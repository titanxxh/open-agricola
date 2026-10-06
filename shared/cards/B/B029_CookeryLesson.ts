import { defineMinorCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { readCardExtraData, writeCardExtraData } from '../helpers/card-state'
import { readActionSnapshotToken } from '../helpers/action-snapshot'
import { isLessonsSpaceId } from '../helpers/lessons-spaces'
import { getPlayerCookeryCards } from '../helpers/cookery'
import { hasExchangeGained } from '../helpers/event-provenance'
import { isAnimalKey } from '../../domain/animal-holder-state'
import type { ActionFlow, PlayerState } from '../../contract/types'
import type { CardImpl } from '../registry'

const CARD_ID = 'B029_CookeryLesson'
const USED_ACTION_TOKEN_KEY = 'usedActionToken'

const COOKED_TOKEN_KEY = 'cookedActionToken'

const LESSONS_TOKEN_KEY = 'lessonsActionToken'

/**
 * B29 Cookery Lesson:
 * Each time you use a Lessons action space and a cooking improvement on the
 * SAME TURN (one takeAction), you get 1 bonus VP.
 *
 * Rule: 'on the same turn' = within one takeAction (one farmer placement and
 * its triggered effects), not 'within the same round'. Tracking is per-action
 * via the action snapshot token.
 *
 * - cookedActionToken: written on after-exchange (cooking)
 * - lessonsActionToken: written on after-placeFarmer (Lessons spaces)
 *
 * VP awarded when both tokens equal the current actionToken in the same
 * triggering listener call. USED_ACTION_TOKEN_KEY guards against double-award
 * within the same action (the two listeners can both detect the match).
 *
 * onRoundStart resets all three tokens defensively (action tokens normally
 * monotonically increase across the game so this is mostly cosmetic).
 */

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

const currentTokenLeaf = (player: PlayerState, storedKey: string): ActionFlow | undefined => {
  const cur = currentActionToken(player)
  if (cur === undefined) return
  return {
    type: 'leaf',
    actionId: 'special-effect',
    sourceCard: CARD_ID,
    params: { kind: 'set-extra-data', key: storedKey, value: cur },
  }
}

const awardBonusVp = (player: PlayerState): ActionFlow | undefined => {
  const actionToken = currentActionToken(player)
  if (actionToken === undefined) return
  if (readCardExtraData<number>(player, CARD_ID, USED_ACTION_TOKEN_KEY) === actionToken) return
  return {
    type: 'seq',
    children: [
      {
        type: 'leaf',
        actionId: 'special-effect',
        sourceCard: CARD_ID,
        params: { kind: 'set-extra-data', key: USED_ACTION_TOKEN_KEY, value: actionToken },
      },
      {
        type: 'leaf',
        actionId: 'bonus-vp',
        sourceCard: CARD_ID,
      },
    ],
  }
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
    const stamp = currentTokenLeaf(context.player, COOKED_TOKEN_KEY)
    if (!stamp) return
    const award = tokenMatchesCurrent(context.player, LESSONS_TOKEN_KEY)
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
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!isLessonsSpaceId(context.space?.id)) return
    const stamp = currentTokenLeaf(context.player, LESSONS_TOKEN_KEY)
    if (!stamp) return
    const award = tokenMatchesCurrent(context.player, COOKED_TOKEN_KEY)
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
