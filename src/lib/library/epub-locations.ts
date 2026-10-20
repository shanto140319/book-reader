// This browser's cache of each EPUB's "locations": epub.js measures reading progress in points
// every ~1600 characters, and working them out reads the whole book (a few seconds), so they're
// kept per book. Small module of its own so clearing it doesn't load epub.js.

import { clear, createStore, del, get, set, type UseStore } from "idb-keyval";

let store: UseStore | null = null;
const locations = () => (store ??= createStore("pata-epub-locations", "locations"));

export const getSavedLocations = (bookId: string) => get<string>(bookId, locations()).catch(() => undefined);
export const saveLocations = (bookId: string, json: string) => set(bookId, json, locations()).catch(() => {});
export const deleteSavedLocations = (bookId: string) => del(bookId, locations());
export const clearSavedLocations = () => clear(locations());
