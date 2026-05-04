import type { ActionSpace, GameState, PlayerState, Resource } from '../../../game/types'
import type { CardListenerContext } from '../../../cards/card-listeners'

export const buildCardCostListenerContext = (
  state: GameState,
  player: PlayerState,
  actionId: string,
): CardListenerContext => {
  const emptySpace: ActionSpace = {
    id: '',
    nameKey: '',
    descriptionKey: '',
    roundAvailable: 1,
    gainPerRound: {},
    canBeExecutedByPlayer: () => true,
    execute: () => ({ type: 'ok' as const }),
    resources: {} as Resource,
    takenBy: [],
  }

  return {
    state,
    player,
    space: emptySpace,
    actionId,
    phase: 'computeCosts',
  }
}
