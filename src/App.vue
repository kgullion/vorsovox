<template lang="pug">
Alignment
</template>

<script setup lang="ts">
import { provide } from "vue";
import Alignment from "./components/Alignment.vue";

// create one AudioContext and reuse it instead of initializing a new one each time
let audioContext: AudioContext;
const getAudioContext = () => {
  if (!audioContext) audioContext = new AudioContext();
  return audioContext;
};
provide("getAudioContext", getAudioContext);
</script>
