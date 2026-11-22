import { defineOccupationCard } from '../../card-source'
import type { CardImpl } from '../../registry'
import { readCardExtraData, writeCardExtraData } from '../../helpers/card-state'
import { payGainActionFlow } from '../../helpers/pay-gain-node'
import { getFarmyardTilePositions } from '../../../domain/farm'
import { getActionDefinition } from '../../../actions'

const CARD_ID = 'CWM049_SunriseAdmirer'

const cardImpl = {
  effect: {
    id: CARD_ID,
    onBuy: (state, player) => {
      writeCardExtraData(player, CARD_ID, 'playedRound', state.round)
    },
    onRoundStart: (state, player, context) => {
      const start = readCardExtraData<number>(player, CARD_ID, 'playedRound')
      if (start === undefined || state.round <= start || state.round > start + 3) return
      const allowedTiles = getFarmyardTilePositions(player).filter((tile) => tile.col === 4)
      const canPlow =
        player.resources.food >= 2 &&
        getActionDefinition('plow')?.canBeExecutedByPlayer(state, player, {
          actionHooks: context?.actionHooks,
          sourceCard: CARD_ID,
          actionContext: { allowedTiles },
        })
      return {
        type: 'leaf',
        actionId: 'emit-choice',
        sourceCard: CARD_ID,
        params: {
          requiresExplicitChoice: true,
          options: [
            ...(canPlow ? [{ value: 'plow', labelKey: 'actions.plow.name' }] : []),
            { value: 'discard', labelKey: 'ui.interactionOptionalSkip' },
          ],
        },
      }
    },
    resolveChoice: (_state, player, choice) => {
      if (choice === 'discard') {
        player.occupationPlayed = player.occupationPlayed.filter((id) => id !== CARD_ID)
        return
      }
      if (choice === 'plow')
        return payGainActionFlow({
          cardId: CARD_ID,
          cost: { food: 2 },
          followUp: [
            {
              type: 'leaf',
              actionId: 'plow',
              sourceCard: CARD_ID,
              actionContext: {
                allowedTiles: getFarmyardTilePositions(player).filter((tile) => tile.col === 4),
              },
            },
          ],
        })
    },
  },
} satisfies CardImpl

export const CWM049_SunriseAdmirer = defineOccupationCard({
  meta: {
    id: 'CWM049_SunriseAdmirer',
    name: "Sunrise Admirer",
    deck: 'CWM',
    number: 49,
    desc: ["At the start of each of the next 3 rounds, you may pay 2 food to plow an unused space in the easternmost farmyard column, opposite your starting rooms. Normal field adjacency applies. If you decline, discard this card."],
    cost: {},
    vp: 0,
    prerequisite: "",
    players: '3+',
    passing: false,
    extraVp: false,
    implemented: true,
    artUrl: '/assets/classic/CWM/CWM049.png',
  },
  impl: cardImpl,
})

export const CWM049_SunriseAdmirer_impl = CWM049_SunriseAdmirer.impl
