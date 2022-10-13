import {
  ChainId,
  CHAIN_ID_SOLANA,
  tryHexToNativeString,
  hexToUint8Array,
  importCoreWasm,
  isEVMChain,
  parseTransferPayload,
  CHAIN_ID_UNSET,
} from "@certusone/wormhole-sdk";

import { REDIS_RETRY_MS, AUDIT_INTERVAL_MS, Relayer } from "../definitions";
import { getScopedLogger, ScopedLogger } from "../../helpers/logHelper";
import {
  connectToRedis,
  RedisTables,
  RelayResult,
  resetPayload,
  Status,
  StorePayload,
  storePayloadFromJson,
  storePayloadToJson,
  WorkerInfo,
  addToRate
} from "../../helpers/redisHelper";
import { PromHelper } from "../../helpers/promHelpers";
import { sleep } from "../../helpers/utils";
import { relayTerra } from "../../relayer/terra";
import { relaySolana } from "../../relayer/solana";
import { relayEVM } from "../../relayer/evm";
import { getRelayerEnvironment } from "../../configureEnv";
import {
  parseSwimPayload,
  parseTransferWithArbPayload
} from "../../utils/swim";

function getChainConfigInfo(chainId: ChainId) {
  const env = getRelayerEnvironment();
  return env.supportedChains.find((x) => x.chainId === chainId);
}

/** Relayer for payload 3 token bridge messages with Swim Payload only */
export class SwimRelayer implements Relayer {
  /** Process the relay request */
  async process(
    key: string,
    privateKey: any,
    relayLogger: ScopedLogger,
    metrics: PromHelper
  ): Promise<void> {
    const logger = getScopedLogger(["SwimRelayer.process"], relayLogger);
    try {
      logger.debug("Processing request %s...", key);
      // Get the entry from the working store
      const redisClient = await connectToRedis();
      if (!redisClient) {
        logger.error("Failed to connect to Redis in processRequest");
        return;
      }
      await redisClient.select(RedisTables.WORKING);
      let value: string | null = await redisClient.get(key);
      if (!value) {
        logger.error("Could not find key %s", key);
        return;
      }
      let payload: StorePayload = storePayloadFromJson(value);
      if (payload.status !== Status.Pending) {
        logger.info("This key %s has already been processed.", key);
        return;
      }
      // Actually do the processing here and update status and time field
      let relayResult: RelayResult;
      try {
        if (payload.retries > 0) {
          logger.info(
            "Calling with vaa_bytes %s, retry %d",
            payload.vaa_bytes,
            payload.retries
          );
        } else {
          logger.info("Calling with vaa_bytes %s", payload.vaa_bytes);
        }
        relayResult = await this.relay(
          payload.vaa_bytes,
          false,
          privateKey,
          logger,
          metrics
        );
        logger.info("Relay returned: %o", Status[relayResult.status]);
      } catch (e: any) {
        if (e.message) {
          logger.error("Failed to relay transfer vaa: %s", e.message);
        } else {
          logger.error("Failed to relay transfer vaa: %o", e);
        }

        relayResult = {
          status: Status.Error,
          result: e && e?.message !== undefined ? e.message : "Failure",
        };
      }

      const MAX_RETRIES = 10;
      let targetChain: ChainId = CHAIN_ID_UNSET;
      try {
        const { parse_vaa } = await importCoreWasm();
        const parsedVAA = parse_vaa(hexToUint8Array(payload.vaa_bytes));
        const transferWithArbPayload = parseTransferWithArbPayload(
          Buffer.from(parsedVAA.payload)
        );
        targetChain = transferWithArbPayload.targetChain;
      } catch (e) {}
      let retry: boolean = false;
      if (relayResult.status !== Status.Completed) {
        metrics.incFailures(targetChain);
        if (payload.retries >= MAX_RETRIES) {
          relayResult.status = Status.FatalError;
        }
        if (relayResult.status === Status.FatalError) {
          // Invoke fatal error logic here!
          payload.retries = MAX_RETRIES;
        } else {
          // Invoke retry logic here!
          retry = true;
        }
      }

      // Put result back into store
      payload.status = relayResult.status;
      payload.timestamp = new Date().toISOString();
      payload.retries++;
      value = storePayloadToJson(payload);
      if (!retry || payload.retries > MAX_RETRIES) {
        await redisClient.set(key, value);
      } else {
        // Remove from the working table
        await redisClient.del(key);
        // Put this back into the incoming table
        await redisClient.select(RedisTables.INCOMING);
        await redisClient.set(key, value);
      }
      await redisClient.quit();
    } catch (e: any) {
      logger.error("Unexpected error in processRequest: " + e.message);
      logger.error("request key: " + key);
      logger.error(e);
    }
  }

