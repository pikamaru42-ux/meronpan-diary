import type { AppData, MelonpanRecord, RatingValue } from '../types'
export const today = () => new Date().toISOString().slice(0, 10)
export const isUuid = (value: string): boolean => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
export const id = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const bytes = new Uint8Array(16)
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') crypto.getRandomValues(bytes)
  else for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256)
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
export const stars = (rating: number) => '★'.repeat(rating) + '☆'.repeat(5 - rating)
export const formatDate = (date: string) => new Intl.DateTimeFormat('ja-JP', { year: 'numeric', month: 'short', day: 'numeric' }).format(new Date(`${date}T00:00:00`))
export const readImage = (file: File): Promise<string> => new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('画像を読み込めませんでした')); reader.onerror = () => reject(reader.error); reader.readAsDataURL(file) })
export function download(name: string, content: string, type: string): void { const url = URL.createObjectURL(new Blob([content], { type })); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url) }
export function parseBackup(value: unknown): AppData | null { if (!value || typeof value !== 'object') return null; const data = value as Partial<AppData>; if (!Array.isArray(data.records) || !Array.isArray(data.definitions)) return null; return { ...data as AppData, records: data.records.map(record => isUuid(record.id) ? record : { ...record, id: id() }) } }
export function newRecord(): MelonpanRecord { const time = new Date().toISOString(); return { id: id(), eatenAt: today(), shop: '', amount: undefined, productName: '', overallRating: 3 as RatingValue, memo: '', tags: [], customRatings: {}, createdAt: time, updatedAt: time } }
