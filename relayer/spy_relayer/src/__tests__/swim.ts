import {
  CHAIN_ID_ETH,
  CHAIN_ID_SOLANA,
  hexToUint8Array,
  uint8ArrayToHex,
  tryNativeToHexString,
  tryHexToNativeString
} from "@certusone/wormhole-sdk";
import { arrayify, zeroPad } from "@ethersproject/bytes";
import { setDefaultWasm } from "@certusone/wormhole-sdk/lib/cjs/solana/wasm";
import { describe, expect, jest, test, it } from "@jest/globals";
import {
  ETH_PUBLIC_KEY,
  ETH_PRIVATE_KEY,
  SOLANA_CORE_BRIDGE_ADDRESS,
  SOLANA_TOKEN_BRIDGE_ADDRESS,
  TEST_APPROVED_ETH_TOKEN,
} from "./consts";
import {
  parseTransferWithArbPayload,
  parseSwimPayload
} from "../utils/swim";
import { BigNumber, BigNumberish } from "@ethersproject/bignumber";
import {
  toBigNumberHex,
  encodeSwimPayload,
  encodeTransferWithPoolPayload,
  convertAddressToHexBuffer,
  convertAddressToUint8,
} from "./utils"

setDefaultWasm("node");

jest.setTimeout(10000);
/*
  VAA structure:
  VAA {
    ...,
    payload 3: {
      ...,
      swim payload: {

      },
    }
  }

  Parse flow (in parseAndValidateVaa in src/listener/validation.ts)
  - VAA is a raw Uint8Array.
  - raw Uint8Array goes into parseVaaTyped(), output is ParsedVaa<Uint8Array>
  - ParsedVaa.payload is a Uint8Array, either payload1 or payload3, determined by first byte
  - ParsedVaa.payload is sent to parseTransferWithArbPayload or parseTransferPayload (sdk/js/src/utils/parseVaa.ts)
  - Buffer is created from ParsedVaa.payload Uint8Array, then passed into parseTransferWithArbPayload
    parsedVaaPayload = parseTransferWithArbPayload(Buffer.from(parsedVaa.payload));

  For parseSwimPayload, there's one more level.
  - parsedVaaPayload contains an extraPayload field, which is a slice of a Buffer, so a Buffer
  - This buffer is passed into parseSwimPayload

  What this test is testing: parseSwimPayload
  Input: Buffer
  Output: object that looks like swim payload
*/


test("parseTransferWithPoolPayload", () => {
  const targetAddress = SOLANA_TOKEN_BRIDGE_ADDRESS;

  const swimPayload = {
    swimMessageVersion: 1,
    targetChainRecipient: convertAddressToUint8(targetAddress, CHAIN_ID_SOLANA),
    propellerEnabled: true,
    gasKickstartEnabled: true,
    swimTokenNumber: 1,
    memoId: BigNumber.from(33)
  };

  const encodedSwim = encodeSwimPayload(
    swimPayload.swimMessageVersion,
    convertAddressToHexBuffer(targetAddress, CHAIN_ID_SOLANA),
    swimPayload.propellerEnabled,
    swimPayload.gasKickstartEnabled,
    swimPayload.swimTokenNumber,
    swimPayload.memoId.toString(),
  );

  const transferWithPoolPayload = {
    amount: BigNumber.from(20),
    originAddress: ETH_PUBLIC_KEY.toLowerCase(),
    originChain: CHAIN_ID_ETH,
    targetAddress: SOLANA_TOKEN_BRIDGE_ADDRESS,
    targetChain: CHAIN_ID_SOLANA,
    senderAddress: ETH_PUBLIC_KEY.toLowerCase(),
    extraPayload: encodedSwim
  };

  const encodedTransferWithPool = encodeTransferWithPoolPayload(
    transferWithPoolPayload.amount.toString(),
    // Note - tryNativeToHexString, then converting back into a native string will remove capitilization. Will be a problem
    // only if we want to use checksum to verify addresses https://github.com/ethereum/EIPs/blob/master/EIPS/eip-55.md
    convertAddressToHexBuffer(transferWithPoolPayload.originAddress, CHAIN_ID_ETH),
    transferWithPoolPayload.originChain,
    convertAddressToHexBuffer(transferWithPoolPayload.targetAddress, CHAIN_ID_SOLANA),
    transferWithPoolPayload.targetChain,
    convertAddressToHexBuffer(transferWithPoolPayload.senderAddress, CHAIN_ID_ETH),
    transferWithPoolPayload.extraPayload
  )

  const result = parseTransferWithArbPayload(encodedTransferWithPool);

  expect(result.amount).toEqual(transferWithPoolPayload.amount.toBigInt());
  expect(tryHexToNativeString(result.originAddress, CHAIN_ID_ETH)).toEqual(transferWithPoolPayload.originAddress);
  expect(result.originChain).toEqual(transferWithPoolPayload.originChain);
  expect(tryHexToNativeString(result.targetAddress, CHAIN_ID_SOLANA)).toEqual(transferWithPoolPayload.targetAddress);
  expect(result.targetChain).toEqual(transferWithPoolPayload.targetChain);
  expect(tryHexToNativeString(result.senderAddress, CHAIN_ID_ETH)).toEqual(transferWithPoolPayload.senderAddress);
  expect(result.extraPayload).toEqual(transferWithPoolPayload.extraPayload);

  const swimResult = parseSwimPayload(result.extraPayload);
  expect(swimResult.swimMessageVersion).toBe(swimPayload.swimMessageVersion);
});

