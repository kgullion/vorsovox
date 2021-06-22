<template lang="pug">
input(type="file" @change="onFileChange")
p {{ transcription.result.text }}
</template>

<script lang="ts">
import { defineComponent, ref } from "vue";
import type { ServerMessageResult } from "vosk-browser/dist/interfaces";

import { VoskManager } from "./vosk";

export default defineComponent({
  name: "Transcriber",
  setup: () => {
    // CONSTANTS
    const transcriber = new VoskManager();
    const blankTranscription: ServerMessageResult = {
      event: "result",
      result: { result: [], text: "" },
    };
    // REFS
    const audioBuffer = ref(
      new AudioBuffer({ length: 1, numberOfChannels: 1, sampleRate: 44100 })
    );
    const transcription = ref(blankTranscription);
    // METHODS
    const onFileChange = async (event: Event) => {
      const { files } = event.currentTarget as HTMLInputElement;
      if (files?.length) {
        const audioContext = new OfflineAudioContext(1, 0x1000, 44100);
        // get file buffer
        const arrayBuffer = await files[0].arrayBuffer();
        // decode to audioBuffer
        audioBuffer.value = await audioContext.decodeAudioData(arrayBuffer);
        // clear transcription and transcribe new audiobuffer
        transcription.value = blankTranscription;
        transcription.value = await transcriber.transcribe(audioBuffer.value);
      }
    };

    return { onFileChange, transcription };
  },
});
</script>
