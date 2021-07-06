<template lang="pug">
div
  | Split at pause of length (ms):
  input(v-model.number="minPause" type="number")
  | Padding (ms):
  input(v-model.number="segmentPadding" type="number")
div
  Upload(@wav="audioBuffer = $event" @txt="corpus = $event")
  Download(:audio-buffer="audioBuffer" :segments="paddedSegmentSpans")
div
  Peaks(:options="peaksOptions" @peaks="peaks=$event" :segments="peaksSegments")
div
  Aligner(:annotated-transcript="aligner.annotatedTranscript.value")
</template>

<script setup lang="ts">
import { ref, provide, computed } from "vue";
import type { PeaksInstance, AudioOptions, OptionalOptions } from "peaks.js";

import Upload from "./components/Upload.vue";
import Download from "./components/Download.vue";
import Peaks from "./components/Peaks.vue";
import Aligner from "./components/Aligner.vue";

import { useAligner } from "./components/aligner";
import { useTranscriber } from "./components/transcriber";

// create one AudioContext and reuse it instead of initializing a new one each time
let audioContext: AudioContext;
const getAudioContext = () => {
  if (!audioContext) audioContext = new AudioContext();
  return audioContext;
};
provide("getAudioContext", getAudioContext);

// get uploaded audio and corpus
const audioBuffer = ref<AudioBuffer>();
const corpus = ref("");

// transcribe
const { minPause, segments } = useTranscriber(audioBuffer);

// do alignment
const aligner = useAligner(corpus, segments);

// calculate spans for download
const segmentPadding = ref(100);
const paddedSegmentSpans = computed(() => {
  const pad = segmentPadding.value / 1000;
  const end = audioBuffer.value?.duration || 0;
  return aligner.alignedSpans.value.reduce((acc, [from, to], i, arr) => {
    from = Math.max(from - pad, 0);
    to = Math.min(to + pad, end);
    if (i === 0 || arr[i - 1][1] < from) acc.push([from, to]);
    else acc[acc.length - 1][1] = to;
    return acc;
  }, [] as typeof aligner.alignedSpans.value);
});

// generate graph
const peaks = ref<PeaksInstance | undefined>(undefined);
const peaksOptions = computed<AudioOptions & OptionalOptions>(() => {
  if (!audioBuffer.value) return {};
  return {
    keyboard: true,
    webAudio: {
      audioContext: getAudioContext(),
      audioBuffer: audioBuffer.value,
    },
  };
});
const peaksSegments = computed(() =>
  segments.value.map((segment) => ({
    startTime: segment[0].start,
    endTime: segment[segment.length - 1].end,
    labelText: segment.map(({ word }) => word).join(" "),
  }))
);
</script>

<style>
#app {
  font-family: Avenir, Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-align: center;
  color: #2c3e50;
  margin-top: 60px;
}
</style>
