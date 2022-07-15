process.env.LOG_LEVEL = "debug";
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
  ParsedVaa
} from "../listener/validation";
import {
  ETH_PUBLIC_KEY,
  ETH_PRIVATE_KEY,
  SOLANA_CORE_BRIDGE_ADDRESS,
  SOLANA_TOKEN_BRIDGE_ADDRESS,
} from "./consts";
import {
  signAndEncodeVaa
} from "./utils";

setDefaultWasm("node");

jest.setTimeout(10000);

describe("parseAndValidateVaa", () => {
  test("swim payload", (done) => {
    done();
  });
});

test("parseVaaTyped", (done) => {
  (async () => {
    const data = Buffer.alloc(16);
    const emitterAddress = ETH_PUBLIC_KEY.toLowerCase(); // encoding/decoding removes capitalization

    let encodedVaa = signAndEncodeVaa(
      16,
      32,
      CHAIN_ID_ETH,
      Buffer.from(tryNativeToHexString(emitterAddress, CHAIN_ID_ETH), "hex"),
      1,
      data
    );

    const result = await parseVaaTyped(encodedVaa);
    console.log(result);
    expect(result.timestamp).toBe(16);
    expect(result.nonce).toBe(32);
    expect(result.emitterChain).toBe(CHAIN_ID_ETH);
    expect(tryHexToNativeString(result.emitterAddress, CHAIN_ID_ETH)).toEqual(emitterAddress);
    expect(result.sequence).toBe(1);
    expect(Buffer.from(result.payload)).toEqual(data);
    done();
  })();
});
