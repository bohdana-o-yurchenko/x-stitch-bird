"use client";

import { createAuthClient } from "@neon/auth/next";

/** Sign-in from the browser, through the app's own /api/auth (SPEC §15.23). */
export const authClient = createAuthClient();
