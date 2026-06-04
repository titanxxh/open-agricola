import { defineMinorCard } from '../card-source'
import { writeCardExtraData, writeCardInfobox } from '../helpers/card-state'
import type { CardImpl } from '../registry'
import type { GameState, PlayerState } from '../../contract/types'
import { appendImmediateEvents } from '../../events/append'

const CARD_ID = 'B23_FinalScenario'

const setExclusiveUse = (state: GameState, player: PlayerState, actionId: string) => {
  const space = state.actionSpaces.find((entry) => entry.id === actionId)
  if (!space) return
  space.exclusiveUse = { playerId: player.id, sourceCardId: CARD_ID, untilRound: 14 }
  appendImmediateEvents(state, [{
    type: 'action.exclusiveUseSet',
    actionId,
    playerId: player.id,
    sourceCardId: CARD_ID,
    untilRound: 14,
  }], { actorPlayerId: player.id, sourceCardId: CARD_ID })
}

const cardImpl = {
  prerequisiteCheck: (_player, state) => {
    if (!state) return true
    return state.round <= 13
  },
  effect: {
  id: CARD_ID,
  onBuy: (state, player) => {
    if (state.round >= 14) return
    const round14SpaceId = state.roundActionOrder[13]
    if (round14SpaceId) {
      writeCardExtraData(player, CARD_ID, 'round14Space', round14SpaceId)
      writeCardExtraData(player, CARD_ID, 'exclusiveOwnerId', player.id)
      writeCardInfobox(player, CARD_ID, `Round 14: ${round14SpaceId}`)
      appendImmediateEvents(state, [{
        type: 'action.revealed',
        actionId: round14SpaceId,
        roundSlot: 14,
      }], { actorPlayerId: player.id, sourceCardId: CARD_ID })
      setExclusiveUse(state, player, round14SpaceId)
    }
  },
  onRoundStart: (state, player) => {
    if (state.round === 14) {
      const round14SpaceId = player.cardStates?.[CARD_ID]?.extraData?.round14Space
      if (typeof round14SpaceId === 'string') {
        const space = state.actionSpaces.find((entry) => entry.id === round14SpaceId)
        if (space?.exclusiveUse?.sourceCardId === CARD_ID) {
          delete space.exclusiveUse
          appendImmediateEvents(state, [{
            type: 'action.exclusiveUseCleared',
            actionId: round14SpaceId,
            playerId: player.id,
            sourceCardId: CARD_ID,
          }], { actorPlayerId: player.id, sourceCardId: CARD_ID })
        }
      }
      writeCardExtraData(player, CARD_ID, 'exclusiveOwnerId', null)
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const B23_FinalScenario = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Final Scenario',
    deck: 'B',
    number: 23,
    category: 'ACTIONS_BOOSTER',
    desc: ['Reveal the action space card for round 14. Only you can use it until round 14 starts.'],
    cost: {},
    prerequisite: 'Round 13 or Before',
    evenMoreSet: true,
  },
  impl: cardImpl,
})

export const B23_FinalScenario_impl = B23_FinalScenario.impl
