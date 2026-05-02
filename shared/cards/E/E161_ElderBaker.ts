import { PlayerActionCard } from '../types'
import { registerPlayerActionSpace, createPlayerActionSpaces } from '../player-action-space'
import type { CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase } from '../../actions/hooks'
import type { ActionChoiceOption } from '../../game/types'
import type { CardImpl } from '../registry'

const CARD_ID = 'E161_ElderBaker'

/**
 * BGA Desc: "You can build the Stone Oven major improvement even when taking a
 * Minor Improvement action." Pattern mirrors D131 CraftsmanshipPromoter — inject
 * a `major:` candidate into the minor-improvement choice list when owner has
 * the card in play.
 */
const STONE_OVEN_ID = 'Major_StoneOven'

const stoneOvenCandidateListener: CardListenerRegistration = {
  id: 'E161-elder-baker-compute-choice-candidates',
  cardIds: [CARD_ID],
  actions: ['minor-improvement'],
  phases: ['computeChoiceCandidates' as ActionHookPhase],
  handler: (ctx) => {
    if (!ctx.player.occupationPlayed.includes(CARD_ID)) return
    const available = ctx.state.availableMajorImprovements ?? []
    if (!available.includes(STONE_OVEN_ID)) return
    const extraOptions: ActionChoiceOption[] = [
      {
        value: `major:${STONE_OVEN_ID}`,
        labelKey: `improvements.${STONE_OVEN_ID}.name`,
        sourceCard: CARD_ID,
      },
    ]
    return { extraOptions, sourceCard: CARD_ID }
  },
}

registerPlayerActionSpace({
  cardId: CARD_ID,
  access: 'owner',
  createDefinition: (ownerId) => ({
    id: CARD_ID,
    nameKey: 'cards.E161_ElderBaker.name',
    descriptionKey: 'cards.E161_ElderBaker.desc',
    canBeExecutedByPlayer: (_, player) => player.id === ownerId,
    execute: ({ player }) => {
      player.resources.grain += 3
      return { type: 'ok', resourcesGained: { grain: 3 } }
    },
  }),
})

export const E161_ElderBaker = new PlayerActionCard({
  id: "E161_ElderBaker",
  name: "Elder Baker",
  deck: "E",
  number: 161,
  desc: ["This card is an action space for you only. When you use it, you get 3 <GRAIN>. You can build the __Stone Oven__ major improvement even when taking a __Minor Improvement__ action."],
  cost: {},
  players: "4+",
})

export const E161_ElderBaker_impl = {
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
  listeners: [stoneOvenCandidateListener],
  reaches: [STONE_OVEN_ID] as readonly string[],
} satisfies CardImpl
