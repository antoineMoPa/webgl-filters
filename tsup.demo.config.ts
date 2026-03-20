import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["site/demo/demo.ts"],
  format: ["esm"],
  outDir: "docs/demo",
  dts: false,
  clean: false,
  sourcemap: false,
  noExternal: [/.*/],
  platform: "browser",
});
