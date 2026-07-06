import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/cli.ts", "src/index.ts"],
  format: ["esm"],
  clean: true,
  dts: true,
  splitting: false,
  sourcemap: true,
  target: "node24",
});
