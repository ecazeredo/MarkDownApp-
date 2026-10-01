import MarkdownIt from "markdown-it";

export interface Counts {
  characters: number;
  charactersNoSpaces: number;
  words: number;
}

const md = new MarkdownIt({ html: false });
const parser = new DOMParser();

/** Counts the visible text: characters including spaces, and words separated by whitespace. */
export function countText(text: string): Counts {
  const normalized = text.replace(/\s+/g, " ").trim();
  const characters = [...normalized].length;
  const charactersNoSpaces = [...normalized.replace(/\s/g, "")].length;
  const words = normalized === "" ? 0 : normalized.split(" ").length;
  return { characters, charactersNoSpaces, words };
}

/** Counts the text a reader sees once the Markdown is formatted, without symbols like # or *. */
export function countMarkdown(markdown: string): Counts {
  const html = md.render(markdown);
  const text = parser.parseFromString(html, "text/html").body.textContent ?? "";
  return countText(text);
}

export function formatCounts(c: Counts): string {
  const n = (v: number) => v.toLocaleString();
  return `${n(c.characters)} characters    ${n(c.words)} words`;
}
