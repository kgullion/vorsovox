<template lang="pug">
.peaksOverview(ref="overview")
.peaksZoomview(ref="zoomview")
audio.peaksAudio(ref="audio")
</template>

<script setup lang="ts">
import { defineProps, defineEmit, ref, toRefs, watch } from "vue";
import type { PropType } from "vue";

import Peaks from "peaks.js";
import type {
  AudioOptions,
  OptionalOptions,
  SegmentAddOptions,
  PeaksInstance,
} from "peaks.js";

// setup props, refs, and emitter
const props = defineProps({
  options: {
    type: Object as PropType<AudioOptions & OptionalOptions>,
    required: true,
  },
  segments: { default: [] as SegmentAddOptions | SegmentAddOptions[] },
});
const { options, segments } = toRefs(props);

const overview = ref<HTMLDivElement>();
const zoomview = ref<HTMLDivElement>();
const audio = ref<HTMLAudioElement>();
const peaks = ref<PeaksInstance>();

const emit = defineEmit(["peaks"]);

// update peaks segments on change of instance
watch([peaks, segments], () => {
  if (!peaks.value) return;
  peaks.value.segments.removeAll();
  peaks.value.segments.add(segments.value);
});

// create new instance on change of options
watch(options, async () => {
  Peaks.init(
    {
      mediaElement: audio.value,
      containers: { overview: overview.value!, zoomview: zoomview.value! },
      ...options.value,
    },
    (error, instance) => {
      if (error || !instance) throw error;
      else {
        peaks.value = instance;
        emit("peaks", instance);
      }
    }
  );
});
</script>

<style scoped>
div {
  height: 150px;
}
</style>
