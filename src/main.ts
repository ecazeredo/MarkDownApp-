import "@milkdown/kit/prose/view/style/prosemirror.css";
import "@milkdown/kit/prose/tables/style/tables.css";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { open, save } from "@tauri-apps/plugin-dialog";
import { countMarkdown, formatCounts } from "./counts";
import { choose, promptText } from "./dialogs";
import { RenderedEditor, SourceEditor, type Format } from "./editors";

interface FileNode {
  name: string;
  path: string;
  children: FileNode[] | null;
}

interface Tab {
  id: number;
  path: string | null;
  name: string;
  /** Latest Markdown, except for edits still inside the rendered editor (see `renderedEdited`). */
  markdown: string;
  dirty: boolean;
  renderedEdited: boolean;
  renderedStale: boolean;
  sourceStale: boolean;
  renderedHost: HTMLElement;
  sourceHost: HTMLElement;
  rendered: RenderedEditor | null;
  source: SourceEditor | null;
}

type View = "rendered" | "source";

const MARKDOWN_EXTENSIONS = ["md", "markdown", "mdown"];
const APP_NAME = "MarkDown++";

const $ = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel)!;
const tabsBar = $("#tabs");
const docArea = $("#document");
const emptyState = $("#empty-state");
const fileTree = $("#file-tree");
const folderName = $("#folder-name");
const btnRefresh = $<HTMLButtonElement>("#btn-refresh");
const statusFile = $("#status-file");
const statusCounts = $("#status-counts");
const btnRendered = $<HTMLButtonElement>("#view-rendered");
const btnSource = $<HTMLButtonElement>("#view-source");

const tabs: Tab[] = [];
let activeTab: Tab | null = null;
let view: View = "rendered";
let nextId = 1;
let untitledCount = 0;
let currentFolder: string | null = null;

// ---------- Helpers ----------

function baseName(path: string): string {
  return path.split(/[\\/]/).pop() || path;
}

function isMarkdownPath(path: string): boolean {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return MARKDOWN_EXTENSIONS.includes(ext);
}

async function showError(message: string, err: unknown) {
  await choose("Something went wrong", `${message}\n\n${String(err)}`, ["OK"]);
}

/** Brings any edits made in the formatted view into `tab.markdown`. */
function flush(tab: Tab) {
  if (tab.renderedEdited && tab.rendered) {
    tab.markdown = tab.rendered.getMarkdown();
    tab.renderedEdited = false;
    tab.sourceStale = true;
  }
}

// ---------- Tabs ----------

function createTab(path: string | null, markdown: string): Tab {
  const renderedHost = document.createElement("div");
  renderedHost.className = "rendered";
  const sourceHost = document.createElement("div");
  sourceHost.className = "source";
  renderedHost.hidden = sourceHost.hidden = true;
  docArea.append(renderedHost, sourceHost);
  const tab: Tab = {
    id: nextId++,
    path,
    name: path ? baseName(path) : `Untitled-${++untitledCount}.md`,
    markdown,
    dirty: false,
    renderedEdited: false,
    renderedStale: false,
    sourceStale: false,
    renderedHost,
    sourceHost,
    rendered: null,
    source: null,
  };
  tabs.push(tab);
  return tab;
}

async function ensureEditor(tab: Tab, v: View) {
  if (v === "rendered") {
    if (!tab.rendered) {
      tab.rendered = await RenderedEditor.create(tab.renderedHost, tab.markdown, () => {
        tab.renderedEdited = true;
        markDirty(tab);
      });
      tab.renderedStale = false;
    } else if (tab.renderedStale) {
      tab.rendered.setMarkdown(tab.markdown);
      tab.renderedStale = false;
    }
  } else {
    flush(tab);
    if (!tab.source) {
      tab.source = new SourceEditor(tab.sourceHost, tab.markdown, (text) => {
        tab.markdown = text;
        tab.renderedStale = true;
        markDirty(tab);
      });
      tab.sourceStale = false;
    } else if (tab.sourceStale) {
      tab.source.setText(tab.markdown);
      tab.sourceStale = false;
    }
  }
}

