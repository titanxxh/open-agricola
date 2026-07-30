import type { ParentCardAsset } from '../../shared/parents'
import { publicAssetUrl } from '../utils/public-asset-url'

const DEFAULT_PARENT_ASSETS_BASE_URL = '/assets/parents'

const trimTrailingSlashes = (value: string): string => value.replace(/\/+$/, '')

export type ResolvedParentCardAssetUrls = {
  portraitUrl: string
  backUrl: string
}

export const resolveParentCardAssetUrls = (
  assets: ParentCardAsset,
): ResolvedParentCardAssetUrls => {
  const normalizedBaseUrl = trimTrailingSlashes(DEFAULT_PARENT_ASSETS_BASE_URL)

  return {
    portraitUrl: publicAssetUrl(`${normalizedBaseUrl}/portrait/${assets.front}`),
    backUrl: publicAssetUrl(`${normalizedBaseUrl}/backs/${assets.back}.png`),
  }
}
