import { getRegisteredMinorImprovement, getRegisteredOccupation } from '../../cards-display/types'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { CardImpl } from '../registry'
import { B100_Clutterer } from '../../cards-display/B/B100_Clutterer'

const CARD_ID = B100_Clutterer.id

const hasAccumulationText = (desc: string[]): boolean =>
  desc.some((line) => line.toLowerCase().includes('accumulation'))

const getPlayedCardDesc = (choice: string | undefined): string[] | undefined => {
  if (!choice) return undefined
  if (choice.startsWith('minor:')) {
    const card = getRegisteredMinorImprovement(choice.replace('minor:', ''))
    return card?.desc
  }
  if (choice.startsWith('major:')) {
    // Major improvements don't have "accumulation" in their text
    return undefined
  }
  // Occupation: choice is raw card ID
  const card = getRegisteredOccupation(choice)
  return card?.desc
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
  actions: ['play-occupation'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const desc = getPlayedCardDesc(context.choice)
    if (!desc || !hasAccumulationText(desc)) return
    return {
      flow: { type: 'leaf', actionId: 'bonus-vp', params: { score: 1 }, sourceCard: CARD_ID },
      sourceCard: CARD_ID,
    }
  },
}

export const B100_Clutterer_impl = {
  listeners: [afterImprovementListener, afterOccupationListener],
  reaches: [] as readonly string[],
} satisfies CardImpl
