import type { ServerMessageResult } from "vosk-browser/dist/interfaces";
import { ref, Ref, watch, triggerRef, computed } from "vue";
import { createTranscriber } from "../logic/transcribe";

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

  const percentage = computed(() => {
    if (!audioBuffer.value) return 0;
    else if (!transcribing.value) return 100;
    else if (!transcription.value.length) return 0;
    else
      return (
        (100 * transcription.value[transcription.value.length - 1].end) /
        audioBuffer.value.duration
      );
  });

  return {
    // terminate: vosk.then((v) => v.terminate()),
    transcription,
    text,
    partial,
    percentage,
    transcribing,
  };
}
