export type RatingValue = 1 | 2 | 3 | 4 | 5
export type SharedAccount = { id: string; name: string }
export type CustomRatingDefinition = { id: string; label: string; order: number; enabled: boolean }
export type MelonpanRecord = { id: string; accountId?: string; syncPending?: boolean; eatenAt: string; shop: string; productName: string; photo?: string; photoPath?: string; overallRating: RatingValue; memo: string; tags: string[]; customRatings: Record<string, RatingValue>; createdAt: string; updatedAt: string }
export type AppData = { records: MelonpanRecord[]; definitions: CustomRatingDefinition[] }
export const DEFAULT_DEFINITIONS: CustomRatingDefinition[] = ['サクサク感', '甘さ', '香り'].map((label, index) => ({ id: `default-${index + 1}`, label, order: index, enabled: true }))
