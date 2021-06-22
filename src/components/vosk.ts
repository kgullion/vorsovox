import { createModel } from "vosk-browser";
import type { Model } from "vosk-browser";
import type {
  ServerMessagePartialResult,
  ServerMessageResult,
} from "vosk-browser/dist/interfaces";
import { queue, QueueObject } from "async";

// type for transcription tasks
type VoskTask = {
  buffer: AudioBuffer;
  sampleRate: number;
  grammar?: string;
  onPartial?: (result: ServerMessagePartialResult) => void;
};

// single thread worker
class VoskWorker {
  model: Promise<Model>;
  inUse: boolean;
  lastUsed: number;
  constructor(modelUrl = "/vosk-model-small-en-us-0.15.tar.gz") {
    this.model = createModel(modelUrl);
    this.inUse = false;
    this.lastUsed = 0;
  }
  async transcribe(
    buffer: VoskTask["buffer"],
    sampleRate = 44100,
    grammar?: VoskTask["grammar"],
    onPartial?: VoskTask["onPartial"]
  ) {
    // create recognizer
    const recognizer = new (await this.model).KaldiRecognizer(
      sampleRate,
      grammar
    );
    // add callback for partial results
    if (onPartial)
      recognizer.on("partialresult", (e) =>
        onPartial(e as ServerMessagePartialResult)
      );
    // transcribe buffer
    return new Promise<ServerMessageResult>((resolve) => {
      recognizer.on("result", (e) => resolve(e as ServerMessageResult));
      recognizer.acceptWaveform(buffer);
      recognizer.remove();
    });
  }
  terminate() {
    this.model.then((m) => m.terminate());
  }
}

export class VoskManager {
  queue: QueueObject<VoskTask>;
  workers: VoskWorker[];
  modelUrl: string;
  constructor(
    concurrency = 1,
    modelUrl = "/vosk-model-small-en-us-0.15.tar.gz"
  ) {
    this.modelUrl = modelUrl;
    this.workers = [];
    this.queue = queue(async (task) => {
      // find free worker
      const w = this.workers.findIndex((worker) => !worker.inUse);
      const worker = this.workers[w];
      // claim worker
      worker.inUse = true;
      worker.lastUsed = +new Date();
      // transcribe audio on worker
      const result = await worker.transcribe(
        task.buffer,
        task.sampleRate,
        task.grammar,
        task.onPartial
      );
      // free worker
      worker.inUse = false;
      return result;
    }, concurrency);
    this.concurrency = concurrency;
  }
  async transcribe(
    buffer: VoskTask["buffer"],
    sampleRate = 44100,
    grammar?: VoskTask["grammar"],
    onPartial?: VoskTask["onPartial"]
  ) {
    // add task to transcription queue
    return this.queue.pushAsync<ServerMessageResult>({
      buffer,
      sampleRate,
      grammar,
      onPartial,
    });
  }
  set concurrency(val: number) {
    // update queue concurrency
    this.queue.concurrency = val;
    // add new workers
    while (this.workers.length < val)
      this.workers.push(new VoskWorker(this.modelUrl));
    // remove extra workers
    while (this.workers.length > val) {
      const removed = this.workers.reduce((a, b) => {
        // prefer removal of never used workers first
        if (b.lastUsed === 0) return b;
        if (a.lastUsed === 0) return a;
        // prefer removal of not-in-use workers second
        if (!b.inUse) return b;
        if (!a.inUse) return a;
        // otherwise remove least recently used worker
        return a.lastUsed < b.lastUsed ? a : b;
      });
      const w = this.workers.findIndex((worker) => removed === worker);
      this.workers[w].terminate();
      // remove worker from worker pool
      this.workers.splice(w, 1);
    }
  }
}
