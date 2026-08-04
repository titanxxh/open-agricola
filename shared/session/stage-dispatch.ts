import type { ReorganizeTrigger } from '../actions/effects/reorganize.ts'
import { getCardEffect, isHandCardEffectHook, runCardEffectHook } from '../cards/card-effects.ts'
import type { BeforeEndGameScope, FlowCardEffectHook } from '../cards/card-effects.ts'
import type { ActionFlow, GameState, PlayerState } from '../contract/types.ts'
import type { Engine, EngineFrame } from '../engine/index.ts'

export type StageResumeState = {
  hook:
    | 'onBeforeHarvest'
    | 'onAfterReap'
    | 'afterHarvestReapReaction'
    | 'onHarvest'
    | 'onEndHarvest'
    | 'onAfterHarvest'
    | 'onBeforeStartOfTurn'
    | 'onRoundStart'
    | 'onStartHarvestFeedingPhase'
    | 'onEndTurn'
    | 'onReturnHome'
    | 'onStartReturnHome'
    | 'onAfterRoundEnd'
    | 'onRoundEnd'
    | 'onBeforeEndGame'
    | 'onStartHarvest'
    | 'onStartHarvestFieldPhase'
    | 'onHarvestFieldPhase'
    | 'onEndHarvestFieldPhase'
    | 'onHarvestFeedingPhase'
    | 'onEndHarvestFeedingPhase'
    | 'onBeforeReturnHome'
    | 'onAllWorkersPlaced'
    | 'onBreedPhase'
    | 'futureMeepleActions'
    | 'onReorganizeComplete'
  playerIndex: number
  cardIndex: number
  extra?: {
    trigger?: ReorganizeTrigger
    originPlayerIndex?: number | null
    triggerActionId?: string | null
    resumeAfterCardId?: string | null
  }
}

export type StageCardEffectHook = Extract<StageResumeState['hook'], FlowCardEffectHook>

export type StageDispatchHost = {
  getState(): GameState
  createFlowEngine(flow: ActionFlow, ownerPlayerIndex?: number): Engine
  pushEngineFrame(frame: EngineFrame): void
  popEngineFrame(): EngineFrame | undefined
  driveEngineSteps(): void
  withDeferredPrivateEventDrain(fn: () => void): void
}

export type StageContinuationTable = Record<StageResumeState['hook'], (stageResume: StageResumeState) => void>

const stageReactionHooks = new Set<StageResumeState['hook']>([
  'onStartHarvestFieldPhase',
  'onHarvestFieldPhase',
  'onEndHarvestFieldPhase',
])

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
    this.host.popEngineFrame()
    this.pendingStageSwitchFromPlayerIndex = frame.ownerPlayerIndex
    try {
      this.host.withDeferredPrivateEventDrain(() => this.resume(stageResume))
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
    if (cardIndex === 0 && stageReactionHooks.has(hook)) {
      return this.continueStageReactionHook(hook, playerIndex)
    }
    for (let currentPlayerIndex = playerIndex; currentPlayerIndex < this.state.players.length; currentPlayerIndex += 1) {
      const player = this.state.players[currentPlayerIndex]
      if (!player) continue
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
        const flow = runCardEffectHook(this.state, player, cardId, hook)
        if (!flow) continue
        this.startFlow(flow, hook, currentPlayerIndex, currentCardIndex + 1, currentPlayerIndex, {
          resumeAfterCardId: cardId,
        })
        return true
      }
    }
    return false
  }

  continueSinglePlayerStageHook(
    hook: StageCardEffectHook,
    playerIndex: number,
    cardIndex = 0,
    extra?: StageResumeState['extra'],
  ): boolean {
    const player = this.state.players[playerIndex]
    if (!player) return false
    const cards = this.getPlayerEffectCardIds(player)
    for (let currentCardIndex = cardIndex; currentCardIndex < cards.length; currentCardIndex += 1) {
      const cardId = cards[currentCardIndex]
      if (!cardId) continue
      const flow = runCardEffectHook(this.state, player, cardId, hook, undefined, {
        triggerActionId: extra?.triggerActionId ?? undefined,
      })
      if (!flow) continue
      this.startFlow(flow, hook, playerIndex, currentCardIndex + 1, playerIndex, extra)
      return true
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
    return [...player.improvements, ...player.minorPlayed, ...player.occupationPlayed]
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
  ): ActionFlow {
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
  ): ActionFlow[] {
    const children: ActionFlow[] = []
    const cards = [
      ...this.getPlayerEffectCardIds(player),
      ...this.getPlayerHandEffectCardIds(player, hook),
    ]
    for (const cardId of cards) {
      const effect = getCardEffect(cardId)
      if (!effect?.[hook]) continue
      children.push(this.buildStageEffectActivationFlow(cardId, hook, player.id, player.id))
    }
    return children
  }

  private continueStageReactionHook(
    hook: StageCardEffectHook,
    playerIndex = 0,
  ): boolean {
    for (let currentPlayerIndex = playerIndex; currentPlayerIndex < this.state.players.length; currentPlayerIndex += 1) {
      const player = this.state.players[currentPlayerIndex]
      if (!player) continue
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
