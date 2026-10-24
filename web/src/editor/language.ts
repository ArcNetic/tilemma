import { HighlightStyle, StreamLanguage, syntaxHighlighting } from "@codemirror/language";
import { tags } from "@lezer/highlight";
import { COLOR_NAMES } from "@pp/engine";

const COLOR_WORD = new RegExp(`^(${COLOR_NAMES.join("|")})\\b`);

export const proofLanguage = StreamLanguage.define<null>({
  token(stream) {
    if (stream.eatSpace()) return null;
    if (stream.match("--")) {
      stream.skipToEnd();
      return "comment";
    }
    if (stream.match(/^(swap|paint|rotate|run|def|fun)\b/)) return "keyword";
    if (stream.match(COLOR_WORD)) return "atom";
    if (stream.match(/^[0-9]+/)) return "number";
    if (stream.match(/^(List|Move|Nat)(\.[a-z]+)?\b/)) return "typeName";
    if (stream.match(/^\.(swap|paint|rotate)\b/)) return "keyword";
    stream.next();
    return null;
  },
});

const highlightStyle = HighlightStyle.define([
  { tag: tags.keyword, color: "var(--syntax-keyword)", fontWeight: "600" },
  { tag: tags.atom, color: "var(--syntax-color)" },
  { tag: tags.number, color: "var(--syntax-number)" },
  { tag: tags.typeName, color: "var(--syntax-type)" },
  { tag: tags.comment, color: "var(--syntax-comment)", fontStyle: "italic" },
]);

export const proofHighlighting = syntaxHighlighting(highlightStyle);
