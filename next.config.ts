import { readFileSync } from "node:fs";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

// the app's version (package.json) is shown in "What's new" and decides when that dialog appears (docs/RELEASING.md)
const { version } = JSON.parse(readFileSync("package.json", "utf8")) as { version: string };

const nextConfig: NextConfig = { env: { NEXT_PUBLIC_APP_VERSION: version } };

export default createNextIntlPlugin("./src/i18n/request.ts")(nextConfig);
