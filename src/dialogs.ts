/** Small in-app dialogs, styled like the rest of the window. */

function openModal(build: (box: HTMLElement, close: () => void) => void): void {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  const box = document.createElement("div");
  box.className = "modal";
  box.setAttribute("role", "dialog");
  overlay.append(box);
  document.body.append(overlay);
  const close = () => overlay.remove();
  build(box, close);
}

/** Shows a message with buttons and resolves with the index of the button clicked (Escape picks the last one). */
export function choose(title: string, message: string, buttons: string[], primary = 0): Promise<number> {
  return new Promise((resolve) => {
    openModal((box, close) => {
      const h = document.createElement("h2");
      h.textContent = title;
      const p = document.createElement("p");
      p.textContent = message;
      const row = document.createElement("div");
      row.className = "modal-buttons";
      const finish = (i: number) => {
        close();
        resolve(i);
      };
      buttons.forEach((label, i) => {
        const b = document.createElement("button");
        b.textContent = label;
        if (i === primary) b.className = "primary";
        b.addEventListener("click", () => finish(i));
        row.append(b);
      });
      box.addEventListener("keydown", (e) => {
        if (e.key === "Escape") finish(buttons.length - 1);
      });
      box.append(h, p, row);
      (row.children[primary] as HTMLButtonElement).focus();
    });
  });
}

/** Asks for a line of text; resolves with null when cancelled. */
export function promptText(title: string, label: string, initial = ""): Promise<string | null> {
  return new Promise((resolve) => {
    openModal((box, close) => {
      const h = document.createElement("h2");
      h.textContent = title;
      const form = document.createElement("form");
      const lbl = document.createElement("label");
      lbl.textContent = label;
      const input = document.createElement("input");
      input.value = initial;
      lbl.append(input);
      const row = document.createElement("div");
      row.className = "modal-buttons";
      const ok = document.createElement("button");
      ok.type = "submit";
      ok.className = "primary";
      ok.textContent = "OK";
      const cancel = document.createElement("button");
      cancel.type = "button";
      cancel.textContent = "Cancel";
      row.append(ok, cancel);
      form.append(lbl, row);
      const finish = (v: string | null) => {
        close();
        resolve(v);
      };
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        finish(input.value.trim() || null);
      });
      cancel.addEventListener("click", () => finish(null));
      box.addEventListener("keydown", (e) => {
        if (e.key === "Escape") finish(null);
      });
      box.append(h, form);
      input.focus();
      input.select();
    });
  });
}
