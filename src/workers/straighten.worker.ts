import { straightenImage, type StraightenJob } from "./straightenImage";

self.onmessage = async (e: MessageEvent<StraightenJob>) => {
  self.postMessage(await straightenImage(e.data));
};
