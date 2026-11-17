import type { Editor } from "../createEditor";

/** Photos above this many pixels (24 MP, e.g. 6000 × 4000) are kept as they are, after a word about freezes. */
export const LARGE_PHOTO_PX = 24_000_000;
const NO_ASK_KEY = "stitchwork.largePhotoOk";

export const largePhotoAsked = () => {
  try {
    return localStorage.getItem(NO_ASK_KEY) === "1";
  } catch {
    return false;
  }
};

export function stopAskingLargePhoto() {
  try {
    localStorage.setItem(NO_ASK_KEY, "1");
  } catch {}
}

/**
 * Photos are never scaled down (SPEC §15.33); a very large one may freeze the app for a moment while it is decoded or
 * straightened, so the user is asked first (unless they said not to ask again). True: use it.
 */
export function confirmLargePhoto(ed: Editor, img: { naturalWidth: number; naturalHeight: number }): Promise<boolean> {
  const w = img.naturalWidth, h = img.naturalHeight;
  if (w * h <= LARGE_PHOTO_PX || largePhotoAsked()) return Promise.resolve(true);
  return new Promise((answer) => ed.openDialog({ type: "largePhoto", w, h, answer }));
}
