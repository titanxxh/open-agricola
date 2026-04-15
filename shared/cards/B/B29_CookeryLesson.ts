import { MinorImprovement } from '../types'
import { registerCardListener } from '../card-listeners'
import { registerCardEffect } from '../card-effects'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { readCardExtraData, writeCardExtraData } from '../helpers/card-state'
import { readActionSnapshotToken } from '../helpers/action-snapshot'
import { getRoundPlacementOrder } from '../helpers/round-placement'

const CARD_ID = 'B29_CookeryLesson'
const USED_ACTION_TOKEN_KEY = 'usedActionToken'

/**
 * B29 Cookery Lesson:
 * Each time you use a Lessons action space and a cooking improvement on the same turn,
 * you get 1 bonus VP.
 *
 * BGA:
 * - onBuy: if both lessons used AND cooked this turn → 1 VP (mark as used)
 * - afterExchange: if lessons used this turn → 1 VP
 * - afterPlaceFarmer (on Lessons space): if cooked this turn → 1 VP
 * - uses usableThisTurn / setUsedOnTurnId to fire at most once per action.
 *
 * Tracking: We use extraData to track if lessons was used and if cooking was used
 * this round, keyed by action token to ensure once-per-action triggering.
 */

const LESSONS_SPACE_IDS = new Set(['lessons', 'lessons-4'])

const hasUsedLessonsThisRound = (context: CardListenerContext): boolean => {
  const placements = getRoundPlacementOrder(context.player)
  return placements.some((spaceId) => LESSONS_SPACE_IDS.has(spaceId))
}

const hasCookedThisRound = (context: CardListenerContext): boolean => {
  // Check if there's a cooking exchange recorded this round
  const token = readCardExtraData<boolean>(context.player, CARD_ID, 'cookedThisRound')
  return !!token
}

const markCookedThisRound = (context: CardListenerContext): void => {
  writeCardExtraData(context.player, CARD_ID, 'cookedThisRound', true)
}

const awardBonusVp = (context: CardListenerContext): ActionHookResult | void => {
  const actionToken = readActionSnapshotToken(context.player)
  if (actionToken === undefined) return
  if (readCardExtraData<number>(context.player, CARD_ID, USED_ACTION_TOKEN_KEY) === actionToken) return
  writeCardExtraData(context.player, CARD_ID, USED_ACTION_TOKEN_KEY, actionToken)
  return {
    flow: {
      type: 'leaf',
      actionId: 'bonus-vp',
      sourceCard: CARD_ID,
    },
    sourceCard: CARD_ID,
  }
}

// After anytime-exchange: mark cooking happened, check if lessons used → VP
const afterExchangeListener: CardListenerRegistration = {
  id: 'B29-cookery-lesson-after-exchange',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['anytime-exchange'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.player.minorPlayed.includes(CARD_ID)) return
    markCookedThisRound(context)
    if (hasUsedLessonsThisRound(context)) {
      return awardBonusVp(context)
    }
  },
}

// After place-farmer on Lessons: check if cooked this round → VP
const afterPlaceFarmerListener: CardListenerRegistration = {
  id: 'B29-cookery-lesson-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.player.minorPlayed.includes(CARD_ID)) return
    if (!context.space || !LESSONS_SPACE_IDS.has(context.space.id)) return
    if (hasCookedThisRound(context)) {
      return awardBonusVp(context)
    }
  },
}

registerCardListener(afterExchangeListener)
registerCardListener(afterPlaceFarmerListener)

// Reset cooking flag at the start of each round
registerCardEffect({
  id: CARD_ID,
  onRoundStart: (_state, player) => {
    if (!player.minorPlayed.includes(CARD_ID)) return
    writeCardExtraData(player, CARD_ID, 'cookedThisRound', false)
    writeCardExtraData(player, CARD_ID, USED_ACTION_TOKEN_KEY, -1)
  },
  onBuy: (_state, player) => {
    // onBuy: if both conditions already met, award VP immediately
    if (hasUsedLessonsThisRound({ player } as CardListenerContext) &&
        hasCookedThisRound({ player } as CardListenerContext)) {
      const actionToken = readActionSnapshotToken(player)
      if (actionToken !== undefined) {
        writeCardExtraData(player, CARD_ID, USED_ACTION_TOKEN_KEY, actionToken)
      }
      return {
        type: 'leaf',
        actionId: 'bonus-vp',
        sourceCard: CARD_ID,
      }
    }
  },
})

export const B29_CookeryLesson = new MinorImprovement({
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
})
