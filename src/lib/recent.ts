/** Recently used projects, persisted in localStorage. */

export type RecentFormat = "bbmodel" | "bmproj" | "sample";

export interface RecentProject {
  id: string;
  name: string;
  format: RecentFormat;
  savedAt: number;
  /** Serialized model file contents (.bbmodel or .bmproj JSON). */
  data: string;
}

const KEY = "blackmodels.recent.v1";
const MAX_ENTRIES = 8;

export function listRecent(): RecentProject[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RecentProject[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function uid(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `r-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
}

/** Add or refresh an entry (deduped by name+format), most recent first. */
export function pushRecent(entry: {
  name: string;
  format: RecentFormat;
  data: string;
}): void {
  if (!entry.name || !entry.data) return;
  const rest = listRecent().filter(
    (e) => !(e.name === entry.name && e.format === entry.format)
  );
  const list = [
    { id: uid(), ...entry, savedAt: Date.now() },
    ...rest,
  ].slice(0, MAX_ENTRIES);
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // Storage full: keep dropping the oldest entries until it fits
    for (let keep = list.length - 1; keep >= 1; keep--) {
      try {
        localStorage.setItem(KEY, JSON.stringify(list.slice(0, keep)));
        return;
      } catch {
        // try smaller
      }
    }
  }
}

export function removeRecent(id: string): void {
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify(listRecent().filter((e) => e.id !== id))
    );
  } catch {
    // ignore
  }
}
