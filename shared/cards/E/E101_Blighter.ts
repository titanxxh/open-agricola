import { defineOccupationCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { CardImpl } from '../registry'

const CARD_ID = 'E101_Blighter'
const SCORE_MAP = [0, 1, 1, 2, 2, 3, 3, 4, 4, 4, 5]

const isDoableListener: CardListenerRegistration = {
  id: 'E101-blighter-isdoable-occupation',
  cardIds: [CARD_ID],
  phases: ['isDoable' as ActionHookPhase],
  actions: ['occupation'],
  handler: (_context: CardListenerContext): ActionHookResult | void => {
    return { doable: false }
  },
}

const onPlayListener: CardListenerRegistration = {
  id: 'E101-blighter-after-play',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['occupation'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.choice !== CARD_ID) return
    const remainingTurns = Math.max(0, 14 - context.state.round)
    const bonusVp = SCORE_MAP[remainingTurns] ?? 5
    if (bonusVp <= 0) return
    return {
      flow: {
        type: 'seq',
        children: Array.from({ length: bonusVp }, () => ({
          type: 'leaf' as const,
          actionId: 'bonus-vp',
          sourceCard: CARD_ID,
        })),
      },
      sourceCard: CARD_ID,
    }
  },
}

const cardImpl = {
  listeners: [isDoableListener, onPlayListener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const E101_Blighter = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: "Blighter",
    deck: "E",
    number: 101,
    category: "BONUS_POINTS_-_GET",
    desc: ['When you play this card, you get 1 bonus <SCORE> for each complete stage left to play. You may not play any more occupations.'],
    cost: {},
    players: "1+",
    extraVp: true,
  },
  presentation: { counters: ['bonusVp'] },
  impl: cardImpl,
})

export const E101_Blighter_impl = E101_Blighter.impl
