"use client";

import { useEffect, useState } from "react";
import { accountUsage, type AccountUsage } from "@/editor/library";
import { useTranslations } from "next-intl";
import { cx, Dropdown, ui } from "../common/widgets";
import { SignInDialog } from "./SignInDialog";
import { useEditor, useEditorState } from "../hooks/editor";
import { useRouter } from "@/i18n/navigation";
import { authClient } from "./authClient";
import s from "./account.module.css";

/**
 * The account, in the header (SPEC §15.23): "Sign in" opens the sign-in dialog — Google, or a code sent by email
 * (the first sign-in makes the account). Signed in: the email, and Sign out. Signing in and out tells the editor,
 * so saved patterns also go to the account.
 */
export function AccountButton() {
  const ed = useEditor();
  const { data: session, isPending } = authClient.useSession();
  const user = useEditorState((st) => st.account);
  const router = useRouter();
  const open = useEditorState((st) => st.signInOpen);
  const setOpen = (on: boolean) => ed.store.setState({ signInOpen: on });

  useEffect(() => {
    if (isPending) return;
    const u = session?.user;
    ed.setAccount(u ? { id: u.id, email: u.email, ...(u.name ? { name: u.name } : {}) } : null);
  }, [ed, session, isPending]);

  if (isPending) return null;
  return (
    <AccountMenu
      user={user}
      signInOpen={open}
      setSignInOpen={setOpen}
      onSignedIn={(email) => ed.toast("account.signedIn", { email })}
      onMyPatterns={() => {
        ed.flush();
        router.push("/patterns");
      }}
      onAccount={() => {
        ed.flush();
        router.push("/account");
      }}
      beforeSignOut={() => ed.prepareSignOut()}
      onSignedOut={() => {
        ed.setAccount(null);
        ed.toast("account.signedOut");
      }}
    />
  );
}

/** "Sign in", or signed in: the initial, with the email and Sign out. Shared by the editor and the patterns page. */
export function AccountMenu({ user, signInOpen, setSignInOpen, onSignedIn, beforeSignOut, onSignedOut, onMyPatterns, onAccount }: {
  user: { email: string; name?: string } | null;
  signInOpen: boolean;
  setSignInOpen: (on: boolean) => void;
  onSignedIn?: (email: string) => void;
  /** Runs first (the account's patterns leave this browser). */
  beforeSignOut?: () => Promise<unknown>;
  onSignedOut?: () => void;
  /** Leave for the My patterns page (not given on that page itself). */
  onMyPatterns?: () => void;
  /** Leave for the account page (SPEC §15.38); a plain link when not given. */
  onAccount?: () => void;
}) {
  const t = useTranslations("account");
  const router = useRouter();
  const [usage, setUsage] = useState<AccountUsage | null>(null);
  // what the account holds against its limits (SPEC §15.35): read on sign-in, and again as the menu opens
  const email = user?.email;
  const readUsage = () => void accountUsage().then(setUsage);
  useEffect(() => {
    if (!email) return;
    let live = true;
    void accountUsage().then((u) => live && setUsage(u));
    return () => void (live = false);
  }, [email]);
  if (!user)
    return (
      <>
        <button type="button" className={cx(ui.btn, ui.ghost)} data-testid="sign-in" onClick={() => setSignInOpen(true)}>{t("signIn")}</button>
        {signInOpen && <SignInDialog onClose={() => setSignInOpen(false)} onSignedIn={onSignedIn} />}
      </>
    );
  const initial = (user.name || user.email).trim()[0]?.toUpperCase() ?? "?";
  return (
    <span data-testid="account">
      <Dropdown
        className={s.avatarBtn}
        label={<span className={s.avatar} title={user.email} aria-label={t("menu", { email: user.email })} onPointerDown={readUsage}>{initial}</span>}
        items={[
          { label: user.email, hint: t("signedInHint"), onClick: () => {} },
          ...(usage ? [{ id: "usage", node: <span className={s.usage} data-testid="account-usage">{t("usage", { patterns: usage.patterns, maxPatterns: usage.maxPatterns, photos: Math.ceil(usage.photos / 1048576), maxPhotos: Math.round(usage.maxPhotos / 1048576) })}</span> }] : []),
          "-",
          ...(onMyPatterns ? [{ label: t("myPatterns"), onClick: onMyPatterns }] : []),
          { label: t("account"), onClick: onAccount ?? (() => router.push("/account")) },
          "-",
          { label: t("signOut"), onClick: async () => { await beforeSignOut?.(); await authClient.signOut(); onSignedOut?.(); } },
        ]}
      />
    </span>
  );
}
