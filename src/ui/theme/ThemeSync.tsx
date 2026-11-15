"use client";

import { useLayoutEffect } from "react";
import { applyTheme, savedTheme } from "./appTheme";

/**
 * Keeps the saved theme on <html>. Switching the language re-renders the root layout, and React then resets the
 * attributes of <html> it doesn't know about (dropping `data-theme`); this puts it back before the browser paints.
 */
export function ThemeSync() {
  useLayoutEffect(() => applyTheme(savedTheme()));
  return null;
}
