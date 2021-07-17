import type { ServerMessageResult } from "vosk-browser/dist/interfaces";
import { ref, Ref, watch, triggerRef } from "vue";
import { createTranscriber } from "../logic/transcribe";
import type { Transcriber } from "../logic/transcribe";

export function useTranscriber(audioBuffer: Ref<AudioBuffer | undefined>) {
  const transcription = ref<ServerMessageResult["result"]["result"]>([]);
  const text = ref("");
  const partial = ref("");
  const transcribing = ref(false);
  const vosk = createTranscriber();

  let currentJob: any; // ReturnType<Transcriber["transcribe"]> | undefined;
  const update = async () => {
    const v = await vosk;
    currentJob?.cancel();
    transcription.value = [];
    text.value = "";
    partial.value = "";
    if (!audioBuffer.value) return;
    transcribing.value = true;
    // transcribe and update refs
    for await (const result of v(
      audioBuffer.value,
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
  watch(audioBuffer, update);
  // update();

  return {
    // terminate: vosk.then((v) => v.terminate()),
    transcription,
    text,
    partial,
    transcribing,
  };
}
