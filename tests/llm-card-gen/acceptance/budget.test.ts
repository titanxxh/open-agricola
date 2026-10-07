import { describe, expect, it } from 'vitest'
import { AcceptanceBudget, PRICE_BASIS, TOTAL_BUDGET_NANO_USD } from './budget'

const request = JSON.stringify({ model: 'deepseek-flash', max_tokens: 16384, messages: [{ role: 'user', content: 'Request' }] })
const unknown = { inputTokens: null, outputTokens: null, cachedInputTokens: null, reasoningTokens: null }

describe('shared paid acceptance budget', () => {
  it('charges cache hits once and includes reasoning inside output usage', () => {
    const ledger = new AcceptanceBudget()
    const row = ledger.reserve(request, 'probe', 1)
    const result = ledger.settle(row.id, { inputTokens: 100, outputTokens: 50, cachedInputTokens: 80, reasoningTokens: 40 })
    expect(result.settledNanoUsd).toBe(20 * PRICE_BASIS.inputNanoUsdPerToken + 80 * PRICE_BASIS.cachedInputNanoUsdPerToken + 50 * PRICE_BASIS.outputNanoUsdPerToken)
    expect(ledger.committedNanoUsd()).toBe(result.settledNanoUsd)
  })
  it('retains reservations after an interrupted request and across runner restarts', () => {
    const ledger = new AcceptanceBudget()
    const row = ledger.reserve(request, 'new/M2/1', 1)
    ledger.settle(row.id, unknown)
    const restored = new AcceptanceBudget(JSON.parse(JSON.stringify(ledger.state)))
    expect(restored.committedNanoUsd()).toBe(row.reservedNanoUsd)
    expect(restored.state.reservations[0].status).toBe('unknown')
    expect(() => restored.settle(row.id, unknown)).toThrow('already settled')
  })
  it('stops before exceeding US$5 without deleting prior failed or unknown calls', () => {
    const ledger = new AcceptanceBudget()
    for (let i = 0; i < 1000; i++) {
      try { ledger.reserve(request, `attempt-${i}`, 1) } catch { break }
    }
    const committed = ledger.committedNanoUsd()
    expect(committed).toBeLessThanOrEqual(TOTAL_BUDGET_NANO_USD)
    expect(committed).toBeGreaterThan(TOTAL_BUDGET_NANO_USD * 0.99)
    expect(() => ledger.reserve(request, 'blocked', 1)).toThrow('No provider request')
    expect(ledger.committedNanoUsd()).toBe(committed)
  })
  it('releases only a provably unissued POST', () => {
    const ledger = new AcceptanceBudget()
    const row = ledger.reserve(request, 'preflight-abort', 1)
    ledger.settle(row.id, unknown, true)
    expect(ledger.committedNanoUsd()).toBe(0)
    expect(ledger.state.reservations).toHaveLength(1)
  })
})
