import {
  signAndEncodeVaa,
  encodeSwimPayload,
  encodeTransferWithPoolPayload
} from "./__tests__/utils";
import {
  CHAIN_ID_ETH,
  CHAIN_ID_SOLANA,
  uint8ArrayToHex,
  tryNativeToHexString,
  tryHexToNativeString
} from "@certusone/wormhole-sdk";
import { BigNumber } from "@ethersproject/bignumber";

const ETH_PRIVATE_KEY =
  "0x4f3edf983ac636a65a842ce7c78d9aa706d3b113bce9c46f30d7d21715b23b1d";
const ETH_PUBLIC_KEY = "0x90F8bf6A479f320ead074411a4B0e7944Ea8c9C1";
const SOLANA_TOKEN_BRIDGE_ADDRESS = "B6RHG3mfcckmrYN1UhmJzyS1XX3fZKbkeUcpJe9Sy3FE";
const TEST_APPROVED_ETH_TOKEN = "0xDDb64fE46a91D46ee29420539FC25FD07c5FEa3E";
const TEST_APPROVED_SOL_TOKEN = "So11111111111111111111111111111111111111112";

// create a test VAA
const originAddress = TEST_APPROVED_ETH_TOKEN.toLowerCase();

const swimPayload = {
  swimMessageVersion: 1,
  targetChainRecipient: SOLANA_TOKEN_BRIDGE_ADDRESS,
  swimTokenNumber: 1,
  minimumOutputAmount: BigNumber.from(33)
};

const encodedSwim = encodeSwimPayload(
  swimPayload.swimMessageVersion,
  Buffer.from(tryNativeToHexString(swimPayload.targetChainRecipient, CHAIN_ID_SOLANA), "hex"),
  swimPayload.swimTokenNumber,
  swimPayload.minimumOutputAmount.toString(),
);

const transferWithPoolPayload = {
  amount: BigNumber.from(20),
  originAddress: originAddress,
  originChain: CHAIN_ID_ETH,
  targetAddress: SOLANA_TOKEN_BRIDGE_ADDRESS,
  targetChain: CHAIN_ID_SOLANA,
  fee: BigNumber.from(2020),
  extraPayload: encodedSwim
};

const encodedTransferWithPool = encodeTransferWithPoolPayload(
  transferWithPoolPayload.amount.toString(),
  // Note - tryNativeToHexString, then converting back into a native string will remove capitilization. Will be a problem
  // only if we want to use checksum to verify addresses https://github.com/ethereum/EIPs/blob/master/EIPS/eip-55.md
  Buffer.from(tryNativeToHexString(transferWithPoolPayload.originAddress, CHAIN_ID_ETH), "hex"),
  transferWithPoolPayload.originChain,
  Buffer.from(tryNativeToHexString(transferWithPoolPayload.targetAddress, CHAIN_ID_SOLANA), "hex"),
  transferWithPoolPayload.targetChain,
  transferWithPoolPayload.fee.toString(),
  transferWithPoolPayload.extraPayload
);

const encodedVaa = signAndEncodeVaa(
  16,
  32,
  CHAIN_ID_ETH,
  Buffer.from(tryNativeToHexString(originAddress, CHAIN_ID_ETH), "hex"),
  1,
  encodedTransferWithPool
)

//console.log(encodedVaa);

const encoded64 = encodedVaa.toString('base64');
console.log(encoded64);
console.log("uri encoded: " + encodeURIComponent(encoded64));
// curl -v localhost:4201/relayvaa/<encodeURIComponent(encoded64)>

//const compare = Uint8Array.from(Buffer.from(encoded64, "base64"));
//console.log("compare: " + compare);


