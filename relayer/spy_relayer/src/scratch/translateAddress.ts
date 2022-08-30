import {
  CHAIN_ID_SOLANA,
  CHAIN_ID_ETH,
  tryHexToNativeString,
  hexToUint8Array
} from "@certusone/wormhole-sdk";

const SWIM_USD_SOL_ADDRESS = "0x44a0a063099540e87e0163a6e27266a364c35930208cfaded5b79377713906e9";

console.log(hexToUint8Array(SWIM_USD_SOL_ADDRESS.slice(2)));
console.log(tryHexToNativeString(SWIM_USD_SOL_ADDRESS.slice(2), CHAIN_ID_SOLANA));
console.log(tryHexToNativeString(SWIM_USD_SOL_ADDRESS, CHAIN_ID_ETH));
