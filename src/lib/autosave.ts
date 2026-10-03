/**
 * Autosave of unsaved work to IndexedDB. The dirty flag still guards against
 * accidental loss in the UI; this is the safety net for crashes, reloads and
 * closing the app without saving.
 */
import { serializeProject } from "./project";
import { useModel } from "../stores/modelStore";

const DB_NAME = "blackmodels";
const DB_VERSION = 1;
const STORE = "autosave";
const KEY = "current";
/** Debounce between the last edit and the write. */
const WRITE_DELAY_MS = 1500;

export interface AutosaveRecord {
  savedAt: number;
  name: string;
  /** Serialized `.bmproj` contents. */
  data: string;
}

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof indexedDB === "undefined") {
      resolve(null);
      return;
    }
    let req: IDBOpenDBRequest;
    try {
      req = indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      resolve(null);
      return;
    }
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
    req.onblocked = () => resolve(null);
  });
}

function request<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest
): Promise<T | null> {
  return new Promise((resolve) => {
    void openDb().then((db) => {
      if (!db) {
        resolve(null);
        return;
      }
      try {
        const tx = db.transaction(STORE, mode);
        const req = run(tx.objectStore(STORE));
        req.onsuccess = () => resolve((req.result as T) ?? null);
        req.onerror = () => resolve(null);
        tx.oncomplete = () => db.close();
        tx.onabort = () => db.close();
      } catch {
        db.close();
        resolve(null);
      }
    });
  });
}

/** Snapshot the current model into IndexedDB. No-op when nothing is dirty. */
export async function writeAutosave(): Promise<void> {
  const { dirty, name } = useModel.getState();
  if (!dirty) return;
  const record: AutosaveRecord = { savedAt: Date.now(), name, data: serializeProject() };
  await request("readwrite", (store) => store.put(record, KEY));
}

export function readAutosave(): Promise<AutosaveRecord | null> {
  return request<AutosaveRecord>("readonly", (store) => store.get(KEY));
}

export function clearAutosave(): Promise<void> {
  return request("readwrite", (store) => store.delete(KEY)).then(() => undefined);
}

/**
 * Watch the model store: debounce writes while dirty, clear once the model is
 * saved/imported, flush when the page is about to unload. Returns the cleanup.
 */
export function startAutosave(): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let lastWrite = 0;
  const stopTimer = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  };
  const schedule = () => {
    stopTimer();
    timer = setTimeout(() => {
      timer = undefined;
      lastWrite = Date.now();
      void writeAutosave();
    }, WRITE_DELAY_MS);
  };
  // pagehide/beforeunload: fire-and-forget write; the debounce already
  // guarantees the record is never older than a couple of seconds.
  const flush = () => {
    if (useModel.getState().dirty) void writeAutosave();
  };
  const unsubscribe = useModel.subscribe((state, prev) => {
    if (!state.dirty) {
      if (prev.dirty) {
        stopTimer();
        void clearAutosave();
      }
      return;
    }
    const changed =
      state.cubes !== prev.cubes ||
      state.bones !== prev.bones ||
      state.textures !== prev.textures ||
      state.name !== prev.name;
    if (changed) schedule();
  });
  window.addEventListener("pagehide", flush);
  window.addEventListener("beforeunload", flush);
  return () => {
    stopTimer();
    unsubscribe();
    window.removeEventListener("pagehide", flush);
    window.removeEventListener("beforeunload", flush);
    if (Date.now() - lastWrite < WRITE_DELAY_MS) void writeAutosave();
  };
}
