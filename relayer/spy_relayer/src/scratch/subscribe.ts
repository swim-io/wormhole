import { ChainId } from "@certusone/wormhole-sdk";
import {
    createSpyRPCServiceClient,
    subscribeSignedVAA,
} from "@certusone/wormhole-spydk";
import { sleep } from "../helpers/utils";

(async () => {
    while (true) {
        let stream: any;
        try {
          const client = createSpyRPCServiceClient(
            "localhost:7073"
          );
          stream = await subscribeSignedVAA(client, {
            filters: []
          });
    
          //TODO validate that this is the correct type of the vaaBytes
          stream.on("data", ({ vaaBytes }: { vaaBytes: Buffer }) => {
            const asUint8 = new Uint8Array(vaaBytes);
            console.log("got vaa");
          });
    
          let connected = true;
          stream.on("error", (err: any) => {
            console.log("spy service returned an error: %o", err);
            connected = false;
          });
    
          stream.on("close", () => {
            console.log("spy service closed the connection!");
            connected = false;
          });
    
          console.log(
            "connected to spy service, listening for transfer signed VAAs"
          );
    
          while (connected) {
            await sleep(1000);
          }
        } catch (e) {
          console.log("spy service threw an exception: %o", e);
        }
    
        stream.end;
        await sleep(5 * 1000);
        console.log("attempting to reconnect to the spy service");
    }
})();
