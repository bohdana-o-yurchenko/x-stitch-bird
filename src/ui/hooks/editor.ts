"use client";

import { createContext, useContext } from "react";
import { useStore } from "zustand";
import { useShallow } from "zustand/react/shallow";
import type { Editor } from "@/editor/createEditor";
import type { EditorState } from "@/editor/store/editorStore";
import { keyNames } from "@/editor/shortcuts/keymap";

export const EditorContext = createContext<Editor | null>(null);

export function useEditor(): Editor {
  const ed = useContext(EditorContext);
  if (!ed) throw new Error("useEditor outside EditorContext");
  return ed;
}

/** Subscribe to a slice of editor state. Return primitives or existing objects (or use `useEditorShallow`). */
export function useEditorState<T>(selector: (s: EditorState) => T): T {
  return useStore(useEditor().store, selector);
}

/** For selectors that build a new object or array each time. */
export function useEditorShallow<T>(selector: (s: EditorState) => T): T {
  return useStore(useEditor().store, useShallow(selector));
}

/** Key names for texts that mention keys ({alt}, {undo}, {redo}, {copy}), as this computer's keyboard shows them. */
export function useKeyNames() {
  return keyNames(useEditor().isMac);
}

/** `run(id, args)` bound to the editor's command registry. */
export function useCommand() {
  const ed = useEditor();
  return (id: string, args?: unknown) => void ed.commands.run(id, args);
}
