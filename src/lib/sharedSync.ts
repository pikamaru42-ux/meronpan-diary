import type { AppData, CustomRatingDefinition, MelonpanRecord, RatingValue, SharedAccount } from '../types'

type CloudRecord = {
  id: string
  account_id: string | null
  eaten_at: string
  shop: string
  product_name: string
  photo_path: string | null
  overall_rating: RatingValue
  memo: string
  tags: string[]
  custom_ratings: Record<string, RatingValue>
  created_at: string
  updated_at: string
}

const configuredUrl = import.meta.env.VITE_SUPABASE_URL?.trim()
const resolveProjectUrl = (value: string | undefined): { url: string | null; error: string | null } => {
  if (!value) return { url: null, error: 'VITE_SUPABASE_URLが未設定です。' }
  try {
    const parsed = new URL(value)
    if (parsed.protocol !== 'https:' && parsed.hostname !== 'localhost' && parsed.hostname !== '127.0.0.1') {
      return { url: null, error: 'VITE_SUPABASE_URLはhttpsのSupabase Project URLを指定してください。' }
    }
    // Accept a pasted REST/Storage endpoint but always build API routes from the project origin.
    return { url: parsed.origin, error: null }
  } catch {
    return { url: null, error: 'VITE_SUPABASE_URLがURLとして正しくありません。SupabaseのProject URLを確認してください。' }
  }
}
const projectUrl = resolveProjectUrl(configuredUrl)
const baseUrl = projectUrl.url
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
const headers = (): HeadersInit => ({
  apikey: publishableKey ?? '',
  Authorization: `Bearer ${publishableKey ?? ''}`,
})
const jsonHeaders = (): HeadersInit => ({ ...headers(), 'Content-Type': 'application/json' })

export const isSharedCloudConfigured = (): boolean => Boolean(configuredUrl && publishableKey)

const readResponse = async <T>(response: Response): Promise<T> => {
  const text = await response.text()
  let body: unknown = null
  try { body = text ? JSON.parse(text) : null } catch { body = text }
  if (!response.ok) {
    const message = typeof body === 'object' && body !== null && 'message' in body
      ? String(body.message)
      : typeof body === 'string' && body
        ? `Supabaseとの通信に失敗しました（${response.status}）：${body.slice(0, 240)}`
        : `Supabaseとの通信に失敗しました（${response.status}）。`
    throw new Error(message)
  }
  return body as T
}

export async function listSharedAccounts(): Promise<SharedAccount[]> {
  if (!configuredUrl || !publishableKey) throw new Error('VITE_SUPABASE_URLとVITE_SUPABASE_PUBLISHABLE_KEYを設定してから再デプロイしてください。')
  if (!baseUrl) throw new Error(projectUrl.error ?? 'Supabase Project URLが正しくありません。')
  const response = await fetch(`${baseUrl}/rest/v1/melonpan_accounts?select=id,name&order=name.asc`, { headers: headers() })
  return readResponse<SharedAccount[]>(response)
}

const toCloudRecord = (record: MelonpanRecord, accountId: string, photoPath: string | null): CloudRecord => ({
  id: record.id,
  account_id: accountId,
  eaten_at: record.eatenAt,
  shop: record.shop,
  product_name: record.productName,
  photo_path: photoPath,
  overall_rating: record.overallRating,
  memo: record.memo,
  tags: record.tags,
  custom_ratings: record.customRatings,
  created_at: record.createdAt,
  updated_at: record.updatedAt,
})

const publicPhotoUrl = (path: string): string =>
  `${baseUrl}/storage/v1/object/public/melonpan-shared-photos/${path.split('/').map(encodeURIComponent).join('/')}`

const toLocalRecord = (record: CloudRecord): MelonpanRecord => ({
  id: record.id,
  accountId: record.account_id ?? undefined,
  eatenAt: record.eaten_at,
  shop: record.shop,
  productName: record.product_name,
  photo: record.photo_path ? publicPhotoUrl(record.photo_path) : undefined,
  photoPath: record.photo_path ?? undefined,
  overallRating: record.overall_rating,
  memo: record.memo,
  tags: record.tags,
  customRatings: record.custom_ratings,
  createdAt: record.created_at,
  updatedAt: record.updated_at,
})

