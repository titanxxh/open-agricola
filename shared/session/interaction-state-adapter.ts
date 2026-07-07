import type {
  ActionChoiceOption,
  AnytimeAction,
  InteractionCommand,
  InteractionRequest,
  InteractionState,
  PlayerState,
  GameState,
} from '../contract/types'
import type { ClientInteractionState } from '../contract/protocol/game'
import type { EngineFrame, EngineStack } from '../engine'
import type { PendingView } from '../engine/types'
import type { AnytimePolicy } from './anytime-policy'
import { waitInteractionCommandsWithUndo } from './interaction-command-policy'
import { hasPendingOrdinaryCardDrawChoice } from './ordinary-card-draw'

type AnytimeEntry = { descriptor: AnytimeAction }

export type PendingInteractionProjectionInput = {
  request: InteractionRequest
  player: PlayerState | undefined
  playerIndex: number
  promptKey?: string
  promptParams?: Record<string, unknown>
  sourceCard?: string
  choiceOptions: ActionChoiceOption[]
  hasPendingHost: boolean
}

export type InteractionStateAdapterInput = {
  state: GameState
  engineStack: EngineStack
  getAnytimeEntries: () => AnytimeEntry[]
  getAnytimePolicy: () => AnytimePolicy
  filterUndoCommands: (commands: readonly InteractionCommand[]) => InteractionCommand[]
  winnerIds: () => string[]
  scoreSummary: () => Array<{ playerId: string; total: number }>
  effectiveOwnerIndexForFrame: (
    frame: EngineFrame,
    nodeId?: string | null,
    pending?: Pick<PendingView, 'effectiveOwnerPlayerId'> | null,
  ) => number
  projectPendingRequest: (input: PendingInteractionProjectionInput) => InteractionRequest
}

const choicesSourceCard = (choices: ActionChoiceOption[]): string | undefined => {
  const sourceCards = choices
    .map((choice) => choice.sourceCard)
    .filter((sourceCard): sourceCard is string => typeof sourceCard === 'string' && sourceCard.length > 0)
  const unique = [...new Set(sourceCards)]
  return unique.length === 1 && sourceCards.length === choices.length ? unique[0] : undefined
}

const requestWithChoices = (request: InteractionRequest, choices: ActionChoiceOption[]): InteractionRequest => {
  if (choices.length === 0) return request
  if (request.kind === 'choice') return { ...request, options: choices }
  if (request.kind === 'select-trigger') return { ...request, options: choices }
  if (request.kind === 'farm-select') return { ...request, options: choices }
  if (request.kind === 'selection') return { ...request, options: choices }
  return request
}

export const interactionRecipientPlayerId = (
  interaction: InteractionState,
  playerIds: readonly string[],
): string | null =>
  interaction.stateId === 'wait' && typeof interaction.playerIndex === 'number'
    ? playerIds[interaction.playerIndex] ?? null
    : null

export const redactInteractionForViewer = (
  interaction: InteractionState,
  playerIds: readonly string[],
  viewerPlayerId: string | null,
): ClientInteractionState => {
  if (interaction.stateId !== 'wait') return interaction
  const recipient = interactionRecipientPlayerId(interaction, playerIds)
  if (recipient !== null && recipient === viewerPlayerId) return interaction
  if (recipient === null) return interaction
  return {
    stateId: 'wait',
    playerIndex: interaction.playerIndex,
    sourceCard: interaction.sourceCard,
    promptKey: interaction.promptKey,
    request: {
      kind: 'private-prompt',
      playerIndex: interaction.playerIndex,
      promptKind: interaction.request.kind,
      sourceCard: interaction.sourceCard,
      promptKey: interaction.promptKey,
    },
    allowedCommands: [],
    anytimeActions: [],
  }
}

export const deriveInteractionState = ({
  state,
  engineStack,
  getAnytimeEntries,
  getAnytimePolicy,
  filterUndoCommands,
  winnerIds,
  scoreSummary,
  effectiveOwnerIndexForFrame,
  projectPendingRequest,
}: InteractionStateAdapterInput): InteractionState => {
  if (state.gameOver) {
    return {
      stateId: 'gameover',
      winners: winnerIds(),
      scores: scoreSummary(),
      allowedCommands: [],
      anytimeActions: [],
    }
  }

  const frame = engineStack.current()
  const view = engineStack.peekPendingView()
  const cursor = engineStack.peekPendingCursor()
  const pendingHost = engineStack.peekPendingHost()

  if (!frame || !view || !cursor) {
    const anytimeActions = getAnytimeEntries().map((entry) => entry.descriptor)
    const baseCommands: InteractionCommand[] = hasPendingOrdinaryCardDrawChoice(state)
      ? ['undoStep', 'undoAction']
      : anytimeActions.length > 0
        ? ['takeAction', 'undoStep', 'undoAction', 'takeAnytimeAction']
        : ['takeAction', 'undoStep', 'undoAction']
    return {
      stateId: 'idle',
      allowedCommands: filterUndoCommands(baseCommands),
      anytimeActions,
    }
  }

  const playerIndex = effectiveOwnerIndexForFrame(frame, cursor.hostNodeId, view)
  const spaceId = frame.spaceId
  const promptKey = view.promptKey
  const promptParams = view.promptParams
  const request = view.request
  const choiceOptions = view.choices ?? []
  const sourceCard = view.sourceCard ?? choicesSourceCard(choiceOptions)
  const player = state.players[playerIndex]
  const projectedRequest = requestWithChoices(
    projectPendingRequest({
      request,
      player,
      playerIndex,
      promptKey,
      promptParams,
      sourceCard,
      choiceOptions,
      hasPendingHost: !!pendingHost,
    }),
    choiceOptions,
  )

  const policy = getAnytimePolicy()
  const anytimeEntries = policy.allowed ? getAnytimeEntries() : []
  const includeAnytimeCmd = policy.allowed && anytimeEntries.length > 0
  const buildWaitCmds = (
    kind: InteractionRequest['kind'],
    options: { allowAnytime?: boolean } = {},
  ): InteractionCommand[] =>
    filterUndoCommands(waitInteractionCommandsWithUndo(kind, {
      includeAnytimeAction: (options.allowAnytime ?? true) && includeAnytimeCmd,
    }))
  const anytimeDescriptors = anytimeEntries.map((entry) => entry.descriptor)

  if (request.kind === 'engine-blocked') {
    return {
      stateId: 'wait',
      playerIndex,
      spaceId,
      promptKey: request.reasonKey ?? promptKey ?? 'ui.interactionEngineBlocked',
      promptParams,
      sourceCard,
      request: projectedRequest,
      allowedCommands: buildWaitCmds(request.kind, { allowAnytime: false }),
      anytimeActions: [],
    }
  }

  return {
    stateId: 'wait',
    playerIndex,
    spaceId,
    promptKey,
    promptParams,
    sourceCard,
    request: projectedRequest,
    allowedCommands: buildWaitCmds(projectedRequest.kind),
    anytimeActions: anytimeDescriptors,
  }
}
