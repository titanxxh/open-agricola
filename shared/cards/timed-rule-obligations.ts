import type { ActionFlow, GameState, PlayerState } from '../contract/types'
import type { FlowCardEffectHook } from '../contract/card-effect-hooks'
import type { FlowEffectContext } from './card-effects'
import type { TimedRule, TimedRuleEventPhase } from '../contract/rule-plans'
import type { CardListenerContext } from './card-listeners'
import { compileRuleBody, compileTimedRuleHooks, timedRuleOccurrences } from '../actions/timed-rules'
import { createEventQuery } from '../events/query'
import { sumActionSpaceMovedToTriggerPlayer } from './helpers/event-provenance'
import { consumePlannedTurnSkip } from '../actions/rule-activated-operation'
import { hasInactiveWorkerInSupply } from '../domain/player'

export type TimedRuleResolver = (cardId: string) => readonly TimedRule[]
const playedCards = (player: PlayerState): string[] => [...player.minorPlayed, ...player.occupationPlayed, ...player.improvements]

/** Only declarations explicitly retaining an activated obligation survive source removal. */
export const timedRuleSources = (state: GameState, player: PlayerState, resolveRules: TimedRuleResolver): { cardId: string; rules: readonly TimedRule[] }[] => {
  const owned = new Set(playedCards(player))
  const scheduledSources = state.futureMeeples.filter(entry => entry.playerId === player.id).map(entry => entry.cardId)
  const receivedSources = state.events.flatMap(event => event.type === 'futureMeeple.resolved' && event.playerId === player.id && event.round === state.round ? [event.cardId] : [])
  const occupiedSources = state.actionSpaces.filter(space => space.takenBy.some(worker => worker.playerId === player.id)).map(space => space.id)
  return [...new Set([...owned, ...Object.keys(player.cardStates), ...scheduledSources, ...receivedSources, ...occupiedSources])].flatMap(cardId => {
    const rules = resolveRules(cardId).filter(rule => owned.has(cardId) || rule.retainAfterCardLeaves === true)
    return rules.length ? [{ cardId, rules }] : []
  })
}

/** Stage callers append these flows after ordinary owned-card hooks; never call old standing hooks. */
export const retainedTimedHookFlows = (state: GameState, player: PlayerState, phase: Exclude<FlowCardEffectHook, 'onBuy'>, resolveRules: TimedRuleResolver): ActionFlow[] => {
  const owned = new Set(playedCards(player))
  return timedRuleSources(state, player, resolveRules).filter(source => !owned.has(source.cardId)).flatMap(source => {
    const flow = compileTimedRuleHooks(source.cardId, source.rules)[phase]?.(state, player)
    return flow ? [flow] : []
  })
}

export const timedEventFlow = (context: CardListenerContext, cardId: string, rules: readonly TimedRule[], phase: Exclude<TimedRuleEventPhase, 'onBeforePlayerTurn'>): ActionFlow | undefined => {
  const { state, player } = context
  const due = timedRuleOccurrences(state, player, cardId, rules, phase).filter(occurrence => occurrence.round === state.round && occurrence.rule.at.phase === phase)
  const children = due.flatMap(occurrence => {
    if (phase === 'afterReceive') {
      const received = createEventQuery(context.actionEvents ?? context.transactionEvents).has('resource.moved', event => event.reason === 'receive' && event.sourceCardId === cardId && event.to.kind === 'player' && event.to.playerId === player.id
        && Object.values(event.resources).some(amount => amount > 0))
      return received ? [{ type: 'leaf' as const, actionId: 'resolve-timed-rule', sourceCard: cardId, params: { ruleKey: occurrence.rule.key, identity: occurrence.identity } }] : []
    }
    if (phase === 'contributeExtraTurn') return hasInactiveWorkerInSupply(player) ? [compileRuleBody(cardId, occurrence.rule.key, occurrence.rule.body)] : []
    const operation = occurrence.rule.body.kind === 'operation' ? occurrence.rule.body.operation : undefined
    if (operation?.kind !== 'gain-per-building-resource-collected') return []
    const keys = ['wood', 'clay', 'reed', 'stone'] as const
    if (!keys.some(resource => (context.space.gainPerRound[resource] ?? 0) > 0)) return []
    const count = keys.reduce((sum, resource) => sum + sumActionSpaceMovedToTriggerPlayer(context, resource), 0)
    return count > 0 ? [{ type: 'leaf' as const, actionId: 'rule-operation', sourceCard: cardId,
      params: { ruleKey: occurrence.rule.key, path: [], buildingResourceCount: count } }] : []
  })
  return children.length ? { type: 'seq', sourceCard: cardId, children } : undefined
}

export const retainedTimedEventFlows = (context: CardListenerContext, phase: Exclude<TimedRuleEventPhase, 'onBeforePlayerTurn'>, resolveRules: TimedRuleResolver): ActionFlow[] => {
  const owned = new Set(playedCards(context.player))
  return timedRuleSources(context.state, context.player, resolveRules).filter(source => !owned.has(source.cardId)).flatMap(source => {
    const flow = timedEventFlow(context, source.cardId, source.rules, phase)
    return flow ? [flow] : []
  })
}

export const retainedTimedTurnSkip = (state: GameState, player: PlayerState, resolveRules: TimedRuleResolver): boolean => {
  const owned = new Set(playedCards(player))
  let skip = false
  for (const source of timedRuleSources(state, player, resolveRules)) {
    if (owned.has(source.cardId)) continue
    for (const occurrence of timedRuleOccurrences(state, player, source.cardId, source.rules, 'onBeforePlayerTurn')) {
      const body = occurrence.rule.body
      if (occurrence.round === state.round && occurrence.rule.at.phase === 'onBeforePlayerTurn' && body.kind === 'operation' && body.operation.kind === 'skip-next-turns') {
        skip = consumePlannedTurnSkip(player, source.cardId, body.operation) || skip
      }
    }
  }
  return skip
}

export const timedExtraTurnFlow = (state: GameState, player: PlayerState, cardId: string, rules: readonly TimedRule[]): ActionFlow | undefined => {
  if (!hasInactiveWorkerInSupply(player)) return
  const due = timedRuleOccurrences(state, player, cardId, rules, 'contributeExtraTurn').filter(occurrence => occurrence.round === state.round && occurrence.rule.at.phase === 'contributeExtraTurn')
  return due.length ? { type: 'seq', children: due.map(occurrence => compileRuleBody(cardId, occurrence.rule.key, occurrence.rule.body)) } : undefined
}
export const retainedTimedExtraTurnFlows = (state: GameState, player: PlayerState, resolveRules: TimedRuleResolver): ActionFlow[] => {
  const owned = new Set(playedCards(player))
  return timedRuleSources(state, player, resolveRules).filter(source => !owned.has(source.cardId)).flatMap(source => {
    const flow = timedExtraTurnFlow(state, player, source.cardId, source.rules)
    return flow ? [flow] : []
  })
}

export const retainedTimedRuleHook = (state: GameState, player: PlayerState, cardId: string, phase: Exclude<FlowCardEffectHook, 'onBuy'>, resolveRules: TimedRuleResolver, context?: FlowEffectContext): ActionFlow | undefined => {
  const rules = resolveRules(cardId).filter(rule => rule.retainAfterCardLeaves)
  return compileTimedRuleHooks(cardId, rules)[phase]?.(state, player, context)
}
