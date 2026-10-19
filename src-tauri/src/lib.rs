use serde::Serialize;
use std::fs;
use std::path::Path;
use tauri::{Emitter, Manager};

const MARKDOWN_EXTENSIONS: [&str; 3] = ["md", "markdown", "mdown"];
const SKIPPED_DIRS: [&str; 3] = ["node_modules", "target", "$RECYCLE.BIN"];
const MAX_DEPTH: usize = 12;

#[derive(Serialize)]
struct FileNode {
    name: String,
    path: String,
    /// `None` for files, `Some` for folders.
    children: Option<Vec<FileNode>>,
}

fn is_markdown(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|e| MARKDOWN_EXTENSIONS.contains(&e.to_ascii_lowercase().as_str()))
        .unwrap_or(false)
}

/// Lists Markdown files under `dir`, keeping only folders that contain some.
fn collect(dir: &Path, depth: usize) -> Vec<FileNode> {
    let Ok(entries) = fs::read_dir(dir) else {
        return Vec::new();
    };
    let mut folders = Vec::new();
    let mut files = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().into_owned();
        if name.starts_with('.') {
            continue;
        }
        let Ok(file_type) = entry.file_type() else {
            continue;
        };
        if file_type.is_dir() {
            if depth >= MAX_DEPTH || SKIPPED_DIRS.contains(&name.as_str()) {
                continue;
            }
            let children = collect(&path, depth + 1);
            if !children.is_empty() {
                folders.push(FileNode { name, path: path.to_string_lossy().into_owned(), children: Some(children) });
            }
        } else if is_markdown(&path) {
            files.push(FileNode { name, path: path.to_string_lossy().into_owned(), children: None });
        }
    }
    let by_name = |a: &FileNode, b: &FileNode| a.name.to_lowercase().cmp(&b.name.to_lowercase());
    folders.sort_by(by_name);
    files.sort_by(by_name);
    folders.extend(files);
    folders
}

#[tauri::command]
fn list_markdown_files(dir: String) -> Result<Vec<FileNode>, String> {
    let path = Path::new(&dir);
    if !path.is_dir() {
        return Err("This folder does not exist.".into());
    }
    Ok(collect(path, 0))
}

#[tauri::command]
fn read_text_file(path: String) -> Result<String, String> {
    let bytes = fs::read(&path).map_err(|e| e.to_string())?;
    let text = String::from_utf8_lossy(&bytes);
    Ok(text.strip_prefix('\u{feff}').unwrap_or(&text).to_string())
}

#[tauri::command]
fn write_text_file(path: String, contents: String) -> Result<(), String> {
    fs::write(&path, contents).map_err(|e| e.to_string())
}

/// Markdown files passed on the command line, e.g. when a file is dropped on the EXE.
#[tauri::command]
fn startup_files() -> Vec<String> {
    files_from_args(std::env::args().skip(1), &std::env::current_dir().unwrap_or_default())
}

/// Turns command-line arguments into absolute paths of existing files.
fn files_from_args(args: impl IntoIterator<Item = String>, cwd: &Path) -> Vec<String> {
    args.into_iter()
        .map(|a| cwd.join(a))
        .filter(|p| p.is_file())
        .map(|p| p.to_string_lossy().into_owned())
        .collect()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Must be registered first: a second launch (e.g. double-clicking a file in
        // File Explorer) hands its files to the running window and exits.
        .plugin(tauri_plugin_single_instance::init(|app, args, cwd| {
            let files = files_from_args(args.into_iter().skip(1), Path::new(&cwd));
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
            if !files.is_empty() {
                let _ = app.emit("open-files", files);
            }
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            list_markdown_files,
            read_text_file,
            write_text_file,
            startup_files
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
