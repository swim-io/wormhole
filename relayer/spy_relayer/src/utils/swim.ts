import {
  ChainId,
} from "@certusone/wormhole-sdk";
import { BigNumber } from "@ethersproject/bignumber";


/*
    Similar to parseVaa.ts
    0   u256     amount
    32  [u8; 32] token_address
    64  u16      token_chain
    66  [u8; 32] recipient
    98  u16      recipient_chain
    100 u256     fee
     */
export const parseTransferWithArbPayload = (arr: Buffer) => ({
    amount: BigNumber.from(arr.slice(1, 1 + 32)).toBigInt(),
    originAddress: arr.slice(33, 33 + 32).toString("hex"),
    originChain: arr.readUInt16BE(65) as ChainId,
    targetAddress: arr.slice(67, 67 + 32).toString("hex"),
    targetChain: arr.readUInt16BE(99) as ChainId,
    fee: BigNumber.from(arr.slice(101, 101 + 32)).toBigInt(),
    extraPayload: arr.slice(133)
});

/*
    Parsing the extraPayload portion of payload3
    1 byte - swim internal payload version number
    32 bytes - logical owner/recipient (will use ATA of owner and token on Solana)
    2 bytes - swimTokenNumber (support up to 65k different tokens, just to be safe)
    32 bytes - minimum output amount (using 32 bytes like Wormhole)
    16 bytes - memo/interactionId (??) (current memo is 16 bytes - can't use Wormhole sequence due to Solana originating transactions (only receive sequence number in last transaction on Solana, hence no id for earlier transactions))
    ?? bytes - propeller parameters (propellerEnabled: bool / gasTokenPrefundingAmount: uint256 / propellerFee (?? - similar to wormhole arbiter fee))
*/
export const parseSwimPayload = (arr: Buffer) => ({
    swimMessageVersion: arr.slice(0, 1),
    targetChainRecipient: arr.slice(1, 1 + 32).toString("hex"),
    swimTokenNumber: arr.slice(33, 33 + 2),
    minimumOutputAmount: BigNumber.from(arr.slice(35, 35 + 32)).toBigInt(),
    memoId: BigNumber.from(arr.slice(67, 67 + 16)).toBigInt(),
    otherParameters: arr.slice(83)
});
