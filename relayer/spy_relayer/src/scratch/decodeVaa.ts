require("../helpers/loadConfig");

import { parseTransferWithArbPayload, parseSwimPayload } from "../utils/swim";

(async () => {
  const vaaPayloadHexString = process.argv.slice(2)[0];
  //console.log("read from cmd line")
  //console.log(vaaPayloadHexString);
  const vaaBuffer = Buffer.from(vaaPayloadHexString, "hex");
  console.log(vaaBuffer);

  const parsed = parseTransferWithArbPayload(vaaBuffer);
  console.log("parsed payload:");
  console.log(parsed);

  const extraPayload = parsed.extraPayload;
  const parsedSwim = parseSwimPayload(extraPayload);
  console.log("parsed swim:");
  console.log(parsedSwim);
})();

