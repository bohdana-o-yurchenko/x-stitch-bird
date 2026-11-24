import { hoverMatching, pickBlock } from "../matching/matching";
import type { Tool } from "./types";

/**
 * Autofill (SPEC §15.11): the 10 × 10 block under the pointer is outlined; a click reads it off the image behind
 * the chart and shows what it found, to accept or decline — then the next block. Paused while the image is edited
 * (the pointer goes to the image then).
 */
export const autofillTool: Tool = {
  id: "autofill",
  icon: "autofill",
  labelKey: "tools.autofill",
  cursor: "pointer",
  hoverSquare: false,
  down: (ed, p) => pickBlock(ed, p.cell),
  hover: (ed, p) => hoverMatching(ed, p.cell),
};
