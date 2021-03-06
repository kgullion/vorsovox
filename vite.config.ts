import { defineConfig } from "vite";
import importToCDN from "vite-plugin-cdn-import";
import vue from "@vitejs/plugin-vue";

// https://vitejs.dev/config/
export default defineConfig({
  base: "/vorsovox/",
  plugins: [
    vue(),
    importToCDN({
      prodUrl: "//unpkg.com/{name}@{version}/{path}",
      modules: [
        {
          name: "vue",
          var: "Vue",
          path: "dist/vue.global.prod.js",
        },
        {
          name: "vosk-browser",
          var: "Vosk",
          path: "/dist/vosk.js",
        },
      ],
    }),
  ],
});
