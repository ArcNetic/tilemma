import { RangeSet, StateEffect, StateField, type Extension } from "@codemirror/state";
import { Decoration, EditorView, GutterMarker, lineNumberMarkers, type DecorationSet } from "@codemirror/view";

export type LineMarks = {
  /** The first failing line. Later lines are dimmed and this one is marked in red. */
  dimAfter: number | null;
  /** The line of the frame the board is showing. */
  active: number | null;
  /** The line of the timeline node the pointer is over. */
  hover?: number | null;
};

export const setLineMarks = StateEffect.define<LineMarks>();

const dimLine = Decoration.line({ class: "cm-dim-line" });
const activeLine = Decoration.line({ class: "cm-active-frame-line" });
const failLine = Decoration.line({ class: "cm-fail-line" });
const hoverLine = Decoration.line({ class: "cm-hover-line" });

const decorate = (view: { doc: EditorView["state"]["doc"] }, marks: LineMarks): DecorationSet => {
  const ranges = [];
  for (let n = 1; n <= view.doc.lines; n++) {
    const line = view.doc.line(n);
    if (marks.dimAfter !== null && n > marks.dimAfter) {
      ranges.push(dimLine.range(line.from));
      continue;
    }
    if (marks.active === n) ranges.push(activeLine.range(line.from));
    if (marks.dimAfter === n) ranges.push(failLine.range(line.from));
    if (marks.hover === n) ranges.push(hoverLine.range(line.from));
  }
  return Decoration.set(ranges, true);
};

type MarkState = { marks: LineMarks; decorations: DecorationSet };

const initial: LineMarks = { dimAfter: null, active: null, hover: null };

const markField = StateField.define<MarkState>({
  create: (state) => ({ marks: initial, decorations: decorate(state, initial) }),
  update(value, tr) {
    let marks = value.marks;
    for (const effect of tr.effects) if (effect.is(setLineMarks)) marks = effect.value;
    if (marks === value.marks && !tr.docChanged) return value;
    return { marks, decorations: decorate(tr.state, marks) };
  },
  provide: (field) => EditorView.decorations.from(field, (value) => value.decorations),
});

class FailMarker extends GutterMarker {
  override elementClass = "cm-fail-gutter";
}

const failMarker = new FailMarker();

/** Colours the line number of the failing line red, so the gutter points at it too. */
const failGutter = lineNumberMarkers.compute([markField], (state) => {
  const { dimAfter } = state.field(markField).marks;
  if (dimAfter === null || dimAfter < 1 || dimAfter > state.doc.lines) return RangeSet.empty;
  return RangeSet.of([failMarker.range(state.doc.line(dimAfter).from)]);
});

export const lineMarks: Extension = [markField, failGutter];
