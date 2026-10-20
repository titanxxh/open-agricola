import { defineMinorCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { writeCardExtraData } from '../helpers/card-state'
import { isLessonsSpaceId } from '../helpers/lessons-spaces'
import { getPlayerCookeryCards } from '../helpers/cookery'
import { hasExchangeGained } from '../helpers/event-provenance'
import { isAnimalKey } from '../../domain/animal-holder-state'
import type { ActionFlow, PlayerState } from '../../contract/types'
import type { CardImpl } from '../registry'
import { isUsedThisTurn, markUsedThisTurnLeaf, readTurnScopeToken, USED_THIS_TURN_KEY } from '../helpers/turn-token'
import { bonusVpLeaf } from '../helpers/pay-gain-node'

const CARD_ID = 'B029_CookeryLesson'
const COOKED_TURN_KEY = 'cookedTurnToken'
const LESSONS_TURN_KEY = 'lessonsTurnToken'

/**
 * B29 Cookery Lesson: using a Lessons action space and a cooking improvement
 * in the same Turn awards 1 bonus VP. Each listener records its half of the
 * pair for the current Turn Scope; whichever half completes the pair awards
 * the point, and the card's own once-per-Turn record keeps it to one point.
 */

const awardBonusVp = (player: PlayerState): ActionFlow | undefined => {
  if (isUsedThisTurn(player, CARD_ID)) return
  const mark = markUsedThisTurnLeaf(player, CARD_ID)
  return mark && { type: 'seq', children: [mark, bonusVpLeaf(CARD_ID)] }
}

const usedCookery = (context: CardListenerContext): boolean => {
  const cookeryIds = new Set(getPlayerCookeryCards(context.player).map((card) => card.id))
  return hasExchangeGained(context.actionEvents, 'food', (event) =>
    Object.entries(event.paid).some(([resource, amount]) =>
      (amount ?? 0) > 0 && (resource === 'vegetable' || isAnimalKey(resource))) &&
    !!event.exchangeSource &&
    cookeryIds.has(event.exchangeSource))
}

const afterExchangeListener: CardListenerRegistration = {
  id: 'B29-cookery-lesson-after-exchange',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['exchange'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!usedCookery(context)) return
    const stamp = markUsedThisTurnLeaf(context.player, CARD_ID, COOKED_TURN_KEY)
    if (!stamp) return
    const award = isUsedThisTurn(context.player, CARD_ID, LESSONS_TURN_KEY)
      ? awardBonusVp(context.player)
      : undefined
    return {
      flow: award ? { type: 'seq', children: [stamp, award] } : stamp,
      sourceCard: CARD_ID,
    }
  },
}

const afterPlaceFarmerListener: CardListenerRegistration = {
  id: 'B29-cookery-lesson-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after'],
  actionSpaces: 'all',
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!isLessonsSpaceId(context.space?.id)) return
    const stamp = markUsedThisTurnLeaf(context.player, CARD_ID, LESSONS_TURN_KEY)
    if (!stamp) return
    const award = isUsedThisTurn(context.player, CARD_ID, COOKED_TURN_KEY)
      ? awardBonusVp(context.player)
      : undefined
    return {
      flow: award ? { type: 'seq', children: [stamp, award] } : stamp,
      sourceCard: CARD_ID,
    }
  },
}

const cardImpl = {
  listeners: [afterExchangeListener, afterPlaceFarmerListener],
  effect: {
  id: CARD_ID,
  onBuy: (_state, player) => {
    // Bought in the same Turn after both halves were recorded.
    const token = readTurnScopeToken(player)
    if (token === undefined || isUsedThisTurn(player, CARD_ID)) return
    if (!isUsedThisTurn(player, CARD_ID, COOKED_TURN_KEY) || !isUsedThisTurn(player, CARD_ID, LESSONS_TURN_KEY)) return
    writeCardExtraData(player, CARD_ID, USED_THIS_TURN_KEY, token)
    return bonusVpLeaf(CARD_ID)
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const B029_CookeryLesson = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Cookery Lesson',
    deck: 'B',
    number: 29,
    category: 'POINTS_PROVIDER',
    desc: [
        'Each time you use a __Lessons__ action space and a cooking improvement on the same turn, you get 1 bonus <SCORE>.',
      ],
    cost: { food: 2 },
    extraVp: true,
    evenMoreSet: true,
    implemented: true,
  },
  presentation: { counters: ['bonusVp'] },
  impl: cardImpl,
})

export const B029_CookeryLesson_impl = B029_CookeryLesson.impl
