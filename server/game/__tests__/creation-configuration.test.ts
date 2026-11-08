import { expect, it } from 'vitest'
import { invalidSoloCreationConfigurations, soloCreationConfiguration } from '../../../shared/contract/__tests__/fixtures/solo-creation-configuration'
import { parseGameCreationRecord } from '../creation-configuration'

const sources = [{ workshopCardId: 'workshop-card', logicalCardId: 'CUSTOM_Test', approvedVersionId: 'version-1' }]
const record = (configuration: unknown) => JSON.stringify({ configuration, resolvedWorkshopSources: sources })

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
