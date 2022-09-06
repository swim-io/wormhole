require("../helpers/loadConfig");

import { parseSwimPayload } from "../utils/swim";

(async () => {
    const payloadByteString = process.argv.slice(2)[0];
    //console.log("read from cmd line")
    //console.log(vaaPayloadHexString);
    const payloadBuffer = Buffer.from(payloadByteString, "hex");
    console.log(payloadBuffer);
  
    const parsedSwim = parseSwimPayload(payloadBuffer);
    console.log("parsed swim:");
    console.log(parsedSwim);
})();