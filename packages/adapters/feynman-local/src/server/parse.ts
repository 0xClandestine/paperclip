// Feynman is built on Pi and emits the same JSONL output format — reuse Pi's parser.
export {
  parsePiJsonl as parseFeynmanJsonl,
  isPiUnknownSessionError as isFeynmanUnknownSessionError,
} from "@paperclipai/adapter-pi-local/server";
