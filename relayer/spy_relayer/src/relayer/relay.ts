import { importCoreWasm } from "@certusone/wormhole-sdk/lib/cjs/solana/wasm";

import {
  ChainId,
  CHAIN_ID_SOLANA,
  tryHexToNativeString,
  hexToUint8Array,
  isEVMChain,
} from "@certusone/wormhole-sdk";

import { relayEVM } from "./evm";
import { relaySolana } from "./solana";
import { getRelayerEnvironment } from "../configureEnv";
import { RelayResult, Status } from "../helpers/redisHelper";
import { getLogger, getScopedLogger, ScopedLogger } from "../helpers/logHelper";
import { PromHelper } from "../helpers/promHelpers";
import { parseTransferWithArbPayload } from "../utils/swim";

const logger = getLogger();
const env = getRelayerEnvironment();

function getChainConfigInfo(chainId: ChainId) {
  return env.supportedChains.find((x) => x.chainId === chainId);
}

export async function relay(
  signedVAA: string,
  checkOnly: boolean,
  walletPrivateKey: any,
  relayLogger: ScopedLogger,
  metrics: PromHelper
): Promise<RelayResult> {
  const logger = getScopedLogger(["relay"], relayLogger);
  const { parse_vaa } = await importCoreWasm();
  const parsedVAA = parse_vaa(hexToUint8Array(signedVAA));
  if (parsedVAA.payload[0] === 3) {
    let parsedVAAPayload = parseTransferWithArbPayload(
      Buffer.from(parsedVAA.payload)
    );

    const chainConfigInfo = getChainConfigInfo(parsedVAAPayload.targetChain);
    if (!chainConfigInfo) {
      logger.error("relay: improper chain ID: " + parsedVAAPayload.targetChain);
      return {
        status: Status.FatalError,
        result:
          "Fatal Error: target chain " +
          parsedVAAPayload.targetChain +
          " not supported",
      };
    }

    if (isEVMChain(parsedVAAPayload.targetChain)) {
      const unwrapNative =
        parsedVAAPayload.originChain === parsedVAAPayload.targetChain &&
        tryHexToNativeString(
          parsedVAAPayload.originAddress,
          parsedVAAPayload.originChain
        )?.toLowerCase() === chainConfigInfo.wrappedAsset?.toLowerCase();
      logger.debug(
        "isEVMChain: originAddress: [" +
          parsedVAAPayload.originAddress +
          "], wrappedAsset: [" +
          chainConfigInfo.wrappedAsset +
          "], unwrapNative: " +
          unwrapNative
      );
      let evmResult = await relayEVM(
        chainConfigInfo,
        signedVAA,
        checkOnly,
        walletPrivateKey,
        logger,
        metrics,
        env.swimEvmContractAddress
      );
      return {
        status: evmResult.redeemed ? Status.Completed : Status.Error,
        result: evmResult.result.toString(),
      };
    }

    if (parsedVAAPayload.targetChain === CHAIN_ID_SOLANA) {
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
        parsedVAAPayload.targetChain +
        " is invalid, this is a program bug!"
    );

    return {
      status: Status.FatalError,
      result:
        "Fatal Error: target chain " +
        parsedVAAPayload.targetChain +
        " is invalid, this is a program bug!",
    };
  }
  return { status: Status.FatalError, result: "ERROR: Invalid payload type" };
}
