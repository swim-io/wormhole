import { Program, SplToken } from "@project-serum/anchor";
import { Propeller, TwoPool } from "@swim-io/solana-contracts/types";
import { Keypair, PublicKey, Transaction } from "@solana/web3.js";
import { MEMO_PROGRAM_ID } from "@solana/spl-memo";
import { BN, web3 } from "@project-serum/anchor";
import {
  CHAIN_ID_ETH,
  CHAIN_ID_BSC,
  ChainId,
  getClaimAddressSolana,
} from "@certusone/wormhole-sdk";
import * as byteify from "byteify";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  Token,
} from "@solana/spl-token";
import { parseVaaTyped } from "../listener/validation";
import { parseSwimPayload, parseTransferWithArbPayload } from "../utils/swim";
import keccak256 from "keccak256";

function hashVaa(signedVaa: Buffer): Buffer {
  const sigStart = 6;
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const numSigners = signedVaa[5]!;
  const sigLength = 66;

  const body = signedVaa.subarray(sigStart + sigLength * numSigners);
  return keccak256(body);
}

const deriveMessagePda = async (
  signedVaa: Buffer,
  programId: web3.PublicKey,
) => {
  const hash = hashVaa(signedVaa);

  return await web3.PublicKey.findProgramAddress(
    [Buffer.from("PostedVAA"), hash],
    programId,
  );
};

const getSwimPayloadMessagePda = async (
  wormholeClaim: PublicKey,
  propellerProgramId: PublicKey,
): Promise<readonly [PublicKey, number]> => {
  return await PublicKey.findProgramAddress(
    [
      Buffer.from("propeller"),
      Buffer.from("swim_payload"),
      wormholeClaim.toBuffer(),
    ],
    propellerProgramId,
  );
};

async function getPropellerRedeemerPda(
  programId: PublicKey,
): Promise<PublicKey> {
  return (
    await PublicKey.findProgramAddress(
      [Buffer.from("redeemer")],
      programId,
    )
  )[0];
}

const getPropellerFeeTrackerAddr = async (
  swimUsdMint: PublicKey,
  feeTrackerOwner: PublicKey,
  propellerProgramId: PublicKey,
) => {
  return await PublicKey.findProgramAddress(
    [
      Buffer.from("propeller"),
      Buffer.from("fee"),
      swimUsdMint.toBuffer(),
      feeTrackerOwner.toBuffer(),
    ],
    propellerProgramId,
  );
};

const getTargetTokenIdMapAddr = async (
  propeller: PublicKey,
  targetTokenId: number,
  propellerProgramId: PublicKey,
) => {
  return await PublicKey.findProgramAddress(
    [
      Buffer.from("propeller"),
      Buffer.from("token_id"),
      propeller.toBuffer(),
      new BN(targetTokenId).toArrayLike(Buffer, "le", 2),
    ],
    propellerProgramId,
  );
};

const getMarginalPricePoolInfo = async (
  propeller: PublicKey,
  propellerProgram: Program<Propeller>,
  twoPoolProgram: Program<TwoPool>,
): Promise<MarginalPricePoolInfo> => {
  const propellerData = await propellerProgram.account.propeller.fetch(
    propeller,
  );
  console.info(`got propellerData`, propellerData);
  const marginalPricePool = propellerData.marginalPricePool;
  console.info(`got marginalPricePool`, marginalPricePool)
  const pool = await twoPoolProgram.account.twoPool.fetch(marginalPricePool);
  console.info(`got pool`, pool);
  return {
    pool: marginalPricePool,
    token0Account: pool.tokenKeys[0],
    token1Account: pool.tokenKeys[1],
    lpMint: pool.lpMintKey,
  };
};

async function getSwimClaimPda(
  wormholeClaim: PublicKey,
  propellerProgramId: PublicKey,
): Promise<readonly [PublicKey, number]> {
  return await PublicKey.findProgramAddress(
    [Buffer.from("propeller"), Buffer.from("claim"), wormholeClaim.toBuffer()],
    propellerProgramId,
  );
}

