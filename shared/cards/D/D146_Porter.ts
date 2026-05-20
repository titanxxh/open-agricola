import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import { sumResourceMovedToPlayer } from '../helpers/event-provenance'
import type { Resource } from '../../contract/types'
import type { CardImpl } from '../registry'
import { D146_Porter } from '../../cards-display/D/D146_Porter'

const CARD_ID = D146_Porter.id

const BUILDING_RESOURCES: (keyof Resource)[] = ['wood', 'clay', 'reed', 'stone']

const listener: CardListenerRegistration = {
  id: 'D146-porter-after-collect',
  cardIds: [CARD_ID],
  actions: ['collect'],
  phases: ['after' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const events = context.actionEvents ?? context.transactionEvents
    const gain: Partial<Resource> = {}
    let triggered = false
    for (const res of BUILDING_RESOURCES) {
      const amount = sumResourceMovedToPlayer(events, res, context.player.id, (event) =>
        event.from.kind === 'actionSpace',
      )
      if (amount >= 4) {
        gain[res] = (gain[res] ?? 0) + 1
        triggered = true
      }
    }
    if (!triggered) return
    gain.food = (gain.food ?? 0) + 1
    return { flow: gainLeaf(CARD_ID, gain), sourceCard: CARD_ID }
  },
}

export const D146_Porter_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
