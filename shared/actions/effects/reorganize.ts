import type { ActionDefinition, ActionExecutionResult, PlayerState } from '../../game/types'

export const reorganize = (player: PlayerState): ActionExecutionResult => {
  void player
  return { type: 'ok' }
}

export const anytimeReorgAction: ActionDefinition = {
  id: 'anytime-reorg',
  nameKey: 'actions.anytime-reorg.name',
  descriptionKey: 'actions.anytime-reorg.description',
  roundAvailable: 1,
  gainPerRound: {},
  anytime: true,
  canBeExecutedByPlayer: (_, player) =>
    player.pastures.length > 0 || Object.keys(player.stableAnimals ?? {}).length > 0,
  execute: () => ({
    type: 'animalReorg',
    sourceId: 'anytime-reorg',
  }),
}
