import { afterEach, describe, expect, it } from 'vitest'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fixtures } from './fixtures'
import { callLLM, readApiKey, resolveLlmTestConfig } from './llm-client'
import { extractCardCode, ExtractError } from './extract'
import { resetCards } from './session-helpers'
import { CARD_DESIGNER_SYSTEM_PROMPT } from '../../client/services/llmPrompts'
import type { TriggerResult, FixtureContext } from './fixtures/types'
import type { GameSession } from '../../server/game/authoritative-session'

const { provider: PROVIDER, model: MODEL } = resolveLlmTestConfig('code')
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
      const llmResponse = await callLLM({
        provider: PROVIDER,
        model: MODEL,
        systemPrompt: CARD_DESIGNER_SYSTEM_PROMPT,
        userMessage: fixture.userMessage,
        apiKey,
      })

      mkdirSync(DUMP_DIR, { recursive: true })
      writeFileSync(join(DUMP_DIR, `${fixture.id}.txt`), llmResponse, 'utf-8')

      let code: string
      try {
        code = extractCardCode(llmResponse)
      } catch (err) {
        const reason = err instanceof ExtractError ? err.message : (err as Error).message
        throw new Error(`[${fixture.id}] extract failed: ${reason} (see ${DUMP_DIR}/${fixture.id}.txt)`)
      }

      if (typeof (fixture as any).setup !== 'function') {
        throw new Error(
          `[${fixture.id}] fixture not yet migrated to setup/trigger/assert shape (see plan §Task 2-6)`,
        )
      }
      let setupResult: { session: GameSession; ctx: FixtureContext }
      try {
        setupResult = fixture.setup(code)
      } catch (err) {
        throw new Error(`[${fixture.id}] setup failed: ${(err as Error).message} (see ${DUMP_DIR}/${fixture.id}.txt)`)
      }
      const { session, ctx } = setupResult

      let triggerResult: TriggerResult
      try {
        triggerResult = fixture.trigger(session, ctx)
      } catch (err) {
        throw new Error(`[${fixture.id}] trigger failed: ${(err as Error).message} (see ${DUMP_DIR}/${fixture.id}.txt)`)
      }

      const assertResult = fixture.assert(session, ctx, triggerResult)
      if (!assertResult.ok) {
        const stepsLabel = triggerResult.steps.map((s) => s.label).join(' → ')
        throw new Error(
          `[${fixture.id}] assert failed: ${assertResult.reason} | trigger: ${stepsLabel} | dump: ${DUMP_DIR}/${fixture.id}.txt`,
        )
      }
      expect(assertResult.ok).toBe(true)
    }, 120_000)
  }
})
