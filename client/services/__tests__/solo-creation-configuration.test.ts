import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { invalidSoloCreationConfigurations, soloCreationConfiguration } from '../../../shared/contract/__tests__/fixtures/solo-creation-configuration'

beforeEach(() => vi.stubGlobal('window', { location: { hostname: 'localhost' } }))
afterEach(() => vi.unstubAllGlobals())
const respond = (value: unknown, status = 200) => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(value), { status })))
}

it('reads the private owner response using no-store and credentials', async () => {
  const { readSoloCreationConfiguration } = await import('../solo-creation-configuration')
  respond({ ok: true, configuration: soloCreationConfiguration, issues: [] })
  await expect(readSoloCreationConfiguration('completed/source')).resolves.toEqual({
    ok: true, configuration: soloCreationConfiguration, issues: [],
  })
  expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/completed%2Fsource/creation-configuration'), {
    credentials: 'include', cache: 'no-store', signal: undefined,
  })
})

it.each(invalidSoloCreationConfigurations)('rejects an invalid owner configuration: $name', async ({ value }) => {
  const { readSoloCreationConfiguration } = await import('../solo-creation-configuration')
  respond({ ok: true, configuration: value, issues: [] })
  await expect(readSoloCreationConfiguration('completed')).rejects.toThrow('Creation configuration response unavailable')
})

it.each([
  { status: 503, issues: [] },
  { status: 200, issues: [{ workshopCardId: 'workshop-card', reason: 'unknown' }] },
])('rejects an invalid HTTP response independently from the configuration: $status / $issues', async ({ status, issues }) => {
  const { readSoloCreationConfiguration } = await import('../solo-creation-configuration')
  respond({ ok: true, configuration: soloCreationConfiguration, issues }, status)
  await expect(readSoloCreationConfiguration('completed')).rejects.toThrow('Creation configuration response unavailable')
})

it('preserves a typed authorization failure without requiring a configuration', async () => {
  const { readSoloCreationConfiguration } = await import('../solo-creation-configuration')
  respond({ ok: false, code: 'not_participant', message: 'Original participant required' }, 403)
  await expect(readSoloCreationConfiguration('completed')).resolves.toEqual({
    ok: false, code: 'not_participant', message: 'Original participant required',
  })
})
