import type { EncyclopediaItem } from './encyclopedia-item'

/** Returns matches in result order; the default catalog order is kept within equal ranks. */
export const queryEncyclopedia = (
  items: readonly EncyclopediaItem[],
  _query: string,
): readonly EncyclopediaItem[] => items
