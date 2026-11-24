import { timedRuleSources } from '../cards/timed-rule-obligations'
import type { ReorganizeTrigger } from '../actions/effects/reorganize.ts'
import { getCardEffect, isHandCardEffectHook, runCardEffectHook } from '../cards/card-effects.ts'
import type { FlowCardEffectHook } from '../cards/card-effects.ts'
import { isPlayerSkippingCurrentHarvest } from '../cards/helpers/harvest-skip.ts'
import type { ActionFlow, GameState, PlayerState, ProtectedObservation } from '../contract/types.ts'
import type { Engine, EngineFrame } from '../engine/index.ts'
import { cloneState } from './state-bootstrap.ts'
import { roundPreparationHooks, type RoundPreparationHook, type RoundPreparationContext } from '../contract/card-effect-hooks'
import { tagInjectedAnytimeFlow } from '../engine/action-context-flags'
import { timedRuleOccurrences } from '../actions/timed-rules'

export type StageResumeState = {
  hook:
    | 'onBeforeHarvest'
    | 'harvestPrepWindow'
    | 'onAfterReap'
    | 'afterHarvestReapReaction'
    | 'onHarvest'
    | 'onEndHarvest'
    | 'onAfterHarvest'
    | 'onBeforeStartOfTurn'
    | 'onBeforeWork'
    | 'onAfterRevealAction'
    | 'onPreparation'
    | 'onMoorSoloPreparation'
    | 'onEndPreparation'
    | 'onWorkStart'
    | 'onRoundStart'
    | 'onStartHarvestFeedingPhase'
    | 'onEndTurn'
    | 'onReturnHome'
    | 'onStartReturnHome'
    | 'onAfterRoundEnd'
    | 'onRoundEnd'
    | 'onBeforeEndGame'
    | 'preScoringWindow'
    | 'onStartHarvest'
    | 'onStartHarvestFieldPhase'
    | 'onHarvestFieldPhase'
    | 'onEndHarvestFieldPhase'
    | 'onHarvestFeedingPhase'
    | 'onEndHarvestFeedingPhase'
    | 'onBeforeReturnHome'
    | 'onAllWorkersPlaced'
    | 'onBreedPhase'
    | 'onReorganizeComplete'
  playerIndex: number
  cardIndex: number
  extra?: {
    trigger?: ReorganizeTrigger
    originPlayerIndex?: number | null
    triggerActionId?: string | null
    resumeAfterCardId?: string | null
    anytimeActionTaken?: boolean
    /** The frozen player order of a reaction window (#2039). */
    playerOrder?: number[]
    roundPreparationPlayerOrder?: number[]
    roundPreparation?: RoundPreparationContext
    supplyDiscardOffered?: number[]
    beforeWorkDiscardComplete?: boolean
  }
}

export type StageCardEffectHook = Extract<StageResumeState['hook'], FlowCardEffectHook>

export type StageDispatchHost = {
  actionHooks: import('../actions/hooks').ActionHookRegistry
  getState(): GameState
  createFlowEngine(flow: ActionFlow, ownerPlayerIndex?: number): Engine
  pushEngineFrame(frame: EngineFrame): void
  popEngineFrame(): EngineFrame | undefined
  driveEngineSteps(): void
  withDeferredPrivateEventDrain(fn: () => void): void
  /** The dispatch ended without another stage frame; seal the Handoff Source's responses. */
  handBackFromStageDispatch(handoffSourcePlayerIndex: number): void
  reportProtectedObservation(observation: ProtectedObservation): void
  getRoundStartScheduleFlows?(playerIndex: number): ActionFlow[]
  getPreparationCompletionFlow?(hook: RoundPreparationHook, playerIndex: number, sourceCardIds: string[]): ActionFlow | null
  canStartFlow?(flow: ActionFlow, playerIndex: number): boolean
}

export type StageContinuationTable = Record<StageResumeState['hook'], (stageResume: StageResumeState) => void>