  /** Run one audit thread per worker so that auditors can not block other auditors or workers */
  async runAuditor(workerInfo: WorkerInfo, metrics: PromHelper): Promise<void> {
    const auditLogger = getScopedLogger([
      `audit-worker-${workerInfo.targetChainName}-${workerInfo.index}`,
    ]);
    while (true) {
      try {
        let redisClient: any = null;
        while (!redisClient) {
          redisClient = await connectToRedis();
          if (!redisClient) {
            auditLogger.error("Failed to connect to redis!");
            await sleep(REDIS_RETRY_MS);
          }
        }
        await redisClient.select(RedisTables.WORKING);
        for await (const si_key of redisClient.scanIterator()) {
          const si_value = await redisClient.get(si_key);
          if (!si_value) {
            continue;
          }

          const storePayload: StorePayload = storePayloadFromJson(si_value);
          try {
            const { parse_vaa } = await importCoreWasm();
            const parsedVAA = parse_vaa(
              hexToUint8Array(storePayload.vaa_bytes)
            );
            const payloadBuffer: Buffer = Buffer.from(parsedVAA.payload);
            const transferWithArbPayload = parseTransferWithArbPayload(payloadBuffer);

            const chain = transferWithArbPayload.targetChain;
            if (chain !== workerInfo.targetChainId) {
              continue;
            }
          } catch (e) {
            auditLogger.error("Failed to parse a stored VAA: " + e);
            auditLogger.error("si_value of failure: " + si_value);
            continue;
          }
          auditLogger.debug(
            "key %s => status: %s, timestamp: %s, retries: %d",
            si_key,
            Status[storePayload.status],
            storePayload.timestamp,
            storePayload.retries
          );
          // Let things sit in here for 10 minutes
          // After that:
          //    - Toss totally failed VAAs
          //    - Check to see if successful transactions were rolled back
          //    - Put roll backs into INCOMING table
          //    - Toss legitimately completed transactions
          const now = new Date();
          const old = new Date(storePayload.timestamp);
          const timeDelta = now.getTime() - old.getTime(); // delta is in mS
          const TEN_MINUTES = 600000;
          auditLogger.debug(
            "Checking timestamps:  now: " +
              now.toISOString() +
              ", old: " +
              old.toISOString() +
              ", delta: " +
              timeDelta
          );
          if (timeDelta > TEN_MINUTES) {
            // Deal with this item
            if (storePayload.status === Status.FatalError) {
              // Done with this failed transaction
              auditLogger.debug("Discarding FatalError.");
              await redisClient.del(si_key);
              continue;
            } else if (storePayload.status === Status.Completed) {
              // Check for rollback
              auditLogger.debug("Checking for rollback.");

              //TODO actually do an isTransferCompleted
              const rr = await this.relay(
                storePayload.vaa_bytes,
                true,
                workerInfo.walletPrivateKey,
                auditLogger,
                metrics
              );

              await redisClient.del(si_key);
              if (rr.status === Status.Completed) {
                metrics.incConfirmed(workerInfo.targetChainId);
              } else {
                auditLogger.info("Detected a rollback on " + si_key);
                metrics.incRollback(workerInfo.targetChainId);
                // Remove this item from the WORKING table and move it to INCOMING
                await redisClient.select(RedisTables.INCOMING);
                await redisClient.set(
                  si_key,
                  storePayloadToJson(
                    resetPayload(storePayloadFromJson(si_value))
                  )
                );
                await redisClient.select(RedisTables.WORKING);
              }
            } else if (storePayload.status === Status.Error) {
              auditLogger.error("Received Error status.");
              continue;
            } else if (storePayload.status === Status.Pending) {
              auditLogger.error("Received Pending status.");
              continue;
            } else {
              auditLogger.error("Unhandled Status of " + storePayload.status);
              continue;
            }
          }
        }
        redisClient.quit();
        // metrics.setDemoWalletBalance(now.getUTCSeconds());
      } catch (e) {
        auditLogger.error("spawnAuditorThread: caught exception: " + e);
      }
      await sleep(AUDIT_INTERVAL_MS);
    }
  }
  /** Parse the target chain id from the payload */
  targetChainId(payload: Buffer): ChainId {
    const transferPayload = parseTransferPayload(payload);
    return transferPayload.targetChain;
  }

