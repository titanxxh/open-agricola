import { defineOccupationCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { CardImpl } from '../registry'
import { getRegisteredMinorImprovement, getRegisteredOccupation } from '../registry-display'

const CARD_ID = 'B100_Clutterer'
const hasAccumulationText = (desc: string[]): boolean =>
  desc.some((line) => line.toLowerCase().includes('accumulation'))

const getPlayedCardDesc = (choice: string | undefined): string[] | undefined => {
  if (!choice) return undefined
  const cardId = choice.replace(/^major:/, '').replace(/^minor:/, '')
  return getRegisteredMinorImprovement(cardId)?.desc
    ?? getRegisteredOccupation(cardId)?.desc
}

const afterImprovementListener: CardListenerRegistration = {
  id: 'B100-clutterer-after-improvement',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['improvement'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const desc = getPlayedCardDesc(context.choice)
    if (!desc || !hasAccumulationText(desc)) return
    return {
      flow: { type: 'leaf', actionId: 'bonus-vp', params: { score: 1 }, sourceCard: CARD_ID },
      sourceCard: CARD_ID,
    }
  },
}

const afterOccupationListener: CardListenerRegistration = {
  id: 'B100-clutterer-after-occupation',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['occupation'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const desc = getPlayedCardDesc(context.choice)
    if (!desc || !hasAccumulationText(desc)) return
    return {
      flow: { type: 'leaf', actionId: 'bonus-vp', params: { score: 1 }, sourceCard: CARD_ID },
      sourceCard: CARD_ID,
    }
  },
}

const cardImpl = {
  listeners: [afterImprovementListener, afterOccupationListener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const B100_Clutterer = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: "Clutterer",
    deck: "B",
    number: 100,
    category: "POINTS_PROVIDER",
    desc: ["During scoring, you get 1 bonus <SCORE> for each card played after this one that has \"accumulation space(s)\" in its text."],
    cost: {},
    players: "1+",
    extraVp: true,
  },
  presentation: { counters: ['bonusVp'] },
  impl: cardImpl,
})

export const B100_Clutterer_impl = B100_Clutterer.impl
