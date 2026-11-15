import { readFileSync } from "node:fs";
import { createTranslator } from "next-intl";
import en from "../../messages/en.json";
import uk from "../../messages/uk.json";
import type { Translate } from "@/core/labels/keyLabel";

const root = new URL("../fixtures/", import.meta.url);
export const fixtureText = (name: string) => readFileSync(new URL(name, root), "utf8");
export const fixtureJson = <T = unknown>(name: string): T => JSON.parse(fixtureText(name));

const t = createTranslator({ locale: "en", messages: en });
export const translateEn: Translate = (key, values) => (t as unknown as Translate)(key, values);
const tUk = createTranslator({ locale: "uk", messages: uk });
export const translateUk: Translate = (key, values) => (tUk as unknown as Translate)(key, values);