describe("parseSwimPayload", () => {
  it("with all fields", async() => {
    const targetAddress = SOLANA_TOKEN_BRIDGE_ADDRESS;
    const swimPayload = {
      swimMessageVersion: 1,
      targetChainRecipient: convertAddressToUint8(targetAddress, CHAIN_ID_SOLANA),
      propellerEnabled: true,
      gasKickstartEnabled: true,
      swimTokenNumber: 1,
      memoId: BigNumber.from(33)
    };

    const encodedSwim = encodeSwimPayload(
      swimPayload.swimMessageVersion,
      convertAddressToHexBuffer(targetAddress, CHAIN_ID_SOLANA),
      swimPayload.propellerEnabled,
      swimPayload.gasKickstartEnabled,
      swimPayload.swimTokenNumber,
      swimPayload.memoId.toString(),
    );

    const result = parseSwimPayload(encodedSwim);
    expect(result.swimMessageVersion).toBe(swimPayload.swimMessageVersion);
    expect(tryHexToNativeString(result.targetChainRecipient, CHAIN_ID_SOLANA)).toBe(targetAddress);
    expect(result.propellerEnabled).toBe(swimPayload.propellerEnabled);
    expect(result.gasKickstartEnabled).toBe(result.gasKickstartEnabled);
    expect(result.swimTokenNumber).toBe(swimPayload.swimTokenNumber);
    expect(result.memoId).toBe(swimPayload.memoId.toBigInt());
  });

  it("with no memo field", async () => {
    const targetAddress = SOLANA_TOKEN_BRIDGE_ADDRESS;
    const swimPayload = {
      swimMessageVersion: 1,
      targetChainRecipient: convertAddressToUint8(targetAddress, CHAIN_ID_SOLANA),
      propellerEnabled: true,
      gasKickstartEnabled: true,
      swimTokenNumber: 1
    };
  
    const encodedSwim = encodeSwimPayload(
      swimPayload.swimMessageVersion,
      convertAddressToHexBuffer(targetAddress, CHAIN_ID_SOLANA),
      swimPayload.propellerEnabled,
      swimPayload.gasKickstartEnabled,
      swimPayload.swimTokenNumber,
      null
    );
  
    const result = parseSwimPayload(encodedSwim);
    expect(result.swimMessageVersion).toBe(swimPayload.swimMessageVersion);
    expect(tryHexToNativeString(result.targetChainRecipient, CHAIN_ID_SOLANA)).toBe(targetAddress);
    expect(result.propellerEnabled).toBe(swimPayload.propellerEnabled);
    expect(result.gasKickstartEnabled).toBe(result.gasKickstartEnabled);
    expect(result.swimTokenNumber).toBe(swimPayload.swimTokenNumber);
    expect(result.memoId).toBe(0n);
  });

  it("only swimMessageVersion and targetChainRecipient", async() => {
    const targetAddress = SOLANA_TOKEN_BRIDGE_ADDRESS;
    const swimPayload = {
      swimMessageVersion: 1,
      targetChainRecipient: convertAddressToUint8(targetAddress, CHAIN_ID_SOLANA),
    };
  
    const encodedSwim = encodeSwimPayload(
      swimPayload.swimMessageVersion,
      convertAddressToHexBuffer(targetAddress, CHAIN_ID_SOLANA),
      null,
      null,
      null,
      null
    );
  
    const result = parseSwimPayload(encodedSwim);
    expect(result.swimMessageVersion).toBe(swimPayload.swimMessageVersion);
    expect(tryHexToNativeString(result.targetChainRecipient, CHAIN_ID_SOLANA)).toBe(targetAddress);
    expect(result.propellerEnabled).toBe(false);
    expect(result.gasKickstartEnabled).toBe(false);
    expect(result.swimTokenNumber).toBe(0);
    expect(result.memoId).toBe(0n);
  });
})