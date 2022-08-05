// createCommonEnvironment and createListenerEnvironment get invoked, so set these env variables
process.env.LOG_LEVEL = "debug";
process.env.REST_PORT = "1111";
require("../helpers/loadConfig");

import {
  CHAIN_ID_ETH,
  CHAIN_ID_SOLANA,
  uint8ArrayToHex,
  tryNativeToHexString,
  tryHexToNativeString
} from "@certusone/wormhole-sdk";
import { setDefaultWasm } from "@certusone/wormhole-sdk/lib/cjs/solana/wasm";
import { describe, expect, jest, test } from "@jest/globals";
import {
  parseAndValidateVaa,
  parseVaaTyped,
  ParsedVaa,
  ParsedTransferWithArbDataPayload,
  ParsedSwimData
} from "../listener/validation";
import {
  ETH_PUBLIC_KEY,
  ETH_PRIVATE_KEY,
  SOLANA_CORE_BRIDGE_ADDRESS,
  SOLANA_TOKEN_BRIDGE_ADDRESS,
  TEST_APPROVED_ETH_TOKEN,
  TEST_SWIM_EVM_ROUTING_ADDRESS,
} from "./consts";
import {
  signAndEncodeVaa,
  encodeSwimPayload,
  encodeTransferWithPoolPayload,
  convertAddressToHexBuffer,
  convertAddressToUint8,
} from "./utils";
import { BigNumber } from "@ethersproject/bignumber";

setDefaultWasm("node");

jest.setTimeout(10000);

