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

/** Opens an image file and returns it as a base64 data URL. */
export async function openImageFile(): Promise<
  { dataUrl: string; name: string } | null
> {
  if (isTauri()) {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const { readFile } = await import("@tauri-apps/plugin-fs");
    const path = await open({
      title: "Import texture",
      multiple: false,
      filters: [{ name: "Image", extensions: ["png", "jpg", "jpeg", "gif", "webp"] }],
    });
    if (typeof path !== "string") return null;
    const bytes = await readFile(path);
    // Convert to PNG data URL (uniform for the canvas pipeline)
    const blob = new Blob([bytes], { type: "image/png" });
    const dataUrl = await blobToDataUrl(blob);
    return { dataUrl, name: (path.split(/[\\/]/).pop() ?? "texture").replace(/\.[^.]+$/, "") };
  }
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/png,image/jpeg,image/gif,image/webp";
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      const reader = new FileReader();
      reader.onload = () =>
        resolve({ dataUrl: reader.result as string, name: file.name.replace(/\.[^.]+$/, "") });
      reader.readAsDataURL(file);
    };
    input.click();
  });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
