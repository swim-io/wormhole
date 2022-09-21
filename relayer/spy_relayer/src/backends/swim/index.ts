import { Backend, Relayer, Listener } from "../definitions";
import { SwimListener } from "./listener";
import { SwimRelayer } from "./relayer";

/** Payload version 3 with Swim payload token bridge listener and relayer backend */
const backend: Backend = {
  relayer: new SwimRelayer(),
  listener: new SwimListener(),
};

export default backend;
