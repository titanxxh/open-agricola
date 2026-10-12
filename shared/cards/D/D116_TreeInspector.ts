import { definePlayerActionCard } from '../card-source'
import { registerPlayerActionSpace, createPlayerActionSpaces, definePlayerActionSpaceFlow } from '../player-action-space'
import { findActionSpaceById } from '../../domain/space'
import type { CardImpl } from '../registry'

const CARD_ID = 'D116_TreeInspector'

registerPlayerActionSpace({
  cardId: CARD_ID,
  access: 'owner',
  gainPerRound: { wood: 1 },
  createDefinition: (ownerId) => definePlayerActionSpaceFlow({
    id: CARD_ID,
    nameKey: 'cards.D116_TreeInspector.name',
    descriptionKey: 'cards.D116_TreeInspector.desc',
    canBeExecutedByPlayer: (_state, player) => player.id === ownerId,
    flowFactory: () => ({ type: 'leaf', actionId: 'collect', sourceCard: CARD_ID }),
  }),
})

const cardImpl = {
  effect: {
  id: CARD_ID,
  onBuy: (state, _player) => {
    const newSpaces = createPlayerActionSpaces(state)
    for (const space of newSpaces) {
      if (!state.actionSpaces.some((s) => s.id === space.id)) {
        state.actionSpaces.push(space)
      }
    }
  },
  onBeforeStartOfTurn: (state) => {
    const revealedAction = state.roundActionOrder[state.round - 1]
    if (revealedAction !== 'western-quarry' && revealedAction !== 'eastern-quarry') return
    const space = findActionSpaceById(state, CARD_ID)
    if (space) space.resources.wood = 0
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const D116_TreeInspector = definePlayerActionCard({
  meta: {
    id: "D116_TreeInspector",
    name: "Tree Inspector",
    deck: "D",
    number: 116,
    playerActionCardType: 'occupation',
    category: "BUILDING_RESOURCE_PROVIDER",
    desc: ["This card is a 1 <WOOD> accumulation space for you only. Each time the newly revealed action space card is a __Quarry__ accumulation space, you must discard all <WOOD> from this card."],
    cost: {},
    players: "1+",
  },
  impl: cardImpl,
})

export const D116_TreeInspector_impl = D116_TreeInspector.impl
