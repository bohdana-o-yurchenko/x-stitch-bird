"use client";

import { useEditor, useEditorState } from "../hooks/editor";
import { ImageImportDialog } from "./ImageImportDialog";
import { ChangelogDialog } from "./ChangelogDialog";
import { StraightenDialog } from "./StraightenDialog";
import { KeepPatternDialog } from "./KeepPatternDialog";
import { LiveConflictDialog } from "./LiveConflictDialog";
import { PdfPageDialog } from "./PdfPageDialog";
import { PdfChartDialog } from "./PdfChartDialog";
import { NewPatternDialog } from "./NewPatternDialog";
import {
  DeleteEntryDialog, DropChoiceDialog, ExtendCanvasDialog, GoToCellDialog, LargePhotoDialog, SamePatternDialog, FileChoiceDialog, PdfPatternIntroDialog, PdfUnreadableDialog, MirrorFromCentreDialog, PhotoRoomDialog,
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
    case "pdfPage": return <PdfPageDialog source={d.source} pages={d.pages} name={d.name} to={d.to} answer={d.answer} onClose={close} />;
    case "pdfChart": return <PdfChartDialog file={d.file} content={d.content} read={d.read} onClose={close} />;
    case "pdfPatternIntro": return <PdfPatternIntroDialog onClose={close} />;
    case "pdfUnreadable": return <PdfUnreadableDialog name={d.name} onClose={close} />;
    case "fileChoice": return <FileChoiceDialog prefer={d.prefer} onClose={close} />;
    case "samePattern": return <SamePatternDialog name={d.name} age={d.age} answer={d.answer} onClose={close} />;
    case "liveConflict": return <LiveConflictDialog theirs={d.theirs} />;
    case "keepPattern": return <KeepPatternDialog then={d.then} onClose={close} />;
  }
}