async function activate(tab: Tab | null) {
  if (activeTab && activeTab !== tab) {
    activeTab.renderedHost.hidden = activeTab.sourceHost.hidden = true;
  }
  activeTab = tab;
  emptyState.hidden = tab !== null;
  if (tab) {
    await ensureEditor(tab, view);
    tab.renderedHost.hidden = view !== "rendered";
    tab.sourceHost.hidden = view !== "source";
    (view === "rendered" ? tab.rendered : tab.source)?.focus();
  }
  renderTabs();
  renderStatus();
  highlightTreeFile();
}

function markDirty(tab: Tab) {
  if (!tab.dirty) {
    tab.dirty = true;
    renderTabs();
  }
  if (tab === activeTab) scheduleStatus();
}

function renderTabs() {
  tabsBar.replaceChildren(
    ...tabs.map((tab) => {
      const el = document.createElement("div");
      el.className = "tab" + (tab === activeTab ? " active" : "") + (tab.dirty ? " dirty" : "");
      el.setAttribute("role", "tab");
      el.setAttribute("aria-selected", String(tab === activeTab));
      el.title = tab.path ?? tab.name;
      el.draggable = true;
      el.dataset.id = String(tab.id);

      const title = document.createElement("span");
      title.className = "tab-title";
      title.textContent = tab.name;
      const dot = document.createElement("span");
      dot.className = "tab-dot";
      dot.title = "Unsaved changes";
      const close = document.createElement("button");
      close.className = "tab-close";
      close.title = "Close (Ctrl+W)";
      close.textContent = "×";
      close.addEventListener("click", (e) => {
        e.stopPropagation();
        void closeTab(tab);
      });
      el.append(title, dot, close);

      el.addEventListener("mousedown", (e) => {
        if (e.button === 1) {
          e.preventDefault();
          void closeTab(tab);
        }
      });
      el.addEventListener("click", () => void activate(tab));
      el.addEventListener("dragstart", (e) => e.dataTransfer?.setData("text/tab-id", String(tab.id)));
      el.addEventListener("dragover", (e) => e.preventDefault());
      el.addEventListener("drop", (e) => {
        e.preventDefault();
        const fromId = Number(e.dataTransfer?.getData("text/tab-id"));
        const from = tabs.findIndex((t) => t.id === fromId);
        const to = tabs.indexOf(tab);
        if (from < 0 || from === to) return;
        const [moved] = tabs.splice(from, 1);
        tabs.splice(to, 0, moved);
        renderTabs();
      });
      return el;
    }),
  );
  tabsBar.querySelector(".tab.active")?.scrollIntoView({ block: "nearest", inline: "nearest" });
  const title = activeTab ? `${activeTab.dirty ? "*" : ""}${activeTab.name} - ${APP_NAME}` : APP_NAME;
  document.title = title;
  if (isTauri()) void getCurrentWindow().setTitle(title);
}

/** Asks about unsaved changes. Resolves false when the user cancels. */
async function confirmDiscard(tab: Tab): Promise<boolean> {
  if (!tab.dirty) return true;
  await activate(tab);
  const choice = await choose(
    "Unsaved changes",
    `Do you want to save the changes to ${tab.name}?`,
    ["Save", "Don't Save", "Cancel"],
  );
  if (choice === 0) return saveTab(tab, false);
  return choice === 1;
}

async function closeTab(tab: Tab): Promise<boolean> {
  if (!(await confirmDiscard(tab))) return false;
  const i = tabs.indexOf(tab);
  tabs.splice(i, 1);
  tab.rendered?.destroy();
  tab.source?.destroy();
  tab.renderedHost.remove();
  tab.sourceHost.remove();
  if (activeTab === tab) {
    activeTab = null;
    await activate(tabs[Math.min(i, tabs.length - 1)] ?? null);
  } else {
    renderTabs();
  }
  return true;
}

function cycleTab(step: number) {
  if (tabs.length < 2 || !activeTab) return;
  const i = (tabs.indexOf(activeTab) + step + tabs.length) % tabs.length;
  void activate(tabs[i]);
}

// ---------- Views ----------

async function showView(v: View) {
  if (activeTab && v === "source") flush(activeTab);
  view = v;
  btnRendered.classList.toggle("active", v === "rendered");
  btnSource.classList.toggle("active", v === "source");
  btnRendered.setAttribute("aria-pressed", String(v === "rendered"));
  btnSource.setAttribute("aria-pressed", String(v === "source"));
  await activate(activeTab);
}

