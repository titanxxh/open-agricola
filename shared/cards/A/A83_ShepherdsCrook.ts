import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { A83_ShepherdsCrook } from '../../cards-display/A/A83_ShepherdsCrook'

const CARD_ID = A83_ShepherdsCrook.id

const MIN_PASTURE_SIZE = 4

const listener: CardListenerRegistration = {
  id: 'A83-shepherds-crook-after-fencing',
  cardIds: [CARD_ID],
  phases: ['immediatelyAfter' as ActionHookPhase],
  actions: ['fence'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const newPastures =
      (context.result?.type === 'ok'
        ? (context.result.extraData?.newPastures as { tiles?: unknown[] }[] | undefined)
        : undefined) ?? []
    const newBig = newPastures.filter(
      (pasture) => (pasture.tiles?.length ?? 0) >= MIN_PASTURE_SIZE,
    ).length
    if (newBig <= 0) return
    const sheepGain = newBig * 2
    return { flow: gainLeaf(CARD_ID, { sheep: sheepGain }), sourceCard: CARD_ID }
  },
}

export const A83_ShepherdsCrook_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
