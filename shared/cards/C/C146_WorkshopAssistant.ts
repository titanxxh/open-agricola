import type {
  ActionChoiceOption,
  ActionDefinition,
  ActionFlow,
  PlayerState,
  Resource,
} from '../../contract/types'
import { registerAdHocAction } from '../../actions/helpers/ad-hoc-action-registry'
import { gainResources } from '../../actions/effects/gain'
import type { CardImpl } from '../registry'
import { C146_WorkshopAssistant } from '../../cards-display/C/C146_WorkshopAssistant'

const CARD_ID = C146_WorkshopAssistant.id

const CHOOSE_PAIRS_ACTION_ID = 'card_C146_WorkshopAssistant_choosePairs'

/**
 * C146 Workshop Assistant — On play, reclaim resource pairs equal to the
 * number of improvements you have built (capped at 6).
 *
 * BGA `C146_WorkshopAssistant::onBuy`:
 *   - n = min(6, countAllImprovements())
 *   - if n >= 6: auto-place all 6 pairs on the card
 *   - else: SPECIAL_EFFECT choosePairs args:[n] — emits an `argsChoosePairs`
 *     UI prompt letting the owner pick exactly n pairs from the 6 possible
 *     unique pairs. `actChoosePairs($chosenKeys, $n)` validates and creates
 *     them.
 *   - When another player renovates, the owner can move 1 placed pair to
 *     the supply.
 *
 * Sprint 7b1 simplification: instead of placing pairs on the card and later
 * draining them through opponent renovations, we directly grant the chosen
 * pairs as resources (single-shot gain). This loses the after-renovate
 * "drain" interaction but keeps the player-meaningful onBuy choice. See
 * `docs/card_progress.md` §刻意不同.
 */

const PAIRS = [
  ['WC', { wood: 1, clay: 1 }],
  ['WR', { wood: 1, reed: 1 }],
  ['WS', { wood: 1, stone: 1 }],
  ['CR', { clay: 1, reed: 1 }],
  ['CS', { clay: 1, stone: 1 }],
  ['RS', { reed: 1, stone: 1 }],
] as const

const PAIR_RESOURCES: Record<string, Partial<Resource>> = Object.fromEntries(
  PAIRS.map(([k, res]) => [k, res]),
)

const VALID_PAIR_KEYS = new Set<string>(PAIRS.map(([k]) => k))

const buildOptions = (): ActionChoiceOption[] =>
  PAIRS.map(([k]) => ({
    value: k,
    labelKey: `cards.${CARD_ID}.pair.${k}`,
    sourceCard: CARD_ID,
  }))

const countAllImprovements = (player: PlayerState) =>
  player.improvements.length + player.minorPlayed.length

const sumPairs = (selected: string[]): Partial<Resource> => {
  const totals: Partial<Resource> = {}
  for (const k of selected) {
    const res = PAIR_RESOURCES[k]
    if (!res) continue
    for (const [r, amt] of Object.entries(res)) {
      const key = r as keyof Resource
      totals[key] = (totals[key] ?? 0) + (amt ?? 0)
    }
  }
  return totals
}

const buildSelectionChoice = (needed: number) => ({
  type: 'request' as const,
  request: { kind: 'choice' as const, options: buildOptions() },
  promptKey: 'ui.interactionWorkshopAssistantSelect' as const,
  promptParams: { needed },
})

const choosePairsAction: ActionDefinition = {
  id: CHOOSE_PAIRS_ACTION_ID,
  nameKey: `occupations.${CARD_ID}.name`,
  descriptionKey: `occupations.${CARD_ID}.description`,
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  execute: ({ player }) => {
    const n = Math.min(6, countAllImprovements(player))
    if (n <= 0) {
      return { type: 'ok', resourcesGained: {} }
    }
    if (n >= 6) {
      const gain = sumPairs(PAIRS.map(([k]) => k))
      gainResources(player, gain)
      return {
        type: 'ok',
        logKey: 'log.cardEffectTrigger',
        logParams: { card: CARD_ID },
        resourcesGained: gain,
      }
    }
    return buildSelectionChoice(n)
  },
  resolveChoice: ({ player }, choice) => {
    const tokens = choice.split(',').filter((s) => VALID_PAIR_KEYS.has(s))
    const selected = [...new Set(tokens)]
    const n = Math.min(6, countAllImprovements(player))
    if (n <= 0) {
      return { type: 'ok', resourcesGained: {} }
    }
    if (selected.length !== n) {
      return buildSelectionChoice(n)
    }
    const gain = sumPairs(selected)
    gainResources(player, gain)
    return {
      type: 'ok',
      logKey: 'log.cardEffectTrigger',
      logParams: { card: CARD_ID },
      resourcesGained: gain,
    }
  },
}

registerAdHocAction(choosePairsAction)

export const C146_WorkshopAssistant_impl = {
  effect: {
    id: CARD_ID,
    onBuy: (_state, player) => {
      const n = Math.min(6, countAllImprovements(player))
      if (n <= 0) return
      const flow: ActionFlow = {
        type: 'leaf',
        actionId: CHOOSE_PAIRS_ACTION_ID,
        sourceCard: CARD_ID,
      }
      return flow
    },
  },
  reaches: [] as readonly string[],
} satisfies CardImpl