// ---------- Status bar ----------

let statusTimer: number | undefined;
function scheduleStatus() {
  clearTimeout(statusTimer);
  statusTimer = window.setTimeout(renderStatus, 250);
}

function renderStatus() {
  const tab = activeTab;
  if (!tab) {
    statusFile.textContent = currentFolder ?? "";
    statusCounts.textContent = "";
    statusCounts.title = "";
    return;
  }
  statusFile.textContent = (tab.path ?? tab.name) + (tab.dirty ? "  • Unsaved changes" : "");
  const markdown = tab.renderedEdited && tab.rendered ? tab.rendered.getMarkdown() : tab.markdown;
  const counts = countMarkdown(markdown);
  statusCounts.textContent = formatCounts(counts);
  statusCounts.title = `${counts.charactersNoSpaces.toLocaleString()} characters without spaces`;
}

// ---------- Files ----------

async function openPaths(paths: string[]) {
  let last: Tab | null = null;
  for (const path of paths) {
    const existing = tabs.find((t) => t.path === path);
    if (existing) {
      last = existing;
      continue;
    }
    try {
      const text = await invoke<string>("read_text_file", { path });
      // Reuse a single untouched new file instead of keeping an empty tab around.
      const blank = tabs.length === 1 && !tabs[0].path && !tabs[0].dirty && tabs[0].markdown === "" ? tabs[0] : null;
      last = createTab(path, text);
      if (blank) await closeTab(blank);
    } catch (err) {
      await showError(`Could not open ${path}.`, err);
    }
  }
  if (last) await activate(last);
}

async function openFileDialog() {
  const picked = await open({
    multiple: true,
    filters: [{ name: "Markdown", extensions: MARKDOWN_EXTENSIONS }, { name: "All files", extensions: ["*"] }],
  });
  if (!picked) return;
  await openPaths(Array.isArray(picked) ? picked : [picked]);
}

async function openFolderDialog() {
  const picked = await open({ directory: true });
  if (typeof picked === "string") await loadFolder(picked);
}

async function loadFolder(path: string) {
  try {
    const nodes = await invoke<FileNode[]>("list_markdown_files", { dir: path });
    currentFolder = path;
    folderName.textContent = baseName(path);
    folderName.title = path;
    btnRefresh.hidden = false;
    renderTree(nodes);
    renderStatus();
  } catch (err) {
    await showError(`Could not open the folder ${path}.`, err);
  }
}

const FILE_ICON =
  '<svg class="tree-icon file-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 1h6L13 4.5V14a1 1 0 0 1-1 1H3.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1z" fill="currentColor"/><path d="M9.5 1v3.5H13" fill="none" stroke="#fff" stroke-opacity=".6"/></svg>';
const FOLDER_ICON =
  '<svg class="tree-icon folder-icon closed" viewBox="0 0 16 16" aria-hidden="true"><path d="M1 3.5A1.5 1.5 0 0 1 2.5 2h3.6l1.5 1.5h5.9A1.5 1.5 0 0 1 15 5v7.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 1 12.5z" fill="currentColor"/></svg>' +
  '<svg class="tree-icon folder-icon open" viewBox="0 0 16 16" aria-hidden="true"><path d="M1 3.5A1.5 1.5 0 0 1 2.5 2h3.6l1.5 1.5h5.4A1.5 1.5 0 0 1 14.5 5v1H4.2a1.5 1.5 0 0 0-1.4 1L1 12z" fill="currentColor" opacity=".75"/><path d="M3.3 7.2A1 1 0 0 1 4.2 6.5h10.6a.7.7 0 0 1 .6 1l-2 5.8a1 1 0 0 1-.9.7H1.6a.6.6 0 0 1-.5-.8z" fill="currentColor"/></svg>';

function treeLabel(icon: string, name: string): DocumentFragment {
  const t = document.createElement("template");
  t.innerHTML = icon;
  const label = document.createElement("span");
  label.textContent = name;
  t.content.append(label);
  return t.content;
}

