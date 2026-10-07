import { afterEach, describe, it, expect } from 'vitest'
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { fixtures } from './fixtures'
import { callLLM, readApiKey, resolveLlmTestConfig } from './llm-client'
import { extractCardCode, ExtractError } from './extract'
import { resetCards } from './session-helpers'
import { Driver } from './driver'
import { CARD_DESIGNER_SYSTEM_PROMPT } from '../../client/services/llmPrompts'

const { provider: PROVIDER, model: MODEL } = resolveLlmTestConfig('code')
const DUMP_DIR = 'output/tmp/llm-card-gen'
const RECORDINGS_DIR = join(import.meta.dirname, 'recordings')
const MODE = (process.env.LLM_TEST_MODE ?? 'record') as 'record' | 'live'
const RECORD = process.env.LLM_TEST_RECORD === '1'

const apiKeyAvailable = (() => {
  try { readApiKey(PROVIDER); return true } catch { return false }
})()

// record 模式永远跑（无需 key）；live 模式无 key 才 skip。
const suiteSkip = MODE === 'live' && !apiKeyAvailable

afterEach(() => resetCards())

describe.skipIf(suiteSkip)(`Historical LLM card-gen [${MODE}${MODE === 'live' ? ` ${PROVIDER}/${MODEL}` : ''}]`, () => {
  for (const fixture of fixtures) {
    it(fixture.id, async () => {
      let llmResponse: string
      if (MODE === 'live') {
        const apiKey = readApiKey(PROVIDER)
        llmResponse = await callLLM({
          provider: PROVIDER, model: MODEL,
          systemPrompt: CARD_DESIGNER_SYSTEM_PROMPT,
          userMessage: fixture.userMessage, apiKey,
        })
        if (RECORD) {
          mkdirSync(RECORDINGS_DIR, { recursive: true })
          writeFileSync(join(RECORDINGS_DIR, `${fixture.id}.txt`), llmResponse, 'utf-8')
        }
      } else {
        const recPath = join(RECORDINGS_DIR, `${fixture.id}.txt`)
        if (!existsSync(recPath)) {
          throw new Error(`missing recording for ${fixture.id}, run test:llm:record`)
        }
        llmResponse = readFileSync(recPath, 'utf-8')
      }

      mkdirSync(DUMP_DIR, { recursive: true })
      writeFileSync(join(DUMP_DIR, `${fixture.id}.txt`), llmResponse, 'utf-8')

      let code: string
      try {
        code = extractCardCode(llmResponse)
      } catch (err) {
        const reason = err instanceof ExtractError ? err.message : (err as Error).message
        throw new Error(`[${fixture.id}] extract failed: ${reason} (see ${DUMP_DIR}/${fixture.id}.txt)`, { cause: err })
      }

      const { session, ctx } = fixture.setup(code, { historicalRecording: MODE === 'record' })
      const driver = new Driver(session, ctx, { historicalRecording: MODE === 'record' })
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
