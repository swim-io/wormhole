import keccak256 from "keccak256";
import { BigNumber, BigNumberish } from "@ethersproject/bignumber";

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

export function encodeSwimPayload(
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

export function encodeTransferWithPoolPayload(
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
