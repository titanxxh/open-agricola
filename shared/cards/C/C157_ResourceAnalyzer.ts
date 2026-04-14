import { Occupation } from '../types'
import { registerCardEffect } from '../card-effects'
import { gainLeaf } from '../helpers/pay-gain-node'

const CARD_ID = 'C157_ResourceAnalyzer'

const BUILD_RESOURCES = ['stone', 'clay', 'reed', 'wood'] as const

// C157 Resource Analyzer: Before the start of each round, if you have more building
// resources than all other players of at least two types, you get 1 food.
registerCardEffect({
  id: CARD_ID,
  onBeforeStartOfTurn: (state, player) => {
    if (!player.occupationPlayed.includes(CARD_ID)) return
    const otherPlayers = state.players.filter((p) => p.id !== player.id)

    let typesWithMost = 0
    for (const resource of BUILD_RESOURCES) {
      const myAmount = player.resources[resource] ?? 0
      const allOthersLess = otherPlayers.every(
        (other) => (other.resources[resource] ?? 0) < myAmount,
      )
      if (allOthersLess) typesWithMost++
    }

    if (typesWithMost >= 2) return gainLeaf(CARD_ID, { food: 1 })
  },
})

export const C157_ResourceAnalyzer = new Occupation({
  id: CARD_ID,
  name: 'Resource Analyzer',
  deck: 'C',
  number: 157,
  category: 'FOOD_PROVIDER',
  desc: ['Before the start of each round, if you have more building resources than all other players of at least two types, you get 1 <FOOD>.'],
  cost: {},
  players: '4+',
  evenMoreSet: true,
})
