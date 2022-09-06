import {
  CHAIN_ID_SOLANA,
  CHAIN_ID_ETH,
  tryHexToNativeString,
  hexToUint8Array
} from "@certusone/wormhole-sdk";

import {ethers} from "ethers";
import Routing from "../swim_routing_abi.json";

const provider = new ethers.providers.JsonRpcBatchProvider("https://ethereum-goerli-rpc.allthatnode.com");
const routing_contract = new ethers.Contract("0xa33E4d9624608c468FE5466dd6CC39cE1Da4FF78", Routing, provider);

console.log(routing_contract.functions);
/*
//const SWIM_USD_SOL_ADDRESS = "0x44a0a063099540e87e0163a6e27266a364c35930208cfaded5b79377713906e9";
const SWIM_USD_SOL_ADDRESS = "0x296b21c9a4722da898b5cba4f10cbf7693a6ea4af06938cab91c2d88afe26719";

console.log(hexToUint8Array(SWIM_USD_SOL_ADDRESS.slice(2)));
console.log(tryHexToNativeString(SWIM_USD_SOL_ADDRESS.slice(2), CHAIN_ID_SOLANA));
console.log(tryHexToNativeString(SWIM_USD_SOL_ADDRESS, CHAIN_ID_ETH));
*/