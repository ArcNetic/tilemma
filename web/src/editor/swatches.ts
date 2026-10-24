import { RangeSetBuilder, type Extension } from "@codemirror/state";
import { Decoration, EditorView, ViewPlugin, WidgetType, type DecorationSet, type ViewUpdate } from "@codemirror/view";
import { COLOR_NAMES, colorCodeOfName, type ColorName } from "@pp/engine";

const COLOR_WORD = new RegExp(`\\b(${COLOR_NAMES.join("|")})\\b`, "g");

/** A tiny chip of the block colour, shown in front of a colour name. It has no text, so it never changes what the line reads as. */
class SwatchWidget extends WidgetType {
  constructor(private readonly name: ColorName) {
    super();
  }

  override eq(other: SwatchWidget): boolean {
    return other.name === this.name;
  }

  override toDOM(): HTMLElement {
    const swatch = document.createElement("span");
    swatch.className = `cm-swatch color-${colorCodeOfName(this.name)}`;
    swatch.setAttribute("aria-hidden", "true");
    return swatch;
  }

  override ignoreEvent(): boolean {
    return true;
  }
}

const build = (view: EditorView): DecorationSet => {
  const builder = new RangeSetBuilder<Decoration>();
  for (let n = 1; n <= view.state.doc.lines; n++) {
    const line = view.state.doc.line(n);
    if (line.text.trimStart().startsWith("--")) continue;
    for (const match of line.text.matchAll(COLOR_WORD)) {
      builder.add(line.from + match.index, line.from + match.index, Decoration.widget({ widget: new SwatchWidget(match[1] as ColorName), side: -1 }));
    }
  }
  return builder.finish();
};

export const colorSwatches: Extension = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = build(view);
    }

    update(update: ViewUpdate): void {
      if (update.docChanged) this.decorations = build(update.view);
    }
  },
  { decorations: (plugin) => plugin.decorations },
);
