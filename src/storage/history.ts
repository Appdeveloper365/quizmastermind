import { idbGet, idbSet } from "./idb";
const key = (t: string, d: string) => `seen:${d}:${t.trim().toLowerCase()}`;
export async function seenGet(t: string, d: string): Promise<string[]> { return (await idbGet<string[]>(key(t, d))) ?? []; }
export async function seenAdd(t: string, d: string, q: string) { const l = await seenGet(t, d); l.push(q); await idbSet(key(t, d), l.slice(-500)); }
export async function seenClear(t: string, d: string) { await idbSet(key(t, d), []); }
