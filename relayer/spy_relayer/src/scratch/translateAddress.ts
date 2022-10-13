import {
  CHAIN_ID_SOLANA,
  CHAIN_ID_ETH,
  tryHexToNativeString,
  hexToUint8Array
} from "@certusone/wormhole-sdk";
import { parseSwimPayload, parseTransferWithArbPayload } from "../utils/swim";
import { parseVaaTyped } from "../listener/validation";

//const SWIM_USD_SOL_ADDRESS = "0x44a0a063099540e87e0163a6e27266a364c35930208cfaded5b79377713906e9";
const SWIM_USD_SOL_ADDRESS = "0x296b21c9a4722da898b5cba4f10cbf7693a6ea4af06938cab91c2d88afe26719";

const toAddress = "0x857d8c691b9e9a1a1e98d010a36d6401a9099ce89d821751410623ad7c2a20d2";
console.log(hexToUint8Array(toAddress.slice(2)));
console.log(tryHexToNativeString(toAddress.slice(2), CHAIN_ID_SOLANA));
console.log(tryHexToNativeString(toAddress, CHAIN_ID_ETH));

//const TEST_WALLET_ADDRESS = "8jzX33FVAV2RCe9aCufT7wjv7W96WeN8wGn6EVAAwnyi";
/*
const TEST_WALLET_ADDRESS = "9kwwhcf2hBg7YCNniSdA1PEmfZvipYsALuZJE5rNfpPE";
console.log(tryHexToNativeString(TEST_WALLET_ADDRESS, CHAIN_ID_SOLANA));
*/

const rawSwimPayload = "01660c0199fc55ed8106d597a5a8822eaa78a7e077aeae9c2c3955100625458681010000000000004dd1e001003eae814a86f395068cd1d4b036e9a0c0";
const swimBuffer = Buffer.from(rawSwimPayload, "hex");
const swimPayload = parseSwimPayload(swimBuffer);
console.log(swimPayload);

/*
(async () => {
  console.log("here");
  const vaaBytes = "010000000001001ee988c0a22a447759fcc9308b1efad9d130bf13f16b8b8d57dbd784ec40b1d43322baec42120dfdf73d06e4081389078d3bad794a3534eafe4832e3f4ccdde1016345920100000000000600000000000000000000000061e44e506ca5659e6c0bba9b678586fa2d7297560000000000001134010300000000000000000000000000000000000000000000000000000000004572cc296b21c9a4722da898b5cba4f10cbf7693a6ea4af06938cab91c2d88afe267190001857d8c691b9e9a1a1e98d010a36d6401a9099ce89d821751410623ad7c2a20d20001000000000000000000000000280999ab9abfde9dc5ce7afb25497d6bb3e8bdd401660c0199fc55ed8106d597a5a8822eaa78a7e077aeae9c2c3955100625458681010000000000004dd1e001003eae814a86f395068cd1d4b036e9a0c0";
  const rawVaa = Uint8Array.from(Buffer.from(vaaBytes, "base64"));
  console.log("here2");
  const vaa = await parseVaaTyped(rawVaa);
  console.log("here3");
  console.log(vaa);

  const payload3 = parseTransferWithArbPayload(Buffer.from(vaa.payload));
  console.log(payload3);

  const swimPayload = parseSwimPayload(Buffer.from(payload3.extraPayload));
  console.log(swimPayload);
})();
*/


/*
const test = Buffer.from("test");
console.log(test);
console.log(Buffer.isBuffer(test));

const test2 = [
  0,  0,   0,   0,   0,   0,   0,  0,   0,
  0,  0,   0, 157, 207, 157,  32, 92, 157,
227, 83,  52, 214,  70, 190, 228, 75,  45,
 40, 89, 113,  42,   9
];

console.log(Buffer.isBuffer(test2));
*/
