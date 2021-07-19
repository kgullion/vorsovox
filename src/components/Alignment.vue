<template lang="pug">
ElTabs(v-model="tab")
  ElTabPane(label="Select Files" name="files")
    Upload(@wav="audioBuffer = $event" @txt="corpus = $event")
  ElTabPane(label="Auto Align" name="align")
    ElSwitch(v-model="autoAlign" active-text="ON" inactive-text="OFF")
    br
    | Silence between segments: 
    ElInputNumber(v-model="autoSegmentGap")
    br
    | Padding around segments: 
    ElInputNumber(v-model="autoSegmentPadding")
    br
    | Minimum word count per segment: 
    ElInputNumber(v-model="aligner.minWordCount.value")
  ElTabPane(label="Manual Align" name="edit" :disabled="transcribing || !audioBuffer")
    br
    | From: 
    ElInputNumber(v-model="activeRegion.start" @change="updateActiveRegion(activeRegion)")
    br
    | To: 
    ElInputNumber(v-model="activeRegion.end" @change="updateActiveRegion(activeRegion)")
    br
    ElButton(@click="addRemoveRegion") {{ activeRegion.id?"Delete":"Add" }} Region
  ElTabPane(label="Export" name="export" :disabled="transcribing || !audioBuffer")
    Download(:audioBuffer="audioBuffer" :segments="exportSegments")
ElProgress(:percentage="percentage" v-show="transcribing")
ElCard
  ElRow(v-loading="transcribing" element-loading-text="Transcribing Audio...")
    ElCol
      div(ref="waveformDiv")
  ElSlider(v-model="zoomLevel" @change="updateZoom" :show-tooltip="false" v-show="audioBuffer")
  audio(ref="audio")
  span(v-for="word in wordSpans" :class="['word', word.regionId?'':'nonregion', word.active?'active':'']" @click="setActiveRegionId(word.regionId)") {{ word.word+" " }}
  span.active.nonregion {{partial}}
</template>

<script setup lang="ts">
import { ref, computed, watchEffect, watch, inject, triggerRef } from "vue";

import {
  ElInputNumber,
  ElButton,
  ElProgress,
  ElSwitch,
  ElSlider,
  ElCard,
  ElTabs,
  ElTabPane,
  ElRow,
  ElCol,
} from "element-plus";
import { sortedIndexBy } from "lodash";

import WaveSurfer from "wavesurfer.js";
import RegionsPlugin from "wavesurfer.js/src/plugin/regions";

import Upload from "./Upload.vue";
import Download from "./Download.vue";
import { useSegmentAligner } from "../compositions/aligner";
import { useTranscriber } from "../compositions/transcriber";
import { segmentize } from "../logic/segmentize";
import type { Region, RegionParams } from "wavesurfer.js/src/plugin/regions";

const regionColor = "#00000022";
const activeRegionColor = "#00000088";

const zoomLevel = ref(0);
const tab = ref("files");
const corpus = ref<string>("");
const audioBuffer = ref<AudioBuffer>();
const { transcription, partial, transcribing, percentage } =
  useTranscriber(audioBuffer);

// setup auto-alignment
const autoSegmentGap = ref(1);
const autoSegmentPadding = ref(0.05);
const segmentedTranscription = computed(() =>
  segmentize(transcription.value, autoSegmentGap.value)
);
const aligner = useSegmentAligner(corpus, segmentedTranscription);
type Annotated = typeof aligner.annotatedSegments.value[0][0];

// Refs for wavesurfer regions
const regionMap = ref(new Map<string, Region>());
const regionSpans = ref(new Map<string, [number, number]>());
type ActiveRegion = { id?: string; start?: number; end?: number };
const activeRegion = ref<ActiveRegion>({});
// updaters
const addRemoveRegion = () => {
  const act = activeRegion.value;
  if (act.id) {
    const region = regionMap.value.get(act.id);
    region?.remove();
    regionMap.value.delete(act.id);
  } else
    wavesurfer.value?.regions.add({
      id: new Date().getTime().toString(),
      start: act.start,
      end: act.end,
      color: activeRegionColor,
    });
};
const updateActiveRegion = (act: ActiveRegion) => {
  if (act.id) {
    const region = regionMap.value.get(act.id);
    if (region) region.update(act as RegionParams);
  }
};
const setActiveRegionId = (id: string | undefined) => {
  const old = activeRegion.value.id;
  if (old) regionMap.value.get(old)?.update({ id: old, color: regionColor });
  if (!id) activeRegion.value = {};
  else {
    const region = regionMap.value.get(id);
    if (region) {
      const { start, end } = region;
      activeRegion.value = { id, start, end };
      if (id !== old)
        regionMap.value.get(id)?.update({ id, color: activeRegionColor });
    }
  }
};
const setActiveRegion = (region: Region) => {
  if (activeRegion.value.id === region.id) return;
  regionMap.value.set(region.id, region);
  regionSpans.value.set(region.id, [region.start, region.end]);
  setActiveRegionId(region.id);
};

