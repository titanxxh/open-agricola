import { Occupation } from '../types'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import { getMinorImprovementCard } from '../catalog'
import { getMajorCard } from '../major'
import type { CardImpl } from '../registry'

const CARD_ID = 'C137_CharcoalBurner'

/**
 * C137 Charcoal Burner (Occupation, C, 137)
 * Each time any player plays/builds an improvement that has bake capability,
 * card owner gets 1 wood + 1 food.
 *
 * BGA: onPlayerAfterBuildImprovement — checks if the built improvement
 * has baking exchanges (isBaking flag).
 *
 * scope 'any' — fires when any player (including owner) builds a baking improvement.
 * Players 3+.
 */

const hasBakeCapability = (cardId: string): boolean => {
  if (cardId.startsWith('Major_')) return getMajorCard(cardId)?.isBaking ?? false
  return getMinorImprovementCard(cardId)?.isBaking ?? false
}

const getBuiltCardId = (choice: string | undefined): string | undefined => {
  if (!choice) return undefined
  return choice.replace(/^major:/, '').replace(/^minor:/, '')
}

const listener: CardListenerRegistration = {
  id: 'C137-charcoal-burner-any-bake-improvement',
  cardIds: [CARD_ID],
  actions: ['improvement-any', 'minor-improvement'],
  phases: ['after' as ActionHookPhase],
  scope: 'any',
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const builtCardId = getBuiltCardId(context.choice)
    if (!builtCardId) return
    if (!hasBakeCapability(builtCardId)) return
    return { flow: gainLeaf(CARD_ID, { wood: 1, food: 1 }), sourceCard: CARD_ID }
  },
}

export const C137_CharcoalBurner = new Occupation({
  id: CARD_ID,
  name: 'Charcoal Burner',
  deck: 'C',
  number: 137,
  category: 'GOODS_PROVIDER',
  desc: [
    'Each time any player (including you) plays or builds a <BAKE>-improvement, you get 1 <WOOD> and 1 <FOOD>.',
  ],
  cost: {},
  players: '3+',
  newSet: true,
})

export const C137_CharcoalBurner_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
