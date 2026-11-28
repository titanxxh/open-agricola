import { activeWorkers, availableWorkers } from '../../../domain/player'
import { defineMinorCard } from '../../card-source'
import { getWorkersHeldOnCard } from '../../helpers/card-held-workers'
import type { CardImpl } from '../../registry'

const CARD_ID = 'CWM090_Honeymoon'

const cardImpl = {
  prerequisiteCheck: (player, state) =>
    (!state || state.round <= 13) && activeWorkers(player).length >= 2,
  effect: {
    id: CARD_ID,
    onEndPreparation: (state, player) => {
      if (state.round !== 14) return
      const sick = state.enableFarmersOfTheMoor ? new Set(player.sickWorkerIds ?? []) : undefined
      const healthyFamily = availableWorkers(state, player).filter(
        (worker) => worker.isActive && !worker.supplyUse && !sick?.has(worker.id),
      )
      const candidates =
        healthyFamily.length >= 2
          ? healthyFamily
          : availableWorkers(state, player).filter((worker) => worker.isActive && !worker.supplyUse)
      const heldIds = candidates.slice(0, 2).map((worker) => worker.id)
      if (heldIds.length === 0) return
      return {
        type: 'leaf',
        actionId: 'special-effect',
        sourceCard: CARD_ID,
        params: { kind: 'set-extra-data', key: 'heldWorkerIds', value: heldIds },
      }
    },
    getStatePresentation: (player) => {
      const held = getWorkersHeldOnCard(player, CARD_ID)
      return held.length > 0 ? { heldWorkerId: held[0] } : {}
    },
  },
} satisfies CardImpl

export const CWM090_Honeymoon = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Honeymoon',
    deck: 'CWM',
    number: 90,
    desc: ['In Round 14, you place 2 fewer Family members.'],
    cost: { food: 2 },
    vp: 5,
    prerequisite: 'Round 13 or before',
    maxRound: 13,
    passing: false,
    extraVp: false,
    implemented: true,
    artUrl: '/assets/classic/CWM/CWM090.png',
  },
  impl: cardImpl,
})

export const CWM090_Honeymoon_impl = CWM090_Honeymoon.impl
