import type { AudioAsset, CollectionRecord } from "./types";
const DB_NAME = "ishop-permission-collection-v1";
let dbPromise: Promise<IDBDatabase> | undefined;
function db() {
  return dbPromise ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore("records", { keyPath: "id" });
      request.result.createObjectStore("audio", { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => { dbPromise = undefined; reject(request.error); };
  });
}
async function transact<T>(store: string, mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>) {
  const database = await db();
  return new Promise<T>((resolve, reject) => {
    const tx = database.transaction(store, mode);
    const request = run(tx.objectStore(store));
    let result: T;
    request.onsuccess = () => { result = request.result; };
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error("Local storage transaction failed"));
  });
}
export const getRecords = () => transact<CollectionRecord[]>("records", "readonly", store => store.getAll());
export const saveRecord = (record: CollectionRecord) => transact("records", "readwrite", store => store.put(record));
export const saveAudio = (asset: AudioAsset) => transact("audio", "readwrite", store => store.put(asset));
export const getAudio = (id: string) => transact<AudioAsset | undefined>("audio", "readonly", store => store.get(id));
export const getAllAudio = () => transact<AudioAsset[]>("audio", "readonly", store => store.getAll());
