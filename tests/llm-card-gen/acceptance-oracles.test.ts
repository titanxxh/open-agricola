import { afterEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { fixtures } from './fixtures'
import { extractCardCode } from './extract'
import { Driver } from './driver'
import { resetCards } from './session-helpers'

afterEach(resetCards)

function check(id: string, transform = (source: string) => source, cattle?: number) {
  const fixture = fixtures.find(item => item.id === id)!
  const recorded = readFileSync(new URL(`./recordings/${id}.txt`, import.meta.url), 'utf8')
  // Test-owned mutations of historical recordings prove the oracle rejects
  // known defects. These are never reported as unedited model generations.
  const { session, ctx } = fixture.setup(transform(extractCardCode(recorded)), { historicalRecording: true, cattle })
  try {
    fixture.scenario(new Driver(session, ctx), ctx)
    return fixture.assert(session, ctx)
  } finally {
    session.dispose()
  }
}

describe('browser acceptance oracle counterexamples', () => {
  it.each([1, 2, 4, 6])('checks actual final scoring with %i starting cattle', cattle => {
    expect(check('M4-endgame-vp', undefined, cattle).ok).toBe(true)
  })
  it('rejects a constant score that happened to match the old single case', () => {
    expect(check('M4-endgame-vp', source => source.replace('Math.floor(cattle / 2)', '2'), 2).ok).toBe(false)
  })
  it('rejects counting fishing even if later counts could appear plausible', () => {
    expect(() => check('M6-cardstate-counter', source => source.replace("'reed-bank'].includes", "'reed-bank', 'fishing'].includes")))
      .toThrow(/fishing/)
  })
  it('rejects a reusable ability after replenishing its payment resource', () => {
    expect(check('M7-anytime-ability', source => source.replace('if (used) return', 'if (false) return')).ok).toBe(false)
  })
  it('rejects a delayed reward in the wrong round', () => {
    expect(() => check('M9-future-meeple', source => source.replace('state.round + 1', 'state.round + 2')))
      .toThrow(/next-round/)
  })
  it('checks exact delivery and cleanup across two round boundaries', () => {
    expect(check('M9-future-meeple').ok).toBe(true)
  })
  it('pins the rendered legacy control independently of changing runtime tables', () => {
    const prompt = readFileSync(new URL('./control/full-prompt.txt', import.meta.url))
    const manifest = JSON.parse(readFileSync(new URL('./control/manifest.json', import.meta.url), 'utf8'))
    expect(prompt.byteLength).toBe(manifest.bytes)
    expect(createHash('sha256').update(prompt).digest('hex')).toBe(manifest.sha256)
  })
})
