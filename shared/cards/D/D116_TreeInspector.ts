import { definePlayerActionCard } from '../card-source'
import { registerPlayerActionSpace, createPlayerActionSpaces, definePlayerActionSpaceFlow } from '../player-action-space'
import { findActionSpaceById } from '../../domain/space'
import { registerAdHocAction } from '../../actions/helpers/ad-hoc-action-registry'
import type { ActionDefinition } from '../../contract/types'
import type { CardImpl } from '../registry'
import { hasCollectableResources } from '../../actions/effects/collect'

const CARD_ID = 'D116_TreeInspector'
const DISCARD_WOOD = `card_${CARD_ID}_discardWood`

registerAdHocAction({
  id: DISCARD_WOOD,
  nameKey: 'actions.special-effect.name',
  descriptionKey: 'actions.special-effect.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  execute: ({ state, eventSink }) => {
    const space = findActionSpaceById(state, CARD_ID)
    const wood = space?.resources.wood ?? 0
    if (space && wood > 0) {
      space.resources.wood = 0
      eventSink?.emit<'resource.moved'>({ type: 'resource.moved', resources: { wood },
        from: { kind: 'actionSpace', spaceId: CARD_ID }, to: { kind: 'supply' }, reason: 'discard' })
    }
    return { type: 'ok' }
  },
} satisfies ActionDefinition)

registerPlayerActionSpace({
  cardId: CARD_ID,
  access: 'owner',
  gainPerRound: { wood: 1 },
  createDefinition: (ownerId) => definePlayerActionSpaceFlow({
    id: CARD_ID,
    nameKey: 'cards.D116_TreeInspector.name',
    descriptionKey: 'cards.D116_TreeInspector.desc',
    canBeExecutedByPlayer: (_state, player) => player.id === ownerId,
    originalActionCondition: context => hasCollectableResources({ ...context, actionContext: undefined }),
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
  stageEligibility: { onAfterRevealAction: (_state, _player, ctx) => {
    const revealedAction = ctx.roundPreparation?.kind === 'after-reveal' ? ctx.roundPreparation.revealedAction?.actionId : undefined
    return revealedAction === 'western-quarry' || revealedAction === 'eastern-quarry'
  } },
  onAfterRevealAction: (_state, _player, ctx) => {
    const revealedAction = ctx?.roundPreparation?.kind === 'after-reveal' ? ctx.roundPreparation.revealedAction?.actionId : undefined
    if (revealedAction !== 'western-quarry' && revealedAction !== 'eastern-quarry') return
    return { type: 'leaf', actionId: DISCARD_WOOD, sourceCard: CARD_ID }
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
