import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { Resource } from '../../contract/types'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'A126_MasterWorkman'

const RESOURCE_MAP: (keyof Resource)[] = ['wood', 'clay', 'reed', 'stone']

const getRoundResource = (context: CardListenerContext): keyof Resource | undefined => {
  const spaceId = context.space?.id
  if (!spaceId) return
  const index = context.state.roundActionOrder.indexOf(spaceId)
  if (index >= 0 && index <= 3) return RESOURCE_MAP[index]
}

const masterWorkmanBeforeListener: CardListenerRegistration = {
  id: 'A126-master-workman-before',
  cardIds: [CARD_ID],
  phases: ['before' as ActionHookPhase],
  dispatchMode: 'select',
  mandatory: true,
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.sourceCard === CARD_ID) return
    const resource = getRoundResource(context)
    if (!resource) return
    return { flow: gainLeaf(CARD_ID, { [resource]: 1 }), sourceCard: CARD_ID }
  },
}

const masterWorkmanIsDoableListener: CardListenerRegistration = {
  id: 'A126-master-workman-isdoable',
  cardIds: [CARD_ID],
  phases: ['isDoable' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.doable) return
    if (context.actionContext?.skipBeforeTriggers === true) return
    if (context.sourceCard === CARD_ID) return
    const resource = getRoundResource(context)
    if (!resource) return
    return { doable: true }
  },
}

export const A126_MasterWorkman_impl = {
  listeners: [masterWorkmanBeforeListener, masterWorkmanIsDoableListener],
  reaches: [] as readonly string[],
} satisfies CardImpl
