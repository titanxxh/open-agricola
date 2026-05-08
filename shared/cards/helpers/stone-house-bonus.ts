import type { PlayerState } from '../../contract/types'
import { familySize } from '../../game/player'

/**
 * BGA's bonusStoneRoom exclusivity: when a player plays multiple cards that
 * grant bonus VP based on their stone house, only the card with the highest
 * score contributes. Each contributing card calls this helper to decide
 * whether it is the winner (and thus scores) or not (and scores 0).
 *
 * Currently only C30_HalfTimberedHouse and D34_LuxuriousHostel carry this flag.
 */

type StoneHouseBonusEntry = {
  id: string
  score: number
}

const computeC30 = (player: PlayerState): number =>
  player.houseType === 'stone' ? player.rooms : 0

const computeD34 = (player: PlayerState): number =>
  player.houseType === 'stone' && player.rooms > familySize(player) ? 4 : 0

const BONUS_CARDS = [
  { id: 'C30_HalfTimberedHouse', compute: computeC30 },
  { id: 'D34_LuxuriousHostel', compute: computeD34 },
] as const

const getEntries = (player: PlayerState): StoneHouseBonusEntry[] =>
  BONUS_CARDS
    .filter((card) => player.minorPlayed.includes(card.id))
    .map((card) => ({ id: card.id, score: card.compute(player) }))

export const getStoneHouseBonusScore = (
  player: PlayerState,
  cardId: string,
): number => {
  const entries = getEntries(player)
  if (entries.length === 0) return 0
  const maxScore = Math.max(...entries.map((e) => e.score))
  if (maxScore <= 0) return 0
  // When tied, the first card declared in BONUS_CARDS wins (stable tie-break).
  const winner = entries.find((e) => e.score === maxScore)!
  return winner.id === cardId ? winner.score : 0
}
