import type { EncyclopediaBrowseState } from './encyclopedia-browse-store'
import { filterEncyclopedia } from './encyclopedia-filters'
import type { EncyclopediaItem } from './encyclopedia-item'
import { queryEncyclopedia } from './encyclopedia-query'

export const encyclopediaResults = (
  items: readonly EncyclopediaItem[],
  { query, filters }: Pick<EncyclopediaBrowseState, 'query' | 'filters'>,
): readonly EncyclopediaItem[] => filterEncyclopedia(queryEncyclopedia(items, query), filters)
