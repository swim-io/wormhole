import {
  CHAIN_ID_SOLANA,
  CHAIN_ID_ETH,
  CHAIN_ID_BSC,
  getForeignAssetSolana,
  getIsTransferCompletedSolana,
  hexToUint8Array,
  importCoreWasm,
  postVaaSolanaWithRetry,
  tryHexToNativeAssetString,
  tryNativeToHexString,
} from "@certusone/wormhole-sdk";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  Token,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { Connection, Keypair, PublicKey, Transaction } from "@solana/web3.js";
import { ChainConfigInfo } from "../configureEnv";
import { getScopedLogger, ScopedLogger } from "../helpers/logHelper";
import { PromHelper } from "../helpers/promHelpers";
import { parseTransferWithArbPayload } from "../utils/swim";
import { getRelayerEnvironment } from "../configureEnv";
import {
  AnchorProvider,
  Program,
  Spl,
  Wallet as AnchorWallet,
  web3
} from "@project-serum/anchor";
import {
  generatePropellerEngineTxns,
  getWormholeAddressesForMint,
  getPropellerPda,
  getPropellerFeeTrackerAddr,
} from "./solana_utils";
import { idl } from "@swim-io/solana-contracts";

const MAX_VAA_UPLOAD_RETRIES_SOLANA = 5;

// TODO put this in env file?
const twoPoolKey = new PublicKey("8VNVtWUae4qMe535i4yL1gD3VTo8JhcfFEygaozBq8aM");
const swimUsdMint = new PublicKey("3ngTtoyP9GFybFifX1dr7gCFXFiM2Wr6NfXn6EuU7k6C");
const DEFAULT_SOL_USD_FEED = new PublicKey("GvDMxPzN1sCj7L26YDK2HnMRXEQmQ2aemov8YBtPS7vR"); // for aggregator

const ethTokenBridgeStr = "0xF890982f9310df57d00f659cf4fd87e65adEd8d7";
const ethTokenBridgeEthHexStr = tryNativeToHexString(
  ethTokenBridgeStr,
  CHAIN_ID_ETH,
);
export const ethTokenBridge = Buffer.from(ethTokenBridgeEthHexStr, "hex");

const bscTokenBridgeStr = "0x0290FB167208Af455bB137780163b7B7a9a10C16";
const bscTokenBridgeBscHexStr = tryNativeToHexString(
  bscTokenBridgeStr,
  CHAIN_ID_BSC,
);
export const bscTokenBridge = Buffer.from(bscTokenBridgeBscHexStr, "hex");