function renderTree(nodes: FileNode[]) {
  if (nodes.length === 0) {
    const p = document.createElement("p");
    p.className = "sidebar-empty";
    p.textContent = "No Markdown files in this folder.";
    fileTree.replaceChildren(p);
    return;
  }
  const build = (list: FileNode[]): HTMLUListElement => {
    const ul = document.createElement("ul");
    for (const node of list) {
      const li = document.createElement("li");
      if (node.children) {
        const details = document.createElement("details");
        const summary = document.createElement("summary");
        summary.append(treeLabel(FOLDER_ICON, node.name));
        details.append(summary, build(node.children));
        li.append(details);
      } else {
        const a = document.createElement("a");
        a.href = "#";
        a.className = "tree-file";
        a.append(treeLabel(FILE_ICON, node.name));
        a.title = node.path;
        a.dataset.path = node.path;
        a.addEventListener("click", (e) => {
          e.preventDefault();
          void openPaths([node.path]);
        });
        li.append(a);
      }
      ul.append(li);
    }
    return ul;
  };
  fileTree.replaceChildren(build(nodes));
  highlightTreeFile();
}

function highlightTreeFile() {
  fileTree.querySelectorAll<HTMLElement>(".tree-file").forEach((a) => {
    a.classList.toggle("active", !!activeTab && a.dataset.path === activeTab.path);
  });
}

function newFile() {
  const tab = createTab(null, "");
  void activate(tab);
}

/** Saves a tab; returns false when the user cancels the Save As dialog or saving fails. */
async function saveTab(tab: Tab, saveAs: boolean): Promise<boolean> {
  flush(tab);
  let path = tab.path;
  if (!path || saveAs) {
    const defaultPath = tab.path ?? (currentFolder ? `${currentFolder}\\${tab.name}` : tab.name);
    const picked = await save({ defaultPath, filters: [{ name: "Markdown", extensions: MARKDOWN_EXTENSIONS }] });
    if (!picked) return false;
    path = isMarkdownPath(picked) ? picked : `${picked}.md`;
  }
  try {
    await invoke("write_text_file", { path, contents: tab.markdown });
  } catch (err) {
    await showError(`Could not save ${path}.`, err);
    return false;
  }
  const isNewLocation = path !== tab.path;
  tab.path = path;
  tab.name = baseName(path);
  tab.dirty = false;
  renderTabs();
  renderStatus();
  if (isNewLocation && currentFolder && path.startsWith(currentFolder)) await loadFolder(currentFolder);
  return true;
}

// ---------- Formatting ----------

async function applyFormat(f: Format) {
  const tab = activeTab;
  if (!tab) return;
  const editor = view === "rendered" ? tab.rendered : tab.source;
  if (!editor) return;
  if (f === "link") {
    if (view === "rendered" && !editor.hasSelection()) {
      await choose("Add a link", "Select the text you want to turn into a link first.", ["OK"]);
      editor.focus();
      return;
    }
    const href = await promptText("Add a link", "Web address", "https://");
    if (!href) {
      editor.focus();
      return;
    }
    editor.format(f, href);
    return;
  }
  editor.format(f);
}

// ---------- Zoom and layout ----------

const ZOOM_STEPS = [0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3];
const statusZoom = $("#status-zoom");
let zoom = 1;

function loadSetting(key: string): number | null {
  try {
    const v = Number(localStorage.getItem(key));
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
}

function storeSetting(key: string, value: number) {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    // Settings are a convenience; ignore storage failures.
  }
}

function setZoom(value: number) {
  zoom = Math.min(ZOOM_STEPS[ZOOM_STEPS.length - 1], Math.max(ZOOM_STEPS[0], value));
  document.documentElement.style.setProperty("--zoom", String(zoom));
  statusZoom.textContent = `${Math.round(zoom * 100)}%`;
  statusZoom.hidden = zoom === 1;
  storeSetting("zoom", zoom);
}

function stepZoom(direction: 1 | -1) {
  const i = ZOOM_STEPS.findIndex((z) => z >= zoom - 0.001);
  const current = i < 0 ? ZOOM_STEPS.length - 1 : i;
  const next = ZOOM_STEPS[Math.min(ZOOM_STEPS.length - 1, Math.max(0, current + direction))];
  setZoom(next);
}

const splitter = $("#splitter");
const SIDEBAR_DEFAULT = 260;

function setSidebarWidth(px: number) {
  const width = Math.round(Math.min(window.innerWidth * 0.6, Math.max(140, px)));
  document.documentElement.style.setProperty("--sidebar-width", `${width}px`);
  storeSetting("sidebarWidth", width);
}

