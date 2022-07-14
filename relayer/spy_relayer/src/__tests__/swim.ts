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
import { describe, expect, jest, test } from "@jest/globals";
import {
  ETH_PUBLIC_KEY,
  ETH_PRIVATE_KEY,
  SOLANA_CORE_BRIDGE_ADDRESS,
  SOLANA_TOKEN_BRIDGE_ADDRESS,
} from "./consts";
import {
  parseTransferWithArbPayload,
  parseSwimPayload
} from "../utils/swim";
import { BigNumber, BigNumberish } from "@ethersproject/bignumber";

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

// TODO put these functions somewhere else that makes more sense
export function toBigNumberHex(value: BigNumberish, numBytes: number): string {
  return BigNumber.from(value)
    .toHexString()
    .substring(2)
    .padStart(numBytes * 2, "0");
}

function encodeSwimPayload(
  swimMessageVersion: number,
  targetChainRecipient: Buffer,
  swimTokenNumber: number,
  minimumOutputAmount: string,
) {
  // TODO encode rest of propeller parameters after design finalized
  const encoded = Buffer.alloc(67);
  encoded.writeUInt8(swimMessageVersion, 0);
  encoded.write(targetChainRecipient.toString("hex"), 1, "hex");
  encoded.writeUInt16BE(swimTokenNumber, 33);
  encoded.write(toBigNumberHex(minimumOutputAmount, 32), 35, "hex");
  return encoded;
}

function encodeTransferWithPoolPayload(
  amount: string,
  originAddress: Buffer,
  originChain: number,
  targetAddress: Buffer,
  targetChain: number,
  fee: string,
  swimPayload: Buffer
) {
  const encoded = Buffer.alloc(133 + 67); // TODO change this size once swim payload finalized
  encoded.writeUInt8(3, 0); // this will always be payload type 3
  encoded.write(toBigNumberHex(amount, 32), 1, "hex");
  encoded.write(originAddress.toString("hex"), 33, "hex");
  encoded.writeUInt16BE(originChain, 65);
  encoded.write(targetAddress.toString("hex"), 67, "hex");
  encoded.writeUInt16BE(targetChain, 99);
  encoded.write(toBigNumberHex(fee, 32), 101, "hex");
  encoded.write(swimPayload.toString("hex"), 133, "hex");
  return encoded;
}

test("parseTransferWithPoolPayload", (done) => {
  (async() => {
    const swimPayload = {
      swimMessageVersion: 1,
      targetChainRecipient: SOLANA_TOKEN_BRIDGE_ADDRESS,
      swimTokenNumber: 1,
      minimumOutputAmount: BigNumber.from(33)
    };

    var encodedSwim = encodeSwimPayload(
      swimPayload.swimMessageVersion,
      Buffer.from(tryNativeToHexString(swimPayload.targetChainRecipient, CHAIN_ID_SOLANA), "hex"),
      swimPayload.swimTokenNumber,
      swimPayload.minimumOutputAmount.toString(),
    );
    console.log(encodedSwim);

    const transferWithPoolPayload = {
      amount: BigNumber.from(20),
      originAddress: ETH_PUBLIC_KEY.toLowerCase(),
      originChain: CHAIN_ID_ETH,
      targetAddress: SOLANA_TOKEN_BRIDGE_ADDRESS,
      targetChain: CHAIN_ID_SOLANA,
      fee: BigNumber.from(2020),
      extraPayload: encodedSwim
    };

    var encodedTransferWithPool = encodeTransferWithPoolPayload(
      transferWithPoolPayload.amount.toString(),
      // Note - tryNativeToHexString, then converting back into a native string will remove capitilization. Will be a problem
      // only if we want to use checksum to verify addresses https://github.com/ethereum/EIPs/blob/master/EIPS/eip-55.md
      Buffer.from(tryNativeToHexString(transferWithPoolPayload.originAddress, CHAIN_ID_ETH), "hex"),
      transferWithPoolPayload.originChain,
      Buffer.from(tryNativeToHexString(transferWithPoolPayload.targetAddress, CHAIN_ID_SOLANA), "hex"),
      transferWithPoolPayload.targetChain,
      transferWithPoolPayload.fee.toString(),
      transferWithPoolPayload.extraPayload
    )

    var result = parseTransferWithArbPayload(encodedTransferWithPool);
    console.log(result);
    /*
    // debug where address is no longer capitalized
    const address = transferWithPoolPayload.originAddress
    console.log(transferWithPoolPayload.originAddress);
    console.log(arrayify(address));
    console.log(zeroPad(arrayify(address), 32));
    console.log(uint8ArrayToHex(zeroPad(arrayify(address), 32))); // this statement is where all hex chars turn to lowercase
    */

    expect(result.amount).toEqual(transferWithPoolPayload.amount.toBigInt());
    expect(tryHexToNativeString(result.originAddress, CHAIN_ID_ETH)).toEqual(transferWithPoolPayload.originAddress);
    expect(result.originChain).toEqual(transferWithPoolPayload.originChain);
    expect(tryHexToNativeString(result.targetAddress, CHAIN_ID_SOLANA)).toEqual(transferWithPoolPayload.targetAddress);
    expect(result.targetChain).toEqual(transferWithPoolPayload.targetChain);
    expect(result.fee).toEqual(transferWithPoolPayload.fee.toBigInt());
    expect(result.extraPayload).toEqual(transferWithPoolPayload.extraPayload);

    var swimResult = parseSwimPayload(result.extraPayload);
    console.log(swimResult);
    expect(swimResult.swimMessageVersion).toBe(swimPayload.swimMessageVersion);
    done();
  })();
});

test("parseSwimPayload", (done) => {
  (async() => {


    const swimPayload = {
      swimMessageVersion: 1,
      targetChainRecipient: SOLANA_TOKEN_BRIDGE_ADDRESS,
      swimTokenNumber: 1,
      minimumOutputAmount: BigNumber.from(33)
    };

    var encoded = encodeSwimPayload(
      swimPayload.swimMessageVersion,
      Buffer.from(tryNativeToHexString(swimPayload.targetChainRecipient, CHAIN_ID_SOLANA), "hex"),
      swimPayload.swimTokenNumber,
      swimPayload.minimumOutputAmount.toString(),
    );
    //console.log(encoded);

    var result = parseSwimPayload(encoded);
    //console.log(result);
    expect(result.swimMessageVersion).toBe(swimPayload.swimMessageVersion);
    expect(tryHexToNativeString(result.targetChainRecipient, CHAIN_ID_SOLANA)).toBe(swimPayload.targetChainRecipient);
    expect(result.swimTokenNumber).toBe(swimPayload.swimTokenNumber);
    expect(result.minimumOutputAmount).toBe(swimPayload.minimumOutputAmount.toBigInt());
    done();
  })();
});