export async function relaySolana(
  chainConfigInfo: ChainConfigInfo,
  signedVAAString: string,
  checkOnly: boolean,
  walletPrivateKey: Uint8Array,
  relayLogger: ScopedLogger,
  metrics: PromHelper
) {
  const logger = getScopedLogger(["solana"], relayLogger);
  //TODO native transfer & create associated token account
  //TODO close connection
  const signedVaaArray = hexToUint8Array(signedVAAString);
  const signedVaaBuffer = Buffer.from(signedVaaArray);
  const connection = new Connection(chainConfigInfo.nodeUrl, "confirmed");

  if (!chainConfigInfo.bridgeAddress) {
    // This should never be the case, as enforced by createSolanaChainConfig
    return { redeemed: false, result: null };
  }

  const keypair = Keypair.fromSecretKey(walletPrivateKey);
  const payerAddress = keypair.publicKey.toString();
  const anchorWallet = new AnchorWallet(keypair);
  const solanaProvider = new AnchorProvider(connection, anchorWallet, { commitment: "confirmed" });
  const env = getRelayerEnvironment();

  const solanaRoutingContract = new Program(
    idl.propeller,
    env.swimSolanaContractAddress,
    solanaProvider,
  );

  const twoPoolProgram = new Program(
    idl.twoPool,
    twoPoolKey,
    solanaProvider
  );

  const propellerEngineAnchorProvider = new AnchorProvider(
    solanaProvider.connection,
    anchorWallet,
    { commitment: "confirmed" },
  );

  logger.info(
    "publicKey: %s, bridgeAddress: %s, tokenBridgeAddress: %s",
    payerAddress,
    chainConfigInfo.bridgeAddress,
    chainConfigInfo.tokenBridgeAddress
  );
  logger.debug("Checking to see if vaa has already been redeemed.");

  const alreadyRedeemed = await getIsTransferCompletedSolana(
    chainConfigInfo.tokenBridgeAddress,
    signedVaaArray,
    connection
  );

  if (alreadyRedeemed) {
    logger.info("VAA has already been redeemed!");
    return { redeemed: true, result: "already redeemed" };
  }
  if (checkOnly) {
    return { redeemed: false, result: "not redeemed" };
  }

  // start solana txn

  // determine fee destination address - an associated token account
  const { parse_vaa } = await importCoreWasm();
  const parsedVAA = parse_vaa(signedVaaArray);
  const payloadBuffer = Buffer.from(parsedVAA.payload);
  const transferWithArbPayload = parseTransferWithArbPayload(payloadBuffer);
  logger.debug("Calculating the fee destination address");
  let nativeOrigin: string;

  try {
    nativeOrigin = tryHexToNativeAssetString(
      transferWithArbPayload.originAddress,
      CHAIN_ID_SOLANA
    );
  } catch (e: any) {
    throw new Error(
      `Unable to convert origin address to native: ${e?.message}`
    );
  }

  const solanaMintAddress =
    transferWithArbPayload.originChain === CHAIN_ID_SOLANA
      ? nativeOrigin
      : await getForeignAssetSolana(
          connection,
          chainConfigInfo.tokenBridgeAddress,
          transferWithArbPayload.originChain,
          hexToUint8Array(transferWithArbPayload.originAddress)
        );
  if (!solanaMintAddress) {
    throw new Error(
      `Unable to determine mint for origin chain: ${transferWithArbPayload.originChain}, address: ${transferWithArbPayload.originAddress} (${nativeOrigin})`
    );
  }
  const solanaMintKey = new PublicKey(solanaMintAddress);
  const feeRecipientAddress = await Token.getAssociatedTokenAddress(
    ASSOCIATED_TOKEN_PROGRAM_ID,
    TOKEN_PROGRAM_ID,
    solanaMintKey,
    keypair.publicKey
  );
  // create the associated token account if it doesn't exist
  const associatedAddressInfo = await connection.getAccountInfo(
    feeRecipientAddress
  );
  if (!associatedAddressInfo) {
    logger.debug(
      "Fee destination address %s for wallet %s, mint %s does not exist, creating it.",
      feeRecipientAddress.toString(),
      keypair.publicKey,
      solanaMintAddress
    );
    const transaction = new Transaction().add(
      await Token.createAssociatedTokenAccountInstruction(
        ASSOCIATED_TOKEN_PROGRAM_ID,
        TOKEN_PROGRAM_ID,
        solanaMintKey,
        feeRecipientAddress,
        keypair.publicKey, // owner
        keypair.publicKey // payer
      )
    );
    const { blockhash } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = keypair.publicKey;
    // sign, send, and confirm transaction
    transaction.partialSign(keypair);
    const txid = await connection.sendRawTransaction(transaction.serialize());
    await connection.confirmTransaction(txid);
  }

  logger.debug("Posting the vaa.");
  await postVaaSolanaWithRetry(
    connection,
    async (transaction) => {
      transaction.partialSign(keypair);
      return transaction;
    },
    chainConfigInfo.bridgeAddress,
    payerAddress,
    signedVaaBuffer,
    MAX_VAA_UPLOAD_RETRIES_SOLANA
  );

  logger.debug("calling getPropellerPda");
  const propeller = await getPropellerPda(
    swimUsdMint,
    env.swimSolanaContractAddress
  );

  logger.debug("calling getPropellerFeeTrackerAddr");
  // initialize fee tracker if needed
  /*
  const feeTrackerPda = await getPropellerFeeTrackerAddr(
    swimUsdMint,
    keypair.publicKey,
    solanaRoutingContract.programId
  );
  logger.debug("done, feeTrackerPda is ", feeTrackerPda);
  logger.debug(feeTrackerPda);

  logger.debug("calling fetchNullable");
  // error here:  Invalid coption undefined
  const feeTrackerAtaData = await Spl.token(solanaProvider).account.token.fetchNullable(
    feeTrackerPda
  );

  logger.debug("checking feeTrackerAtaData");
  logger.debug(!feeTrackerAtaData);
  if(!feeTrackerAtaData) {
    const initFeeTrackers = solanaRoutingContract.methods
    .initializeFeeTracker()
    .accounts({
      propeller,
      payer: keypair.publicKey,
      swimUsdMint: swimUsdMint,
      systemProgram: web3.SystemProgram.programId,
    });
    const initializeFeeTrackersTxn = await initFeeTrackers.transaction();
    await solanaProvider.sendAndConfirm(initializeFeeTrackersTxn, [
      keypair,
    ]);
  }
  */

  logger.debug("getWormholeAddressesForMint");
  const wormholeAddresses = await getWormholeAddressesForMint(
    new PublicKey(chainConfigInfo.bridgeAddress),
    new PublicKey(chainConfigInfo.tokenBridgeAddress),
    swimUsdMint,
    ethTokenBridge, // TODO do i really need these?
    bscTokenBridge,
  );

  const swimTxns = await generatePropellerEngineTxns(
    solanaRoutingContract,
    signedVaaBuffer,
    propeller,
    swimUsdMint,
    wormholeAddresses,
    keypair,
    twoPoolProgram,
    Spl.token(solanaProvider),
    DEFAULT_SOL_USD_FEED,
    keypair,
  )

  let swimTxnIndex = 0;
  logger.debug("starting completeNativeWithPayloadTxn");
  const completeNativeWithPayloadTxn = swimTxns[swimTxnIndex++];
  const completeNativeWithPayloadTxnSig = await propellerEngineAnchorProvider.sendAndConfirm(completeNativeWithPayloadTxn);

  logger.debug("starting createOwnerAtaTxn");
  const createOwnerAtaTxn = swimTxns[swimTxnIndex++];
  const createOwnerAtaTxnSig = await propellerEngineAnchorProvider.sendAndConfirm(createOwnerAtaTxn);

  logger.debug("starting processSwimPayloadTxn");
  const processSwimPayloadTxn = swimTxns[swimTxnIndex++];
  const processSwimPayloadTxnSig =
    await propellerEngineAnchorProvider.sendAndConfirm(
      processSwimPayloadTxn,
      [keypair],
    );

  logger.debug("Checking to see if the transaction is complete.");
  const success = await getIsTransferCompletedSolana(
    chainConfigInfo.tokenBridgeAddress,
    signedVaaArray,
    connection
  );

  logger.info(
    "success: %s, tx hashes:\n 1: %s\n 2: %s\n 3: %s",
    success, completeNativeWithPayloadTxnSig, createOwnerAtaTxnSig, processSwimPayloadTxnSig
  );
  metrics.incSuccesses(chainConfigInfo.chainId);
  return { redeemed: success, result: processSwimPayloadTxnSig };
}
