export const ENCYCLOPEDIA_BROWSE_STORAGE_KEY = 'open-agricola:encyclopedia-browse'

export type EncyclopediaSessionResetOptions = {
  /** Read on every access: browsers throw when storage is blocked. */
  storage?: () => Pick<Storage, 'removeItem'> | null | undefined
  isReload?: () => boolean
}

const documentWasReloaded = (): boolean => {
  try {
    const [navigation] = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[]
    return navigation?.type === 'reload'
  } catch {
    return false
  }
}

/**
 * A refresh starts the tab's search over even on pages that never load the encyclopedia,
 * so the application entry runs this before any page can restore the saved state.
 */
export function forgetEncyclopediaBrowseOnReload({
  storage = () => window.sessionStorage,
  isReload = documentWasReloaded,
}: EncyclopediaSessionResetOptions = {}): void {
  if (!isReload()) return
  try {
    storage()?.removeItem(ENCYCLOPEDIA_BROWSE_STORAGE_KEY)
  } catch {
    // Blocked storage holds nothing to forget.
  }
}
