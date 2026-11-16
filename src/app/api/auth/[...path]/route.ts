import { auth } from "@/server/auth";

/** Neon Auth's endpoints, proxied on our own origin (sign-in by email code and Google, sessions). */
export const { GET, POST, PUT, PATCH, DELETE } = auth.handler();
