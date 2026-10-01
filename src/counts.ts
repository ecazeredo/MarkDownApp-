export interface Counts {
  characters: number;
  charactersNoSpaces: number;
  words: number;
}

/** Counts the visible text: characters including spaces, and words separated by whitespace. */
export function countText(text: string): Counts {
  const normalized = text.replace(/\s+/g, " ").trim();
  const characters = [...normalized].length;
  const charactersNoSpaces = [...normalized.replace(/\s/g, "")].length;
  const words = normalized === "" ? 0 : normalized.split(" ").length;
  return { characters, charactersNoSpaces, words };
}

export function formatCounts(c: Counts): string {
  const n = (v: number) => v.toLocaleString();
  return `${n(c.characters)} characters    ${n(c.words)} words`;
}