const containsOptionalFlow = (flow: ActionFlow): boolean => flow.optional === true
  || (flow.type !== 'leaf' && flow.children.some(containsOptionalFlow))

export class StageDispatch {
  private readonly host: StageDispatchHost
  private readonly continuations: StageContinuationTable
  /**
   * Handoff Source carried from a completed frame into the next frame of the
   * same dispatch. `passedOn` turns true once a later stage frame took it over.
   */
  private pendingHandoff: { playerIndex: number | null; passedOn: boolean } | null = null

  constructor(host: StageDispatchHost, continuations: StageContinuationTable) {
    this.host = host
    this.continuations = continuations
  }

  private get state(): GameState {
    return this.host.getState()
  }

  completeFrameIfStage(frame: EngineFrame): boolean {
    const stageResume = (frame.stageResume ?? null) as StageResumeState | null
    if (!stageResume) return false
    const completedStageResume = stageResume.hook === 'preScoringWindow'
      ? {
          ...stageResume,
          extra: {
            ...stageResume.extra,
            anytimeActionTaken:
              frame.engine.snapshot().treeCursor.some((cursor) =>
                cursor.data.optional === true && cursor.data.optionalActive === true,
              ),
          },
        }
      : stageResume
    this.host.popEngineFrame()
    const outerHandoff = this.pendingHandoff
    const handoff = { playerIndex: frame.handoffSourcePlayerIndex ?? null, passedOn: false }
    this.pendingHandoff = handoff
    try {
      this.host.withDeferredPrivateEventDrain(() => this.resume(completedStageResume))
    } finally {
      this.pendingHandoff = outerHandoff
    }
    if (frame.reason !== 'stage-hook') return true
    // This later stage frame now owns any hand-back of an outer one.
    if (outerHandoff) outerHandoff.passedOn = true
    // No later stage frame took the Handoff Source: control returns to ordinary flow.
    if (!handoff.passedOn && handoff.playerIndex !== null) {
      this.host.handBackFromStageDispatch(handoff.playerIndex)
    }
    return true
  }

  resume(stageResume: StageResumeState): void {
    this.continuations[stageResume.hook](stageResume)
  }

  startFlow(
    flow: ActionFlow,
    hook: StageResumeState['hook'],
    playerIndex: number,
    nextCardIndex: number,
    resumePlayerIndex = playerIndex,
    extra?: StageResumeState['extra'],
  ): void {
    const handoff = this.pendingHandoff
    this.pendingHandoff = null
    if (handoff) handoff.passedOn = true
    const handoffSourcePlayerIndex = handoff?.playerIndex ?? null
    this.host.pushEngineFrame({
      engine: this.host.createFlowEngine(flow, playerIndex),
      source: { kind: 'flow', flow },
      spaceId: `__stage:${hook}`,
      ownerPlayerIndex: playerIndex,
      stageResume: { hook, playerIndex: resumePlayerIndex, cardIndex: nextCardIndex, ...(extra ? { extra } : {}) },
      deferredPlayerSwitch: null,
      handoffSourcePlayerIndex,
      reason: 'stage-hook',
    })
    this.host.driveEngineSteps()
  }

