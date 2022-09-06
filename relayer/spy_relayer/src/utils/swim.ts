import {
  ChainId,
} from "@certusone/wormhole-sdk";
import { BigNumber } from "@ethersproject/bignumber";


/*
    Similar to parseVaa.ts
    Everything is offset by 1, because first byte is the payload type (1, 2, 3)
    0   u256     amount
    32  [u8; 32] token_address
    64  u16      token_chain
    66  [u8; 32] recipient
    98  u16      recipient_chain
    100 [u8; 32] sender_address
    132 [u8; ?]  extra_payload
     */
export const parseTransferWithArbPayload = (arr: Buffer) => ({
    amount: BigNumber.from(arr.slice(1, 1 + 32)).toBigInt(),
    // For whatever reason parseTransferWithPayload names these originAddress/Chain,
    originAddress: arr.slice(33, 33 + 32).toString("hex"),
    originChain: arr.readUInt16BE(65) as ChainId,
    targetAddress: arr.slice(67, 67 + 32).toString("hex"),
    targetChain: arr.readUInt16BE(99) as ChainId,
    senderAddress: arr.slice(101, 101 + 32).toString("hex"),
    extraPayload: arr.slice(133)
});

/*
    Parsing the extraPayload portion of payload3
     1 byte  - swim internal payload version number
    32 bytes - logical owner/recipient (will use ATA of owner and token on Solana)
     1 byte  - propeller enabled bool
     1 byte  - gas kickstart requested bool
     2 bytes - swimTokenNumber (support up to 65k different tokens, just to be safe)
    16 bytes - memo/interactionId
*/
/*
export const parseSwimPayload = (arr: Buffer) => ({
    swimMessageVersion: arr.readUInt8(0),
    targetChainRecipient: arr.slice(1, 1 + 32).toString("hex"),
    propellerEnabled: arr.readUInt8(33) == 1 ? true : false,
    gasKickstartEnabled: arr.readUInt8(34) == 1 ? true : false,
    swimTokenNumber: arr.readUInt16BE(35),
    memoId: arr.slice(37, 37 + 16).toString("hex")
});
*/
export const parseSwimPayload = (arr: Buffer) => {
  const swimMessageVersion = arr.readUInt8(0);
  const targetChainRecipient = arr.slice(1, 1 + 32).toString("hex");
  if (arr.length == 33)
    return {swimMessageVersion, targetChainRecipient};

  const propellerEnabled = arr.readUInt8(33) == 1 ? true : false;
  const gasKickstartEnabled = arr.readUInt8(34) == 1 ? true : false;
  const swimTokenNumber = arr.readUInt16BE(35);
  if (arr.length == 37)
    return {swimMessageVersion, targetChainRecipient, propellerEnabled, gasKickstartEnabled, swimTokenNumber};

  const memoId = arr.slice(37, 37 + 16).toString("hex");
  return {swimMessageVersion, targetChainRecipient, propellerEnabled, gasKickstartEnabled, swimTokenNumber, memoId};
};