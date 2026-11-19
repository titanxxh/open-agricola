import { definePlayerActionCard } from '../../card-source'
import type { CardImpl } from '../../registry'
import {
  registerPlayerActionSpace,
  createPlayerActionSpaces,
  definePlayerActionSpaceFlow,
} from '../../player-action-space'
import { countUnusedFarmyardSpaces } from '../../../domain/farm'
import { gainLeaf } from '../../helpers/pay-gain-node'

const CARD_ID = 'CFL038_ShepherdwithFlock'

registerPlayerActionSpace({
  cardId: CARD_ID,
  access: 'owner',
  createDefinition: (ownerId) =>
    definePlayerActionSpaceFlow({
      id: CARD_ID,
      nameKey: `cards.${CARD_ID}.name`,
      descriptionKey: `cards.${CARD_ID}.desc`,
      canBeExecutedByPlayer: (_state, player) =>
        player.id === ownerId &&
        player.resources.sheep > 0 &&
        countUnusedFarmyardSpaces(player) > 0,
      flowFactory: ({ player }) =>
        gainLeaf(CARD_ID, {
          sheep: Math.min(player.resources.sheep, countUnusedFarmyardSpaces(player)),
        }),
    }),
})

const cardImpl = {
  effect: {
    id: CARD_ID,
    onBuy: (state) => {
      for (const space of createPlayerActionSpaces(state))
        if (!state.actionSpaces.some((existing) => existing.id === space.id))
          state.actionSpaces.push(space)
    },
  },
} satisfies CardImpl

export const CFL038_ShepherdwithFlock = definePlayerActionCard({
  meta: {
    id: 'CFL038_ShepherdwithFlock',
    name: 'Shepherd with Flock',
    deck: 'CFL',
    number: 38,
    players: '1+',
    desc: [
      'This card is an action space for you only. When you use it, you get as many <SHEEP> as you already have, up to the number of unused spaces in your farmyard.',
    ],
    implemented: true,
    artUrl: 'assets/classic/CFL/CFL038.png',
    playerActionCardType: 'occupation',
  },
  impl: cardImpl,
})
