import { timedRuleSources } from '../cards/timed-rule-obligations'
import type { ReorganizeTrigger } from '../actions/effects/reorganize.ts'
import { getCardEffect, isHandCardEffectHook, runCardEffectHook } from '../cards/card-effects.ts'
import type { BeforeEndGameScope, FlowCardEffectHook } from '../cards/card-effects.ts'
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
    beforeHarvestPlayerOrder?: number[]
    roundPreparationPlayerOrder?: number[]
    roundPreparation?: RoundPreparationContext
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
  reportProtectedObservation(observation: ProtectedObservation): void
  getRoundStartScheduleFlows?(playerIndex: number): ActionFlow[]
  getPreparationCompletionFlow?(hook: RoundPreparationHook, playerIndex: number, sourceCardIds: string[]): ActionFlow | null
  canStartFlow?(flow: ActionFlow, playerIndex: number): boolean
}

export type StageContinuationTable = Record<StageResumeState['hook'], (stageResume: StageResumeState) => void>

const stageReactionHooks = new Set<StageResumeState['hook']>([
  'onRoundStart',
  'onAllWorkersPlaced',
  'onStartHarvestFieldPhase',
  'onHarvestFieldPhase',
  'onEndHarvestFieldPhase',
])

const containsOptionalFlow = (flow: ActionFlow): boolean => flow.optional === true
  || (flow.type !== 'leaf' && flow.children.some(containsOptionalFlow))

