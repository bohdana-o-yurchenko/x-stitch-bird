"use client";

import { useTranslations } from "next-intl";
import { Modal, ui } from "../common/widgets";
import { useEditor, useEditorState } from "../hooks/editor";

/**
 * Signed out, before another pattern takes the open one's place (SPEC §15.25): it's only in this browser, so keep
 * it — download its work file, or sign in — or let it go.
 */
export function KeepPatternDialog({ then, onClose }: { then: { command: string; args?: unknown }; onClose: () => void }) {
  const t = useTranslations("keepPattern");
  const ed = useEditor();
  const name = useEditorState((st) => st.doc.name);
  const go = () => ed.commands.run(then.command, then.args, true);
  return (
    <Modal
      title={t("title")}
      help="start#keep-pattern"
      wide
      onClose={onClose}
      buttons={[
        { label: t("cancel") },
        { label: t("signIn"), onClick: () => ed.store.setState({ signInOpen: true }) },
        // plain, so the one coloured button is the safe one
        { label: t("replace"), onClick: go },
        {
          label: t("download"),
          primary: true,
          onClick: async () => {
            await ed.commands.run("file.export", "pattern");
            await go();
          },
        },
      ]}
    >
      <div data-testid="keep-pattern">
        <p>{t("body", { name })}</p>
        <p className={ui.hint}>{t("why")}</p>
      </div>
    </Modal>
  );
}