  continueStageHook(
    hook: StageCardEffectHook,
    playerIndex = 0,
    cardIndex = 0,
    extra?: StageResumeState['extra'],
  ): boolean {
    const preparationHook = roundPreparationHooks.find(candidate => candidate === hook)
    if (preparationHook) return this.continueRoundPreparationHook(preparationHook, playerIndex, extra)
    for (let currentPlayerIndex = playerIndex; currentPlayerIndex < this.state.players.length; currentPlayerIndex += 1) {
      const player = this.state.players[currentPlayerIndex]
      if (!player) continue
      if (isPlayerSkippingCurrentHarvest(this.state, player)) continue
      const cards = [
        ...this.getPlayerEffectCardIds(player),
        ...this.getPlayerHandEffectCardIds(player, hook),
      ]
      const startCardIndex = currentPlayerIndex === playerIndex
        ? this.resolveStageStartCardIndex(cards, cardIndex, extra?.resumeAfterCardId)
        : 0
      for (let currentCardIndex = startCardIndex; currentCardIndex < cards.length; currentCardIndex += 1) {
        const cardId = cards[currentCardIndex]
        if (!cardId) continue
        const flow = runCardEffectHook(this.state, player, cardId, hook, undefined, { actionHooks: this.host.actionHooks,
          reportProtectedObservation: (observation) => this.host.reportProtectedObservation(observation),
        })
        if (!flow) continue
        this.startFlow(flow, hook, currentPlayerIndex, currentCardIndex + 1, currentPlayerIndex, {
          ...extra,
          resumeAfterCardId: cardId,
        })
        return true
      }
    }
    return false
  }

  private resolveStageStartCardIndex(
    cards: string[],
    cardIndex: number,
    resumeAfterCardId?: string | null,
  ): number {
    if (!resumeAfterCardId) return cardIndex
    const liveIndex = cards.indexOf(resumeAfterCardId)
    if (liveIndex >= 0) return liveIndex + 1
    return Math.max(0, cardIndex - 1)
  }

  private getPlayerEffectCardIds(player: PlayerState): string[] {
    return [...new Set([...player.improvements, ...player.minorPlayed, ...player.occupationPlayed,
      ...timedRuleSources(this.state, player, id => getCardEffect(id)?.timedRules ?? []).map(source => source.cardId),
    ])]
  }

  private getPlayerHandEffectCardIds(player: PlayerState, hook: StageCardEffectHook): string[] {
    if (!isHandCardEffectHook(hook)) return []
    const handCards = [...player.occupationHand, ...player.minorHand]
    return handCards.filter((id) => {
      const effect = getCardEffect(id)
      return effect?.handHooks?.includes(hook)
    })
  }

  private buildStageEffectActivationFlow(
    cardId: string,
    hook: StageCardEffectHook,
    ownerPlayerId: string,
    targetPlayerId: string,
    mandatory = true,
    actionContext: Record<string, unknown> = {},
  ): Extract<ActionFlow, { type: 'leaf' }> {
    const context = {
      ownerPlayerId,
      targetPlayerId,
      stageHook: hook,
      mandatory,
      ...actionContext,
    }
    return {
      type: 'leaf',
      actionId: 'activate-card-effect',
      params: {
        cardId,
        hook,
        ...context,
      },
      actionContext: context,
      sourceCard: cardId,
      targetPlayerId,
      optional: mandatory ? undefined : true,
    }
  }

  /**
   * The sources a player resolves in a stage window: their own played, timed and
   * hand cards, and before the end of the game also other players' cards whose
   * `beforeEndGameScope` is `allPlayers`. The player is the target the effect runs for.
   */
  private stageReactionSources(hook: StageCardEffectHook, player: PlayerState): { cardId: string; owner: PlayerState }[] {
    const own = [...this.getPlayerEffectCardIds(player), ...this.getPlayerHandEffectCardIds(player, hook)]
      .map(cardId => ({ cardId, owner: player }))
    if (hook !== 'onBeforeEndGame') return own
    const others = this.state.players.filter(owner => owner.id !== player.id).flatMap(owner =>
      this.getPlayerEffectCardIds(owner)
        .filter(cardId => getCardEffect(cardId)?.beforeEndGameScope === 'allPlayers')
        .map(cardId => ({ cardId, owner })))
    return [...own, ...others]
  }

