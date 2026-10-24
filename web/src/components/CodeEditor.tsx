import { autocompletion } from "@codemirror/autocomplete";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { bracketMatching } from "@codemirror/language";
import { linter, setDiagnostics, type Diagnostic as CmDiagnostic } from "@codemirror/lint";
import { EditorState, Prec } from "@codemirror/state";
import { EditorView, drawSelection, highlightActiveLine, keymap, lineNumbers, placeholder } from "@codemirror/view";
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import type { Diagnostic } from "@pp/engine";
import { makeCompletionSource, type EditorVariant } from "../editor/completion.js";
import { proofHighlighting, proofLanguage } from "../editor/language.js";
import { lineMarks, setLineMarks } from "../editor/marks.js";
import { colorSwatches } from "../editor/swatches.js";
import { editorTheme } from "../editor/theme.js";
import { docLinesOf, rangeFor } from "../lib/ranges.js";

export type CodeEditorHandle = {
  insertAtCursor: (text: string) => void;
  focus: () => void;
};

export type CodeEditorProps = {
  variant: EditorVariant;
  value: string;
  ariaLabel: string;
  placeholderText: string;
  diagnostics: readonly Diagnostic[];
  dimAfterLine: number | null;
  activeLine: number | null;
  /** The line the timeline pointer is over, if any. */
  hoverLine?: number | null;
  helperNames: readonly string[];
  onChange: (text: string) => void;
  onCursorLine?: (line: number, docChanged: boolean) => void;
  onStep?: (delta: -1 | 1) => void;
  onRun?: () => void;
};

const toCmDiagnostics = (diagnostics: readonly Diagnostic[], text: string): CmDiagnostic[] => {
  const doc = docLinesOf(text);
  return diagnostics.flatMap((d) => {
    const range = rangeFor(d, doc);
    return range ? [{ from: range.from, to: range.to, severity: d.severity, message: d.message, source: "Tilemma" }] : [];
  });
};

export const CodeEditor = forwardRef<CodeEditorHandle, CodeEditorProps>(function CodeEditor(props, ref) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const latest = useRef(props);
  latest.current = props;

  useImperativeHandle(ref, () => ({
    insertAtCursor(text) {
      const v = view.current;
      if (!v) return;
      const { from, to } = v.state.selection.main;
      v.dispatch({ changes: { from, to, insert: text }, selection: { anchor: from + text.length }, scrollIntoView: true });
      v.focus();
    },
    focus() {
      view.current?.focus();
    },
  }));

  useEffect(() => {
    if (!host.current) return;
    const stepKeys = Prec.highest(
      keymap.of([
        { key: "Alt-ArrowLeft", run: () => (latest.current.onStep?.(-1), true) },
        { key: "Alt-ArrowRight", run: () => (latest.current.onStep?.(1), true) },
        { key: "Mod-Enter", run: () => (latest.current.onRun?.(), true) },
      ]),
    );
    const state = EditorState.create({
      doc: latest.current.value,
      extensions: [
        stepKeys,
        lineNumbers(),
        history(),
        drawSelection(),
        EditorView.lineWrapping,
        highlightActiveLine(),
        bracketMatching(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        proofLanguage,
        proofHighlighting,
        linter(null),
        lineMarks,
        colorSwatches,
        autocompletion({ override: [makeCompletionSource(latest.current.variant, () => latest.current.helperNames)], icons: false }),
        placeholder(latest.current.placeholderText),
        EditorView.contentAttributes.of({ "aria-label": latest.current.ariaLabel, tabindex: "0", spellcheck: "false", autocapitalize: "off", autocorrect: "off" }),
        editorTheme,
        EditorView.updateListener.of((update) => {
          if (update.docChanged) latest.current.onChange(update.state.doc.toString());
          if (update.selectionSet || update.docChanged) {
            latest.current.onCursorLine?.(update.state.doc.lineAt(update.state.selection.main.head).number, update.docChanged);
          }
        }),
      ],
    });
    const created = new EditorView({ state, parent: host.current });
    view.current = created;
    return () => {
      created.destroy();
      view.current = null;
    };
  }, []);

  useEffect(() => {
    const v = view.current;
    if (v && v.state.doc.toString() !== props.value) {
      v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: props.value } });
    }
  }, [props.value]);

  useEffect(() => {
    const v = view.current;
    if (!v) return;
    v.dispatch(setDiagnostics(v.state, toCmDiagnostics(props.diagnostics, v.state.doc.toString())));
  }, [props.diagnostics, props.value]);

  useEffect(() => {
    view.current?.dispatch({ effects: setLineMarks.of({ dimAfter: props.dimAfterLine, active: props.activeLine, hover: props.hoverLine ?? null }) });
  }, [props.dimAfterLine, props.activeLine, props.hoverLine, props.value]);

  return <div className="code-editor" ref={host} data-testid={`editor-${props.variant}`} />;
});
