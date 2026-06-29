import { definePlayerActionCard } from '../card-source'
import { registerPlayerActionSpace, createPlayerActionSpaces } from '../player-action-space'
import type { CardImpl } from '../registry'

const CARD_ID = 'C162_ForestOwner'

registerPlayerActionSpace({
  cardId: CARD_ID,
  access: 'all',
  createDefinition: (ownerId) => ({
    id: CARD_ID,
    nameKey: 'cards.C162_ForestOwner.name',
    descriptionKey: 'cards.C162_ForestOwner.desc',
    canBeExecutedByPlayer: () => true,
    execute: ({ state, player, eventSink }) => {
      if (player.id === ownerId) {
        player.resources.wood += 4
        eventSink?.emit<'resource.moved'>({
          type: 'resource.moved',
          resources: { wood: 4 },
          from: { kind: 'actionSpace', spaceId: CARD_ID },
          to: { kind: 'player', playerId: player.id },
          reason: 'gain',
        })
        return { type: 'ok', resourcesGained: { wood: 4 } }
      }
      player.resources.wood += 3
      eventSink?.emit<'resource.moved'>({
        type: 'resource.moved',
        resources: { wood: 3 },
        from: { kind: 'actionSpace', spaceId: CARD_ID },
        to: { kind: 'player', playerId: player.id },
        reason: 'gain',
      })
      const owner = state.players.find((p) => p.id === ownerId)
      if (owner) {
        owner.resources.wood += 1
        eventSink?.emit<'resource.moved'>({
          type: 'resource.moved',
          resources: { wood: 1 },
          from: { kind: 'supply' },
          to: { kind: 'player', playerId: owner.id },
          reason: 'gain',
          sourceCardId: CARD_ID,
        })
      }
      return { type: 'ok', resourcesGained: { wood: 3 } }
    },
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
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const C162_ForestOwner = definePlayerActionCard({
  meta: {
    id: "C162_ForestOwner",
    name: "Forest Owner",
    deck: "C",
    number: 162,
    playerActionCardType: 'occupation',
    category: "ACTIONS_BOOSTER",
    desc: ["This card is an action space for all. If another player uses it, they get 3 <WOOD> and must give you 1 <WOOD> from the general supply. If you use it, you get 4 <WOOD>."],
    cost: {},
    players: "4+",
  },
  impl: cardImpl,
})

export const C162_ForestOwner_impl = C162_ForestOwner.impl
