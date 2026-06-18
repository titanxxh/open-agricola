import type { ParentCardAsset } from '../../shared/parents'

const DEFAULT_PARENT_ASSETS_BASE_URL = '/assets/parents'

const trimTrailingSlashes = (value: string): string => value.replace(/\/+$/, '')

const getParentAssetsBaseUrl = (): string => {
  const envBaseUrl = typeof import.meta !== 'undefined'
    ? import.meta.env?.VITE_PARENT_ASSETS_BASE_URL
    : undefined

  return trimTrailingSlashes(envBaseUrl || DEFAULT_PARENT_ASSETS_BASE_URL)
}

export type ResolvedParentCardAssetUrls = {
  frontUrl: string
  backUrl: string
}

export const resolveParentCardAssetUrls = (
  assets: ParentCardAsset,
  baseUrl = getParentAssetsBaseUrl(),
): ResolvedParentCardAssetUrls => {
  const normalizedBaseUrl = trimTrailingSlashes(baseUrl)

  return {
    frontUrl: `${normalizedBaseUrl}/cards/${assets.front}`,
    backUrl: `${normalizedBaseUrl}/backs/${assets.back}.png`,
  }
}
