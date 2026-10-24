import type { AppData, CustomRatingDefinition, MelonpanRecord } from '../types'
import { DEFAULT_DEFINITIONS } from '../types'
import { id, isUuid } from '../lib/utils'

const DB = 'melonpan-diary', STORE = 'app-data', KEY = 'singleton'
function openDb(): Promise<IDBDatabase> { return new Promise((resolve, reject) => { const request = indexedDB.open(DB, 1); request.onupgradeneeded = () => request.result.createObjectStore(STORE); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error) }) }
export async function loadData(): Promise<AppData> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    const store = tx.objectStore(STORE)
    const request = store.get(KEY)
    let data: AppData = { records: [], definitions: DEFAULT_DEFINITIONS }
    request.onsuccess = () => {
      const saved = request.result as AppData | undefined
      if (!saved) return
      let migrated = false
      data = {
        ...saved,
        records: saved.records.map(record => {
          if (isUuid(record.id)) return record
          migrated = true
          return { ...record, id: id() }
        }),
      }
      if (migrated) store.put(data, KEY)
    }
    request.onerror = () => reject(request.error)
    tx.oncomplete = () => { db.close(); resolve(data) }
    tx.onerror = () => { db.close(); reject(tx.error) }
    tx.onabort = () => { db.close(); reject(tx.error ?? new Error('端末内データの読み込みに失敗しました。')) }
  })
}
export async function saveData(data: AppData): Promise<void> { const db = await openDb(); return new Promise((resolve, reject) => { const tx = db.transaction(STORE, 'readwrite'); tx.objectStore(STORE).put(data, KEY); tx.oncomplete = () => { db.close(); resolve() }; tx.onerror = () => reject(tx.error) }) }
export async function saveRecord(record: MelonpanRecord): Promise<AppData> { const data = await loadData(); const found = data.records.findIndex((item) => item.id === record.id); if (found >= 0) data.records[found] = record; else data.records.push(record); await saveData(data); return data }
export async function deleteRecord(id: string): Promise<AppData> { const data = await loadData(); data.records = data.records.filter((record) => record.id !== id); await saveData(data); return data }
export async function saveDefinitions(definitions: CustomRatingDefinition[]): Promise<AppData> { const data = await loadData(); data.definitions = definitions; await saveData(data); return data }
