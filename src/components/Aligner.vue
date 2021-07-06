<template lang="pug">
table
  template(v-for="chunk in annotatedTranscript")
    tr
      | ::::
    tr(v-for="a in chunk")
      td {{ a.word }}
      td {{ doubleMetaphone(a.word)[0] }}
      td {{ a.corpus }}
      td {{ a.corpus && doubleMetaphone(a.corpus)[0] }}
      td {{ a.start }} - {{ a.end }}
      td {{ a.conf }}
</template>

<script setup lang="ts">
import { defineProps } from "vue";
import { doubleMetaphone } from "double-metaphone";

defineProps({
  annotatedTranscript: {
    default: [] as {
      corpus?: string;
      conf: number;
      start: number;
      end: number;
      word: string;
    }[][],
  },
});
</script>
