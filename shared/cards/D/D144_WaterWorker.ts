import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { D144_WaterWorker } from '../../cards-display/D/D144_WaterWorker'

const CARD_ID = D144_WaterWorker.id

const TRIGGER_SPACE_IDS = new Set(['day-laborer', 'reed-bank'])

const isRound4ActionSpace = (context: CardListenerContext): boolean => {
  if (!context.space) return false
  const roundOrder = context.state.roundActionOrder
  // Round 4 is index 3 (0-based)
  const round4SpaceId = roundOrder[3]
  return round4SpaceId !== null && context.space.id === round4SpaceId
}

const collectListener: CardListenerRegistration = {
  id: 'D144-water-worker-after-collect',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['collect'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.space?.id !== 'fishing') return
    return { flow: gainLeaf(CARD_ID, { reed: 1 }), sourceCard: CARD_ID }
  },
}

const placeFarmerListener: CardListenerRegistration = {
  id: 'D144-water-worker-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.space) return
    if (TRIGGER_SPACE_IDS.has(context.space.id) || isRound4ActionSpace(context)) {
      return { flow: gainLeaf(CARD_ID, { reed: 1 }), sourceCard: CARD_ID }
    }
  },
}

export const D144_WaterWorker_impl = {
  listeners: [collectListener, placeFarmerListener],
  reaches: [] as readonly string[],
} satisfies CardImpl
