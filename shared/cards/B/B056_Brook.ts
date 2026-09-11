import { defineMinorCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'B056_Brook'
const FIXED_BROOK_SPACES = new Set(['forest', 'clay-pit', 'reed-bank'])

const listener: CardListenerRegistration = {
  id: 'B56-brook-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const spaceId = context.space?.id
    if (!spaceId) return
    const roundOneSpaceId = context.state.roundActionOrder[0]
    if (!FIXED_BROOK_SPACES.has(spaceId) && spaceId !== roundOneSpaceId) return
    return { flow: gainLeaf(CARD_ID, { food: 1 }), sourceCard: CARD_ID }
  },
}

const cardImpl = {
  prerequisiteCheck: (player, state) => {
    if (!state) return true
    const fishing = state.actionSpaces.find((s) => s.id === 'fishing')
    if (!fishing) return false
    return fishing.takenBy.some((w) => w.playerId === player.id)
  },
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const B056_Brook = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Brook',
    deck: 'B',
    number: 56,
    category: 'FOOD_PROVIDER',
    desc: ['Each time you use one of the four action spaces above the __Fishing__ accumulation space, you get 1 additional <FOOD>.'],
    cost: {},
    prerequisite: 'Farmer on Fishing Space',
  },
  impl: cardImpl,
})

export const B056_Brook_impl = B056_Brook.impl
