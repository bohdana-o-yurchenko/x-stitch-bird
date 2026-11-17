"use client";

import { useEditor, useEditorState } from "../hooks/editor";
import { ImageImportDialog } from "./ImageImportDialog";
import { OpenPatternDialog } from "./OpenPatternDialog";
import { ChangelogDialog } from "./ChangelogDialog";
import { StraightenDialog } from "./StraightenDialog";
import { KeepPatternDialog } from "./KeepPatternDialog";
import { LiveConflictDialog } from "./LiveConflictDialog";
import { NewPatternDialog } from "./NewPatternDialog";
import {
  DeleteEntryDialog, DropChoiceDialog, ExtendCanvasDialog, GoToCellDialog, LargePhotoDialog, MirrorFromCentreDialog, PhotoRoomDialog,
  PatternKeeperDialog, ReplaceKeyDialog, ResizeDialog, TextFallbackDialog,
} from "./simpleDialogs";

/** Renders whichever dialog the editor asked for. */
export function DialogHost() {
  const ed = useEditor();
  const d = useEditorState((st) => st.dialog);
  if (!d) return null;
  // only this dialog: a button may have opened the next one already (the question before replacing a pattern)
  const close = () => ed.state.dialog === d && ed.closeDialog();
  switch (d.type) {
    case "deleteEntry": return <DeleteEntryDialog index={d.index} count={d.count} onClose={close} />;
    case "newPattern": return <NewPatternDialog onClose={close} />;
    case "open": return <OpenPatternDialog onClose={close} />;
    case "resize": return <ResizeDialog onClose={close} />;
    case "changelog": return <ChangelogDialog since={d.since} onClose={close} />;
    case "straighten": return <StraightenDialog onClose={close} />;
    case "imageImport": return <ImageImportDialog image={d.image} onClose={close} />;
    case "goToCell": return <GoToCellDialog onClose={close} />;
    case "mirrorFromCentre": return <MirrorFromCentreDialog onClose={close} />;
    case "extendCanvas": return <ExtendCanvasDialog onClose={close} />;
    case "replaceKey": return <ReplaceKeyDialog onClose={close} />;
    case "dropChoice": return <DropChoiceDialog file={d.file} onClose={close} />;
    case "patternKeeper": return <PatternKeeperDialog issues={d.issues} onClose={close} />;
    case "textFallback": return <TextFallbackDialog ext={d.ext} text={d.text} onClose={close} />;
    case "photoRoom": return <PhotoRoomDialog used={d.used} max={d.max} size={d.size} onClose={close} />;
    case "largePhoto": return <LargePhotoDialog w={d.w} h={d.h} answer={d.answer} onClose={close} />;
    case "liveConflict": return <LiveConflictDialog theirs={d.theirs} />;
    case "keepPattern": return <KeepPatternDialog then={d.then} onClose={close} />;
  }
}
