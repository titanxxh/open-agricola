import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { B56_Brook } from '../../cards-display/B/B56_Brook'

const CARD_ID = B56_Brook.id

const BROOK_SPACES = new Set(['forest', 'clay-pit', 'reed-bank', 'hollow-4'])

const listener: CardListenerRegistration = {
  id: 'B56-brook-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!BROOK_SPACES.has(context.space?.id ?? '')) return
    return { flow: gainLeaf(CARD_ID, { food: 1 }), sourceCard: CARD_ID }
  },
}

export const B56_Brook_impl = {
  prerequisiteCheck: (player, state) => {
    if (!state) return true
    const fishing = state.actionSpaces.find((s) => s.id === 'fishing')
    if (!fishing) return false
    return fishing.takenBy.some((w) => w.playerId === player.id)
  },
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
