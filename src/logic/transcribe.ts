import { createModel } from "vosk-browser";
import type {
  RecognizerMessage,
  ServerMessagePartialResult,
  ServerMessageResult,
} from "vosk-browser/dist/interfaces";
import voskUrl from "../assets/vosk-model-small-en-us-0.15.tar.gz?url";

export type Transcriber = {
  // terminate: () => void;
  transcribe: (
    buffer: AudioBuffer,
    grammar?: string,
    onPartial?: (partial: string) => void,
    chunkSize?: number
  ) => Promise<{
    // id: number;
    // cancel: () => void;
    start: () => AsyncGenerator<ServerMessageResult["result"], void, undefined>;
  }>;
};

const hasPartial = (
  message: RecognizerMessage
): message is ServerMessagePartialResult =>
  (message as ServerMessagePartialResult).result?.partial?.length > 0;
const hasResult = (
  message: RecognizerMessage
): message is ServerMessageResult =>
  (message as ServerMessageResult).result?.result?.length > 0;

export async function createTranscriber(modelUrl = voskUrl) {
  const model = await createModel(modelUrl);
  let modelLock = Promise.resolve();
  return async function* (
    buffer: AudioBuffer,
    grammar?: string,
    onPartial?: (partial: string) => void,
    chunkSize = 0x10000
  ) {
    await modelLock;
    let modelUnlock: () => void;
    modelLock = new Promise<void>((resolve) => (modelUnlock = resolve));
    try {
      // setup results pool to push event data to
      let results: ServerMessageResult["result"][] = [];
      let resolve: () => void;
      let lock = new Promise<void>((r) => (resolve = r));
      // releases and replaces the lock promise
      const next = () => {
        resolve();
        lock = new Promise<void>((r) => (resolve = r));
      };
      // create recognizer for transcription
      const recognizer = new model.KaldiRecognizer(buffer.sampleRate, grammar);
      // intercept results
      const onMessage = (message: RecognizerMessage) => {
        if (hasResult(message)) results.push(message.result);
        else if (onPartial && hasPartial(message))
          onPartial((message as ServerMessagePartialResult).result.partial);
        next();
      };
      recognizer.on("partialresult", onMessage);
      recognizer.on("result", onMessage);
      let canceled = false;
      for (let i = 0; i < buffer.length; i += chunkSize) {
        let kaldiPcm = new Float32Array(chunkSize);
        buffer.copyFromChannel(kaldiPcm, 0, i);
        if (buffer.length < i + chunkSize)
          kaldiPcm = kaldiPcm.subarray(0, buffer.length % chunkSize);
        // scale data for Kaldi
        for (let i = kaldiPcm.length; i--; ) kaldiPcm[i] *= 0x8000;
        // send data to recognizer
        model["postMessage"](
          {
            action: "audioChunk",
            data: kaldiPcm,
            recognizerId: recognizer.id,
            sampleRate: buffer.sampleRate,
          },
          {
            transfer: [kaldiPcm.buffer],
          }
        );
        // wait for results event and yield results, if any
        await lock;
        if (canceled) return;
        if (results.length) yield* results;
        results = [];
      }
      // cleanup and yield final result
      recognizer.remove();
      await lock;
      if (results.length) yield* results;
    } finally {
      modelUnlock!();
    }
  };
}
// export async function createTranscriber(
//   modelUrl = voskUrl
// ): Promise<Transcriber> {
//   const model = await createModel(modelUrl);
//   model.on("error", (...e)=>console.error("VOSKERROR",...e))
//   model.on("load", (...e)=>console.log("VOSKLOADED",...e))
//   let id = 0;
//   return {
//     // terminate: model.terminate.bind(model),
//     transcribe: async (
//       buffer: AudioBuffer,
//       grammar?: string,
//       onPartial?: (partial: string) => void,
//       chunkSize = 0x10000
//     ) => {console.log("LOADING....")
//       while (!model.ready) {await new Promise(resolve=>setTimeout(resolve, 1000));console.log("WAITING....")}
//       // setup results pool to push event data to
//       let results: ServerMessageResult["result"][] = [];
//       let resolve: () => void;
//       let lock = new Promise<void>((r) => (resolve = r));
//       // releases and replaces the lock promise
//       const next = () => {
//         resolve();
//         lock = new Promise<void>((r) => (resolve = r));
//       };
//       // create recognizer for transcription
//       const recognizer = new model.KaldiRecognizer(buffer.sampleRate, grammar);
//       // intercept results
//       const onMessage = (message: RecognizerMessage) => {
//         if (hasResult(message)) results.push(message.result);
//         else if (onPartial && hasPartial(message))
//           onPartial((message as ServerMessagePartialResult).result.partial);
//         next();
//       };
//       recognizer.on("partialresult", onMessage);
//       recognizer.on("result", onMessage);
//       let kaldiPcm = new Float32Array(chunkSize);
//       let canceled = false;
//       return {
//         // id: id++,
//         // cancel: () => {
//         //   canceled = true;
//         //   results = [];
//         //   recognizer.removeEventListener("partialresult", null);
//         //   recognizer.removeEventListener("result", null);
//         //   recognizer.remove();
//         //   resolve();
//         // },
//         start: async function* () {
//           for (let i = 0; i < buffer.length; i += chunkSize) {
//             buffer.copyFromChannel(kaldiPcm, 0, i);
//             if (buffer.length < i + chunkSize)
//               kaldiPcm = kaldiPcm.subarray(0, buffer.length % chunkSize);
//             // scale data for Kaldi
//             for (let i = kaldiPcm.length; i--; ) kaldiPcm[i] *= 0x8000;
//             // send data to recognizer
//             model["postMessage"](
//               {
//                 action: "audioChunk",
//                 data: kaldiPcm,
//                 recognizerId: recognizer.id,
//                 sampleRate: buffer.sampleRate,
//               },
//               {
//                 transfer: [kaldiPcm.buffer],
//               }
//             );
//             // wait for results event and yield results, if any
//             await lock;
//             if (canceled) return;
//             if (results.length) yield* results;
//             results = [];
//           }
//           // cleanup and yield final result
//           recognizer.remove();
//           await lock;
//           if (results.length) yield* results;
//         },
//       };
//     },
//   };
// }
