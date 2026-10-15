import { Engine, ActionRegistry } from '../engine'
import { createInternalActionDefinitions } from './internal-actions'
import { collectCardStatePresentation } from '../cards/card-state-presentation'
import { pendingHarvestSkips, fieldAndBreedSkipSources } from '../cards/helpers/harvest-skip'
import { getCardEffect } from '../cards/card-effects'
import { timedRuleSources } from '../cards/timed-rule-obligations'
import { timedRuleOccurrences } from './timed-rules'
import { describeRuleBody } from './rule-description'
import type { ChoiceDescriptionPreview, GameState, PlayerState, ScheduledEffectPreview } from '../contract/types'
import { describeFutureSchedule } from './future-schedule'
import { describeScheduledOffers, readScheduledOffers } from './effects/internal/scheduled-offers'
import type { ActionHookRegistry } from './hooks'

const canonical = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value)
    .filter(([, entry]) => entry !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => [key, canonical(entry)]))
  return value
}

/** Group presentation only; each authoritative entry still executes independently. */
export const collectScheduledEffectPreviews = (state: GameState, player: PlayerState, actionHooks: ActionHookRegistry | undefined): ScheduledEffectPreview[] => {
  const groups = new Map<string, ScheduledEffectPreview>()
  const add = (round: number, sourceCard: string, description: ChoiceDescriptionPreview, timing?: ScheduledEffectPreview['timing']) => {
    const key = JSON.stringify(canonical({ round, sourceCard, description, timing }))
    const existing = groups.get(key)
    if (existing) existing.count += 1
    else groups.set(key, { round, sourceCard, description, timing, count: 1 })
  }
  for (const entry of state.futureMeeples) {
    if (entry.playerId !== player.id) continue
    add(entry.round, entry.cardId, { kind: 'action', showLabel: false,
      labelKey: 'actions.future-meeples.name',
      effectPreview: describeFutureSchedule(entry.round - 1, { cardId: entry.cardId, playerId: player.id, entries: [entry] }),
    })
  }
  for (const cardId of [...player.minorPlayed, ...player.occupationPlayed, ...player.improvements]) {
    for (const offer of readScheduledOffers(player, cardId)) {
      if (offer.consumed || offer.dueRound < state.round) continue
      add(offer.dueRound, cardId, { kind: 'action', optional: true, showLabel: false,
        labelKey: 'actions.future-meeples.name', effectPreview: describeScheduledOffers([offer]),
      }, 'onRoundStart')
    }
  }
  for (const { cardId, rules } of timedRuleSources(state, player, id => getCardEffect(id)?.timedRules ?? [])) {
    for (const occurrence of timedRuleOccurrences(state, player, cardId, rules)) {
      const space = state.actionSpaces[0]
      if (!space) continue
      add(occurrence.round, cardId, describeRuleBody(occurrence.rule.body, { actionHooks, state, player, space, sourceCard: cardId }), occurrence.rule.at.phase)
    }
  }
  const operation = (round: number, cardId: string, effectPreview: Extract<import('../contract/types').ChoiceEffectPreview, { kind: 'timedOperation' }>, timing?: ScheduledEffectPreview['timing']) =>
    add(round, cardId, { kind: 'action', showLabel: false, labelKey: 'actions.special-effect.name', effectPreview }, timing)
  const projectedSupplyOffers = new Set<string>()
  for (const worker of player.workers) {
    const use = worker.supplyUse
    if (use?.sourceCard && use.status === 'reserved' && use.returnRound === state.round && !projectedSupplyOffers.has(use.sourceCard)) {
      projectedSupplyOffers.add(use.sourceCard)
      const effect = getCardEffect(use.sourceCard)
      const ownsSource = [...player.minorPlayed, ...player.occupationPlayed, ...player.improvements].includes(use.sourceCard)
      const describedByTimedRule = effect?.timedRules?.some(rule => rule.at.phase === 'contributeExtraTurn')
      const flow = ownsSource && !describedByTimedRule ? effect?.contributeExtraTurn?.(state, player, { actionHooks }) : undefined
      const space = state.actionSpaces[0]
      if (flow && space) {
        const registry = new ActionRegistry()
        for (const action of [...state.actionSpaces, ...createInternalActionDefinitions(actionId => registry.get(actionId))]) registry.register(action)
        const description = Engine.describeFlow(flow, registry, { actionHooks, state, player, space, sourceCard: use.sourceCard })
        if (description) add(state.round, use.sourceCard, description, 'contributeExtraTurn')
      }
    }
    if (use?.sourceCard && use.returnRound !== undefined && use.returnRound >= state.round) operation(use.returnRound, use.sourceCard,
      { kind: 'timedOperation', operation: use.disposition === 'remove-from-game' ? 'remove-worker' : 'return-worker' }, 'afterBeforeReturnHomeHooks')
  }
  for (const [cardId, presentation] of Object.entries(collectCardStatePresentation(player))) {
    if (presentation.heldWorkerId) operation(state.round, cardId, { kind: 'timedOperation', operation: 'release-held-worker' }, 'afterReturnHomeHooks')
  }
  for (const entry of pendingHarvestSkips(state, player)) operation(entry.round, entry.cardId, { kind: 'timedOperation', operation: 'skip-harvest' }, 'onStartHarvest')
  if (['harvest', 'field', 'feeding', 'breeding'].includes(state.roundPhase)) for (const cardId of fieldAndBreedSkipSources(state, player)) operation(state.round, cardId, { kind: 'timedOperation', operation: 'skip-field-and-breed' }, 'onStartHarvest')
  for (const space of state.actionSpaces) {
    const exclusive = space.exclusiveUse
    if (exclusive?.playerId === player.id) operation(exclusive.untilRound, exclusive.sourceCardId, { kind: 'timedOperation', operation: 'exclusive-use-expires', actionNameKey: space.nameKey }, 'onRoundStart')
  }
  return [...groups.values()].sort((a, b) => a.round - b.round || a.sourceCard.localeCompare(b.sourceCard))
}
