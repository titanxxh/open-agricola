import { afterEach, describe, it, expect } from 'vitest'
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { fixtures } from './fixtures'
import { extractCardCode, ExtractError } from './extract'
import { resetCards } from './session-helpers'
import { Driver } from './driver'

const DUMP_DIR = 'output/tmp/llm-card-gen'
const RECORDINGS_DIR = join(import.meta.dirname, 'recordings')
if (process.env.LLM_TEST_MODE === 'live' || process.env.LLM_TEST_RECORD === '1') {
  throw new Error('Historical replay never calls providers. Use the browser acceptance harness for live generation.')
}

afterEach(() => resetCards())

describe('Historical LLM card-gen [record]', () => {
  for (const fixture of fixtures) {
    it(fixture.id, async () => {
      const recPath = join(RECORDINGS_DIR, `${fixture.id}.txt`)
      if (!existsSync(recPath)) throw new Error(`Missing historical recording for ${fixture.id}`)
      const llmResponse = readFileSync(recPath, 'utf-8')

      mkdirSync(DUMP_DIR, { recursive: true })
      writeFileSync(join(DUMP_DIR, `${fixture.id}.txt`), llmResponse, 'utf-8')

      let code: string
      try {
        code = extractCardCode(llmResponse)
      } catch (err) {
        const reason = err instanceof ExtractError ? err.message : (err as Error).message
        throw new Error(`[${fixture.id}] extract failed: ${reason} (see ${DUMP_DIR}/${fixture.id}.txt)`, { cause: err })
      }

      const { session, ctx } = fixture.setup(code, { historicalRecording: true })
      const driver = new Driver(session, ctx, { historicalRecording: true })
      try {
        fixture.scenario(driver, ctx)
      } catch (err) {
        throw new Error(`[${fixture.id}] scenario threw: ${(err as Error).message} | steps: ${driver.steps.map((s) => s.label).join(' → ')} | dump: ${DUMP_DIR}/${fixture.id}.txt`, { cause: err })
      }

      const result = fixture.assert(session, ctx)
      if (!result.ok) {
        throw new Error(`[${fixture.id}] assert failed: ${result.reason} | steps: ${driver.steps.map((s) => s.label).join(' → ')} | dump: ${DUMP_DIR}/${fixture.id}.txt`)
      }
      expect(result.ok).toBe(true)
    }, 120_000)
  }
})