describe("parseAndValidateVaa", () => {
  test("successful swim payload", async () => {
    const originAddress = TEST_APPROVED_ETH_TOKEN.toLowerCase();
    const targetChainRecipientStr = SOLANA_TOKEN_BRIDGE_ADDRESS;

    const swimPayload = {
      swimMessageVersion: 1,
      targetChainRecipient: convertAddressToUint8(targetChainRecipientStr, CHAIN_ID_SOLANA),
      swimTokenNumber: 1,
      minimumOutputAmount: BigNumber.from(33)
    };

    const encodedSwim = encodeSwimPayload(
      swimPayload.swimMessageVersion,
      convertAddressToHexBuffer(targetChainRecipientStr, CHAIN_ID_SOLANA),
      swimPayload.swimTokenNumber,
      swimPayload.minimumOutputAmount.toString(),
    );

    const transferWithPoolPayload = {
      amount: BigNumber.from(20),
      originAddress: convertAddressToUint8(originAddress, CHAIN_ID_ETH),
      originChain: CHAIN_ID_ETH,
      targetAddress: convertAddressToUint8(targetChainRecipientStr, CHAIN_ID_SOLANA),
      targetChain: CHAIN_ID_SOLANA,
      senderAddress: convertAddressToUint8(TEST_SWIM_EVM_ROUTING_ADDRESS, CHAIN_ID_ETH),
      extraPayload: encodedSwim
    };

    const encodedTransferWithPool = encodeTransferWithPoolPayload(
      transferWithPoolPayload.amount.toString(),
      // Note - tryNativeToHexString, then converting back into a native string will remove capitilization. Will be a problem
      // only if we want to use checksum to verify addresses https://github.com/ethereum/EIPs/blob/master/EIPS/eip-55.md
      convertAddressToHexBuffer(originAddress, CHAIN_ID_ETH),
      transferWithPoolPayload.originChain,
      convertAddressToHexBuffer(targetChainRecipientStr, CHAIN_ID_SOLANA),
      transferWithPoolPayload.targetChain,
      convertAddressToHexBuffer(TEST_SWIM_EVM_ROUTING_ADDRESS, CHAIN_ID_ETH),
      transferWithPoolPayload.extraPayload
    );

    // mock Redis call https://medium.com/welldone-software/jest-how-to-mock-a-function-call-inside-a-module-21c05c57a39f
    const validation = require("../listener/validation");
    jest.spyOn(validation, 'checkQueue').mockReturnValue(null);

    const encodedVaa = signAndEncodeVaa(
      16,
      32,
      CHAIN_ID_ETH,
      convertAddressToHexBuffer(originAddress, CHAIN_ID_ETH),
      1,
      encodedTransferWithPool
    )

    const rawVaa = Uint8Array.from(encodedVaa);
    let result = await parseAndValidateVaa(rawVaa);
    console.log(result);
    expect(typeof result).toBe("object");
    result = result as ParsedVaa<ParsedTransferWithArbDataPayload<ParsedSwimData>>;
    expect(result.timestamp).toBe(16);
    expect(result.nonce).toBe(32);
    expect(result.emitterChain).toBe(CHAIN_ID_ETH);
    expect(tryHexToNativeString(uint8ArrayToHex(result.emitterAddress), CHAIN_ID_ETH)).toBe(originAddress);
    expect(result.sequence).toBe(1);
    // TODO verify payload fields are the same
  });

  test("swim payload does not have expected SWIM_EVM_ROUTING_ADDRESS", async () => {
    const originAddress = TEST_APPROVED_ETH_TOKEN.toLowerCase();

    const swimPayload = {
      swimMessageVersion: 1,
      targetChainRecipient: SOLANA_TOKEN_BRIDGE_ADDRESS,
      swimTokenNumber: 1,
      minimumOutputAmount: BigNumber.from(33)
    };

    const encodedSwim = encodeSwimPayload(
      swimPayload.swimMessageVersion,
      convertAddressToHexBuffer(swimPayload.targetChainRecipient, CHAIN_ID_SOLANA),
      swimPayload.swimTokenNumber,
      swimPayload.minimumOutputAmount.toString(),
    );

    const transferWithPoolPayload = {
      amount: BigNumber.from(20),
      originAddress: originAddress,
      originChain: CHAIN_ID_ETH,
      targetAddress: SOLANA_TOKEN_BRIDGE_ADDRESS,
      targetChain: CHAIN_ID_SOLANA,
      senderAddress: "0x1111111111111111111111111111111111111111",
      extraPayload: encodedSwim
    };

    const encodedTransferWithPool = encodeTransferWithPoolPayload(
      transferWithPoolPayload.amount.toString(),
      convertAddressToHexBuffer(transferWithPoolPayload.originAddress, CHAIN_ID_ETH),
      transferWithPoolPayload.originChain,
      convertAddressToHexBuffer(transferWithPoolPayload.targetAddress, CHAIN_ID_SOLANA),
      transferWithPoolPayload.targetChain,
      convertAddressToHexBuffer(transferWithPoolPayload.senderAddress, CHAIN_ID_ETH),
      transferWithPoolPayload.extraPayload
    );

    const validation = require("../listener/validation");
    jest.spyOn(validation, 'checkQueue').mockReturnValue(null);

    const encodedVaa = signAndEncodeVaa(
      16,
      32,
      CHAIN_ID_ETH,
      convertAddressToHexBuffer(originAddress, CHAIN_ID_ETH),
      1,
      encodedTransferWithPool
    )

    const rawVaa = Uint8Array.from(encodedVaa);
    let result = await parseAndValidateVaa(rawVaa);
    expect(typeof result).toBe("string");
  });
});

test("parseVaaTyped", async () => {
  const data = Buffer.alloc(16);
  const emitterAddress = ETH_PUBLIC_KEY.toLowerCase(); // encoding/decoding removes capitalization

  let encodedVaa = signAndEncodeVaa(
    16,
    32,
    CHAIN_ID_ETH,
    convertAddressToHexBuffer(emitterAddress, CHAIN_ID_ETH),
    1,
    data
  );

  const result = await parseVaaTyped(encodedVaa);
  //console.log(result);
  expect(result.timestamp).toBe(16);
  expect(result.nonce).toBe(32);
  expect(result.emitterChain).toBe(CHAIN_ID_ETH);
  expect(tryHexToNativeString(result.emitterAddress, CHAIN_ID_ETH)).toEqual(emitterAddress);
  expect(result.sequence).toBe(1);
  expect(Buffer.from(result.payload)).toEqual(data);
});