export const deriveEndpointPda = async (
  foreignChain: ChainId,
  foreignTokenBridge: Buffer,
  programId: PublicKey,
) => {
  return await PublicKey.findProgramAddress(
    [byteify.serializeUint16(foreignChain as number), foreignTokenBridge],
    programId,
  );
};

const getOwnerTokenAccountsForPool = async (
  pool: PublicKey,
  owner: PublicKey,
  twoPoolProgram: Program<TwoPool>,
): Promise<readonly PublicKey[]> => {
  const tokenIdMapPoolData = await twoPoolProgram.account.twoPool.fetch(pool);
  const tokenIdMapPoolInfo = {
    pool,
    tokenMints: tokenIdMapPoolData.tokenMintKeys,
    tokenAccounts: tokenIdMapPoolData.tokenKeys,
    lpMint: tokenIdMapPoolData.lpMintKey,
    governanceFeeAcct: tokenIdMapPoolData.governanceFeeKey,
  };
  const mints = [...tokenIdMapPoolInfo.tokenMints, tokenIdMapPoolInfo.lpMint];
  return await Promise.all(
    mints.map(async (mint) => {
      return await Token.getAssociatedTokenAddress(ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID, mint, owner);
    }),
  );
};

type WormholeAddresses = {
  readonly wormhole: PublicKey;
  readonly tokenBridge: PublicKey;
  readonly ethEndpointAccount: PublicKey;
  readonly bscEndpointAccount: PublicKey;
  readonly custody: PublicKey;
  readonly wormholeConfig: PublicKey;
  readonly wormholeFeeCollector: PublicKey;
  readonly wormholeEmitter: PublicKey;
  readonly wormholeSequence: PublicKey;
  readonly authoritySigner: PublicKey;
  readonly tokenBridgeConfig: PublicKey;
  readonly custodySigner: PublicKey;
};

type MarginalPricePoolInfo = {
  readonly pool: PublicKey;
  readonly token0Account: PublicKey;
  readonly token1Account: PublicKey;
  readonly lpMint: PublicKey;
};

export const getWormholeAddressesForMint = async (
  wormhole: web3.PublicKey,
  tokenBridge: web3.PublicKey,
  mint: web3.PublicKey,
  ethTokenBridge: Buffer,
  bscTokenBridge: Buffer,
): Promise<WormholeAddresses> => {
  const [ethEndpointAccount] = await deriveEndpointPda(
    CHAIN_ID_ETH,
    ethTokenBridge,
    tokenBridge,
  );

  const [bscEndpointAccount] = await deriveEndpointPda(
    CHAIN_ID_BSC,
    bscTokenBridge,
    tokenBridge,
  );
  const [custody] = await (async () => {
    return await web3.PublicKey.findProgramAddress(
      [mint.toBytes()],
      tokenBridge,
    );
  })();

  const [wormholeConfig] = await web3.PublicKey.findProgramAddress(
    [Buffer.from("Bridge")],
    wormhole,
  );
  const [wormholeFeeCollector] = await web3.PublicKey.findProgramAddress(
    [Buffer.from("fee_collector")],
    wormhole,
  );
  // wh functions return in a hex string format
  // wormholeEmitter = new web3.PublicKey(
  //   tryHexToNativeString(await getEmitterAddressSolana(tokenBridge.toBase58()), CHAIN_ID_SOLANA)
  //   );
  const [wormholeEmitter] = await web3.PublicKey.findProgramAddress(
    [Buffer.from("emitter")],
    tokenBridge,
  );
  const [wormholeSequence] = await web3.PublicKey.findProgramAddress(
    [Buffer.from("Sequence"), wormholeEmitter.toBytes()],
    wormhole,
  );

  const [authoritySigner] = await web3.PublicKey.findProgramAddress(
    [Buffer.from("authority_signer")],
    tokenBridge,
  );
  const [tokenBridgeConfig] = await web3.PublicKey.findProgramAddress(
    [Buffer.from("config")],
    tokenBridge,
  );
  const [custodySigner] = await web3.PublicKey.findProgramAddress(
    [Buffer.from("custody_signer")],
    tokenBridge,
  );
  return {
    wormhole,
    tokenBridge,
    ethEndpointAccount,
    bscEndpointAccount,
    custody,
    wormholeConfig,
    wormholeFeeCollector,
    wormholeEmitter,
    wormholeSequence,
    authoritySigner,
    tokenBridgeConfig,
    custodySigner,
  };
};