  async relay(
    signedVAA: string,
    checkOnly: boolean,
    walletPrivateKey: any,
    relayLogger: ScopedLogger,
    metrics: PromHelper
  ): Promise<RelayResult> {
    const logger = getScopedLogger(["relay"], relayLogger);
    const { parse_vaa } = await importCoreWasm();
    const parsedVAA = parse_vaa(hexToUint8Array(signedVAA));
    const env = getRelayerEnvironment();
    const swimEvmContractAddress = env.swimEvmContractAddress;

    if (parsedVAA.payload[0] !== 3) {
      return { status: Status.FatalError, result: "ERROR: Invalid payload type" };
    }

    const parsedVaaPayload = parseTransferWithArbPayload(
      Buffer.from(parsedVAA.payload)
    );

    const chainConfigInfo = getChainConfigInfo(parsedVaaPayload.targetChain);
    if (!chainConfigInfo) {
      logger.error(
        "relay: improper chain ID: " + parsedVaaPayload.targetChain
      );
      return {
        status: Status.FatalError,
        result:
          "Fatal Error: target chain " +
          parsedVaaPayload.targetChain +
          " not supported",
      };
    }

    if (isEVMChain(parsedVaaPayload.targetChain)) {
      let nativeOrigin: string;
      try {
        nativeOrigin = tryHexToNativeString(
          parsedVaaPayload.originAddress,
          parsedVaaPayload.originChain
        );
      } catch (e: any) {
        return {
          status: Status.Error,
          result: `error converting origin address: ${e?.message}`,
        };
      }
      const unwrapNative =
        parsedVaaPayload.originChain === parsedVaaPayload.targetChain &&
        nativeOrigin?.toLowerCase() ===
          chainConfigInfo.wrappedAsset?.toLowerCase();
      logger.debug(
        "isEVMChain: originAddress: [" +
          parsedVaaPayload.originAddress +
          "], wrappedAsset: [" +
          chainConfigInfo.wrappedAsset +
          "], unwrapNative: " +
          unwrapNative
      );
      let evmResult = await relayEVM(
        chainConfigInfo,
        signedVAA,
        unwrapNative,
        checkOnly,
        walletPrivateKey,
        logger,
        metrics,
        swimEvmContractAddress
      );

      // add request to rate limit only if successful?
      if (evmResult.redeemed) {
        const parsedSwimPayload = parseSwimPayload(parsedVaaPayload.extraPayload);
        const baseKey = parsedSwimPayload.targetChainRecipient;
        addToRate(baseKey);
      }
      return {
        status: evmResult.redeemed ? Status.Completed : Status.Error,
        result: evmResult.result.toString(),
      };
    }

    if (parsedVaaPayload.targetChain === CHAIN_ID_SOLANA) {
      let rResult: RelayResult = { status: Status.Error, result: "" };
      const retVal = await relaySolana(
        chainConfigInfo,
        signedVAA,
        checkOnly,
        walletPrivateKey,
        logger,
        metrics
      );
      if (retVal.redeemed) {
        rResult.status = Status.Completed;
      }
      rResult.result = retVal.result;
      return rResult;
    }

    logger.error(
      "relay: target chain ID: " +
        parsedVaaPayload.targetChain +
        " is invalid, this is a program bug!"
    );

    return {
      status: Status.FatalError,
      result:
        "Fatal Error: target chain " +
        parsedVaaPayload.targetChain +
        " is invalid, this is a program bug!",
    };
  }
}
