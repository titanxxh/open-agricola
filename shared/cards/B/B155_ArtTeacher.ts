import { Occupation } from '../types'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'B155_ArtTeacher'

/**
 * B155 Art Teacher (Occupation, 4+ players).
 *
 * BGA (B155_ArtTeacher.php):
 *   - onBuy → gain 1 wood + 1 reed.
 *   - onPlayerComputeCostsOccupation → add alternative trades where 1-N food
 *     of the occupation cost can be paid as FOOD_TRAVEL (food on the
 *     Traveling Players accumulation space).
 *
 * Implementation strategy (no core changes):
 *   - play-occupation after-listener triggered when this card is played →
 *     gain 1 wood + 1 reed (onBuy analogue).
 *   - lessons/lessons-4 before-listener: if the traveling-players
 *     accumulation space has food, drain up to the occupation-cost amount
 *     from the space into the player's food supply. This effectively lets
 *     the player pay the occupation cost "from Traveling Players". We drain
 *     directly on state because the BGA effect consumes the TP food; engine
 *     payments then deduct from the player's (now-boosted) food pool, which
 *     is equivalent. Note: takeAction's before-phase dispatches with
 *     actionId = spaceId, so the listener matches on 'lessons' / 'lessons-4'.
 *
 * Limitations:
 *   - We cap the drain at the occupation cost to avoid free food laundering.
 *   - We cannot reject the lessons action if TP food wouldn't cover the cost
 *     alone; the player just has to make up the remainder from their own food.
 */

const LESSONS_SPACE_IDS = new Set(['lessons', 'lessons-4'])

const getLessonsFoodCost = (
  occupationsPlayed: number,
  spaceId: string,
  hasPaperMaker: boolean,
): number => {
  const base = spaceId === 'lessons-4'
    ? occupationsPlayed <= 1 ? 1 : 2
    : occupationsPlayed === 0 ? 0 : 1
  const discount = hasPaperMaker ? 1 : 0
  return Math.max(0, base - discount)
}

const onBuyListener: CardListenerRegistration = {
  id: 'B155-art-teacher-onbuy',
  cardIds: [CARD_ID],
  actions: ['play-occupation'],
  phases: ['after' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.choice !== CARD_ID) return
    return { flow: gainLeaf(CARD_ID, { wood: 1, reed: 1 }), sourceCard: CARD_ID }
  },
}

const beforeLessonsListener: CardListenerRegistration = {
  id: 'B155-art-teacher-before-lessons',
  cardIds: [CARD_ID],
  actions: ['lessons', 'lessons-4'],
  phases: ['before' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const spaceId = context.space?.id
    if (!spaceId || !LESSONS_SPACE_IDS.has(spaceId)) return

    const travelingPlayers = context.state.actionSpaces.find(
      (s) => s.id === 'traveling-players',
    )
    const tpFood = travelingPlayers?.resources?.food ?? 0
    if (tpFood <= 0 || !travelingPlayers) return

    const hasPaperMaker = context.player.occupationPlayed.includes('B109_PaperMaker')
    const foodCost = getLessonsFoodCost(
      context.player.occupationPlayed.length,
      spaceId,
      hasPaperMaker,
    )
    if (foodCost <= 0) return

    const transferred = Math.min(tpFood, foodCost)
    if (transferred <= 0) return

    // Drain TP space, credit player with equivalent food as a gain flow so
    // the move is logged and visible to the UI.
    travelingPlayers.resources.food = tpFood - transferred

    return {
      flow: gainLeaf(CARD_ID, { food: transferred }),
      sourceCard: CARD_ID,
    }
  },
}

export const B155_ArtTeacher = new Occupation({
  id: CARD_ID,
  name: 'Art Teacher',
  deck: 'B',
  number: 155,
  category: 'GOODS_PROVIDER',
  desc: [
    'When you play this card, you immediately get 1 <WOOD> and 1 <REED>. Each time you pay an occupation cost, you can use <FOOD> from the __Traveling Players__ accumulation space.',
  ],
  cost: {},
  players: '4+',
  evenMoreSet: true,
})

export const B155_ArtTeacher_impl = {
  listeners: [onBuyListener, beforeLessonsListener],
  reaches: [] as readonly string[],
} satisfies CardImpl
