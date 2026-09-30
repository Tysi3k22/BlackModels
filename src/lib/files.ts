/** Shared file save/open helpers: Tauri native dialogs with browser fallback. */

/** True when running inside the Tauri desktop app. */
export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export interface SaveRequest {
  /** Proposed file name, e.g. "model.bbmodel". */
  defaultName: string;
  filters: { name: string; extensions: string[] }[];
  contents: string;
}

export async function saveTextFile(req: SaveRequest): Promise<boolean> {
  if (isTauri()) {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const { writeTextFile } = await import("@tauri-apps/plugin-fs");
    const path = await save({
      title: "Save",
      defaultPath: req.defaultName,
      filters: req.filters,
    });
    if (!path) return false;
    await writeTextFile(path, req.contents);
    return true;
  }
  const blob = new Blob([req.contents], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = req.defaultName;
  a.click();
  URL.revokeObjectURL(url);
  return true;
}

export async function openTextFile(
  filters: { name: string; extensions: string[] }[]
): Promise<{ contents: string; name?: string } | null> {
  if (isTauri()) {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const { readTextFile } = await import("@tauri-apps/plugin-fs");
    const path = await open({
      title: "Open",
      multiple: false,
      filters,
    });
    if (typeof path !== "string") return null;
    const contents = await readTextFile(path);
    const name = path.split(/[\\/]/).pop();
    return { contents, name };
  }
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    const accepts = filters.flatMap((f) => f.extensions.map((e) => `.${e}`));
    input.accept = [...accepts, "application/json"].join(",");
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      resolve({ contents: await file.text(), name: file.name });
    };
    input.click();
  });
}
