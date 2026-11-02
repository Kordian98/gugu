import swc from "unplugin-swc";
import { defineConfig } from "rolldown";

// The API is bundled (docs/adr/0008): workspace packages such as @gugu/contracts ship TypeScript
// source, and SWC emits the decorator metadata Nest's DI needs. npm dependencies stay external.
export default defineConfig({
  input: { main: "src/main.ts", worker: "src/worker.ts" },
  platform: "node",
  external: (id) => !id.startsWith(".") && !id.startsWith("/") && !id.startsWith("@gugu/"),
  plugins: [swc.rolldown({ tsconfigFile: "tsconfig.json" })],
  output: { dir: "dist", format: "esm", sourcemap: true },
});
