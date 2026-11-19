import { defineMinorCard } from '../../card-source'
import type { CardImpl } from '../../registry'
import { getPlayedCardDefinitions } from '../../helpers/card-type'
import { getCardEffect } from '../../card-effects'
import { registerPlayerActionSpace, createPlayerActionSpaces } from '../../player-action-space'
import { registerAdHocAction } from '../../../actions/helpers/ad-hoc-action-registry'
import type { PlayerState, GameState } from '../../../contract/types'

const CARD_ID = 'CFL016_JannekenPis'

const REFRESH = 'card_CFL016_JannekenPis_refresh'
const wells = (player: PlayerState) =>
  getPlayedCardDefinitions(player).filter((card) => card.wellIdentity)
const refresh = (state: GameState) => {
  state.actionSpaces.push(
    ...createPlayerActionSpaces(state).filter(
      (space) => !state.actionSpaces.some((existing) => existing.id === space.id),
    ),
  )
}
registerAdHocAction({
  id: REFRESH,
  nameKey: `cards.${CARD_ID}.name`,
  descriptionKey: `cards.${CARD_ID}.name`,
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  execute: ({ state }) => {
    refresh(state)
    return { type: 'ok' }
  },
})
registerPlayerActionSpace({
  cardId: CARD_ID,
  access: 'owner',
  createDefinitions: (state, ownerId) => {
    const owner = state.players.find((player) => player.id === ownerId)
    return owner
      ? wells(owner).map((well) => ({
          id: `${CARD_ID}:${well.id}`,
          nameKey: `cards.${well.id}.name`,
          descriptionKey: `cards.${CARD_ID}.name`,
          canBeExecutedByPlayer: (_state: GameState, player: PlayerState) =>
            player.id === ownerId &&
            player.minorPlayed.includes(CARD_ID) &&
            wells(player).some((card) => card.id === well.id),
          execute: (context) => {
            const flow = getCardEffect(well.id)?.onBuy?.(context.state, context.player, undefined, {
              actionHooks: context.actionHooks,
              transactionEvents: [],
            })
            return flow ? { type: 'flow', flow } : { type: 'ok' }
          },
        }))
      : []
  },
})

const cardImpl = {
  prerequisiteCheck: (player) => wells(player).length > 0,
  effect: { id: CARD_ID, onBuy: refresh, onRoundStart: refresh },
  listeners: [
    {
      id: CARD_ID + '-new-well',
      cardIds: [CARD_ID],
      actions: ['improvement'],
      phases: ['after'],
      handler: () => ({ flow: { type: 'leaf', actionId: REFRESH, sourceCard: CARD_ID } }),
    },
  ],
} satisfies CardImpl

export const CFL016_JannekenPis = defineMinorCard({
  meta: {
    id: 'CFL016_JannekenPis',
    name: 'Janneken Pis',
    deck: 'CFL',
    number: 16,
    cost: {
      stone: 1,
    },
    vp: 1,
    desc: [
      "Each Well you own is an action space only you may use. When you use one, activate that Well's effect again.",
    ],
    implemented: true,
    artUrl: 'assets/classic/CFL/CFL016.png',
    prerequisite: '1 Well',
  },
  impl: cardImpl,
})
