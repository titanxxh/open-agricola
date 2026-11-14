import type { PlayerState } from '../../shared/contract/types'
import { getCardMeta } from '../services/card-meta'

export const playerCanBuildPalisades = (
  builder: Pick<PlayerState, 'id' | 'minorPlayed' | 'occupationPlayed' | 'improvements'>,
  farmOwner: Pick<PlayerState, 'id'>,
): boolean => {
  const has = (id: string) => {
    const card = getCardMeta(id)
    return card?.enablesPalisades === true
      && (card.palisadeTargetFarmPolicy !== 'own' || builder.id === farmOwner.id)
  }
  return (
    builder.minorPlayed.some(has)
    || builder.occupationPlayed.some(has)
    || builder.improvements.some(has)
  )
}
