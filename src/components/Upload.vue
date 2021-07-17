<template lang="pug">
ElUpload(action :auto-upload="false" @change="onWav")
  ElButton(size="small" type="primary")
    i.el-icon-headset
    span.el-upload__text Select audio file (.wav)
ElUpload(action :auto-upload="false" @change="onTxt")
  ElButton(size="small" type="primary")
    i.el-icon-notebook-2
    span.el-upload__text Select script file (.txt)
</template>

<script setup lang="ts">
import { defineEmit, inject, ref, watchEffect } from "vue";
import { ElButton, ElUpload } from "element-plus";

const getCtx = inject<() => AudioContext>("getAudioContext");
const emit = defineEmit(["wav", "txt"]);

// on audio file load, convert to AudioBuffer and emit
const onWav = async ({ raw }: any) => {
  if (!raw) emit("wav", raw);
  else {
    const ctx = getCtx!();
    const arrayBuffer = await raw.arrayBuffer();
    emit("wav", await ctx.decodeAudioData(arrayBuffer));
  }
};

// on text file load, extract text and emit
const onTxt = async ({ raw }: any) => {
  if (!raw) emit("txt", "");
  else emit("txt", await raw.text());
};
</script>