// event handlers for wavesurfer
const createHandler = (region: Region) => {
  regionMap.value.set(region.id, region);
  regionSpans.value.set(region.id, [region.start, region.end]);
  triggerRef(regionMap);
};
const removeHandler = (region: Region) => {
  regionMap.value.delete(region.id);
  if (activeRegion.value.id === region.id) activeRegion.value = {};
  triggerRef(regionMap);
};
const updateHandler = (region: Region) => {
  const span = regionSpans.value.get(region.id);
  if (span && (span[0] !== region.start || span[1] !== region.end)) {
    tab.value = "edit";
    autoAlign.value = false;
  }
  regionMap.value.set(region.id, region);
  regionSpans.value.set(region.id, [region.start, region.end]);
  if (region.color === activeRegionColor) {
    const { id, start, end } = region;
    activeRegion.value = { id, start, end };
  }
  triggerRef(regionMap);
};
// generate graph
const autoAlign = ref(true);
const getAudioContext = inject<() => AudioContext>("getAudioContext")!;
const waveformDiv = ref<HTMLDivElement>();
const audio = ref<HTMLAudioElement>();
const wavesurfer = ref<WaveSurfer>();
watchEffect(() => {
  if (!waveformDiv.value || !audioBuffer.value) return;
  wavesurfer.value?.destroy();
  const ws = WaveSurfer.create({
    audioContext: getAudioContext(),
    container: waveformDiv.value,
    partialRender: true,
    plugins: [{ name: "regions", params: {}, instance: RegionsPlugin }],
  });
  ws.on("region-created", createHandler);
  ws.on("region-updated", updateHandler);
  ws.on("region-update-end", updateHandler);
  ws.on("region-removed", removeHandler);
  ws.on("region-mouseenter", setActiveRegion);
  ws.on("region-dblclick", (region: Region) =>
    setTimeout(() => ws.play(region.start, region.end), 0)
  );
  wavesurfer.value = ws;
});

watchEffect(async () => {
  if (!wavesurfer.value || !audioBuffer.value) return;
  wavesurfer.value.loadDecodedBuffer(audioBuffer.value);
});
watch(
  [wavesurfer, autoAlign, aligner.annotatedSegments, autoSegmentPadding],
  () => {
    if (!wavesurfer.value || !autoAlign.value || !audioBuffer.value) return;
    wavesurfer.value.regions.clear();
    regionMap.value.clear();
    const coerce = (x: number) => {
      if (x < 0) return 0;
      else if (x <= audioBuffer.value!.duration) return x;
      else return audioBuffer.value!.duration;
    };
    for (const segment of aligner.annotatedSegments.value) {
      let end = 0;
      for (let i = segment.length; i--; )
        if (segment[i].corpus) {
          end = segment[i].end;
          break;
        }
      if (end > 0)
        wavesurfer.value.regions.add({
          id: end.toString(),
          start: coerce(segment[0].start - autoSegmentPadding.value),
          end: coerce(end + autoSegmentPadding.value),
          color: regionColor,
        });
    }
  }
);

type Span = { word: string; regionId?: string; active: boolean };
const wordSpans = computed(() => {
  let out = transcription.value.map(
    ({ word }): Span => ({ word, active: false })
  );
  for (const { start, end, id } of regionMap.value.values()) {
    let i = sortedIndexBy(
      transcription.value,
      { start } as any,
      ({ start }) => start
    );
    let word = transcription.value[i];
    // const active = id === activeRegion.value.id;
    while (word?.end <= end) {
      out[i].active ||=
        activeRegion.value.start! < word.end &&
        word.start < activeRegion.value.end!;
      out[i].regionId = id;
      word = transcription.value[++i];
    }
  }
  return out;
});
const exportSegments = computed(() =>
  [...regionMap.value.values()].map(({ start, end }): [number, number] => [
    start,
    end,
  ])
);
const updateZoom = () =>
  wavesurfer.value?.zoom(
    zoomLevel.value ** 3 / 2048 -
      zoomLevel.value ** 2 / 16 +
      4 * zoomLevel.value +
      1
  );
</script>

<style>
.nonregion {
  color: lightgray;
}
.active {
  font-style: italic;
}
</style>
