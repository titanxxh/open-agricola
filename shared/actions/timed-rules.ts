import type { ActionFlow, GameState, PlayerState } from '../contract/types'
import type { FlowCardEffectHook } from '../contract/card-effect-hooks'
import type { RuleBody, TimedRule, TimedRulePhase } from '../contract/rule-plans'
import { readActionSnapshotToken, readActionSnapshotExtraData } from '../cards/helpers/action-snapshot-state'
import { getStoredResource } from '../cards/helpers/card-storage'
import { harvestRounds } from '../contract/state-constants'
import { readCardExtraData, writeCardExtraData, isCardFlagged, setCardFlag } from '../cards/helpers/card-state'

const phaseOrder: Partial<Record<TimedRulePhase, number>> = {
  afterReceive: 2, afterCollect: 10, contributeExtraTurn: 10, onBeforePlayerTurn: 10, onBeforeStartOfTurn: 0, onBeforeWork: 1, onRoundStart: 2, onEndTurn: 11,
  onAllWorkersPlaced: 20, onBeforeReturnHome: 30, onStartReturnHome: 31, onReturnHome: 32,
  onBeforeHarvest: 40, onStartHarvest: 41, onStartHarvestFieldPhase: 42, onHarvestFieldPhase: 43,
  onAfterReap: 44, onEndHarvestFieldPhase: 45, onHarvest: 46,
  onStartHarvestFeedingPhase: 47, onHarvestFeedingPhase: 48, onEndHarvestFeedingPhase: 49,
  onEndHarvest: 51, onAfterHarvest: 52, onRoundEnd: 60, onAfterRoundEnd: 61, onBeforeEndGame: 80,
}
const roundPhaseStart: Record<GameState['roundPhase'], number> = { preparation: 0, work: 10, 'returning-home': 30, harvest: 40, field: 42, feeding: 47, breeding: 50 }
const phaseIsUpcoming = (state: GameState, phase: TimedRulePhase): boolean => (phaseOrder[phase] ?? 0) >= roundPhaseStart[state.roundPhase]

const RECEIPTS_KEY = 'timedRuleReceipts'
export type TimedRuleOccurrence = { rule: TimedRule; round: number; identity: string }

export const timedRuleOccurrences = (state: GameState, player: PlayerState, cardId: string, rules: readonly TimedRule[], executingPhase?: TimedRule['at']['phase']): TimedRuleOccurrence[] => {
  const receipts = readCardExtraData<unknown>(player, cardId, RECEIPTS_KEY)
  const consumed = Array.isArray(receipts) ? receipts : []
  return rules.flatMap(rule => {
    const target = rule.at
    let rounds: readonly unknown[]
    switch (target.kind) {
      case 'rounds': rounds = target.rounds; break
      case 'round-window': rounds = [readCardExtraData<unknown>(player, cardId, target.fact)]; break
      case 'supply-worker-round': rounds = !isCardFlagged(player, cardId) ? [readCardExtraData<unknown>(player, cardId, target.fact)] : []; break
      case 'card-round': rounds = [readCardExtraData<unknown>(player, cardId, target.fact)]; break
      case 'flag': rounds = readCardExtraData<unknown>(player, cardId, target.fact) === true
        ? [target.clock === 'current-round' ? state.round : harvestRounds.find(round => round > state.round || round === state.round && (executingPhase === target.phase || phaseIsUpcoming(state, target.phase)))] : []; break
      case 'card-flag': rounds = isCardFlagged(player, cardId) ? [state.round] : []; break
      case 'card-list-nonempty': {
        const value = readCardExtraData<unknown>(player, cardId, target.fact)
        rounds = Array.isArray(value) && value.length > 0 ? [state.round] : []
        break
      }
      case 'card-positive': {
        const value = readCardExtraData<unknown>(player, cardId, target.fact)
        rounds = typeof value === 'number' && value > 0 && (!target.roundFact || readCardExtraData<unknown>(player, cardId, target.roundFact) === state.round) ? [state.round] : []
        break
      }
      case 'future-source': rounds = [...state.futureMeeples.filter(entry => entry.cardId === cardId && entry.playerId === player.id).map(entry => entry.round), ...state.events.filter(event => event.type === 'futureMeeple.resolved' && event.cardId === cardId && event.playerId === player.id && event.round === state.round).map(() => state.round)]; break
      case 'worker-on-space': rounds = state.actionSpaces.find(space => space.id === target.spaceId)?.takenBy.some(worker => worker.playerId === player.id) ? [state.round] : []; break
      case 'next-stored-payout': rounds = target.resources.some(resource => getStoredResource(player, cardId, resource) > 0)
        ? [target.rounds.find(round => round > state.round || round === state.round && (executingPhase === target.phase || phaseIsUpcoming(state, target.phase)))] : []; break
    }
    return [...new Set(rounds)].flatMap(round => {
      if (typeof round !== 'number' || !Number.isInteger(round) || round < state.round || round > 14) return []
      if (round === state.round && executingPhase !== rule.at.phase && !phaseIsUpcoming(state, rule.at.phase)) return []
      const turn = (target.kind === 'card-flag' || target.kind === 'card-positive') && target.clock === 'current-turn'
        ? `:${readActionSnapshotToken(player) ?? readActionSnapshotExtraData<number>(player, 'lastToken') ?? 0}` : ''
      const episode = target.episodeFact ? `:${readCardExtraData<unknown>(player, cardId, target.episodeFact) ?? 0}` : ''
      const identity = `${rule.key}:${round}${turn}${episode}`
      return target.kind !== 'round-window' && consumed.includes(identity) ? [] : [{ rule, round, identity }]
    })
  })
}

