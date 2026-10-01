import { countText, formatCounts } from "./counts";

const WELCOME_SOURCE = `# Welcome to MarkDown++

This is the first preview of the app. The window layout is in place: the toolbar at the top, tabs for open files, the file list on the left, and the status bar at the bottom.

Opening files and folders arrives in the next step. Try the **Rendered** and **Source** switch at the top right to see both views.
`;

const rendered = document.querySelector<HTMLElement>("#rendered")!;
const source = document.querySelector<HTMLPreElement>("#source")!;
const btnRendered = document.querySelector<HTMLButtonElement>("#view-rendered")!;
const btnSource = document.querySelector<HTMLButtonElement>("#view-source")!;
const statusCounts = document.querySelector<HTMLElement>("#status-counts")!;

source.textContent = WELCOME_SOURCE;

function updateCounts() {
  const counts = countText(rendered.innerText);
  statusCounts.textContent = formatCounts(counts);
  statusCounts.title = `${counts.charactersNoSpaces.toLocaleString()} characters without spaces`;
}

function showView(view: "rendered" | "source") {
  const isRendered = view === "rendered";
  rendered.hidden = !isRendered;
  source.hidden = isRendered;
  btnRendered.classList.toggle("active", isRendered);
  btnSource.classList.toggle("active", !isRendered);
  btnRendered.setAttribute("aria-pressed", String(isRendered));
  btnSource.setAttribute("aria-pressed", String(!isRendered));
}

btnRendered.addEventListener("click", () => showView("rendered"));
btnSource.addEventListener("click", () => showView("source"));

window.addEventListener("keydown", (e) => {
  if (e.ctrlKey && e.key.toLowerCase() === "e") {
    e.preventDefault();
    showView(rendered.hidden ? "rendered" : "source");
  }
});

updateCounts();