export class StageDispatch {
  private readonly host: StageDispatchHost
  private readonly continuations: StageContinuationTable
  private pendingStageSwitchFromPlayerIndex: number | null = null

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
    this.pendingStageSwitchFromPlayerIndex = frame.ownerPlayerIndex
    try {
      this.host.withDeferredPrivateEventDrain(() => this.resume(completedStageResume))
    } finally {
      this.pendingStageSwitchFromPlayerIndex = null
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
    const stageSwitchFromPlayerIndex = this.pendingStageSwitchFromPlayerIndex
    this.pendingStageSwitchFromPlayerIndex = null
    const deferredPlayerSwitch = stageSwitchFromPlayerIndex !== null && stageSwitchFromPlayerIndex !== playerIndex
      ? { fromPlayerIndex: stageSwitchFromPlayerIndex, toPlayerIndex: playerIndex }
      : null
    this.host.pushEngineFrame({
      engine: this.host.createFlowEngine(flow, playerIndex),
      source: { kind: 'flow', flow },
      spaceId: `__stage:${hook}`,
      ownerPlayerIndex: playerIndex,
      stageResume: { hook, playerIndex: resumePlayerIndex, cardIndex: nextCardIndex, ...(extra ? { extra } : {}) },
      deferredPlayerSwitch,
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
    if (cardIndex === 0 && stageReactionHooks.has(hook)) {
      return this.continueStageReactionHook(hook, playerIndex)
    }
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

  continueBeforeEndGamePlayerDispatch(playerIndex = 0): boolean {
    for (let currentPlayerIndex = playerIndex; currentPlayerIndex < this.state.players.length; currentPlayerIndex += 1) {
      const children = this.collectBeforeEndGameActivationFlows(currentPlayerIndex)
      if (children.length === 0) continue
      const flow = children.length === 1
        ? children[0]!
        : { type: 'parallel' as const, mode: 'trigger-select' as const, children }
      this.startFlow(
        flow,
        'onBeforeEndGame',
        currentPlayerIndex,
        0,
        currentPlayerIndex + 1,
      )
      return true
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

  private collectOwnStageReactionActivationFlows(
    hook: StageCardEffectHook,
    player: PlayerState,
    options: { inferMandatoryFromPreview?: boolean; roundPreparation?: RoundPreparationContext } = {},
  ): ActionFlow[] {
    const children: ActionFlow[] = []
    const cards = [
      ...this.getPlayerEffectCardIds(player),
      ...this.getPlayerHandEffectCardIds(player, hook),
    ]
    for (const cardId of cards) {
      const effect = getCardEffect(cardId)
      if (!effect?.[hook]) continue
      if (effect.timedRules?.some(rule => rule.at.phase === hook)
        && !timedRuleOccurrences(this.state, player, cardId, effect.timedRules, hook)
          .some(occurrence => occurrence.round === this.state.round && occurrence.rule.at.phase === hook)) continue
      const preparationHook = roundPreparationHooks.find(candidate => candidate === hook)
      if (preparationHook && effect.stageEligibility?.[preparationHook]?.(
        this.state, player, { roundPreparation: options.roundPreparation },
      ) === false) continue
      const preview = options.inferMandatoryFromPreview
        ? this.previewStageEffectFlow(hook, player, cardId, options.roundPreparation)
        : undefined
      const activation = this.buildStageEffectActivationFlow(
        cardId,
        hook,
        player.id,
        player.id,
        options.inferMandatoryFromPreview ? false : true,
        options.inferMandatoryFromPreview
          ? { commitOnTriggerSelection: true, previewApplicable: preview?.applicable === true, roundPreparation: options.roundPreparation }
          : { roundPreparation: options.roundPreparation },
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

  continueBeforeHarvestReactionHook(
    playerOrder: readonly number[],
    orderOffset = 0,
  ): boolean {
    for (let currentOffset = orderOffset; currentOffset < playerOrder.length; currentOffset += 1) {
      const currentPlayerIndex = playerOrder[currentOffset]
      if (currentPlayerIndex === undefined) continue
      const player = this.state.players[currentPlayerIndex]
      if (!player) continue
      const children = this.collectOwnStageReactionActivationFlows(
        'onBeforeHarvest',
        player,
        { inferMandatoryFromPreview: true },
      )
      if (children.length === 0 || !children.some((child) =>
        child.type === 'leaf' && child.actionContext?.previewApplicable === true,
      )) continue
      const flow = children.length === 1
        ? children[0]!
        : {
            type: 'parallel' as const,
            mode: 'trigger-select' as const,
            children: children.map((child) => ({ ...child, optional: true })),
          }
      this.startFlow(
        flow,
        'onBeforeHarvest',
        currentPlayerIndex,
        0,
        currentOffset + 1,
        { beforeHarvestPlayerOrder: [...playerOrder] },
      )
      return true
    }
    return false
  }

  private continueStageReactionHook(
    hook: StageCardEffectHook,
    playerIndex = 0,
  ): boolean {
    for (let currentPlayerIndex = playerIndex; currentPlayerIndex < this.state.players.length; currentPlayerIndex += 1) {
      const player = this.state.players[currentPlayerIndex]
      if (!player) continue
      if (isPlayerSkippingCurrentHarvest(this.state, player)) continue
      const children = this.collectOwnStageReactionActivationFlows(hook, player)
      if (children.length === 0) continue
      const flow = children.length === 1
        ? children[0]!
        : { type: 'parallel' as const, mode: 'trigger-select' as const, children }
      this.startFlow(
        flow,
        hook,
        currentPlayerIndex,
        0,
        currentPlayerIndex + 1,
      )
      return true
    }
    return false
  }

  private buildBeforeEndGameActivationFlow(
    cardId: string,
    ownerPlayerId: string,
    targetPlayerId: string,
    scope: BeforeEndGameScope,
    mandatory: boolean,
  ): ActionFlow {
    return this.buildStageEffectActivationFlow(cardId, 'onBeforeEndGame', ownerPlayerId, targetPlayerId, mandatory, {
      ownerPlayerId,
      targetPlayerId,
      beforeEndGameScope: scope,
      beforeEndGameMandatory: mandatory,
    })
  }

  private collectBeforeEndGameActivationFlows(targetPlayerIndex: number): ActionFlow[] {
    const targetPlayer = this.state.players[targetPlayerIndex]
    const children: ActionFlow[] = []
    if (!targetPlayer) return children

    for (const ownerPlayer of this.state.players) {
      const playedCards = this.getPlayerEffectCardIds(ownerPlayer)
      for (const cardId of playedCards) {
        const effect = getCardEffect(cardId)
        if (!effect?.onBeforeEndGame) continue
        const scope = effect.beforeEndGameScope ?? 'owner'
        if (scope === 'owner' && ownerPlayer.id !== targetPlayer.id) continue
        const flow = this.buildBeforeEndGameActivationFlow(
          cardId,
          ownerPlayer.id,
          targetPlayer.id,
          scope,
          effect.beforeEndGameMandatory !== false,
        )
        children.push(flow)
      }
    }

    return children
  }
}
