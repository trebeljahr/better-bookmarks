import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { defineWxtModule } from "wxt/modules";

export default defineWxtModule({
  name: "copy-onnx-wasm",
  setup(wxt) {
    wxt.hooks.hook("build:before", () => {
      const require = createRequire(import.meta.url);

      const transformersDist = dirname(require.resolve("@huggingface/transformers"));
      const ortWebDist = dirname(require.resolve("onnxruntime-web"));

      const outDir = join(wxt.config.root, "public", "transformers");
      if (existsSync(outDir)) rmSync(outDir, { recursive: true, force: true });
      mkdirSync(outDir, { recursive: true });

      const KEEP = /^ort-wasm-simd-threaded\.(jsep\.)?(wasm|mjs)$/;
      let copied = 0;
      for (const sourceDir of [transformersDist, ortWebDist]) {
        for (const f of readdirSync(sourceDir)) {
          if (KEEP.test(f)) {
            copyFileSync(join(sourceDir, f), join(outDir, f));
            copied++;
          }
        }
      }
      wxt.logger.info(`copy-onnx-wasm: copied ${copied} ORT runtime files to public/transformers/`);
    });
  },
});
