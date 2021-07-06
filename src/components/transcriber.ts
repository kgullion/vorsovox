import { createModel } from "vosk-browser";
import type {
  ServerMessagePartialResult,
  ServerMessageResult,
} from "vosk-browser/dist/interfaces";
import { computed, ref, Ref, watch, triggerRef } from "vue";
import { segmentOnSilence } from "./vad";

export async function createTranscriber(
  modelUrl = "/vosk-model-small-en-us-0.15.tar.gz"
) {
  const model = await createModel(modelUrl);
  return {
    terminate: model.terminate.bind(model),
    transcribe: async function* (
      buffer: AudioBuffer,
      segments?: [number, number][],
      grammar?: string,
      onPartial?: (partial: string) => void
    ) {
      // TODO: currently the whole array is transcribed in one go, splitting
      // on silence allows better partial updates and, once it is implemented,
      // concurrent transcription
      if (!segments) segments = [[0, buffer.duration]];
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
      recognizer.on("partialresult", (message) => {
        if (message.result && onPartial)
          onPartial((message as ServerMessagePartialResult).result.partial);
        next();
      });
      recognizer.on("result", (message) => {
        if ((message as ServerMessageResult)?.result?.result?.length)
          results.push((message as ServerMessageResult).result);
        next();
      });

      for (let [from, to] of segments) {
        // copy segment of buffer for transcription
        from = Math.floor(from * buffer.sampleRate);
        to = Math.floor(to * buffer.sampleRate);
        const signal = new Float32Array(to - from);
        buffer.copyFromChannel(signal, 0, from);
        // scale data for Kaldi
        for (let i = signal.length; i--; ) signal[i] *= 0x8000;
        // send data to recognizer
        model["postMessage"](
          {
            action: "audioChunk",
            data: signal,
            recognizerId: recognizer.id,
            sampleRate: buffer.sampleRate,
          },
          {
            transfer: [signal.buffer],
          }
        );
        // wait for results event and yield results, if any
        await lock;
        if (results.length) yield* results;
        results = [];
      }
      // cleanup and yield final result
      recognizer.remove();
      await lock;
      if (results) yield* results;
    },
  };
}

export function useTranscriber(audioBuffer: Ref<AudioBuffer | undefined>) {
  const transcription = ref<ServerMessageResult["result"]["result"]>([]);
  const text = ref("");
  const partial = ref("");
  const transcribing = ref(false);
  const vosk = createTranscriber();

  const update = async () => {
    if (!audioBuffer) {
      return;
    }
    transcription.value = [];
    text.value = "";
    partial.value = "";
    if (!audioBuffer.value) return;
    transcribing.value = true;

    // split on silence of 250ms
    let midpoints: [number, number][] = [];
    let from = 0;
    let to = 0;
    const { silences } = await segmentOnSilence(audioBuffer.value, 0.25);
    for (const [a, b] of silences) {
      to = (a + b) / 2;
      if (from < to) midpoints.push([from, to]);
      from = to;
    }
    to = audioBuffer.value.duration;
    if (from < to) midpoints.push([from, to]);
    // transcribe and update refs
    for await (const result of (await vosk).transcribe(
      audioBuffer.value,
      midpoints,
      undefined,
      (p) => (partial.value = p)
    )) {
      transcription.value.push(...result.result);
      triggerRef(transcription);
      if (result.text.length) {
        text.value += " " + result.text;
        triggerRef(text);
      }
      partial.value = "";
    }
    transcribing.value = false;
  };
  // setup watcher for transcription
  watch([audioBuffer], update);
  update();

  // compute pauses based on transcription
  const minPause = ref(2000);
  const pauses = computed(() => {
    const min = minPause.value / 1000;
    let pauses: [number, number][] = [];
    let end = 0;
    for (let seg of transcription.value) {
      // add pause if it is long enough
      if (end + min <= seg.start) pauses.push([end, seg.start]);
      end = seg.end;
    }
    // add end pause
    pauses.push([end, audioBuffer.value!.duration]);
    return pauses;
  });

  // compute segments of transcription based on pauses
  const segments = computed(() => {
    if (transcription.value.length === 0) return [];
    let p = 0;
    let segs: typeof transcription.value[] = [];
    let seg: typeof transcription.value = [];
    for (const word of transcription.value) {
      const pause = pauses.value[p];
      // if end of current word is before start of next pause, add to segment
      if (word.end <= pause[0]) seg.push(word);
      else {
        // otherwise, end current segment and start a new one
        if (seg.length) segs.push(seg);
        seg = [word];
        // advance pause index until we find a pause after current word
        while (word.end > pauses.value[++p][0]) {}
      }
    }
    // push final segment if any words are in it
    if (seg.length > 0) segs.push(seg);
    return segs;
  });

  return {
    transcription,
    text,
    partial,
    transcribing,
    minPause,
    segments,
    pauses,
  };
}
