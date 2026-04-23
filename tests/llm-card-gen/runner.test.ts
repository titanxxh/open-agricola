import { afterEach, describe, expect, it } from 'vitest'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fixtures } from './fixtures'
import { callLLM, readApiKey, type Provider } from './llm-client'
import { extractCardCode, ExtractError } from './extract'
import { resetCards } from './session-helpers'
import { CARD_DESIGNER_SYSTEM_PROMPT } from '../../client/services/llmPrompts'

const PROVIDER = (process.env.LLM_TEST_PROVIDER ?? 'gemini') as Provider
const MODEL = process.env.LLM_TEST_MODEL ?? 'gemini-3.1-pro-preview'
const DUMP_DIR = 'output/tmp/llm-card-gen'

const apiKeyAvailable = (() => {
  try {
    readApiKey(PROVIDER)
    return true
  } catch {
    return false
  }
})()

afterEach(() => resetCards())

describe.skipIf(!apiKeyAvailable)(`LLM card-gen [${PROVIDER}/${MODEL}]`, () => {
  for (const fixture of fixtures) {
    it(fixture.id, async () => {
      const apiKey = readApiKey(PROVIDER)

      let llmResponse: string
      try {
        llmResponse = await callLLM({
          provider: PROVIDER,
          model: MODEL,
          systemPrompt: CARD_DESIGNER_SYSTEM_PROMPT,
          userMessage: fixture.userMessage,
          apiKey,
        })
      } catch (err) {
        throw new Error(`[${fixture.id}] LLM call failed: ${(err as Error).message}`)
      }

      mkdirSync(DUMP_DIR, { recursive: true })
      writeFileSync(join(DUMP_DIR, `${fixture.id}.txt`), llmResponse, 'utf-8')

      let code: string
      try {
        code = extractCardCode(llmResponse)
      } catch (err) {
        const reason = err instanceof ExtractError ? err.message : (err as Error).message
        throw new Error(
          `[${fixture.id}] extract failed: ${reason} (see ${DUMP_DIR}/${fixture.id}.txt)`,
        )
      }

      const result = await fixture.run(code)
      if (!result.ok) {
        throw new Error(
          `[${fixture.id}] fixture failed: ${result.reason} (see ${DUMP_DIR}/${fixture.id}.txt)`,
        )
      }
      expect(result.ok).toBe(true)
    }, 120_000)
  }
})
