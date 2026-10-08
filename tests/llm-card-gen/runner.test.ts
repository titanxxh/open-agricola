import { afterEach, describe, it, expect } from 'vitest'
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fixtures } from './fixtures'
import { extractCardCode, ExtractError } from './extract'
import { resetCards } from './session-helpers'
import { Driver } from './driver'

const DUMP_DIR = 'output/tmp/llm-card-gen'
const RECORDINGS_DIR = join(import.meta.dirname, 'recordings')
// Generated sources run through exactly the same fixed cases as recordings.
// A manifest only selects source files; it cannot supply or change assertions.
const sourceManifest = process.env.LLM_TEST_SOURCES
const generated: Array<{ id: string; fixtureId: string; sourcePath: string }> | undefined = sourceManifest !== undefined
  ? JSON.parse(readFileSync(sourceManifest, 'utf8')) : undefined
if (sourceManifest !== undefined && (!Array.isArray(generated) || generated.length === 0)) throw new Error('Generated source manifest must contain fixed cases')
const cases = generated
  ? generated.map(item => {
      const fixture = fixtures.find(fixture => fixture.id === item.fixtureId)
      if (!fixture) throw new Error(`Unknown fixed case: ${item.fixtureId}`)
      return { ...item, fixture, sourcePath: resolve(dirname(resolve(sourceManifest!)), item.sourcePath) }
    })
  : fixtures.map(fixture => ({ id: fixture.id, fixture, sourcePath: join(RECORDINGS_DIR, `${fixture.id}.txt`) }))
if (process.env.LLM_TEST_MODE === 'live' || process.env.LLM_TEST_RECORD === '1') {
  throw new Error('Historical replay never calls providers. Use the browser acceptance harness for live generation.')
}

afterEach(() => resetCards())

describe(`Fixed LLM card cases [${generated ? 'generated' : 'record'}]`, () => {
  for (const { id, fixture, sourcePath } of cases) {
    it(id, () => {
      if (!existsSync(sourcePath)) throw new Error(`Missing source for ${id}: ${sourcePath}`)
      const llmResponse = readFileSync(sourcePath, 'utf-8')

      mkdirSync(DUMP_DIR, { recursive: true })
      writeFileSync(join(DUMP_DIR, `${id.replaceAll('/', '-')}.txt`), llmResponse, 'utf-8')

      let code: string
      try {
        code = generated ? llmResponse : extractCardCode(llmResponse)
      } catch (err) {
        const reason = err instanceof ExtractError ? err.message : (err as Error).message
        throw new Error(`[${fixture.id}] extract failed: ${reason} (see ${DUMP_DIR}/${fixture.id}.txt)`, { cause: err })
      }

      const { session, ctx } = fixture.setup(code, { historicalRecording: !generated })
      const driver = new Driver(session, ctx, { historicalRecording: !generated })
      try {
        fixture.scenario(driver, ctx)
        const result = fixture.assert(session, ctx)
        expect(result.ok, result.reason).toBe(true)
        expect(driver.steps.length).toBeGreaterThan(0)
        expect(driver.steps.every(step => step.ok)).toBe(true)
      } catch (err) {
        throw new Error(`[${fixture.id}] scenario threw: ${(err as Error).message} | steps: ${driver.steps.map((s) => s.label).join(' → ')} | dump: ${DUMP_DIR}/${fixture.id}.txt`, { cause: err })
      } finally { session.dispose() }
    }, 120_000)
  }
})