  private collectOwnStageReactionActivationFlows(
    hook: StageCardEffectHook,
    player: PlayerState,
    options: { inferMandatoryFromPreview?: boolean; roundPreparation?: RoundPreparationContext } = {},
  ): ActionFlow[] {
    const children: ActionFlow[] = []
    for (const { cardId, owner } of this.stageReactionSources(hook, player)) {
      const effect = getCardEffect(cardId)
      if (!effect?.[hook]) continue
      if (effect.timedRules?.some(rule => rule.at.phase === hook)
        && !timedRuleOccurrences(this.state, owner, cardId, effect.timedRules, hook)
          .some(occurrence => occurrence.round === this.state.round && occurrence.rule.at.phase === hook)) continue
      const preparationHook = roundPreparationHooks.find(candidate => candidate === hook)
      if (preparationHook && effect.stageEligibility?.[preparationHook]?.(
        this.state, player, { actionHooks: this.host.actionHooks, roundPreparation: options.roundPreparation },
      ) === false) continue
      const preview = options.inferMandatoryFromPreview
        ? this.previewStageEffectFlow(hook, player, cardId, options.roundPreparation)
        : undefined
      const beforeEndGame = hook === 'onBeforeEndGame'
        ? { beforeEndGameScope: effect.beforeEndGameScope ?? 'owner', beforeEndGameMandatory: effect.beforeEndGameMandatory !== false }
        : {}
      const activation = this.buildStageEffectActivationFlow(
        cardId,
        hook,
        owner.id,
        player.id,
        options.inferMandatoryFromPreview ? false : true,
        options.inferMandatoryFromPreview
          ? { commitOnTriggerSelection: true, previewApplicable: preview?.applicable === true, roundPreparation: options.roundPreparation, ...beforeEndGame }
          : { roundPreparation: options.roundPreparation, ...beforeEndGame },
      )
      if (options.inferMandatoryFromPreview && preview?.applicable) {
        activation.optional = preview.flow?.optional === true ? true : undefined
      }
      if (preview?.flow?.promptKey) activation.promptKey = preview.flow.promptKey
      activation.actionContext = { ...activation.actionContext,
        previewHasNestedOptional: !!preview?.flow && preview.flow.type !== 'leaf'
          && preview.flow.children.some(containsOptionalFlow),
        previewDoable: preview?.applicable === true
        && (!preview.flow || (this.host.canStartFlow?.({ ...preview.flow, optional: false }, this.state.players.indexOf(player)) ?? true)) }
      children.push(activation)
    }
    return children
  }

  private continueRoundPreparationHook(
    hook: RoundPreparationHook,
    offset: number,
    extra?: StageResumeState['extra'],
  ): boolean {
    const start = Math.max(0, this.state.players.findIndex(player => player.startPlayer))
    const order = extra?.roundPreparationPlayerOrder
      ?? this.state.players.map((_, index) => (start + index) % this.state.players.length)
    for (let currentOffset = offset; currentOffset < order.length; currentOffset += 1) {
      const playerIndex = order[currentOffset]
      const player = playerIndex === undefined ? undefined : this.state.players[playerIndex]
      if (!player || playerIndex === undefined) continue
      const children = this.collectOwnStageReactionActivationFlows(hook, player, {
        roundPreparation: extra?.roundPreparation,
        inferMandatoryFromPreview: true,
      })
      if (hook === 'onRoundStart') children.push(...(this.host.getRoundStartScheduleFlows?.(playerIndex) ?? []))
      const single = children.length === 1 ? children[0] : undefined
      const singleDoable = single && (single.type === 'leaf' && single.actionId === 'activate-card-effect'
        ? single.actionContext?.previewDoable === true
        : (this.host.canStartFlow?.({ ...single, optional: false }, playerIndex) ?? true))
      const singleActivation = single?.type === 'leaf' && single.actionId === 'activate-card-effect' ? single : undefined
      const eligibleOptionalSource = children.some(child => child.optional === true)
      const nestedOptionalSource = children.some(child => child.type === 'leaf'
        && child.actionId === 'activate-card-effect' && child.actionContext?.previewHasNestedOptional === true)
      if (nestedOptionalSource || (eligibleOptionalSource && (!single || !singleDoable || !singleActivation))) children.push(tagInjectedAnytimeFlow({
        type: 'leaf', actionId: 'exchange', optional: true, targetPlayerId: player.id,
        choiceLabelKey: 'actions.exchange.name', actionContext: { anytimeInteractionKind: 'choice', includeBasicConversions: true },
      }))
      const sourceCardIds = children.flatMap(child => child.type === 'leaf' && child.actionId === 'activate-card-effect'
        && typeof child.params?.cardId === 'string' ? [child.params.cardId] : [])
      const completion = this.host.getPreparationCompletionFlow?.(hook, playerIndex, sourceCardIds)
      if (!children.length && !completion) continue
      const only = children.length === 1 ? children[0] : undefined
      const inactiveActivation = only?.type === 'leaf' && only.actionId === 'activate-card-effect'
        && only.actionContext?.previewApplicable !== true
      const reactions: ActionFlow = only && singleDoable && !inactiveActivation ? only
        : { type: 'parallel', mode: 'trigger-select', children }
      const flow: ActionFlow = completion ? { type: 'seq', children: [reactions, completion] } : reactions
      this.startFlow(flow, hook, playerIndex, 0, currentOffset + 1, {
        ...extra, roundPreparationPlayerOrder: [...order],
      })
      return true
    }
    return false
  }

