"use client";

import { useEditor, useEditorState } from "../hooks/editor";
import { ImageImportDialog } from "./ImageImportDialog";
import { KeyEntryDialog } from "./key-entry/KeyEntryDialog";
import { OpenPatternDialog, VersionsDialog } from "./OpenPatternDialog";
import {
  DeleteEntryDialog, DropChoiceDialog, ExtendCanvasDialog, GoToCellDialog, MirrorFromCentreDialog, NewPatternDialog,
  PatternInfoDialog, ReplaceKeyDialog, ResizeDialog, TextFallbackDialog,
} from "./simpleDialogs";

/** Renders whichever dialog the editor asked for. */
export function DialogHost() {
  const ed = useEditor();
  const d = useEditorState((st) => st.dialog);
  if (!d) return null;
  const close = () => ed.closeDialog();
  switch (d.type) {
    case "keyEntry": return <KeyEntryDialog key={d.edit ?? "new"} edit={d.edit} onClose={close} />;
    case "deleteEntry": return <DeleteEntryDialog index={d.index} count={d.count} onClose={close} />;
    case "newPattern": return <NewPatternDialog onClose={close} />;
    case "open": return <OpenPatternDialog onClose={close} />;
    case "resize": return <ResizeDialog onClose={close} />;
    case "versions": return <VersionsDialog onClose={close} />;
    case "imageImport": return <ImageImportDialog image={d.image} onClose={close} />;
    case "patternInfo": return <PatternInfoDialog onClose={close} />;
    case "goToCell": return <GoToCellDialog onClose={close} />;
    case "mirrorFromCentre": return <MirrorFromCentreDialog onClose={close} />;
    case "extendCanvas": return <ExtendCanvasDialog onClose={close} />;
    case "replaceKey": return <ReplaceKeyDialog onClose={close} />;
    case "dropChoice": return <DropChoiceDialog file={d.file} onClose={close} />;
    case "textFallback": return <TextFallbackDialog ext={d.ext} text={d.text} onClose={close} />;
  }
}
