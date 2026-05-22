import type { GameSession } from '../../../server/game/authoritative-session'
import type { CustomCardData } from '../../../shared/cards/custom-registry'
import type { Driver } from '../driver'

export interface FixtureContext {
  cardId: string
  cardData: CustomCardData
  manifest: any
  [k: string]: unknown
}

export interface TriggerStep {
  label: string
  resp?: unknown
}

export interface TriggerResult {
  steps: TriggerStep[]
}

export interface FixtureResult {
  ok: boolean
  reason?: string
}

export interface CardFixture {
  id: string
  cardId: string
  cardType: 'minor' | 'occupation'
  userMessage: string
  setup: (llmGeneratedCode: string) => { session: GameSession; ctx: FixtureContext }
  /** 旧结构，迁移期保留。Task 12 收尾删除。 */
  trigger?: (session: GameSession, ctx: FixtureContext) => TriggerResult
  /** 新结构：调 driver 原语。迁移期 optional，Task 12 收尾改必填。 */
  scenario?: (driver: Driver, ctx: FixtureContext) => void
  assert: (session: GameSession, ctx: FixtureContext, result?: TriggerResult) => FixtureResult
}
