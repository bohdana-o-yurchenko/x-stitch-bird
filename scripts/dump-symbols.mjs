// Prints every chart symbol (shapes with their parts, then the characters) as JSON, for build-symbol-font.py.
// Run with Node 24+ (it reads the TypeScript sources directly):  node scripts/dump-symbols.mjs
import { registerHooks } from "node:module";

// the sources import each other without ".ts"
registerHooks({
  resolve(specifier, context, next) {
    try {
      return next(specifier, context);
    } catch (e) {
      if (specifier.startsWith(".")) return next(`${specifier}.ts`, context);
      throw e;
    }
  },
});

const { SHAPES, TEXT_SYMBOLS } = await import("../src/core/symbols/shapes.ts");
console.log(JSON.stringify({ shapes: SHAPES, text: TEXT_SYMBOLS }));
