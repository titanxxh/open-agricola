import type { EncyclopediaEntry, EncyclopediaSearchDocument } from '../../../shared/contract/card-encyclopedia'
import type { CardEncyclopedia } from '../../services/card-encyclopedia'

export type EncyclopediaItem = Readonly<{ entry: EncyclopediaEntry; document: EncyclopediaSearchDocument }>

/** Default catalog order. */
export const encyclopediaItems = (encyclopedia: CardEncyclopedia): readonly EncyclopediaItem[] =>
  [...encyclopedia.byKey.values()]
