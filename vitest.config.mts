import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    coverage: {
      provider: "v8",
      include: ["src/core/**", "src/editor/**", "src/persistence/**", "src/render/**"],
      exclude: ["**/*.test.ts", "src/core/catalog/data/**", "src/editor/store/**", "src/editor/createEditor.ts"],
      // ARCHITECTURE §12.2: minimums only where unit tests pay off
      thresholds: {
        "src/core/**": { lines: 85, branches: 75 },
        "src/editor/history/**": { lines: 60 },
        "src/editor/tools/ToolManager.ts": { lines: 60 },
        "src/editor/shortcuts/ShortcutManager.ts": { lines: 60 },
        "src/editor/selection/**": { lines: 60 },
        "src/editor/snapshots/**": { lines: 60 },
        "src/editor/tools/**": { lines: 75 },
        "src/editor/viewport/**": { lines: 90 },
        "src/editor/references/**": { lines: 75 },
        "src/editor/actions/paint.ts": { lines: 80 },
        "src/editor/actions/transforms.ts": { lines: 90 },
        "src/render/primitives/**": { lines: 60 },
      },
    },
  },
});
