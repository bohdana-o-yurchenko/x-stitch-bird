import { Files } from "files-sdk";
import { neon } from "files-sdk/neon";

/** Pictures in Neon Object Storage (the private "assets" bucket, neon.ts); credentials from the AWS_* env vars. */
export const assets = new Files({ adapter: neon({ bucket: "assets" }) });
