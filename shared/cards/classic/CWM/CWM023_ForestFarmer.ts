import { defineOccupationCard } from '../../card-source'
import type { CardImpl } from '../../registry'
import { readCardExtraData } from '../../helpers/card-state'
import { payGainActionFlow } from '../../helpers/pay-gain-node'
import { jumpLeaf } from '../../helpers/jump-leaf'
import { computeAllowedPlacementSpaces } from '../../../actions/helpers/placement-availability'

const CARD_ID = 'CWM023_ForestFarmer'

const cardImpl = {
  effect: {
    id: CARD_ID,
    onBuy: () => ({
      type: 'leaf',
      actionId: 'special-effect',
      sourceCard: CARD_ID,
      params: { kind: 'set-counter', key: 'uses', value: 3 },
    }),
    onAllWorkersPlaced: (state, player, context) => {
      if (
        (player.cardStates[CARD_ID]?.counters?.uses ?? 0) <= 0 ||
        readCardExtraData(player, CARD_ID, 'usedRound') === state.round
      )
        return
      const workers = state.actionSpaces
        .filter((space) => ['farmland', 'cultivation'].includes(space.id))
        .flatMap((space) => space.takenBy.filter((worker) => worker.playerId === player.id))
      const targets = computeAllowedPlacementSpaces(state, player, {
        actionHooks: context?.actionHooks,
        ignoreWorkerAvailability: true,
        actionSpaceUse: { newPlacement: false },
      }).filter((target) => !target.allowOccupied)
      if (!workers.length || !targets.length) return
      return {
        type: 'xor',
        optional: true,
        children: workers.flatMap((worker) =>
          targets.map((target) =>
            payGainActionFlow({
              cardId: CARD_ID,
              cost: { wood: 1 },
              followUp: [
                {
                  type: 'leaf',
                  actionId: 'special-effect',
                  sourceCard: CARD_ID,
                  params: { kind: 'increment-counter', key: 'uses', amount: -1 },
                },
                {
                  type: 'leaf',
                  actionId: 'special-effect',
                  sourceCard: CARD_ID,
                  params: { kind: 'set-extra-data', key: 'usedRound', value: state.round },
                },
                jumpLeaf({
                  sourceCard: CARD_ID,
                  workerId: worker.workerId,
                  targetSpaceId: target.spaceId,
                }),
              ],
            }),
          ),
        ),
      }
    },
  },
} satisfies CardImpl

export const CWM023_ForestFarmer = defineOccupationCard({
  meta: {
    id: 'CWM023_ForestFarmer',
    name: "Forest Farmer",
    deck: 'CWM',
    number: 23,
    desc: ["Place 3 arrow markers on this card. Once per round, after the work phase and before returning home, you may pay 1 <WOOD> and discard a marker to move one of your people from __Farmland__ or __Cultivation__ to an unoccupied action space and use it."],
    cost: {},
    vp: 0,
    prerequisite: "",
    players: '1+',
    passing: false,
    extraVp: false,
    implemented: true,
    artUrl: '/assets/classic/CWM/CWM023.png',
  },
  presentation: { counters: ['uses'] },
  impl: cardImpl,
})

export const CWM023_ForestFarmer_impl = CWM023_ForestFarmer.impl
