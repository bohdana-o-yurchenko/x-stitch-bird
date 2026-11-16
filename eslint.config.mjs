import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import boundaries from "eslint-plugin-boundaries";

// Levels from docs/ARCHITECTURE.md §2 — a level may only import from the levels listed for it.
const levels = {
  core: ["core"],
  persistence: ["core", "persistence"],
  platform: ["core", "platform"],
  render: ["core", "render"],
  workers: ["core", "workers"],
  editor: ["core", "render", "persistence", "platform", "workers", "editor"],
  ui: ["editor", "render", "core", "platform", "i18n", "ui"],
  i18n: ["i18n"],
  // server-only: sign-in, database, object storage — imported by the app's API routes, never by the browser code
  server: ["core", "server"],
  app: ["ui", "i18n", "server", "app"],
};

const frameworkImports = ["react", "react-dom", "react/*", "next", "next/*", "next-intl", "next-intl/*", "zustand/react"];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: { boundaries },
    settings: {
      "import/resolver": { typescript: { alwaysTryTypes: true } },
      "boundaries/elements": Object.keys(levels).map((type) => ({ type, pattern: `src/${type}` })),
      "boundaries/files": [{ pattern: "**/*.test.ts", category: "test" }],
    },
    rules: {
      "boundaries/dependencies": [
        2,
        {
          default: "disallow",
          policies: Object.entries(levels).map(([from, to]) => ({
            from: { element: { type: from } },
            allow: { to: { element: { types: to } } },
          })),
        },
      ],
    },
  },
  {
    // the domain, drawing and application levels stay framework-free
    files: ["src/{core,render,editor,persistence,platform,workers}/**/*.ts"],
    ignores: ["**/*.test.ts"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [{ group: frameworkImports, message: "This level must not depend on React/Next (ARCHITECTURE §2)." }] }],
    },
  },
  {
    files: ["src/ui/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [{ group: ["@/persistence/*", "**/persistence/*"], message: "UI talks to the editor, not to storage." }] }],
    },
  },
  globalIgnores([".next/**", "out/**", "build/**", "coverage/**", "next-env.d.ts", "index.html", "playwright-report/**", "test-results/**"]),
]);

export default eslintConfig;
