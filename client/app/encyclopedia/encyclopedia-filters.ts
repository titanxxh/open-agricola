import type { EncyclopediaItem } from './encyclopedia-item'

export type EncyclopediaFilters = Readonly<Record<never, never>>

export const EMPTY_ENCYCLOPEDIA_FILTERS: EncyclopediaFilters = Object.freeze({})

/** Keeps the incoming order. */
export const filterEncyclopedia = (
  items: readonly EncyclopediaItem[],
  _filters: EncyclopediaFilters,
): readonly EncyclopediaItem[] => items
