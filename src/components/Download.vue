<template lang="pug">
ElButton(@click="download()") download
a(v-show="false" ref="downloadAnchor" download)
</template>

<script setup lang="ts">
import { defineEmit, defineProps, ref } from "vue";
import type { PropType } from "vue";
import audioBufferToWav from "audiobuffer-to-wav";
import { ElButton } from "element-plus";

const props = defineProps({
  audioBuffer: { type: Object as PropType<AudioBuffer | undefined> },
  segments: { default: [] as [number, number][] },
});
const emit = defineEmit(["rendering"]);

const toWavUri = () => {
  if (!(props.audioBuffer && props.segments.length)) return;
  const sampleRate = props.audioBuffer.sampleRate;
  // scale segments and cast to int via |0
  const segments = props.segments.map(([from, to]) => [
    (from * sampleRate) | 0,
    (to * sampleRate) | 0,
  ]);
  // create Float32Array to hold PCM data
  const length = segments.reduce((sum, [from, to]) => sum + to - from, 0);
  const pcm = new Float32Array(length);

  // copy each segment into the PCM data
  let i = 0;
  segments.forEach(([from, to]) => {
    const len = to - from;
    props.audioBuffer!.copyFromChannel(pcm.subarray(i, i + len), 0, from);
    i += len;
  });

  // create new AudioBuffer from PCM data
  const chopped = new AudioBuffer({ sampleRate, length, numberOfChannels: 1 });
  chopped.copyToChannel(pcm, 0);

  // convert to AudioBuffer to .wav encoded binary string
  const wav = new Uint8Array(audioBufferToWav(chopped));
  let bin = "";
  for (i = 0; i < wav.byteLength; i++) bin += String.fromCharCode(wav[i]);

  // convert binary data to a Base64-encoded ASCII string and return a data URI
  return "data:audio/wav;base64," + btoa(bin);
};

const downloadAnchor = ref<HTMLAnchorElement>();
const download = () => {
  emit("rendering", true);
  // TODO: move this to a worker so the UI doesn't freeze while rendering
  const href = toWavUri();
  emit("rendering", false);
  if (!(href && downloadAnchor.value)) return;
  // set, click, and clear wavURI to initiate a client download
  downloadAnchor.value.href = href;
  downloadAnchor.value.click();
  downloadAnchor.value.href = "";
};
</script>
