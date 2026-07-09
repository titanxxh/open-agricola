import type { ParentCardAsset } from '../../shared/parents'
import { publicAssetUrl } from '../utils/public-asset-url'

const DEFAULT_PARENT_ASSETS_BASE_URL = '/assets/parents'

const trimTrailingSlashes = (value: string): string => value.replace(/\/+$/, '')

const getParentAssetsBaseUrl = (): string => publicAssetUrl(DEFAULT_PARENT_ASSETS_BASE_URL)

export type ResolvedParentCardAssetUrls = {
  portraitUrl: string
  backUrl: string
}

export const resolveParentCardAssetUrls = (
  assets: ParentCardAsset,
  baseUrl = getParentAssetsBaseUrl(),
): ResolvedParentCardAssetUrls => {
  const normalizedBaseUrl = trimTrailingSlashes(publicAssetUrl(baseUrl))

  return {
    portraitUrl: `${normalizedBaseUrl}/portrait/${assets.front}`,
    backUrl: `${normalizedBaseUrl}/backs/${assets.back}.png`,
  }
}
