import type { AppData, CustomRatingDefinition, MelonpanRecord, RatingValue } from '../types'

type Session = { accessToken: string; refreshToken: string; expiresAt: number; userId: string; email: string }
type PendingOperation = { type: 'record' | 'delete' | 'definitions'; payload: MelonpanRecord | string | CustomRatingDefinition[] }
type CloudRecord = { id: string; eaten_at: string; shop: string; product_name: string; photo_path: string | null; overall_rating: RatingValue; memo: string; tags: string[]; custom_ratings: Record<string, RatingValue>; created_at: string; updated_at: string }

const baseUrl = import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/, '')
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
const sessionKey = 'melonpan-supabase-session'
const queueKey = 'melonpan-supabase-queue'

export const isSupabaseConfigured = (): boolean => Boolean(baseUrl && publishableKey)
const headers = (token?: string): HeadersInit => ({ apikey: publishableKey ?? '', Authorization: `Bearer ${token ?? publishableKey ?? ''}` })
const jsonHeaders = (token?: string): HeadersInit => ({ ...headers(token), 'Content-Type': 'application/json' })
const readJson = async <T>(response: Response): Promise<T> => {
  const body: unknown = await response.json()
  if (!response.ok) throw new Error(typeof body === 'object' && body !== null && 'message' in body ? String(body.message) : 'Supabaseとの通信に失敗しました。')
  return body as T
}
const readSession = (): Session | null => { try { const raw = localStorage.getItem(sessionKey); return raw ? JSON.parse(raw) as Session : null } catch { return null } }
const writeSession = (session: Session | null): void => { if (session) localStorage.setItem(sessionKey, JSON.stringify(session)); else localStorage.removeItem(sessionKey) }
const authSession = (value: { access_token: string; refresh_token: string; expires_in: number; user: { id: string; email?: string } }): Session => ({ accessToken: value.access_token, refreshToken: value.refresh_token, expiresAt: Date.now() + value.expires_in * 1000, userId: value.user.id, email: value.user.email ?? '' })

export async function getSession(): Promise<Session | null> {
  const session = readSession()
  if (!session || !isSupabaseConfigured()) return null
  if (session.expiresAt > Date.now() + 60_000) return session
  const response = await fetch(`${baseUrl}/auth/v1/token?grant_type=refresh_token`, { method: 'POST', headers: jsonHeaders(), body: JSON.stringify({ refresh_token: session.refreshToken }) })
  try { const refreshed = authSession(await readJson<{ access_token: string; refresh_token: string; expires_in: number; user: { id: string; email?: string } }>(response)); writeSession(refreshed); return refreshed } catch { writeSession(null); return null }
}
export async function signUp(email: string, password: string): Promise<void> {
  const response = await fetch(`${baseUrl}/auth/v1/signup`, { method: 'POST', headers: jsonHeaders(), body: JSON.stringify({ email, password }) })
  const result = await readJson<{ access_token?: string; refresh_token?: string; expires_in?: number; user: { id: string; email?: string } }>(response)
  if (result.access_token && result.refresh_token && result.expires_in) writeSession(authSession(result as Required<typeof result>))
}
export async function signIn(email: string, password: string): Promise<Session> {
  const response = await fetch(`${baseUrl}/auth/v1/token?grant_type=password`, { method: 'POST', headers: jsonHeaders(), body: JSON.stringify({ email, password }) })
  const session = authSession(await readJson<{ access_token: string; refresh_token: string; expires_in: number; user: { id: string; email?: string } }>(response)); writeSession(session); return session
}
export async function signOut(): Promise<void> { const session = await getSession(); if (session) await fetch(`${baseUrl}/auth/v1/logout`, { method: 'POST', headers: headers(session.accessToken) }); writeSession(null) }