  private previewStageEffectFlow(
    hook: StageCardEffectHook,
    player: PlayerState,
    cardId: string,
    roundPreparation?: RoundPreparationContext,
  ): { flow: ActionFlow | null; applicable: boolean } | undefined {
    const previewState = cloneState(this.state)
    const previewPlayer = previewState.players.find((entry) => entry.id === player.id)
    if (!previewPlayer) return undefined
    const before = JSON.stringify({ state: previewState, player: previewPlayer })
    const flow = runCardEffectHook(previewState, previewPlayer, cardId, hook, undefined, { actionHooks: this.host.actionHooks, roundPreparation })
    return {
      flow,
      applicable: flow !== null || JSON.stringify({ state: previewState, player: previewPlayer }) !== before,
    }
  }

  /**
   * Frozen-order reaction window (#2039): players in `playerOrder`, frozen at
   * window entry; each player's sources are captured on entry and previewed on
   * clones. Optional sources can be passed together; same-timing sources enter
   * one trigger-select whose auto-resolution follows the player's setting.
   */
  continueReactionWindow(
    hook: StageCardEffectHook,
    playerOrder: readonly number[],
    orderOffset = 0,
  ): boolean {
    for (let offset = orderOffset; offset < playerOrder.length; offset += 1) {
      const playerIndex = playerOrder[offset]
      const player = playerIndex === undefined ? undefined : this.state.players[playerIndex]
      if (!player || playerIndex === undefined) continue
      const children = this.collectOwnStageReactionActivationFlows(hook, player, { inferMandatoryFromPreview: true })
      if (!children.some((child) => child.type === 'leaf' && child.actionContext?.previewApplicable === true)) continue
      const extra = { playerOrder: [...playerOrder] }
      const sole = children.length === 1 ? children[0] : undefined
      if (sole?.type === 'leaf' && typeof sole.params?.cardId === 'string') {
        // A sole source orders nothing: its own flow runs, keeping the card's own choices and skip.
        const flow = runCardEffectHook(this.state, player, sole.params.cardId, hook, undefined, {
          actionHooks: this.host.actionHooks,
          reportProtectedObservation: (observation) => this.host.reportProtectedObservation(observation),
        })
        if (!flow) continue
        this.startFlow(flow, hook, playerIndex, 0, offset + 1, extra)
        return true
      }
      this.startFlow({
        type: 'parallel',
        mode: 'trigger-select',
        children: children.map((child) => ({ ...child, optional: true })),
      }, hook, playerIndex, 0, offset + 1, extra)
      return true
    }
    return false
  }
}
