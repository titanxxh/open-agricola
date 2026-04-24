import type { GameSession } from '../../../server/game/authoritative-session'
import type { CustomCardData } from '../../../shared/cards/custom-registry'

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
  trigger: (session: GameSession, ctx: FixtureContext) => TriggerResult
  assert: (session: GameSession, ctx: FixtureContext, result: TriggerResult) => FixtureResult
}
