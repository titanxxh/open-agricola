import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { A80_StoneTongs } from '../../cards-display/A/A80_StoneTongs'

const CARD_ID = A80_StoneTongs.id

/**
 * A80 Stone Tongs — Each time you use a stone accumulation space
 * (eastern-quarry or western-quarry), you get 1 additional stone.
 *
 * BGA reference: A_80_StoneTongs.php
 */
const STONE_SPACES = ['eastern-quarry', 'western-quarry']

const listener: CardListenerRegistration = {
  id: 'A80-stone-tongs-after-stone',
  cardIds: [CARD_ID],
  actions: ['place-farmer'],
  phases: ['after' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.space || !STONE_SPACES.includes(context.space.id)) return
    return { flow: gainLeaf(CARD_ID, { stone: 1 }), sourceCard: CARD_ID }
  },
}

export const A80_StoneTongs_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