export const generatePropellerEngineTxns = async (
  propellerProgram: Program<Propeller>,
  tokenTransferWithPayloadSignedVaa: Buffer,
  propeller: PublicKey,
  swimUsdMint: PublicKey,
  wormholeAddresses: WormholeAddresses,
  payer: Keypair,
  twoPoolProgram: Program<TwoPool>,
  splToken: Program<SplToken>,
  aggregator: PublicKey,
  userTransferAuthority: Keypair,
): Promise<readonly Transaction[]> => {
  let txns: readonly Transaction[] = [];
  const {
    custody,
    custodySigner,
    ethEndpointAccount,
    tokenBridge,
    tokenBridgeConfig,
    wormhole,
  } = wormholeAddresses;
  const [wormholeMessage] = await deriveMessagePda(
    tokenTransferWithPayloadSignedVaa,
    wormhole,
  );
  const wormholeClaim = await getClaimAddressSolana(
    tokenBridge.toBase58(),
    tokenTransferWithPayloadSignedVaa,
  );
  const [swimPayloadMessage] = await getSwimPayloadMessagePda(
    wormholeClaim,
    propellerProgram.programId,
  );

  console.info(`
    generatePropellerEngineTnxs
      wormholeMESSAGE: ${wormholeMessage.toBase58()}
      wormholeClaim: ${wormholeClaim.toBase58()}
      swimPayloadMessage: ${swimPayloadMessage.toBase58()})
  `);

  const propellerFeeVault: PublicKey = await Token.getAssociatedTokenAddress(
    ASSOCIATED_TOKEN_PROGRAM_ID,
    TOKEN_PROGRAM_ID,
    swimUsdMint,
    propeller,
    true,
  );
  console.info(`got propellerFeeVault`);
  const propellerRedeemer = await getPropellerRedeemerPda(
    propellerProgram.programId,
  );
  console.info(`got propellerRedeemer`);

  const propellerRedeemerEscrowAccount: PublicKey =
    await Token.getAssociatedTokenAddress(ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID, swimUsdMint, propellerRedeemer, true);

  console.info(`got propellerRedeemerEscrowAccount`)
  const marginalPricePoolInfo = await getMarginalPricePoolInfo(
    propeller,
    propellerProgram,
    twoPoolProgram,
  );
  console.info(`
    marginalPricePoolInfo: ${JSON.stringify(marginalPricePoolInfo, null, 2)}
  `);
  const [propellerEngineFeeTracker] = await getPropellerFeeTrackerAddr(
    swimUsdMint,
    payer.publicKey,
    propellerProgram.programId,
  );

  console.info(`
  getPropellerEngineTxns:
    propellerEngineFeeTracker: ${propellerEngineFeeTracker.toBase58()}
  `);

  const propellerEngineFeeTrackerData =
    await propellerProgram.account.feeTracker.fetch(propellerEngineFeeTracker);
  console.info(`
    propellerEngineFeeTrackerData: ${JSON.stringify(
      propellerEngineFeeTrackerData,
      null,
      2,
    )}
  `);

  const parsedVaa = await parseVaaTyped(tokenTransferWithPayloadSignedVaa);
  const parsedTransferWithSwimPayload = parseTransferWithArbPayload(parsedVaa.payload);
  const swimPayload = parseSwimPayload(
    parsedTransferWithSwimPayload.extraPayload,
  );

  const requestUnitsIx = web3.ComputeBudgetProgram.requestUnits({
    // units: 420690,
    units: 900000,
    additionalFee: 0,
  });
  const propellerData = await propellerProgram.account.propeller.fetch(
    propeller,
  );
  console.info(`
    propellerData: ${JSON.stringify(propellerData, null, 2)}
  `);

  const completePubkeys = await propellerProgram.methods
    .completeNativeWithPayload()
    .accounts({
      propeller,
      payer: payer.publicKey,
      tokenBridgeConfig,
      message: wormholeMessage,
      claim: wormholeClaim,
      swimPayloadMessage: swimPayloadMessage,
      endpoint: ethEndpointAccount,
      to: propellerRedeemerEscrowAccount,
      redeemer: propellerRedeemer,
      feeRecipient: propellerFeeVault,
      custody: custody,
      swimUsdMint: swimUsdMint,
      custodySigner,
      rent: web3.SYSVAR_RENT_PUBKEY,
      systemProgram: web3.SystemProgram.programId,
      wormhole: wormholeAddresses.wormhole,
      tokenProgram: splToken.programId,
      tokenBridge: wormholeAddresses.tokenBridge,
    })
    .pubkeys();
  console.info(`
    completePubkeys: ${JSON.stringify(completePubkeys, null, 2)}
  `);

  const completeNativeWithPayloadIxs = propellerProgram.methods
    .propellerCompleteNativeWithPayload()
    .accounts({
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      completeNativeWithPayload: completePubkeys,
      feeTracker: propellerEngineFeeTracker,
      aggregator,
      marginalPricePool: marginalPricePoolInfo.pool,
      marginalPricePoolToken0Account: marginalPricePoolInfo.token0Account,
      marginalPricePoolToken1Account: marginalPricePoolInfo.token1Account,
      marginalPricePoolLpMint: marginalPricePoolInfo.lpMint,
      twoPoolProgram: twoPoolProgram.programId,
      memo: MEMO_PROGRAM_ID,
    })
    .preInstructions([requestUnitsIx])
    .signers([payer]);

  const completeNativeWithPayloadPubkeys =
    await completeNativeWithPayloadIxs.pubkeys();

  console.info(
    `completeNativeWithPayloadPubkeys: ${JSON.stringify(
      completeNativeWithPayloadPubkeys,
      null,
      2,
    )}`,
  );
  const completeNativeWithPayloadTxn =
    await completeNativeWithPayloadIxs.transaction();
  txns = [completeNativeWithPayloadTxn];
  const targetTokenId = swimPayload.swimTokenNumber!;
  const [tokenIdMapAddr] = await getTargetTokenIdMapAddr(
    propeller,
    targetTokenId,
    propellerProgram.programId,
  );
  const tokenIdMapData =
    await propellerProgram.account.tokenIdMap.fetchNullable(tokenIdMapAddr);
  const owner = new PublicKey(swimPayload.targetChainRecipient);
  const [swimClaim] = await getSwimClaimPda(
    wormholeClaim,
    propellerProgram.programId,
  );

  if (!tokenIdMapData) {
    console.info(
      `invalid tokenIdMap. targetTokenId: ${targetTokenId.toString()}. Generating fallback transactions`,
    );

    const userSwimUsdAta: PublicKey = await Token.getAssociatedTokenAddress(
      ASSOCIATED_TOKEN_PROGRAM_ID,
      TOKEN_PROGRAM_ID,
      swimUsdMint,
      owner,
    );
    const ownerSwimUsdAtaData = await splToken.account.token.fetchNullable(
      userSwimUsdAta,
    );
    if (!ownerSwimUsdAtaData) {
      const createOwnerSwimUsdAtaTxn = await propellerProgram.methods
        .propellerCreateOwnerSwimUsdAta()
        .accounts({
          propeller,
          payer: payer.publicKey,
          redeemer: propellerRedeemer,
          redeemerEscrow: propellerRedeemerEscrowAccount,
          feeVault: propellerFeeVault,
          feeTracker: propellerEngineFeeTracker,
          claim: wormholeClaim,
          swimPayloadMessage,
          tokenIdMap: tokenIdMapAddr,
          swimUsdMint: swimUsdMint,
          owner,
          ownerSwimUsdAta: userSwimUsdAta,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: web3.SystemProgram.programId,
          tokenProgram: splToken.programId,
          memo: MEMO_PROGRAM_ID,
          aggregator,
          marginalPricePool: marginalPricePoolInfo.pool,
          marginalPricePoolToken0Account: marginalPricePoolInfo.token0Account,
          marginalPricePoolToken1Account: marginalPricePoolInfo.token1Account,
          marginalPricePoolLpMint: marginalPricePoolInfo.lpMint,
          twoPoolProgram: twoPoolProgram.programId,
          rent: web3.SYSVAR_RENT_PUBKEY,
        })
        .transaction();
      txns = [...txns, createOwnerSwimUsdAtaTxn];
    }

    const propellerProcessSwimPayloadFallbackTxn =
      await propellerProgram.methods
        .propellerProcessSwimPayloadFallback()
        .accounts({
          propeller,
          payer: payer.publicKey,
          claim: wormholeClaim,
          swimClaim,
          swimPayloadMessage,
          swimPayloadMessagePayer: payer.publicKey,
          redeemer: propellerRedeemer,
          redeemerEscrow: propellerRedeemerEscrowAccount,
          tokenIdMap: tokenIdMapAddr,
          userTransferAuthority: userTransferAuthority.publicKey,
          userSwimUsdAta: userSwimUsdAta,
          tokenProgram: splToken.programId,
          memo: MEMO_PROGRAM_ID,
          twoPoolProgram: twoPoolProgram.programId,
          systemProgram: web3.SystemProgram.programId,
          feeVault: propellerFeeVault,
          feeTracker: propellerEngineFeeTracker,
          aggregator,
          marginalPricePool: marginalPricePoolInfo.pool,
          marginalPricePoolToken0Account: marginalPricePoolInfo.token0Account,
          marginalPricePoolToken1Account: marginalPricePoolInfo.token1Account,
          marginalPricePoolLpMint: marginalPricePoolInfo.lpMint,
          owner,
        })
        .preInstructions([requestUnitsIx])
        .signers([userTransferAuthority, payer])
        .transaction();
    txns = [...txns, propellerProcessSwimPayloadFallbackTxn];
  } else {
    const tokenIdMapPoolAddr = tokenIdMapData.pool;
    const tokenIdMapPoolData = await twoPoolProgram.account.twoPool.fetch(
      tokenIdMapPoolAddr,
    );
    const tokenIdMapPoolInfo = {
      pool: tokenIdMapPoolAddr,
      tokenMints: tokenIdMapPoolData.tokenMintKeys,
      tokenAccounts: tokenIdMapPoolData.tokenKeys,
      lpMint: tokenIdMapPoolData.lpMintKey,
      governanceFeeAcct: tokenIdMapPoolData.governanceFeeKey,
    };

    const ownerAtaAddrs = await getOwnerTokenAccountsForPool(
      tokenIdMapPoolAddr,
      owner,
      twoPoolProgram,
    );

    const ownerAtas = await Promise.all(
      ownerAtaAddrs.map(async (ataAddr: web3.PublicKey) => {
        return await splToken.account.token.fetchNullable(ataAddr);
      }),
    );
    // Note: this is normally how we should get the swimPayloadMessagePayer address
    // but since we're generating txns, this account won't exist at the timem we call this.
    // const swimPayloadMessageAccount = await propellerProgram.account.swimPayloadMessage.fetch(
    //   swimPayloadMessage,
    // );
    if (ownerAtas.some((ata) => ata === null)) {
      console.info(
        "at least one owner ATA was not found. generating txn to create them",
      );
      const createOwnerAtasTxn = await propellerProgram.methods
        .propellerCreateOwnerTokenAccounts()
        .accounts({
          propeller,
          payer: payer.publicKey,
          redeemer: propellerRedeemer,
          redeemerEscrow: propellerRedeemerEscrowAccount,
          feeVault: propellerFeeVault,
          feeTracker: propellerEngineFeeTracker,
          claim: wormholeClaim,
          swimPayloadMessage,
          tokenIdMap: tokenIdMapAddr,
          pool: tokenIdMapPoolInfo.pool,
          poolToken0Mint: tokenIdMapPoolInfo.tokenMints[0],
          poolToken1Mint: tokenIdMapPoolInfo.tokenMints[1],
          poolLpMint: tokenIdMapPoolInfo.lpMint,
          user: owner,
          userPoolToken0Account: ownerAtaAddrs[0],
          userPoolToken1Account: ownerAtaAddrs[1],
          userLpTokenAccount: ownerAtaAddrs[2],
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: web3.SystemProgram.programId,
          tokenProgram: splToken.programId,
          memo: MEMO_PROGRAM_ID,
          aggregator,
          marginalPricePool: marginalPricePoolInfo.pool,
          marginalPricePoolToken0Account: marginalPricePoolInfo.token0Account,
          marginalPricePoolToken1Account: marginalPricePoolInfo.token1Account,
          marginalPricePoolLpMint: marginalPricePoolInfo.lpMint,
          twoPoolProgram: twoPoolProgram.programId,
        })
        .preInstructions([requestUnitsIx])
        .transaction();
      txns = [...txns, createOwnerAtasTxn];
    }
    const processSwimPayloadPubkeys = await propellerProgram.methods
      .processSwimPayload(targetTokenId, new BN(0))
      .accounts({
        propeller,
        payer: payer.publicKey,
        claim: wormholeClaim,
        swimPayloadMessage,
        swimPayloadMessagePayer: payer.publicKey,
        swimClaim,
        redeemer: propellerRedeemer,
        redeemerEscrow: propellerRedeemerEscrowAccount,
        pool: tokenIdMapPoolInfo.pool,
        poolTokenAccount0: tokenIdMapPoolInfo.tokenAccounts[0],
        poolTokenAccount1: tokenIdMapPoolInfo.tokenAccounts[1],
        lpMint: tokenIdMapPoolInfo.lpMint,
        governanceFee: tokenIdMapPoolInfo.governanceFeeAcct,
        userTransferAuthority: userTransferAuthority.publicKey,
        userTokenAccount0: ownerAtaAddrs[0],
        userTokenAccount1: ownerAtaAddrs[1],
        userLpTokenAccount: ownerAtaAddrs[2],
        tokenProgram: splToken.programId,
        twoPoolProgram: twoPoolProgram.programId,
        systemProgram: web3.SystemProgram.programId,
      })
      .pubkeys();
    const propellerProcessSwimPayloadTxn = await propellerProgram.methods
      .propellerProcessSwimPayload(targetTokenId)
      .accounts({
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        processSwimPayload: processSwimPayloadPubkeys,
        feeVault: propellerFeeVault,
        feeTracker: propellerEngineFeeTracker,
        aggregator,
        marginalPricePool: marginalPricePoolInfo.pool,
        marginalPricePoolToken0Account: marginalPricePoolInfo.token0Account,
        marginalPricePoolToken1Account: marginalPricePoolInfo.token1Account,
        marginalPricePoolLpMint: marginalPricePoolInfo.lpMint,
        owner,
        memo: MEMO_PROGRAM_ID,
      })
      .preInstructions([requestUnitsIx])
      .signers([userTransferAuthority, payer])
      .transaction();
    txns = [...txns, propellerProcessSwimPayloadTxn];
  }

  return txns;
};
