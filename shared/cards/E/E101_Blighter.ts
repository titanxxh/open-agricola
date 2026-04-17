import { Occupation } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'

const CARD_ID = 'E101_Blighter'
const SCORE_MAP = [0, 1, 1, 2, 2, 3, 3, 4, 4, 4, 5]

const isDoableListener: CardListenerRegistration = {
  id: 'E101-blighter-isdoable-occupation',
  cardIds: [CARD_ID],
  phases: ['isDoable' as ActionHookPhase],
  actions: ['play-occupation'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.player.occupationPlayed.includes(CARD_ID)) return
    return { doable: false }
  },
}

const onPlayListener: CardListenerRegistration = {
  id: 'E101-blighter-after-play',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['play-occupation'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.choice !== CARD_ID) return
    if (!context.player.occupationPlayed.includes(CARD_ID)) return
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
      logKey: 'log.cardEffectTrigger',
      logParams: { cardId: CARD_ID },
      sourceCard: CARD_ID,
    }
  },
}

registerCardListener(isDoableListener)
registerCardListener(onPlayListener)

export const E101_Blighter = new Occupation({
  id: CARD_ID,
  name: "Blighter",
  deck: "E",
  number: 101,
  category: "POINTS_PROVIDER",
  desc: ['When you play this card, you get 1 bonus <SCORE> for each complete stage left to play. You may not play any more occupations.'],
  cost: {},
  players: "1+",
})
