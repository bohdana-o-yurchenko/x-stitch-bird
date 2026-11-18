import { createNeonAuth } from "@neon/auth/next/server";

/** Sign-in (Neon Managed Better Auth, SPEC §15.23): sessions in Postgres, proxied through /api/auth. */
export const auth = createNeonAuth({
  baseUrl: process.env.NEON_AUTH_BASE_URL!,
  cookies: { secret: process.env.NEON_AUTH_COOKIE_SECRET! },
});

/** The signed-in user's id, or null: every API route checks this before touching a user's data. */
export async function currentUserId(): Promise<string | null> {
  const { data } = await auth.getSession();
  return data?.user?.id ?? null;
}

/** The signed-in user (id and email), or null. */
export async function currentUser(): Promise<{ id: string; email: string } | null> {
  const { data } = await auth.getSession();
  return data?.user ? { id: data.user.id, email: data.user.email } : null;
}
