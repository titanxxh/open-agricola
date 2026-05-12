import { describe, expect, it } from 'vitest'
import { computeAnytimePolicy } from '../anytime-policy'
import type { AnytimePolicyInput } from '../anytime-policy'

const base = (over: Partial<AnytimePolicyInput> = {}): AnytimePolicyInput => ({
  hasActiveContext: true,
  stageResume: null,
  interactionKind: undefined,
  promptKey: undefined,
  ...over,
})

describe('computeAnytimePolicy', () => {
  it('rule 1 — no active context → blocked', () => {
    expect(computeAnytimePolicy(base({ hasActiveContext: false })))
      .toEqual({ allowed: false, reason: 'no-active-interaction' })
  })

  it('rule 2 — feed → blocked', () => {
    expect(computeAnytimePolicy(base({ interactionKind: 'feed' })))
      .toEqual({ allowed: false, reason: 'feed-window-locked' })
  })

  it('rule 3 — confirm-next-player → blocked', () => {
    expect(computeAnytimePolicy(base({ interactionKind: 'confirm-next-player' })))
      .toEqual({ allowed: false, reason: 'confirm-window' })
  })

  it('rule 3 — confirm-player-switch → blocked', () => {
    expect(computeAnytimePolicy(base({ interactionKind: 'confirm-player-switch' })))
      .toEqual({ allowed: false, reason: 'confirm-window' })
  })

  it('rule 4 — animal-reorg → allowed, blocks exchange', () => {
    expect(computeAnytimePolicy(base({ interactionKind: 'animal-reorg' })))
      .toEqual({ allowed: true, blockedIds: ['exchange'] })
  })

  it('rule 5 — exchange promptKey → allowed, blocks exchange', () => {
    expect(computeAnytimePolicy(base({ promptKey: 'ui.interactionExchange' })))
      .toEqual({ allowed: true, blockedIds: ['exchange'] })
  })

  it('rule 5 — bake-bread promptKey → allowed, blocks exchange', () => {
    expect(computeAnytimePolicy(base({ promptKey: 'ui.interactionBakeBread' })))
      .toEqual({ allowed: true, blockedIds: ['exchange'] })
  })

  it('rule 4 overrides rule 6 — animal-reorg + stageResume non-null still allowed', () => {
    expect(
      computeAnytimePolicy(
        base({
          interactionKind: 'animal-reorg',
          stageResume: { hook: 'onReorganizeComplete', playerIndex: 0, cardIndex: 0 },
        }),
      ),
    ).toEqual({ allowed: true, blockedIds: ['exchange'] })
  })

  it('rule 5 overrides rule 6 — exchange promptKey + stageResume non-null still allowed', () => {
    expect(
      computeAnytimePolicy(
        base({
          promptKey: 'ui.interactionExchange',
          stageResume: { hook: 'beforeHarvest', playerIndex: 0, cardIndex: 0 },
        }),
      ),
    ).toEqual({ allowed: true, blockedIds: ['exchange'] })
  })

  it('rule 6 — stageResume non-null + non-whitelist kind → blocked (stage hook interactive pending)', () => {
    expect(
      computeAnytimePolicy(
        base({
          stageResume: { hook: 'beforeHarvest', playerIndex: 0, cardIndex: 0 },
          interactionKind: 'choice',
        }),
      ),
    ).toEqual({ allowed: false, reason: 'stage-hook-chain' })
  })

  it('rule 7 — plain choice pending → allowed, no blocks', () => {
    expect(computeAnytimePolicy(base({ interactionKind: 'choice' })))
      .toEqual({ allowed: true, blockedIds: [] })
  })

  it('rule 7 — farm-select pending → allowed, no blocks', () => {
    expect(computeAnytimePolicy(base({ interactionKind: 'farm-select' })))
      .toEqual({ allowed: true, blockedIds: [] })
  })
})
