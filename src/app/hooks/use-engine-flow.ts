import type { ActionChoiceOption, ActionSpace, GameState, PlayerState } from '../../game/types'

type EngineLike = {
  proceed: (context: {
    state: GameState
    player: PlayerState
    space: ActionSpace
  }) =>
    | { type: 'ok'; result: { type: 'ok' | 'flow' | 'choice' | 'fail'; logKey?: string } }
    | { type: 'blocked'; nodeId: string }
    | { type: 'done' }
    | {
        type: 'choice'
        nodeId: string
        choice: { options: ActionChoiceOption[]; promptKey?: string }
      }
  resolveChoice: (
    choice: string,
    context: { state: GameState; player: PlayerState; space: ActionSpace },
  ) => { type: 'ok' | 'flow' | 'choice' | 'fail'; logKey?: string; options?: ActionChoiceOption[]; promptKey?: string }
}

export type EngineProgress =
  | { type: 'choice'; choice: ActionChoiceOption[]; promptKey?: string }
  | { type: 'done' }
  | { type: 'fail'; logKey: string }
  | { type: 'reorg'; playerIndex: number; spaceId: string }

const getAnimalCount = (player: PlayerState) =>
  player.resources.sheep + player.resources.boar + player.resources.cattle

export const animalCountIncreased = (
  beforePlayerStep: PlayerState,
  currentPlayer: PlayerState,
) => getAnimalCount(currentPlayer) > getAnimalCount(beforePlayerStep)

export const runEngineStepsCore = (params: {
  engine: EngineLike
  nextState: GameState
  player: PlayerState
  targetSpace: ActionSpace
  playerIndex: number
  logAction: (nextState: GameState, player: PlayerState, targetSpace: ActionSpace, beforePlayerStep: PlayerState) => void
  clonePlayer: (player: PlayerState) => PlayerState
}): EngineProgress => {
  const { engine, nextState, player, targetSpace, playerIndex, logAction, clonePlayer } =
    params
  while (true) {
    const beforePlayerStep = clonePlayer(player)
    const step = engine.proceed({
      state: nextState,
      player,
      space: targetSpace,
    })
    if (step.type === 'blocked' || step.type === 'done') {
      return { type: 'done' }
    }
    if (step.type === 'choice') {
      if (step.choice.options.length === 1) {
        const autoChoice = step.choice.options[0]
        const autoResult = engine.resolveChoice(autoChoice.value, {
          state: nextState,
          player,
          space: targetSpace,
        })
        if (autoResult.type === 'choice') {
          return {
            type: 'choice',
            choice: autoResult.options ?? [],
            promptKey: autoResult.promptKey,
          }
        }
        if (autoResult.type === 'fail') {
          return { type: 'fail', logKey: autoResult.logKey ?? 'log.unknownError' }
        }
        logAction(nextState, player, targetSpace, beforePlayerStep)
        if (animalCountIncreased(beforePlayerStep, player)) {
          return {
            type: 'reorg',
            playerIndex,
            spaceId: targetSpace.id,
          }
        }
        continue
      }
      return {
        type: 'choice',
        choice: step.choice.options,
        promptKey: step.choice.promptKey,
      }
    }
    if (step.type === 'ok' && step.result.type === 'fail') {
      return { type: 'fail', logKey: step.result.logKey ?? 'log.unknownError' }
    }
    logAction(nextState, player, targetSpace, beforePlayerStep)
    if (animalCountIncreased(beforePlayerStep, player)) {
      return {
        type: 'reorg',
        playerIndex,
        spaceId: targetSpace.id,
      }
    }
  }
}
