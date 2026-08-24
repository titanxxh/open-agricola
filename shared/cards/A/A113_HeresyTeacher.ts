import { defineOccupationCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { fieldHasCrop, fieldFindStackOfKind } from '../../domain/field'
import { parsePositionKey, positionKey } from '../../domain/farm'
import { isLessonsSpaceId } from '../helpers/lessons-spaces'
import type { ActionDefinition } from '../../contract/types'
import { registerAdHocAction } from '../../actions/helpers/ad-hoc-action-registry'
import type { CardImpl } from '../registry'

const CARD_ID = 'A113_HeresyTeacher'
const INSERT_ACTION_ID = 'card_A113_HeresyTeacher_insertVegetable'

const insertVegetableAction: ActionDefinition = {
  id: INSERT_ACTION_ID,
  nameKey: 'actions.special-effect.name',
  descriptionKey: 'actions.special-effect.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: (_state, player) => player.occupationPlayed.includes(CARD_ID),
  execute: ({ player, params }) => {
    const positions = (params as { positions?: unknown } | undefined)?.positions
    if (!Array.isArray(positions) || positions.some((value) => typeof value !== 'string')) {
      return { type: 'fail', errorKey: 'log.actionFail' }
    }
    for (const key of positions) {
      const position = parsePositionKey(key)
      const field = position && player.fields.find(
        (candidate) => candidate.row === position.row && candidate.col === position.col,
      )
      if (!field) continue
      const grain = fieldFindStackOfKind(field, 'grain')
      if (grain && grain.remaining >= 3 && !fieldHasCrop(field, 'vegetable')) {
        field.stacks.unshift({ kind: 'vegetable', remaining: 1 })
      }
    }
    return { type: 'ok' }
  },
}

registerAdHocAction(insertVegetableAction)

const listener: CardListenerRegistration = {
  id: 'A113-heresy-teacher-after-lessons',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.space || !isLessonsSpaceId(context.space.id)) return
    const positions = context.player.fields.flatMap((field) => {
      const grain = fieldFindStackOfKind(field, 'grain')
      const hasVeg = fieldHasCrop(field, 'vegetable')
      return grain && grain.remaining >= 3 && !hasVeg ? [positionKey(field)] : []
    })
    if (positions.length === 0) return
    return {
      flow: {
        type: 'leaf',
        actionId: INSERT_ACTION_ID,
        sourceCard: CARD_ID,
        params: { positions },
      },
      sourceCard: CARD_ID,
    }
  },
}

const cardImpl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const A113_HeresyTeacher = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Heresy Teacher',
    deck: 'A',
    number: 113,
    category: 'CROP_PROVIDER',
    desc: [
        'Each time you use a __Lessons__ action space, you get 1 <VEGETABLE> in each of your <FIELD> with at least 3 <GRAIN> and no <VEGETABLE>. Place the <VEGETABLE> below the <GRAIN>.',
      ],
    cost: {},
    players: '1+',
  },
  impl: cardImpl,
})

export const A113_HeresyTeacher_impl = A113_HeresyTeacher.impl
