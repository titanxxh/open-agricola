import type { Locale } from '../../../shared/i18n'
import type { EncyclopediaBrowseStore } from './encyclopedia-browse-store'

export type EncyclopediaSearchProps = {
  store: EncyclopediaBrowseStore
  locale: Locale
}

/** Search box slot above the results; renders nothing until search ships. */
export function EncyclopediaSearch(_props: EncyclopediaSearchProps) {
  return null
}