const toCloud = (record: MelonpanRecord, photoPath: string | null): CloudRecord => ({ id: record.id, eaten_at: record.eatenAt, shop: record.shop, product_name: record.productName, photo_path: photoPath, overall_rating: record.overallRating, memo: record.memo, tags: record.tags, custom_ratings: record.customRatings, created_at: record.createdAt, updated_at: record.updatedAt })
const toLocal = (record: CloudRecord, photo?: string): MelonpanRecord => ({ id: record.id, eatenAt: record.eaten_at, shop: record.shop, productName: record.product_name, photo, overallRating: record.overall_rating, memo: record.memo, tags: record.tags, customRatings: record.custom_ratings, createdAt: record.created_at, updatedAt: record.updated_at })
const dataUrlToBlob = async (dataUrl: string): Promise<Blob> => (await fetch(dataUrl)).blob()
async function uploadPhoto(record: MelonpanRecord, session: Session): Promise<string | null> { if (!record.photo) return null; const match = record.photo.match(/^data:(image\/[a-zA-Z0-9.+-]+);/); if (!match) return null; const path = `${session.userId}/${record.id}`; const response = await fetch(`${baseUrl}/storage/v1/object/melonpan-photos/${path}`, { method: 'PUT', headers: { ...headers(session.accessToken), 'Content-Type': match[1], 'x-upsert': 'true' }, body: await dataUrlToBlob(record.photo) }); if (!response.ok) throw new Error('写真のアップロードに失敗しました。'); return path }
export async function syncRecord(record: MelonpanRecord): Promise<void> { const session = await getSession(); if (!session) return; const photoPath = await uploadPhoto(record, session); const response = await fetch(`${baseUrl}/rest/v1/melonpan_records?on_conflict=id`, { method: 'POST', headers: { ...jsonHeaders(session.accessToken), Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify(toCloud(record, photoPath)) }); if (!response.ok) throw new Error('記録の同期に失敗しました。') }
export async function syncDefinitions(definitions: CustomRatingDefinition[]): Promise<void> { const session = await getSession(); if (!session) return; const rows = definitions.map(definition => ({ id: definition.id, label: definition.label, display_order: definition.order, enabled: definition.enabled, updated_at: new Date().toISOString() })); const response = await fetch(`${baseUrl}/rest/v1/rating_definitions?on_conflict=id`, { method: 'POST', headers: { ...jsonHeaders(session.accessToken), Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify(rows) }); if (!response.ok) throw new Error('評価項目の同期に失敗しました。') }
export async function syncDelete(id: string): Promise<void> { const session = await getSession(); if (!session) return; const response = await fetch(`${baseUrl}/rest/v1/melonpan_records?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE', headers: headers(session.accessToken) }); if (!response.ok) throw new Error('削除の同期に失敗しました。') }
export async function queueOperation(operation: PendingOperation): Promise<void> { const queue: PendingOperation[] = JSON.parse(localStorage.getItem(queueKey) ?? '[]') as PendingOperation[]; queue.push(operation); localStorage.setItem(queueKey, JSON.stringify(queue)) }
export async function flushQueue(): Promise<void> { const queue: PendingOperation[] = JSON.parse(localStorage.getItem(queueKey) ?? '[]') as PendingOperation[]; if (!queue.length || !await getSession()) return; const remaining: PendingOperation[] = []; for (const item of queue) { try { if (item.type === 'record') await syncRecord(item.payload as MelonpanRecord); if (item.type === 'delete') await syncDelete(item.payload as string); if (item.type === 'definitions') await syncDefinitions(item.payload as CustomRatingDefinition[]) } catch { remaining.push(item) } } localStorage.setItem(queueKey, JSON.stringify(remaining)) }
export async function syncAll(data: AppData): Promise<void> { for (const record of data.records) await syncRecord(record); await syncDefinitions(data.definitions) }
export async function pullCloudData(): Promise<AppData | null> { const session = await getSession(); if (!session) return null; const recordResponse = await fetch(`${baseUrl}/rest/v1/melonpan_records?select=*&order=eaten_at.desc`, { headers: headers(session.accessToken) }); const records = await readJson<CloudRecord[]>(recordResponse); const definitionResponse = await fetch(`${baseUrl}/rest/v1/rating_definitions?select=*&order=display_order.asc`, { headers: headers(session.accessToken) }); const definitions = await readJson<Array<{ id: string; label: string; display_order: number; enabled: boolean }>>(definitionResponse); const local = await Promise.all(records.map(async record => { let photo: string | undefined; if (record.photo_path) { const image = await fetch(`${baseUrl}/storage/v1/object/authenticated/melonpan-photos/${record.photo_path}`, { headers: headers(session.accessToken) }); if (image.ok) { const blob = await image.blob(); photo = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('写真を読み込めませんでした。')); reader.onerror = () => reject(reader.error); reader.readAsDataURL(blob) }) } } return toLocal(record, photo) })); return { records: local, definitions: definitions.map(d => ({ id: d.id, label: d.label, order: d.display_order, enabled: d.enabled })) } }
