import { Occupation } from '../types'
import { registerCardEffect } from '../card-effects'
import { gainLeaf } from '../helpers/pay-gain-node'

const CARD_ID = 'E136_AnimalHusbandryWorker'

const roundsLeftWoodBonus = (state: { round: number }): number => {
  const remaining = 14 - state.round
  if (remaining >= 9) return 4
  if (remaining >= 6) return 3
  if (remaining >= 3) return 2
  return 0
}

registerCardEffect({
  id: CARD_ID,
  onBuy: (state) => {
    const wood = roundsLeftWoodBonus(state)
    if (wood <= 0) return
    return {
      type: 'seq' as const,
      children: [
        gainLeaf(CARD_ID, { wood }),
        { type: 'leaf' as const, actionId: 'fencing', sourceCard: CARD_ID, optional: true },
      ],
    }
  },
  computeBonusScore: (state, player) => {
    if (!player.occupationPlayed.includes(CARD_ID)) return 0
    const myPastures = player.pastures.length
    const maxPastures = Math.max(...state.players.map((p) => p.pastures.length))
    return myPastures === maxPastures && myPastures > 0 ? 2 : 0
  },
})

export const E136_AnimalHusbandryWorker = new Occupation({
  id: CARD_ID,
  name: "Animal Husbandry Worker",
  deck: "E",
  number: 136,
  category: "POINTS_PROVIDER",
  desc: ['If there are still 3/6/9 complete rounds left to play, you immediately get 2/3/4 <WOOD> and a __Build Fences__ action. During scoring, each player with the most pastures gets 2 <SCORE>.'],
  cost: {},
  players: "3+",
})
