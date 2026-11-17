import { accountPictureApi, accountUsageApi } from "@/persistence";
import { imageId } from "@/persistence/blobs";
import type { Editor } from "../createEditor";

/**
 * Signed in, before a photo is attached: does it fit in the account's room for photos (SPEC §15.35)? When it
 * doesn't, the user is told what to remove and it isn't added. A photo the account already has takes no more room;
 * signed out or offline nothing is asked (the account checks again when it goes up).
 */
export async function photoFits(ed: Editor, blob: Blob): Promise<boolean> {
  if (!ed.state.account) return true;
  const usage = await accountUsageApi.get();
  if (!usage || usage.photos + blob.size <= usage.maxPhotos) return true;
  if (await accountPictureApi.has(await imageId(blob))) return true;
  ed.openDialog({ type: "photoRoom", used: usage.photos, max: usage.maxPhotos, size: blob.size });
  return false;
}
