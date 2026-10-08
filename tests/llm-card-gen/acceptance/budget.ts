import type { GenerationUsage } from '../../../shared/contract/workshop-generation'

// Nanodollars keep every reservation integral. The approved budget is shared
// by probes, both arms, failures and any subsequent complete batch.
export const TOTAL_BUDGET_NANO_USD = 20_000_000_000
export const PRICE_BASIS = Object.freeze({
  source: 'https://api-docs.deepseek.com/quick_start/pricing/',
  verifiedAt: '2026-10-08',
  currency: 'USD',
  documentedService: 'DeepSeek-V4.1-Flash',
  // Peak rates conservatively bound off-peak/holiday billing too.
  inputNanoUsdPerToken: 300, cachedInputNanoUsdPerToken: 6, outputNanoUsdPerToken: 1200,
  basis: 'Published peak rates; settled costs are conservative estimates, not invoices.',
})
export type Reservation = {
  id: string
  task: string
  sequence: number
  at: string
  inputBytes: number
  maxOutputTokens: number
  reservedNanoUsd: number
  settledNanoUsd?: number
  usage?: GenerationUsage
  status: 'reserved' | 'settled' | 'unknown' | 'not-posted'
}
export type BudgetState = { format: 1; limitNanoUsd: number; prices: typeof PRICE_BASIS; reservations: Reservation[] }

export class AcceptanceBudget {
  readonly state: BudgetState
  constructor(state?: BudgetState) {
    if (state && (state.format !== 1 || state.limitNanoUsd !== TOTAL_BUDGET_NANO_USD || JSON.stringify(state.prices) !== JSON.stringify(PRICE_BASIS))) {
      throw new Error('The persisted acceptance budget or verified price basis changed. Reconcile it before any paid call.')
    }
    this.state = state ? structuredClone(state) : { format: 1, limitNanoUsd: TOTAL_BUDGET_NANO_USD, prices: { ...PRICE_BASIS }, reservations: [] }
  }
  committedNanoUsd(): number {
    return this.state.reservations.reduce((total, row) => total + (row.settledNanoUsd ?? row.reservedNanoUsd), 0)
  }
  reserve(body: string, task: string, sequence: number): Reservation {
    const payload = JSON.parse(body) as { max_tokens?: number }
    return this.reserveRequest(new TextEncoder().encode(body).length, payload.max_tokens!, task, sequence)
  }
  /** The browser reports only byte counts/caps, never its opaque transcript. */
  reserveRequest(inputBytes: number, maxOutputTokens: number, task: string, sequence: number): Reservation {
    if (!Number.isInteger(maxOutputTokens) || maxOutputTokens <= 0 || maxOutputTokens > 16384) throw new Error('The request output cap is outside the frozen acceptance budget.')
    if (!Number.isSafeInteger(inputBytes) || inputBytes <= 0) throw new Error('Invalid request size')
    // UTF-8 bytes bound ordinary text tokens; reserve an additional 16K tokens
    // for role/tool protocol templates. No cache discount is assumed up front.
    const reservedNanoUsd = (inputBytes + 16384) * PRICE_BASIS.inputNanoUsdPerToken + maxOutputTokens * PRICE_BASIS.outputNanoUsdPerToken
    if (reservedNanoUsd + this.committedNanoUsd() > TOTAL_BUDGET_NANO_USD) throw new Error('US$20 acceptance budget cannot reserve this request. No provider request was sent.')
    const reservation: Reservation = { id: crypto.randomUUID(), task, sequence, at: new Date().toISOString(), inputBytes, maxOutputTokens, reservedNanoUsd, status: 'reserved' }
    this.state.reservations.push(reservation)
    return structuredClone(reservation)
  }
  settle(id: string, usage: GenerationUsage, notPosted = false): Reservation {
    const row = this.state.reservations.find(item => item.id === id)
    if (!row) throw new Error('Unknown cost reservation')
    if (row.status !== 'reserved') throw new Error('Cost reservation was already settled')
    row.usage = { ...usage }
    if (notPosted) { row.settledNanoUsd = 0; row.status = 'not-posted'; return structuredClone(row) }
    const input = usage.inputTokens
    const output = usage.outputTokens
    const cached = usage.cachedInputTokens ?? 0
    if (input === null || output === null || ![input, output, cached].every(value => Number.isSafeInteger(value) && value >= 0) || cached > input) {
      row.status = 'unknown' // Keep the entire reservation; missing is not zero.
      return structuredClone(row)
    }
    // reasoningTokens is a subset of completion_tokens, not an added charge.
    const cost = (input - cached) * PRICE_BASIS.inputNanoUsdPerToken + cached * PRICE_BASIS.cachedInputNanoUsdPerToken + output * PRICE_BASIS.outputNanoUsdPerToken
    row.settledNanoUsd = cost
    row.status = 'settled'
    if (cost > row.reservedNanoUsd) throw new Error('Provider usage exceeded its conservative reservation. Halt acceptance and reconcile the ledger.')
    return structuredClone(row)
  }
}
