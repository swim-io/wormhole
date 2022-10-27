import keccak256 from "keccak256";
import { BigNumber, BigNumberish } from "@ethersproject/bignumber";
import {
  ChainId,
  tryNativeToHexString,
  tryHexToNativeString,
  uint8ArrayToHex
} from "@certusone/wormhole-sdk";

const elliptic = require("elliptic");

// copied from wormhole-icco https://github.com/certusone/wormhole-icco/blob/main/anchor-contributor/tests/helpers/wormhole.ts#L6
export function signAndEncodeVaa(
  timestamp: number,
  nonce: number,
  emitterChainId: number,
  emitterAddress: Buffer,
  sequence: number,
  data: Buffer
): Buffer {
  if (emitterAddress.length != 32) {
    throw Error("emitterAddress != 32 bytes");
  }

  // wormhole initialized with only one guardian in devnet
  const signers = ["cfb12303a19cde580bb4dd771639b0d26bc68353645571a8cff516ab2ee113a0"];

  const sigStart = 6;
  const numSigners = signers.length;
  const sigLength = 66;
  const bodyStart = sigStart + sigLength * numSigners;
  const bodyHeaderLength = 51;
  const vm = Buffer.alloc(bodyStart + bodyHeaderLength + data.length);

  // header
  const guardianSetIndex = 0;

  vm.writeUInt8(1, 0);
  vm.writeUInt32BE(guardianSetIndex, 1);
  vm.writeUInt8(numSigners, 5);

  // encode body with arbitrary consistency level
  const consistencyLevel = 1;

  vm.writeUInt32BE(timestamp, bodyStart);
  vm.writeUInt32BE(nonce, bodyStart + 4);
  vm.writeUInt16BE(emitterChainId, bodyStart + 8);
  vm.write(emitterAddress.toString("hex"), bodyStart + 10, "hex");
  vm.writeBigUInt64BE(BigInt(sequence), bodyStart + 42);
  vm.writeUInt8(consistencyLevel, bodyStart + 50);
  vm.write(data.toString("hex"), bodyStart + bodyHeaderLength, "hex");

  // signatures
  const hash = keccak256(keccak256(vm.subarray(bodyStart)));

  for (let i = 0; i < numSigners; ++i) {
    const ec = new elliptic.ec("secp256k1");
    const key = ec.keyFromPrivate(signers[i]);
    const signature = key.sign(hash, { canonical: true });

    const start = sigStart + i * sigLength;
    vm.writeUInt8(i, start);
    vm.write(signature.r.toString(16).padStart(64, "0"), start + 1, "hex");
    vm.write(signature.s.toString(16).padStart(64, "0"), start + 33, "hex");
    vm.writeUInt8(signature.recoveryParam, start + 65);
  }

  return vm;
}

// TODO put these functions somewhere else that makes more sense
export function toBigNumberHex(value: BigNumberish, numBytes: number): string {
  return BigNumber.from(value)
    .toHexString()
    .substring(2)
    .padStart(numBytes * 2, "0");
}

/**
 * There are three "formats" of swim payload:
 * 1. Only swimMessageVersion and targetChainRecipient
 * 2. Every field except memoId
 * 3. Every field
 */
export function encodeSwimPayload(
  swimMessageVersion: number,
  targetChainRecipient: Buffer,
  propellerEnabled: boolean | null,
  gasKickstartEnabled: boolean | null,
  maxSwimUSDFee: bigint | null,
  swimTokenNumber: number | null,
  memoId: Buffer | null
) {
  // Allocate the correct number of bytes for the encoded payload
  let encoded = Buffer.alloc(61);
  if (!propellerEnabled && !gasKickstartEnabled && !maxSwimUSDFee && !swimTokenNumber && !memoId) {
    encoded = Buffer.alloc(33);
  } else if (!memoId) {
    encoded = Buffer.alloc(61-16);
  }

  // Case 1
  encoded.writeUInt8(swimMessageVersion, 0);
  encoded.write(targetChainRecipient.toString("hex"), 1, "hex");

  // Case 2
  if (propellerEnabled)
    encoded.writeUInt8(propellerEnabled ? 1 : 0, 33);
  if (gasKickstartEnabled)
    encoded.writeUInt8(gasKickstartEnabled ? 1 : 0, 34);
  if (maxSwimUSDFee)
    encoded.writeBigUInt64BE(maxSwimUSDFee, 35);
  if (swimTokenNumber)
    encoded.writeUInt16BE(swimTokenNumber, 43);

  // Case 3
  if (memoId)
    encoded.write(memoId.toString("hex"), 45, "hex");
  return encoded;
}

export function encodeTransferWithPoolPayload(
  amount: string,
  originAddress: Buffer,
  originChain: number,
  targetAddress: Buffer,
  targetChain: number,
  senderAddress: Buffer,
  swimPayload: Buffer
) {
  const encoded = Buffer.alloc(133 + 61); // TODO change this size once swim payload finalized
  encoded.writeUInt8(3, 0); // this will always be payload type 3
  encoded.write(toBigNumberHex(amount, 32), 1, "hex");
  encoded.write(originAddress.toString("hex"), 33, "hex");
  encoded.writeUInt16BE(originChain, 65);
  encoded.write(targetAddress.toString("hex"), 67, "hex");
  encoded.writeUInt16BE(targetChain, 99);
  encoded.write(senderAddress.toString("hex"), 101, "hex");
  encoded.write(swimPayload.toString("hex"), 133, "hex");
  return encoded;
}

export function convertAddressToHexBuffer(address: string, chain_id: ChainId): Buffer {
  return Buffer.from(tryNativeToHexString(address, chain_id), "hex");
}

export function convertAddressToUint8Array(address: string, chain_id: ChainId): Uint8Array {
  return Uint8Array.from(convertAddressToHexBuffer(address, chain_id));
}

export function convertUint8ToAddress(uint8: Uint8Array, chain_id: ChainId): string {
  return tryHexToNativeString(uint8ArrayToHex(uint8), chain_id);
}
