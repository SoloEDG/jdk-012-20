import type { GalleryDocument, SessionSnapshot, Visit } from "./types";
export const DOCUMENT_KEY = "yujing-gallery-v1";
const SESSION_KEY = "yujing-session-v1";
export const emptyDocument = (): GalleryDocument => ({
  favorites: [],
  visits: [],
  notes: {},
});
export function parseDocument(text: string | null): GalleryDocument | null {
  try {
    const d = JSON.parse(text || "null");
    if (!d) return null;
    return {
      favorites: Array.isArray(d.favorites)
        ? d.favorites.filter((v: unknown) => typeof v === "string")
        : [],
      visits: Array.isArray(d.visits)
        ? d.visits.filter(
            (v: { id?: unknown; seconds?: unknown }) =>
              typeof v.id === "string" && typeof v.seconds === "number",
          )
        : [],
      notes: typeof d.notes === "object" && d.notes ? d.notes : {},
    };
  } catch {
    return null;
  }
}
export function loadDocument(): GalleryDocument {
  return parseDocument(localStorage.getItem(DOCUMENT_KEY)) ?? emptyDocument();
}
export function saveDocument(d: GalleryDocument): boolean {
  try {
    localStorage.setItem(DOCUMENT_KEY, JSON.stringify(d));
    return true;
  } catch {
    return false;
  }
}
// 三方合并：base 是本地已知的最近公共版本，stored 是存储中的版本，local 是当前界面版本。
// 收藏按集合合并（本地新增/远端新增都保留，任一侧删除都生效），
// 感想按键合并（本地改过的键以本地为准，其余跟随远端），
// 停留时长按增量合并（stored 已含远端增量，再叠加本地相对 base 的增量）。
export function mergeDocuments(
  base: GalleryDocument,
  stored: GalleryDocument,
  local: GalleryDocument,
): GalleryDocument {
  return {
    favorites: mergeFavorites(base.favorites, stored.favorites, local.favorites),
    visits: mergeVisits(base.visits, stored.visits, local.visits),
    notes: mergeNotes(base.notes, stored.notes, local.notes),
  };
}
function mergeFavorites(base: string[], stored: string[], local: string[]) {
  const inBase = new Set(base);
  const inLocal = new Set(local);
  const inStored = new Set(stored);
  const result: string[] = [];
  for (const id of stored)
    if (!(inBase.has(id) && !inLocal.has(id)) && !result.includes(id))
      result.push(id);
  for (const id of local)
    if (!inStored.has(id) && !inBase.has(id) && !result.includes(id))
      result.push(id);
  return result;
}
function mergeVisits(base: Visit[], stored: Visit[], local: Visit[]) {
  const byId = new Map<string, Visit>();
  const baseSeconds = new Map(base.map((v) => [v.id, v.seconds]));
  const storedById = new Map(stored.map((v) => [v.id, v]));
  const localById = new Map(local.map((v) => [v.id, v]));
  const ids: string[] = [];
  for (const v of [...stored, ...local])
    if (!ids.includes(v.id)) ids.push(v.id);
  for (const id of ids) {
    const s = storedById.get(id);
    const l = localById.get(id);
    if (s && l) {
      byId.set(id, {
        id,
        seconds: s.seconds + Math.max(0, l.seconds - (baseSeconds.get(id) ?? 0)),
        at: Math.max(s.at, l.at),
      });
    } else {
      const only = s ?? l;
      if (only) byId.set(id, only);
    }
  }
  return [...byId.values()];
}
function mergeNotes(
  base: Record<string, string>,
  stored: Record<string, string>,
  local: Record<string, string>,
) {
  const result: Record<string, string> = {};
  for (const key of new Set([...Object.keys(stored), ...Object.keys(local)])) {
    if (local[key] !== undefined && local[key] !== base[key])
      result[key] = local[key];
    else if (stored[key] !== undefined) result[key] = stored[key];
  }
  return result;
}
export function loadSessionSnapshot(): unknown {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
  } catch {
    return null;
  }
}
export function saveSessionSnapshot(s: SessionSnapshot): boolean {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(s));
    return true;
  } catch {
    return false;
  }
}
