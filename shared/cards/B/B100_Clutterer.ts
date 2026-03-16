import { Occupation } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { incCounter } from '../__stubs__/helpers'
import { en } from '../../i18n/en'

const CARD_ID = 'B100_Clutterer'

const hasAccumulationText = (cardId: string, actionId: string) => {
  const description =
    actionId === 'play-occupation'
      ? en.occupations?.[cardId as keyof typeof en.occupations]?.description
      : en.minorImprovements?.[cardId as keyof typeof en.minorImprovements]?.description
  return /accumulation space/i.test(description ?? '')
}

const getPlayedCardId = (context: CardListenerContext) => {
  if (!context.choice) return null
  if (context.actionId === 'play-occupation') {
    return context.choice
  }
  if (context.actionId === 'minor-improvement') {
    return context.choice
  }
  if (context.choice.startsWith('minor:')) {
    return context.choice.replace('minor:', '')
  }
  return null
}

const listener: CardListenerRegistration = {
  id: 'B100-clutterer-after-card',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['play-occupation', 'improvement-any', 'minor-improvement'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.player.occupationPlayed.includes(CARD_ID)) return
    const playedCardId = getPlayedCardId(context)
    if (!playedCardId || playedCardId === CARD_ID) return
    if (!hasAccumulationText(playedCardId, context.actionId)) return
    incCounter(context.player, CARD_ID, 'bonusVp')
    incCounter(context.player, CARD_ID, 'triggerCount')
    return {
      logKey: 'log.cardEffectTrigger',
      logParams: { cardId: CARD_ID },
      sourceCard: CARD_ID,
    }
  },
}

registerCardListener(listener)

export const B100_Clutterer = new Occupation({
  id: CARD_ID,
  name: "Clutterer",
  deck: "B",
  number: 100,
  category: "POINTS_PROVIDER",
  desc: ["During scoring, you get 1 bonus <SCORE> for each card played after this one that has \"accumulation space(s)\" in its text."],
  cost: {},
  players: "1+",
})
