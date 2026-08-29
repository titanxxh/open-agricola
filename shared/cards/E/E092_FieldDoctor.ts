import { defineOccupationCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { isCardFlagged } from '../helpers/card-state'
import { familySize, hasInactiveWorkerInSupply } from '../../domain/player'
import { positionKey } from '../../domain/farm'
import { getExtraRoomCapacity } from '../card-effects'
import type { CardImpl } from '../registry'

const CARD_ID = 'E092_FieldDoctor'
const REQUIRED_FIELD_KEYS = ['0-0', '0-1', '1-1', '2-1'] as const
const WISH_CHILDREN_SPACE_IDS = new Set([
  'wish-children',
  'urgent-wish-children',
  'modest-wish-children-56',
])

const checkRoomsSurroundedByFields = (context: CardListenerContext): boolean => {
  const player = context.player
  if (player.rooms !== 2) return false
  const fieldKeys = new Set(player.fields.map(positionKey))
  return REQUIRED_FIELD_KEYS.every((key) => fieldKeys.has(key))
}

const canUseFieldDoctor = (context: CardListenerContext): boolean => {
  if (!WISH_CHILDREN_SPACE_IDS.has(context.space.id)) return false
  if (context.actionContext?.skipRoomCheck === true) return false
  if (context.actionContext?.checkedReplaceAction === true) return false
  if (isCardFlagged(context.player, CARD_ID)) return false
  if (!checkRoomsSurroundedByFields(context)) return false
  if (!hasInactiveWorkerInSupply(context.player)) return false
  return context.player.rooms + getExtraRoomCapacity(context.player) <= familySize(context.player)
}

const computeReplaceListener: CardListenerRegistration = {
  id: 'E92-field-doctor-replace-wish-children',
  cardIds: [CARD_ID],
  phases: ['computeReplace' as ActionHookPhase],
  actions: ['family-growth'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!canUseFieldDoctor(context)) return
    return {
      decline: true,
      alternativeFlow: {
        type: 'seq',
        children: [
          {
            type: 'leaf',
            actionId: 'family-growth',
            sourceCard: CARD_ID,
            actionContext: { skipRoomCheck: true },
          },
          { type: 'leaf', actionId: 'special-effect', sourceCard: CARD_ID, params: { kind: 'set-flag', flag: true } },
        ],
      },
      sourceCard: CARD_ID,
    }
  },
}

const isDoableListener: CardListenerRegistration = {
  id: 'E92-field-doctor-isdoable-wish-children',
  cardIds: [CARD_ID],
  phases: ['isDoable' as ActionHookPhase],
  actions: ['family-growth'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!canUseFieldDoctor(context)) return
    return { doable: true }
  },
}

const cardImpl = {
  listeners: [computeReplaceListener, isDoableListener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const E092_FieldDoctor = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Field Doctor',
    deck: 'E',
    number: 92,
    desc: ['Once this game, if you live in a house with exactly 2 rooms surrounded by 4 <FIELD> tiles, you can use any __Wish for Children__ action space even without room.'],
    cost: {},
    players: '1+',
    category: 'ACTION_-_FAMILY_GROWTH',
  },
  impl: cardImpl,
})

export const E092_FieldDoctor_impl = E092_FieldDoctor.impl