async function uploadPhoto(record: MelonpanRecord, accountId: string): Promise<string | null> {
  if (!record.photo) return null
  if (!record.photo.startsWith('data:')) return record.photoPath ?? null
  const match = record.photo.match(/^data:(image\/[a-zA-Z0-9.+-]+);/)
  if (!match) throw new Error('写真データの形式を判別できません。')
  const path = `${accountId}/${record.id}`
  const response = await fetch(`${baseUrl}/storage/v1/object/melonpan-shared-photos/${path}`, {
    method: 'PUT',
    headers: { ...headers(), 'Content-Type': match[1], 'x-upsert': 'true' },
    body: await (await fetch(record.photo)).blob(),
  })
  if (!response.ok) throw new Error(`写真のアップロードに失敗しました（${response.status}）。`)
  return path
}

async function removePhoto(path: string): Promise<void> {
  const response = await fetch(`${baseUrl}/storage/v1/object/melonpan-shared-photos/${path}`, {
    method: 'DELETE',
    headers: headers(),
  })
  if (!response.ok) throw new Error(`写真の削除に失敗しました（${response.status}）。`)
}

export async function syncSharedRecord(record: MelonpanRecord, accountId: string): Promise<void> {
  const photoPath = await uploadPhoto(record, accountId)
  const response = await fetch(`${baseUrl}/rest/v1/melonpan_shared_records?on_conflict=id`, {
    method: 'POST',
    headers: { ...jsonHeaders(), Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify(toCloudRecord(record, accountId, photoPath)),
  })
  await readResponse<unknown>(response)
  if (record.photoPath && record.photoPath !== photoPath) await removePhoto(record.photoPath)
}

export async function deleteSharedRecord(recordId: string, accountId: string): Promise<void> {
  const response = await fetch(
    `${baseUrl}/rest/v1/melonpan_shared_records?id=eq.${encodeURIComponent(recordId)}&account_id=eq.${encodeURIComponent(accountId)}`,
    { method: 'DELETE', headers: { ...headers(), Prefer: 'return=representation' } },
  )
  const deleted = await readResponse<Array<{ photo_path: string | null }>>(response)
  if (deleted[0]?.photo_path) await removePhoto(deleted[0].photo_path)
}

export async function syncSharedDefinitions(definitions: CustomRatingDefinition[], accountId: string): Promise<void> {
  const base = `${baseUrl}/rest/v1/melonpan_account_rating_definitions`
  const accountFilter = `account_id=eq.${encodeURIComponent(accountId)}`
  const existingResponse = await fetch(`${base}?select=id&${accountFilter}`, { headers: headers() })
  const existing = await readResponse<Array<{ id: string }>>(existingResponse)
  const retainedIds = new Set(definitions.map(definition => definition.id))
  for (const definition of existing) {
    if (!retainedIds.has(definition.id)) {
      const response = await fetch(`${base}?id=eq.${encodeURIComponent(definition.id)}&${accountFilter}`, { method: 'DELETE', headers: headers() })
      await readResponse<unknown>(response)
    }
  }
  const rows = definitions.map(definition => ({
    id: definition.id,
    account_id: accountId,
    label: definition.label,
    display_order: definition.order,
    enabled: definition.enabled,
    updated_at: new Date().toISOString(),
  }))
  if (!rows.length) return
  const response = await fetch(`${base}?on_conflict=account_id,id`, {
    method: 'POST',
    headers: { ...jsonHeaders(), Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify(rows),
  })
  await readResponse<unknown>(response)
}

export async function loadSharedData(accountId: string): Promise<AppData> {
  const [recordResponse, definitionResponse] = await Promise.all([
    fetch(`${baseUrl}/rest/v1/melonpan_shared_records?select=*&account_id=eq.${encodeURIComponent(accountId)}&order=eaten_at.desc`, { headers: headers() }),
    fetch(`${baseUrl}/rest/v1/melonpan_account_rating_definitions?select=*&account_id=eq.${encodeURIComponent(accountId)}&order=display_order.asc`, { headers: headers() }),
  ])
  const records = await readResponse<CloudRecord[]>(recordResponse)
  const definitions = await readResponse<Array<{ id: string; label: string; display_order: number; enabled: boolean }>>(definitionResponse)
  return {
    records: records.map(toLocalRecord),
    definitions: definitions.map(definition => ({ id: definition.id, label: definition.label, order: definition.display_order, enabled: definition.enabled })),
  }
}
