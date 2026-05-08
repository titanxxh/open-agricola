import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { readCardExtraData, writeCardExtraData } from '../helpers/card-state'
import { readActionSnapshotToken } from '../helpers/action-snapshot'
import type { PlayerState } from '../../contract/types'
import type { CardImpl } from '../registry'
import { B29_CookeryLesson } from '../../cards-display/B/B29_CookeryLesson'
export { B29_CookeryLesson }

const CARD_ID = B29_CookeryLesson.id

const USED_ACTION_TOKEN_KEY = 'usedActionToken'

const COOKED_TOKEN_KEY = 'cookedActionToken'

const LESSONS_TOKEN_KEY = 'lessonsActionToken'

/**
 * B29 Cookery Lesson:
 * Each time you use a Lessons action space and a cooking improvement on the
 * SAME TURN (one takeAction), you get 1 bonus VP.
 *
 * BGA: 'on the same turn' = within one takeAction (one farmer placement and
 * its triggered effects), not 'within the same round'. Tracking is per-action
 * via the action snapshot token.
 *
 * - cookedActionToken: written on after-exchange (cooking)
 * - lessonsActionToken: written on after-placeFarmer (lessons / lessons-4)
 *
 * VP awarded when both tokens equal the current actionToken in the same
 * triggering listener call. USED_ACTION_TOKEN_KEY guards against double-award
 * within the same action (the two listeners can both detect the match).
 *
 * onRoundStart resets all three tokens defensively (action tokens normally
 * monotonically increase across the game so this is mostly cosmetic).
 */

const LESSONS_SPACE_IDS = new Set(['lessons', 'lessons-4'])

const currentActionToken = (player: PlayerState) =>
  readActionSnapshotToken(player)

const tokenMatchesCurrent = (
  player: PlayerState,
  storedKey: string,
): boolean => {
  const cur = currentActionToken(player)
  if (cur === undefined) return false
  const stored = readCardExtraData<number>(player, CARD_ID, storedKey)
  return stored === cur
}

const writeCurrentToken = (player: PlayerState, storedKey: string): void => {
  const cur = currentActionToken(player)
  if (cur === undefined) return
  writeCardExtraData(player, CARD_ID, storedKey, cur)
}

const awardBonusVp = (context: CardListenerContext): ActionHookResult | void => {
  const actionToken = currentActionToken(context.player)
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

const afterExchangeListener: CardListenerRegistration = {
  id: 'B29-cookery-lesson-after-exchange',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['exchange'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    writeCurrentToken(context.player, COOKED_TOKEN_KEY)
    if (tokenMatchesCurrent(context.player, LESSONS_TOKEN_KEY)) {
      return awardBonusVp(context)
    }
  },
}

const afterPlaceFarmerListener: CardListenerRegistration = {
  id: 'B29-cookery-lesson-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.space || !LESSONS_SPACE_IDS.has(context.space.id)) return
    writeCurrentToken(context.player, LESSONS_TOKEN_KEY)
    if (tokenMatchesCurrent(context.player, COOKED_TOKEN_KEY)) {
      return awardBonusVp(context)
    }
  },
}

export const B29_CookeryLesson_impl = {
  listeners: [afterExchangeListener, afterPlaceFarmerListener],
  effect: {
  id: CARD_ID,
  onRoundStart: (_state, player) => {
    writeCardExtraData(player, CARD_ID, COOKED_TOKEN_KEY, -1)
    writeCardExtraData(player, CARD_ID, LESSONS_TOKEN_KEY, -1)
    writeCardExtraData(player, CARD_ID, USED_ACTION_TOKEN_KEY, -1)
  },
  onBuy: (_state, player) => {
    // onBuy fires within an exchange/lessons triggering action. If both tokens
    // already match the current action, award VP now.
    const cur = readActionSnapshotToken(player)
    if (cur === undefined) return
    const cookedMatches = readCardExtraData<number>(player, CARD_ID, COOKED_TOKEN_KEY) === cur
    const lessonsMatches = readCardExtraData<number>(player, CARD_ID, LESSONS_TOKEN_KEY) === cur
    if (!cookedMatches || !lessonsMatches) return
    if (readCardExtraData<number>(player, CARD_ID, USED_ACTION_TOKEN_KEY) === cur) return
    writeCardExtraData(player, CARD_ID, USED_ACTION_TOKEN_KEY, cur)
    return {
      type: 'leaf',
      actionId: 'bonus-vp',
      sourceCard: CARD_ID,
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
