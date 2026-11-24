import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { HELP_EN } from "./content.en";
import { HELP_UK } from "./content.uk";
import { TIPS } from "@/core/tips/tips";
import { allQuestions, HELP_PAGES, parseInline, type HelpTexts } from "./help";

const LANGS: [string, HelpTexts][] = [["en", HELP_EN], ["uk", HELP_UK]];
const shape = (t: HelpTexts) => t.pages.map((p) => [p.id, p.groups.map((g) => g.qs.map((q) => `${q.id}${q.shot ? "+shot" : ""}`))]);

describe("help pages", () => {
  it("both languages have the same pages, groups, questions and screenshots, in the same order", () => {
    expect(HELP_EN.pages.map((p) => p.id)).toEqual([...HELP_PAGES]);
    expect(shape(HELP_UK)).toEqual(shape(HELP_EN));
  });

  it("question ids are unique on their page and fit an anchor", () => {
    for (const p of HELP_EN.pages) {
      const ids = p.groups.flatMap((g) => g.qs.map((q) => q.id));
      expect(new Set(ids).size).toBe(ids.length);
      for (const id of ids) expect(id).toMatch(/^[a-z0-9-]+$/);
    }
  });

  it.each(LANGS)("every link in %s leads to a question, and the marks are closed", (_, texts) => {
    const known = new Set(allQuestions(texts).map((q) => `${q.page}#${q.id}`));
    for (const q of allQuestions(texts))
      for (const line of q.a) {
        for (const part of parseInline(line)) {
          if (part.t === "link") expect(known.has(part.to), `${q.page}#${q.id} → ${part.to}`).toBe(true);
          // an unclosed ** or ` would show up as text
          if (part.t === "text") expect(part.s, `${q.page}#${q.id}`).not.toMatch(/\*\*|`/);
        }
      }
  });

  it.each(LANGS)("every screenshot in %s is there", (lang, texts) => {
    for (const q of allQuestions(texts).filter((q) => q.shot))
      expect(existsSync(join(process.cwd(), "public", "help", lang, `${q.id}.png`)), `${lang}/${q.id}.png — run scripts/help-shots.mjs`).toBe(true);
  });
});

describe("tip of the day", () => {
  it("every tip's \"Read more\" leads to a help question", () => {
    const questions = new Set(allQuestions(HELP_EN).map((q) => `${q.page}#${q.id}`));
    for (const t of TIPS) expect(questions.has(t.help), t.help).toBe(true);
  });
});

describe("parseInline", () => {
  it("reads names, keys and links", () => {
    expect(parseInline("Press `O` or **Override**, see [this](draw#override).")).toEqual([
      { t: "text", s: "Press " },
      { t: "key", s: "O" },
      { t: "text", s: " or " },
      { t: "ui", s: "Override" },
      { t: "text", s: ", see " },
      { t: "link", s: "this", to: "draw#override" },
      { t: "text", s: "." },
    ]);
  });
});
