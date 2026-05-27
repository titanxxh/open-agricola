import type { PlayerState } from '../../shared/contract/types'
import { getCardMeta } from '../services/card-meta'

export const playerCanBuildPalisades = (player: PlayerState): boolean => {
  const has = (id: string) => !!getCardMeta(id)?.enablesPalisades
  return (
    player.minorPlayed.some(has)
    || player.occupationPlayed.some(has)
    || player.improvements.some(has)
  )
}
