import { Files } from "files-sdk";
import { neon } from "files-sdk/neon";

/*
 * Pictures in Neon Object Storage (the private "assets" bucket, neon.ts). Locally `neon env pull` writes the
 * credentials as AWS_* variables; on Vercel those names are reserved for Vercel's own infrastructure, so there the
 * same values are set as NEON_STORAGE_* — read first.
 */
const env = process.env;
const accessKeyId = env.NEON_STORAGE_ACCESS_KEY_ID, secretAccessKey = env.NEON_STORAGE_SECRET_ACCESS_KEY;

export const assets = new Files({
  adapter: neon({
    bucket: "assets",
    ...(env.NEON_STORAGE_ENDPOINT ? { endpoint: env.NEON_STORAGE_ENDPOINT } : {}),
    ...(env.NEON_STORAGE_REGION ? { region: env.NEON_STORAGE_REGION } : {}),
    ...(accessKeyId && secretAccessKey ? { accessKeyId, secretAccessKey } : {}),
  }),
});
