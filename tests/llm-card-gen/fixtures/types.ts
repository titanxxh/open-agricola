import type { GameSession } from '../../../server/game/authoritative-session'
import type { CustomCardData } from '../../../shared/cards/custom-registry'
import type { Driver } from '../driver'

export interface FixtureContext {
  cardId: string
  cardData: CustomCardData
  manifest: any
  [k: string]: unknown
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
  scenario: (driver: Driver, ctx: FixtureContext) => void
  assert: (session: GameSession, ctx: FixtureContext) => FixtureResult
}
