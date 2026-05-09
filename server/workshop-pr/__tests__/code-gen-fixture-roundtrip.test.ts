import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { generateDisplayFile, generateImplFile } from '../code-gen'

const FIXTURE_WCARD = {
  id: 'fixture',
  card_id: 'CUSTOM_FixtureHarvester',
  card_type: 'minor',
  author_name: 'fixture',
  effect_code: `const CARD_ID = 'CUSTOM_FixtureHarvester'
const CARD_DEF = new MinorImprovement({ id: CARD_ID, name: 'Fixture Harvester', deck: 'community', number: 0, desc: ['Each harvest, gain 1 <FOOD>. (Community deck fixture card; not a real card.)'], cost: { wood: 1 }, vp: 0 })
const CARD_IMPL = { effect: { id: CARD_ID, onHarvest: () => ({ type: 'leaf', actionId: 'gain', params: { food: 1 }, sourceCard: CARD_ID }) } }`,
  card_json: JSON.stringify({ name: 'Fixture Harvester' }),
}

const REPO_ROOT = resolve(__dirname, '../../..')

const stripSubmittedLine = (s: string) =>
  s.split('\n').filter((l) => !l.startsWith('// Submitted:')).join('\n')

describe('CUSTOM_FixtureHarvester roundtrip — generator output ↔ on-disk fixture', () => {
  it('display file is byte-equal to generator output (modulo // Submitted: ISO line)', () => {
    const generated = generateDisplayFile(FIXTURE_WCARD, { githubLogin: 'fixture', iso: '__SUBMITTED__' })
    const onDisk = readFileSync(
      resolve(REPO_ROOT, 'shared/cards-display/community/CUSTOM_FixtureHarvester.ts'),
      'utf-8',
    )
    expect(stripSubmittedLine(generated)).toBe(stripSubmittedLine(onDisk))
  })

  it('impl file is byte-equal to generator output (modulo // Submitted: ISO line)', () => {
    const generated = generateImplFile(FIXTURE_WCARD, { githubLogin: 'fixture', iso: '__SUBMITTED__' })
    const onDisk = readFileSync(
      resolve(REPO_ROOT, 'shared/cards/community/CUSTOM_FixtureHarvester.ts'),
      'utf-8',
    )
    expect(stripSubmittedLine(generated)).toBe(stripSubmittedLine(onDisk))
  })
})
