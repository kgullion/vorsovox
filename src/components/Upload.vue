<template lang="pug">
label(for="uploadWav") Select .wav file:
input(type="file" @change="onWav" accept=".wav" id="uploadWav")
label(for="uploadTxt") Select .txt file:
input(type="file" @change="onTxt" accept=".txt" id="uploadTxt")
</template>

<script setup lang="ts">
import { defineEmit, inject } from "vue";

const getCtx = inject<() => AudioContext>("getAudioContext");
const emit = defineEmit(["wav", "txt"]);

// helper function to extract first file from input elem, if it exists
const extractFile = (elem: HTMLInputElement) =>
  elem?.files?.length ? elem.files[0] : null;

// on audio file load, convert to AudioBuffer and emit
const onWav = async (event: Event) => {
  const file = extractFile(event.currentTarget as HTMLInputElement);
  if (!file) emit("wav", file);
  else {
    const ctx = getCtx!();
    const arrayBuffer = await file.arrayBuffer();
    emit("wav", await ctx.decodeAudioData(arrayBuffer));
  }
};

// on text file load, extract text and emit
const onTxt = async (event: Event) => {
  const file = extractFile(event.currentTarget as HTMLInputElement);
  if (!file) emit("txt", "");
  else emit("txt", await file.text());
};
</script>
