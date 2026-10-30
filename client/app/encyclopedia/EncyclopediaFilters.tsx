import type { Locale } from '../../../shared/i18n'
import type { EncyclopediaBrowseStore } from './encyclopedia-browse-store'
import type { EncyclopediaItem } from './encyclopedia-item'

export type EncyclopediaFiltersProps = {
  store: EncyclopediaBrowseStore
  locale: Locale
  /** The whole catalog, for building filter options. */
  items: readonly EncyclopediaItem[]
  resultCount: number
}

/** Desktop sidebar slot beside the results; renders nothing until filters ship. */
export function EncyclopediaFilterPanel(_props: EncyclopediaFiltersProps) {
  return null
}

/** Phone entry point slot in the results bar; renders nothing until filters ship. */
export function EncyclopediaFilterEntry(_props: EncyclopediaFiltersProps) {
  return null
}
