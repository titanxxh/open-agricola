import type { SoloCreationConfiguration } from '../../game-creation'

export const soloCreationConfiguration = {
  kind: 'standard-solo', maxPlayers: 1, soloHandMode: 'choose-7',
  officialCardPool: 'default-implemented-A-E', enableCommunityDeck: false,
  enableParentCards: false, draftParents: false,
  enableThroughTheSeasons: false, enableFarmersOfTheMoor: false,
  customCardIds: ['workshop-card'],
} satisfies SoloCreationConfiguration

export const invalidSoloCreationConfigurations: Array<{ name: string; value: unknown }> = [
  { name: 'null', value: null },
  { name: 'array', value: [] },
  { name: 'kind', value: { ...soloCreationConfiguration, kind: 'multiplayer' } },
  { name: 'player count', value: { ...soloCreationConfiguration, maxPlayers: 2 } },
  { name: 'hand mode', value: { ...soloCreationConfiguration, soloHandMode: 'draft' } },
  { name: 'missing hand mode', value: { ...soloCreationConfiguration, soloHandMode: undefined } },
  { name: 'official pool', value: { ...soloCreationConfiguration, officialCardPool: 'unknown' } },
  ...['enableCommunityDeck', 'enableParentCards', 'draftParents', 'enableThroughTheSeasons', 'enableFarmersOfTheMoor']
    .map(name => ({ name, value: { ...soloCreationConfiguration, [name]: 'true' } })),
  { name: 'custom card list', value: { ...soloCreationConfiguration, customCardIds: 'workshop-card' } },
  { name: 'custom card identity', value: { ...soloCreationConfiguration, customCardIds: [42] } },
]
