import { imageToPattern, type ImageToPatternInput } from "@/core/imageToPattern/candidates";

self.onmessage = (e: MessageEvent<ImageToPatternInput>) => {
  self.postMessage(imageToPattern(e.data));
};