splitter.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  splitter.setPointerCapture(e.pointerId);
  splitter.classList.add("dragging");
  document.body.classList.add("resizing");
  const move = (ev: PointerEvent) => setSidebarWidth(ev.clientX);
  const up = () => {
    splitter.removeEventListener("pointermove", move);
    splitter.classList.remove("dragging");
    document.body.classList.remove("resizing");
  };
  splitter.addEventListener("pointermove", move);
  splitter.addEventListener("pointerup", up, { once: true });
});
splitter.addEventListener("dblclick", () => setSidebarWidth(SIDEBAR_DEFAULT));
statusZoom.addEventListener("click", () => setZoom(1));

window.addEventListener(
  "wheel",
  (e) => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    if (e.deltaY !== 0) stepZoom(e.deltaY < 0 ? 1 : -1);
  },
  { passive: false },
);

setZoom(loadSetting("zoom") ?? 1);
const savedWidth = loadSetting("sidebarWidth");
if (savedWidth) setSidebarWidth(savedWidth);

// ---------- Wiring ----------

$("#btn-new").addEventListener("click", newFile);
$("#empty-new").addEventListener("click", newFile);
$("#btn-open-file").addEventListener("click", () => void openFileDialog());
$("#empty-open-file").addEventListener("click", () => void openFileDialog());
$("#btn-open-folder").addEventListener("click", () => void openFolderDialog());
$("#empty-open-folder").addEventListener("click", () => void openFolderDialog());
$("#link-open-folder").addEventListener("click", (e) => {
  e.preventDefault();
  void openFolderDialog();
});
btnRefresh.addEventListener("click", () => currentFolder && void loadFolder(currentFolder));
$("#btn-save").addEventListener("click", () => activeTab && void saveTab(activeTab, false));
$("#btn-save-as").addEventListener("click", () => activeTab && void saveTab(activeTab, true));
btnRendered.addEventListener("click", () => void showView("rendered"));
btnSource.addEventListener("click", () => void showView("source"));
document.querySelectorAll<HTMLButtonElement>("button.fmt").forEach((b) => {
  b.addEventListener("mousedown", (e) => e.preventDefault()); // keep the text selection
  b.addEventListener("click", () => void applyFormat(b.dataset.format as Format));
});

window.addEventListener(
  "keydown",
  (e) => {
    if (!e.ctrlKey || e.altKey || document.querySelector(".modal-overlay")) return;
    const key = e.key.toLowerCase();
    const handled = (fn: () => unknown) => {
      e.preventDefault();
      e.stopPropagation();
      void fn();
    };
    if (key === "n" && !e.shiftKey) handled(newFile);
    else if (key === "o" && e.shiftKey) handled(openFolderDialog);
    else if (key === "o") handled(openFileDialog);
    else if (key === "s" && activeTab) handled(() => saveTab(activeTab!, e.shiftKey));
    else if (key === "w" && activeTab) handled(() => closeTab(activeTab!));
    else if (key === "e") handled(() => showView(view === "rendered" ? "source" : "rendered"));
    else if (key === "tab") handled(() => cycleTab(e.shiftKey ? -1 : 1));
    else if (key === "=" || key === "+") handled(() => stepZoom(1));
    else if (key === "-" || key === "_") handled(() => stepZoom(-1));
    else if (key === "0") handled(() => setZoom(1));
  },
  { capture: true },
);

async function init() {
  await activate(null);
  if (!isTauri()) return;

  const win = getCurrentWindow();
  await win.onCloseRequested(async (event) => {
    event.preventDefault();
    for (const tab of [...tabs]) {
      if (!(await confirmDiscard(tab))) return;
    }
    await win.destroy();
  });

  await getCurrentWebview().onDragDropEvent(async (event) => {
    if (event.payload.type !== "drop") return;
    const files = event.payload.paths.filter(isMarkdownPath);
    const others = event.payload.paths.filter((p) => !isMarkdownPath(p));
    if (files.length) await openPaths(files);
    else if (others.length === 1) await loadFolder(others[0]);
  });

  const startup = await invoke<string[]>("startup_files");
  if (startup.length) await openPaths(startup);
}

void init();
