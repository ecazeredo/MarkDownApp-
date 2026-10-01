import { Editor, rootCtx, defaultValueCtx, editorViewCtx } from "@milkdown/kit/core";
import {
  commonmark,
  toggleStrongCommand,
  toggleEmphasisCommand,
  wrapInHeadingCommand,
  wrapInBulletListCommand,
  wrapInOrderedListCommand,
  wrapInBlockquoteCommand,
  toggleLinkCommand,
} from "@milkdown/kit/preset/commonmark";
import { gfm } from "@milkdown/kit/preset/gfm";
import { history } from "@milkdown/kit/plugin/history";
import { clipboard } from "@milkdown/kit/plugin/clipboard";
import { $prose, callCommand, getMarkdown, replaceAll } from "@milkdown/kit/utils";
import { Plugin } from "@milkdown/kit/prose/state";
import { basicSetup } from "codemirror";
import { EditorView, keymap } from "@codemirror/view";
import { EditorSelection } from "@codemirror/state";
import { indentWithTab } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";

export type Format = "bold" | "italic" | "h1" | "h2" | "bullet" | "ordered" | "quote" | "link";

/** The formatted (WYSIWYG) editor for one tab. */
export class RenderedEditor {
  private editor!: Editor;
  private syncing = false;

  private constructor(readonly host: HTMLElement) {}

  static async create(host: HTMLElement, value: string, onChange: () => void): Promise<RenderedEditor> {
    const r = new RenderedEditor(host);
    const changes = $prose(
      () =>
        new Plugin({
          view: () => ({
            update: (view, prev) => {
              if (!r.syncing && !view.state.doc.eq(prev.doc)) onChange();
            },
          }),
        }),
    );
    r.editor = await Editor.make()
      .config((ctx) => {
        ctx.set(rootCtx, host);
        ctx.set(defaultValueCtx, value);
      })
      .use(commonmark)
      .use(gfm)
      .use(history)
      .use(clipboard)
      .use(changes)
      .create();
    return r;
  }

  getMarkdown(): string {
    return this.editor.action(getMarkdown());
  }

  setMarkdown(value: string): void {
    this.syncing = true;
    try {
      this.editor.action(replaceAll(value, true));
    } finally {
      this.syncing = false;
    }
  }

  hasSelection(): boolean {
    return this.editor.action((ctx) => !ctx.get(editorViewCtx).state.selection.empty);
  }

  format(f: Format, href?: string): void {
    const run = {
      bold: () => callCommand(toggleStrongCommand.key),
      italic: () => callCommand(toggleEmphasisCommand.key),
      h1: () => callCommand(wrapInHeadingCommand.key, 1),
      h2: () => callCommand(wrapInHeadingCommand.key, 2),
      bullet: () => callCommand(wrapInBulletListCommand.key),
      ordered: () => callCommand(wrapInOrderedListCommand.key),
      quote: () => callCommand(wrapInBlockquoteCommand.key),
      link: () => callCommand(toggleLinkCommand.key, { href: href ?? "" }),
    }[f];
    this.editor.action(run());
    this.focus();
  }

  focus(): void {
    this.editor.action((ctx) => ctx.get(editorViewCtx).focus());
  }

  destroy(): void {
    void this.editor.destroy();
  }
}

/** The raw Markdown text editor for one tab. */
export class SourceEditor {
  private view: EditorView;
  private syncing = false;

  constructor(readonly host: HTMLElement, value: string, onChange: (text: string) => void) {
    this.view = new EditorView({
      parent: host,
      doc: value,
      extensions: [
        basicSetup,
        keymap.of([indentWithTab]),
        markdown({ codeLanguages: languages }),
        EditorView.lineWrapping,
        EditorView.updateListener.of((u) => {
          if (u.docChanged && !this.syncing) onChange(u.state.doc.toString());
        }),
      ],
    });
  }

  getText(): string {
    return this.view.state.doc.toString();
  }

  setText(value: string): void {
    if (value === this.getText()) return;
    this.syncing = true;
    try {
      this.view.dispatch({ changes: { from: 0, to: this.view.state.doc.length, insert: value } });
    } finally {
      this.syncing = false;
    }
  }

  hasSelection(): boolean {
    return !this.view.state.selection.main.empty;
  }

  /** Applies Markdown syntax to the selection or current lines. */
  format(f: Format, href?: string): void {
    const view = this.view;
    const wrap = (mark: string) =>
      view.dispatch(
        view.state.changeByRange((range) => {
          const text = view.state.sliceDoc(range.from, range.to);
          return {
            changes: { from: range.from, to: range.to, insert: mark + text + mark },
            range: EditorSelection.range(range.from + mark.length, range.to + mark.length),
          };
        }),
      );
    const prefixLines = (prefix: (i: number) => string) => {
      const { from, to } = view.state.selection.main;
      const first = view.state.doc.lineAt(from).number;
      const last = view.state.doc.lineAt(to).number;
      const changes = [];
      for (let n = first; n <= last; n++) {
        changes.push({ from: view.state.doc.line(n).from, insert: prefix(n - first) });
      }
      view.dispatch({ changes });
    };
    switch (f) {
      case "bold":
        wrap("**");
        break;
      case "italic":
        wrap("*");
        break;
      case "h1":
        prefixLines(() => "# ");
        break;
      case "h2":
        prefixLines(() => "## ");
        break;
      case "bullet":
        prefixLines(() => "- ");
        break;
      case "ordered":
        prefixLines((i) => `${i + 1}. `);
        break;
      case "quote":
        prefixLines(() => "> ");
        break;
      case "link": {
        const { from, to } = view.state.selection.main;
        const text = view.state.sliceDoc(from, to) || "link";
        view.dispatch({
          changes: { from, to, insert: `[${text}](${href ?? ""})` },
          selection: EditorSelection.range(from + 1, from + 1 + text.length),
        });
        break;
      }
    }
    this.focus();
  }

  focus(): void {
    this.view.focus();
  }

  destroy(): void {
    this.view.destroy();
  }
}
