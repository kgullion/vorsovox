<template lang="pug">
Transcriber
</template>

<script lang="ts">
import { defineComponent } from "vue";
import Transcriber from "./components/Transcriber.vue";

export default defineComponent({
  name: "App",
  components: {
    Transcriber,
  },
});
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
