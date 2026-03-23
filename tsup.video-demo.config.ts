import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["site/video-demo/video-demo.ts"],
  format: ["esm"],
  outDir: "docs/video-demo",
  dts: false,
  clean: false,
  sourcemap: false,
  noExternal: [/.*/],
  platform: "browser",
});
