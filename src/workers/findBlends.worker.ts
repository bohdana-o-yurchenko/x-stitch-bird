import { DMC } from "@/core/catalog/catalog";
import { findBlends } from "@/core/imageToPattern/findBlends";

self.onmessage = (e: MessageEvent<string>) => {
  self.postMessage(findBlends(e.data, DMC).map((s) => ({ a: s.a.id, b: s.b.id, deltaE: s.deltaE })));
};
