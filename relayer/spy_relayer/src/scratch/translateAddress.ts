import {
  CHAIN_ID_SOLANA,
  CHAIN_ID_ETH,
  tryHexToNativeString,
  hexToUint8Array
} from "@certusone/wormhole-sdk";

import {ethers} from "ethers";

//const SWIM_USD_SOL_ADDRESS = "0x44a0a063099540e87e0163a6e27266a364c35930208cfaded5b79377713906e9";
const SWIM_USD_SOL_ADDRESS = "0x296b21c9a4722da898b5cba4f10cbf7693a6ea4af06938cab91c2d88afe26719";

/*
console.log(hexToUint8Array(SWIM_USD_SOL_ADDRESS.slice(2)));
console.log(tryHexToNativeString(SWIM_USD_SOL_ADDRESS.slice(2), CHAIN_ID_SOLANA));
console.log(tryHexToNativeString(SWIM_USD_SOL_ADDRESS, CHAIN_ID_ETH));
*/

//const TEST_WALLET_ADDRESS = "8jzX33FVAV2RCe9aCufT7wjv7W96WeN8wGn6EVAAwnyi";
const TEST_WALLET_ADDRESS = "9kwwhcf2hBg7YCNniSdA1PEmfZvipYsALuZJE5rNfpPE";
console.log(tryHexToNativeString(TEST_WALLET_ADDRESS, CHAIN_ID_SOLANA));


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
