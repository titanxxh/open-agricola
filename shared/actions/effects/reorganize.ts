import type { ActionDefinition } from '../../game/types'

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
