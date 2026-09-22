import type { AppData, MelonpanRecord, RatingValue } from '../types'
export const today = () => new Date().toISOString().slice(0, 10)
export const id = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const bytes = new Uint32Array(4)
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') crypto.getRandomValues(bytes)
  else for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 0xffffffff)
  return `${Date.now().toString(36)}-${Array.from(bytes, value => value.toString(36)).join('')}`
}
export const stars = (rating: number) => '★'.repeat(rating) + '☆'.repeat(5 - rating)
export const formatDate = (date: string) => new Intl.DateTimeFormat('ja-JP', { year: 'numeric', month: 'short', day: 'numeric' }).format(new Date(`${date}T00:00:00`))
export const readImage = (file: File): Promise<string> => new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('画像を読み込めませんでした')); reader.onerror = () => reject(reader.error); reader.readAsDataURL(file) })
const esc = (value: string) => `"${value.replaceAll('"', '""')}"`
export function csv(records: MelonpanRecord[]): string { const header = ['食べた日','店名','商品名','総合評価','タグ','メモ']; const rows = records.map(r => [r.eatenAt,r.shop,r.productName,String(r.overallRating),r.tags.join('、'),r.memo].map(esc).join(',')); return `\uFEFF${header.join(',')}\n${rows.join('\n')}` }
export function download(name: string, content: string, type: string): void { const url = URL.createObjectURL(new Blob([content], { type })); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url) }
export function parseBackup(value: unknown): AppData | null { if (!value || typeof value !== 'object') return null; const data = value as Partial<AppData>; if (!Array.isArray(data.records) || !Array.isArray(data.definitions)) return null; return data as AppData }
export function newRecord(): MelonpanRecord { const time = new Date().toISOString(); return { id: id(), eatenAt: today(), shop: '', productName: '', overallRating: 3 as RatingValue, memo: '', tags: [], customRatings: {}, createdAt: time, updatedAt: time } }
