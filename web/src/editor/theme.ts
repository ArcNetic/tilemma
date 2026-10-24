import { EditorView } from "@codemirror/view";

/** The editor's look, drawn entirely from the design tokens so it follows the light and dark themes. */
export const editorTheme = EditorView.theme({
  "&": { height: "100%", fontSize: "15px", backgroundColor: "var(--editor-bg)", color: "var(--text-1)" },
  "&.cm-focused": { outline: "2px solid var(--accent-fg)", outlineOffset: "-2px" },
  ".cm-scroller": { overflow: "auto", lineHeight: "1.55" },
  ".cm-content": { fontFamily: "var(--font-mono)", caretColor: "var(--accent-fg)", padding: "8px 0" },
  ".cm-line": { padding: "0 12px 0 8px" },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--accent-fg)", borderLeftWidth: "2px" },
  ".cm-placeholder": { color: "var(--text-3)" },

  ".cm-gutters": { backgroundColor: "var(--editor-gutter)", color: "var(--text-3)", border: "none", borderRight: "1px solid var(--border-1)" },
  ".cm-lineNumbers .cm-gutterElement": { padding: "0 10px 0 12px", minWidth: "2.2em" },
  ".cm-activeLine": { backgroundColor: "var(--editor-active)" },
  ".cm-activeLineGutter": { backgroundColor: "var(--editor-active)", color: "var(--text-1)" },
  ".cm-gutterElement.cm-fail-gutter": {
    color: "var(--state-error-fg)",
    fontWeight: "700",
    boxShadow: "inset 3px 0 0 var(--state-error-solid)",
  },

  "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground": {
    backgroundColor: "color-mix(in srgb, var(--accent-fg) 28%, transparent)",
  },
  "&.cm-focused .cm-matchingBracket": { backgroundColor: "color-mix(in srgb, var(--accent-fg) 24%, transparent)", outline: "none" },
  "&.cm-focused .cm-nonmatchingBracket": { backgroundColor: "var(--state-error-bg)" },

  "& .cm-lintRange-error": {
    backgroundImage: "none",
    textDecoration: "underline wavy var(--state-error-solid)",
    textDecorationSkipInk: "none",
    textUnderlineOffset: "4px",
  },
  "& .cm-lintRange-warning": {
    backgroundImage: "none",
    textDecoration: "underline wavy var(--state-warning-solid)",
    textDecorationSkipInk: "none",
    textUnderlineOffset: "4px",
  },

  ".cm-tooltip": {
    backgroundColor: "var(--surface-4)",
    color: "var(--text-1)",
    border: "1px solid var(--border-2)",
    borderRadius: "var(--radius-2)",
    boxShadow: "var(--shadow-2)",
    overflow: "hidden",
  },
  ".cm-tooltip-lint .cm-diagnostic": { padding: "6px 10px", fontFamily: "var(--font-ui)", fontSize: "var(--fs-sm)" },
  ".cm-diagnostic-error": { borderLeft: "4px solid var(--state-error-solid)" },
  ".cm-diagnostic-warning": { borderLeft: "4px solid var(--state-warning-solid)" },
  ".cm-tooltip-autocomplete > ul": { fontFamily: "var(--font-mono)", fontSize: "var(--fs-sm)", maxHeight: "14em" },
  ".cm-tooltip-autocomplete > ul > li": { padding: "3px 10px" },
  ".cm-tooltip-autocomplete > ul > li[aria-selected]": { backgroundColor: "var(--accent-wash)", color: "var(--text-1)" },
  ".cm-completionDetail": { color: "var(--text-3)", fontStyle: "normal", marginLeft: "0.8em" },
  ".cm-completionInfo": { fontFamily: "var(--font-ui)", color: "var(--text-2)", padding: "4px 10px" },
});
