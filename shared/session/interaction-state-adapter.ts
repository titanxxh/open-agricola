import type {
  ActionChoiceOption,
  AnytimeAction,
  InteractionAnimalReorgZone,
  InteractionCommand,
  InteractionFarmSelection,
  InteractionSelection,
  InteractionState,
  PlayerState,
  GameState,
} from '../contract/types'
import type { EngineFrame, EngineStack } from '../engine'
import type { PendingView } from '../engine/types'
import type { AnytimePolicy } from './anytime-policy'
import { hasPendingOrdinaryCardDrawChoice } from './ordinary-card-draw'

type AnytimeEntry = { descriptor: AnytimeAction }

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
  animalReorgZones: (player: PlayerState) => InteractionAnimalReorgZone[]
  isSelectionPrompt: (promptKey?: string) => boolean
  buildSelectionInteraction: (player: PlayerState) => InteractionSelection
  buildFarmInteraction: (
    promptKey: string | undefined,
    player: PlayerState,
  ) => InteractionFarmSelection | null
}

const choicesSourceCard = (choices: ActionChoiceOption[]): string | undefined => {
  const sourceCards = choices
    .map((choice) => choice.sourceCard)
    .filter((sourceCard): sourceCard is string => typeof sourceCard === 'string' && sourceCard.length > 0)
  const unique = [...new Set(sourceCards)]
  return unique.length === 1 && sourceCards.length === choices.length ? unique[0] : undefined
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
  animalReorgZones,
  isSelectionPrompt,
  buildSelectionInteraction,
  buildFarmInteraction,
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
  const costOverride = view.costOverride
  const player = state.players[playerIndex]

  const policy = getAnytimePolicy()
  const anytimeEntries = policy.allowed ? getAnytimeEntries() : []
  const includeAnytimeCmd = policy.allowed && anytimeEntries.length > 0
  const buildCmds = (
    base: ReadonlyArray<InteractionCommand>,
  ): InteractionCommand[] => {
    const commands: InteractionCommand[] = includeAnytimeCmd ? [...base, 'takeAnytimeAction'] : [...base]
    return filterUndoCommands(commands)
  }
  const anytimeDescriptors = anytimeEntries.map((entry) => entry.descriptor)

  switch (request.kind) {
    case 'animal-reorg':
      return {
        stateId: 'wait',
        playerIndex,
        spaceId,
        promptKey,
        promptParams,
        sourceCard,
        request,
        options: choiceOptions,
        zones: player ? animalReorgZones(player) : [],
        allowedCommands: buildCmds(['resolveChoice', 'undoStep', 'undoAction']),
        anytimeActions: anytimeDescriptors,
      }
    case 'confirm-next-player':
      return {
        stateId: 'wait',
        playerIndex,
        spaceId,
        promptKey,
        promptParams,
        sourceCard,
        request,
        nextPlayerIndex: request.nextPlayerIndex,
        allowedCommands: buildCmds(['resolveChoice', 'undoStep', 'undoAction']),
        anytimeActions: anytimeDescriptors,
      }
    case 'confirm-player-switch':
      return {
        stateId: 'wait',
        playerIndex,
        spaceId,
        promptKey,
        promptParams,
        sourceCard,
        request,
        fromPlayerIndex: request.fromPlayerIndex,
        toPlayerIndex: request.toPlayerIndex,
        allowedCommands: buildCmds(['resolveChoice', 'undoStep', 'undoAction']),
        anytimeActions: anytimeDescriptors,
      }
    case 'feed':
      return {
        stateId: 'wait',
        playerIndex,
        spaceId,
        promptKey,
        promptParams,
        sourceCard,
        request,
        remaining: request.remaining,
        foodUsed: request.foodUsed,
        feedQueue: request.feedQueue,
        allowedCommands: buildCmds(['resolveChoice', 'undoStep', 'undoAction']),
        anytimeActions: anytimeDescriptors,
      }
    case 'heating':
      return {
        stateId: 'wait',
        playerIndex,
        spaceId,
        promptKey,
        promptParams,
        sourceCard,
        request,
        allowedCommands: buildCmds(['resolveChoice', 'undoStep', 'undoAction']),
        anytimeActions: anytimeDescriptors,
      }
    case 'farm-select':
      return {
        stateId: 'wait',
        playerIndex,
        spaceId,
        promptKey,
        promptParams,
        sourceCard,
        request,
        options: choiceOptions,
        costOverride,
        farm: request.farm,
        allowedCommands: buildCmds(['commitSelection', 'undoStep', 'undoAction']),
        anytimeActions: anytimeDescriptors,
      }
    case 'resource-quantity-select':
    case 'resource-batch-exchange-select':
      return {
        stateId: 'wait',
        playerIndex,
        spaceId,
        promptKey,
        promptParams,
        sourceCard,
        request,
        options: choiceOptions,
        costOverride,
        allowedCommands: buildCmds(['commitSelection', 'undoStep', 'undoAction']),
        anytimeActions: anytimeDescriptors,
      }
    case 'select-trigger':
      return {
        stateId: 'wait',
        playerIndex,
        spaceId,
        promptKey,
        promptParams,
        sourceCard,
        request,
        options: choiceOptions,
        allowedCommands: buildCmds(['resolveChoice', 'undoStep', 'undoAction']),
        anytimeActions: anytimeDescriptors,
      }
    case 'card-draft':
      return {
        stateId: 'wait',
        playerIndex,
        spaceId,
        promptKey,
        promptParams,
        sourceCard,
        request,
        options: choiceOptions,
        allowedCommands: buildCmds(['undoStep', 'undoAction']),
        anytimeActions: anytimeDescriptors,
      }
    case 'engine-blocked':
      return {
        stateId: 'wait',
        playerIndex,
        spaceId,
        promptKey: request.reasonKey ?? promptKey ?? 'ui.interactionEngineBlocked',
        promptParams,
        sourceCard,
        request,
        options: [],
        allowedCommands: filterUndoCommands(['undoStep', 'undoAction']),
        anytimeActions: [],
      }
    case 'choice':
    default: {
      if (pendingHost && isSelectionPrompt(promptKey) && player) {
        return {
          stateId: 'wait',
          playerIndex,
          spaceId,
          promptKey,
          promptParams,
          sourceCard,
          request,
          options: choiceOptions,
          costOverride,
          selection: buildSelectionInteraction(player),
          allowedCommands: buildCmds(['commitSelection', 'undoStep', 'undoAction']),
          anytimeActions: anytimeDescriptors,
        }
      }
      const farm = pendingHost && player ? buildFarmInteraction(promptKey, player) : null
      const allowedCommands: InteractionCommand[] = farm
        ? buildCmds(['commitSelection', 'undoStep', 'undoAction'])
        : buildCmds(['resolveChoice', 'undoStep', 'undoAction'])
      if (farm) {
        return {
          stateId: 'wait',
          playerIndex,
          spaceId,
          promptKey,
          promptParams,
          sourceCard,
          request,
          options: choiceOptions,
          costOverride,
          farm,
          allowedCommands,
          anytimeActions: anytimeDescriptors,
        }
      }
      return {
        stateId: 'wait',
        playerIndex,
        spaceId,
        promptKey,
        promptParams,
        sourceCard,
        request,
        options: choiceOptions,
        costOverride,
        allowedCommands,
        anytimeActions: anytimeDescriptors,
      }
    }
  }
}
