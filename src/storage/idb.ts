const DB = "quiz-mastermind", STORE = "kv";
function open(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error);
  });
}
export async function idbGet<T>(key: string): Promise<T | undefined> {
  const db = await open();
  return new Promise((res, rej) => { const r = db.transaction(STORE).objectStore(STORE).get(key); r.onsuccess = () => res(r.result as T | undefined); r.onerror = () => rej(r.error); });
}
export async function idbSet(key: string, value: unknown): Promise<void> {
  const db = await open();
  return new Promise((res, rej) => { const tx = db.transaction(STORE, "readwrite"); tx.objectStore(STORE).put(value, key); tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); });
}
