import { useState, useEffect, useRef } from "react";
import {
  DOCUMENT_KEY,
  loadDocument,
  mergeDocuments,
  parseDocument,
  saveDocument,
} from "../../../shared/storage";
import { artworkById } from "../../../shared/catalog";
import type { GalleryDocument } from "../../../shared/types";
const sameDocument = (a: GalleryDocument, b: GalleryDocument) =>
  JSON.stringify(a) === JSON.stringify(b);
export function useCollection() {
  const [document, setDocument] = useState(loadDocument);
  const [storageError, setStorageError] = useState(false);
  // base：与存储一致的最近公共版本，用于三方合并
  const base = useRef<GalleryDocument>(document);
  const view = useRef<GalleryDocument>(document);
  useEffect(() => {
    const stored = loadDocument();
    const merged = mergeDocuments(base.current, stored, document);
    if (!sameDocument(merged, stored)) {
      const ok = saveDocument(merged);
      setStorageError(!ok);
      // 保存失败时 base 留在存储版本，本地新增下次合并仍会带上
      base.current = ok ? merged : stored;
    } else {
      setStorageError(false);
      base.current = merged;
    }
    view.current = merged;
    if (!sameDocument(merged, document)) setDocument(merged);
  }, [document]);
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== DOCUMENT_KEY || e.newValue === null) return;
      const stored = parseDocument(e.newValue);
      if (!stored) return;
      const local = view.current;
      const merged = mergeDocuments(base.current, stored, local);
      if (!sameDocument(merged, stored))
        base.current = saveDocument(merged) ? merged : stored;
      else base.current = merged;
      view.current = merged;
      if (!sameDocument(merged, local)) setDocument(merged);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
  return {
    document,
    storageError,
    toggle: (id: string) =>
      setDocument((d) => ({
        ...d,
        favorites: d.favorites.includes(id)
          ? d.favorites.filter((x) => x !== id)
          : [...d.favorites, id],
      })),
    note: (id: string, text: string) =>
      setDocument((d) => ({ ...d, notes: { ...d.notes, [id]: text } })),
    record: (id: string, seconds: number) => {
      if (!artworkById(id)) return;
      setDocument((d) => {
        const previous = d.visits.find((v) => v.id === id);
        return {
          ...d,
          visits: previous
            ? d.visits.map((v) =>
                v.id === id ? { ...v, seconds: v.seconds + seconds } : v,
              )
            : [...d.visits, { id, seconds, at: Date.now() }],
        };
      });
    },
  };
}