export const consumeTimedRule = (player: PlayerState, cardId: string, occurrence: TimedRuleOccurrence): void => {
  const raw = readCardExtraData<unknown>(player, cardId, RECEIPTS_KEY)
  const receipts = Array.isArray(raw) ? raw.filter((entry): entry is string => typeof entry === 'string') : []
  writeCardExtraData(player, cardId, RECEIPTS_KEY, [...receipts, occurrence.identity])
  if (occurrence.rule.consume?.clearFlag) writeCardExtraData(player, cardId, occurrence.rule.consume.clearFlag, false)
  if (occurrence.rule.consume?.clearCardFlag) setCardFlag(player, cardId, false)
  if (occurrence.rule.consume?.recordTurnFact) writeCardExtraData(player, cardId, occurrence.rule.consume.recordTurnFact, readActionSnapshotToken(player) ?? readActionSnapshotExtraData<number>(player, 'lastToken'))
}

export const compileRuleBody = (cardId: string, ruleKey: string, body: RuleBody, path: readonly number[] = []): ActionFlow => {
  const binding = { ruleKey, path }
  switch (body.kind) {
    case 'action': return { type: 'leaf', sourceCard: cardId, actionId: body.actionId, ...(body.params ? { params: { ...body.params } } : {}), ...(body.policy ? { actionContext: { ...body.policy } } : {}) }
    case 'operation': return { type: 'leaf', sourceCard: cardId, actionId: 'rule-operation', params: binding }
    case 'gain': return { type: 'leaf', sourceCard: cardId, actionId: 'rule-gain', params: binding }
    case 'condition': return { type: 'leaf', sourceCard: cardId, actionId: 'rule-condition', params: binding }
    case 'optional': return { ...compileRuleBody(cardId, ruleKey, body.body, [...path, 0]), optional: true, ...(body.promptKey ? { promptKey: body.promptKey } : {}) }
    case 'seq': case 'xor': case 'or': case 'parallel': return { type: body.kind, children: body.children.map((child, index) => compileRuleBody(cardId, ruleKey, child, [...path, index])) }
  }
}

export const findRuleBody = (rules: readonly TimedRule[], params?: Record<string, unknown>): { body: RuleBody; rule: TimedRule; path: number[] } | undefined => {
  if (typeof params?.ruleKey !== 'string' || !Array.isArray(params.path) || !params.path.every((index: unknown) => typeof index === 'number' && Number.isInteger(index) && index >= 0)) return undefined
  const path = params.path.filter((index: unknown): index is number => typeof index === 'number')
  const rule = rules.find(rule => rule.key === params.ruleKey)
  if (!rule) return undefined
  let body = rule.body
  for (const index of path) {
    const child: RuleBody | undefined = body.kind === 'condition' || body.kind === 'optional' ? index === 0 ? body.body : undefined : 'children' in body ? body.children[index] : undefined
    if (!child) return undefined
    body = child
  }
  return { body, rule, path }
}

export const compileTimedRuleHooks = (cardId: string, rules: readonly TimedRule[]): Partial<Record<Exclude<FlowCardEffectHook, 'onBuy'>, (state: GameState, player: PlayerState) => ActionFlow | undefined>> => {
  const hooks: Partial<Record<Exclude<FlowCardEffectHook, 'onBuy'>, (state: GameState, player: PlayerState) => ActionFlow | undefined>> = {}
  const keys = new Set<string>()
  for (const rule of rules) {
    if (keys.has(rule.key)) throw new Error(`Duplicate timed rule ${cardId}:${rule.key}`)
    keys.add(rule.key)
    const phase = rule.at.phase
    if (phase === 'afterReceive' || phase === 'afterCollect' || phase === 'contributeExtraTurn' || phase === 'onBeforePlayerTurn') continue
    hooks[phase] = (state, player) => {
      const due = timedRuleOccurrences(state, player, cardId, rules, phase).filter(occurrence => occurrence.round === state.round && occurrence.rule.at.phase === phase)
      const children: ActionFlow[] = due.map(occurrence => ({ type: 'leaf', sourceCard: cardId, actionId: 'resolve-timed-rule', params: { ruleKey: occurrence.rule.key, identity: occurrence.identity } }))
      return children.length ? { type: 'seq', children } : undefined
    }
  }
  return hooks
}
