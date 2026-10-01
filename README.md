# MarkDown++

A lightweight Windows app to view, create and edit Markdown files.

## Try the latest build

1. Open the **Actions** tab of this repository and pick the latest green **Build Windows app** run.
2. Download **MarkDownPlusPlus-Windows** at the bottom of the page and unzip it.
3. Put `MarkDown++.exe` in any folder and double-click it. No installation needed.
   Windows may show a SmartScreen warning for unsigned test builds: click **More info**, then **Run anyway**.

## Development

Built with [Tauri 2](https://tauri.app), TypeScript and Vite. Editing uses
[Milkdown](https://milkdown.dev) for the formatted view and [CodeMirror](https://codemirror.net) for the source view.

```sh
npm install
npm run tauri dev                    # run the app
npm run tauri build -- --no-bundle   # build MarkDown++ as a single EXE
```
