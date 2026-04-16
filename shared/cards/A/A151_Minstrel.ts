import { Occupation } from '../types'
import { registerCardEffect } from '../card-effects'
import type { ActionFlow } from '../../game/types'

const CARD_ID = 'A151_Minstrel'

// A151 Minstrel: At the start of each returning home phase, if only one action space
// card on round space 1 to 4 is unoccupied, you can use that action space.
//
// Stage 1 actions: sheep-market, grain-utilization, fencing, major-improvement
// Note: For sheep-market we gain accumulated sheep from general supply (same as A82).

// Inlined from roundStageActions[1] to avoid circular dependency through state.ts -> catalog.ts
const STAGE_1_ACTIONS = ['sheep-market', 'grain-utilization', 'fencing', 'major-improvement']

const buildFlowForSpace = (
  spaceId: string,
  accumulatedSheep: number,
): ActionFlow | null => {
  switch (spaceId) {
    case 'sheep-market': {
      if (accumulatedSheep <= 0) return null
      return {
        type: 'leaf',
        actionId: 'gain',
        params: { sheep: accumulatedSheep },
        sourceCard: CARD_ID,
      }
    }
    case 'grain-utilization':
      return {
        type: 'or',
        children: [
          { type: 'leaf', actionId: 'sow', sourceCard: CARD_ID, actionContext: { trueAction: false } },
          { type: 'leaf', actionId: 'bake-bread', sourceCard: CARD_ID, actionContext: { trueAction: false } },
        ],
      }
    case 'fencing':
      return {
        type: 'leaf',
        actionId: 'fence',
        sourceCard: CARD_ID,
        actionContext: { trueAction: false },
      }
    case 'major-improvement':
      return {
        type: 'leaf',
        actionId: 'improvement-any',
        sourceCard: CARD_ID,
        actionContext: { trueAction: false },
      }
    default:
      return null
  }
}

registerCardEffect({
  id: CARD_ID,
  onStartReturnHome: (state, player) => {
    if (!player.occupationPlayed.includes(CARD_ID)) return

    const unoccupied: string[] = []
    for (const actionId of STAGE_1_ACTIONS) {
      const space = state.actionSpaces.find((s) => s.id === actionId)
      if (!space) continue
      const roundOrder = state.roundActionOrder
      const posIndex = roundOrder.indexOf(actionId)
      if (posIndex < 0 || posIndex + 1 > state.round) continue
      if (!space.takenBy) {
        unoccupied.push(actionId)
      }
    }

    if (unoccupied.length !== 1) return

    const targetSpaceId = unoccupied[0]!
    const sheepSpace = state.actionSpaces.find((s) => s.id === 'sheep-market')
    const accumulatedSheep = sheepSpace?.resources?.sheep ?? 0
    const flow = buildFlowForSpace(targetSpaceId, accumulatedSheep)
    if (!flow) return

    return {
      type: 'seq',
      optional: true,
      children: [flow],
    }
  },
})

export const A151_Minstrel = new Occupation({
  id: CARD_ID,
  name: 'Minstrel',
  deck: 'A',
  number: 151,
  category: 'ACTIONS_BOOSTER',
  desc: ['At the start of each returning home phase, if only one action space card on round space 1 to 4 is unoccupied, you can use that action space.'],
  cost: {},
  players: '4+',
  newSet: true,
})
