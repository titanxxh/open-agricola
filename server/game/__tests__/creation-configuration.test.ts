import { expect, it } from 'vitest'
import { invalidSoloCreationConfigurations, soloCreationConfiguration } from '../../../shared/contract/__tests__/fixtures/solo-creation-configuration'
import { parseGameCreationRecord } from '../creation-configuration'

const sources = [{ workshopCardId: 'workshop-card', logicalCardId: 'CUSTOM_Test', approvedVersionId: 'version-1' }]
const record = (configuration: unknown) => JSON.stringify({ configuration, resolvedWorkshopSources: sources })

it('round trips the accepted team creation choices without storing any rule state', () => {
  const configuration = { ...soloCreationConfiguration, kind: 'team', maxPlayers: 4,
    teamConfig: { mode: 'multihand', seatsPerTeam: 2, seating: 'random', scoring: 'sum' },
    draftMode: 'simultaneous', draftPoolSize: 8, enableSnakeOpening: true, allowIncompleteFarmersOfTheMoorMinorDeal: false,
  }
  Reflect.deleteProperty(configuration, 'soloHandMode')
  expect(parseGameCreationRecord(record(configuration))).toEqual({ configuration, resolvedWorkshopSources: sources })
  expect(parseGameCreationRecord(record({ ...configuration, maxPlayers: 2 }))).toBeNull()
})

it('reads the accepted configuration with its resolved source record', () => {
  expect(parseGameCreationRecord(record(soloCreationConfiguration))).toEqual({
    configuration: soloCreationConfiguration, resolvedWorkshopSources: sources,
  })
})

it.each(invalidSoloCreationConfigurations)('rejects an invalid stored configuration: $name', ({ value }) => {
  expect(parseGameCreationRecord(record(value))).toBeNull()
})

it.each(['{', '{}', JSON.stringify({ configuration: soloCreationConfiguration, resolvedWorkshopSources: [{ workshopCardId: 'only-one-field' }] })])(
  'rejects an invalid creation record independently from the configuration', json => {
    expect(parseGameCreationRecord(json)).toBeNull()
  },
)
