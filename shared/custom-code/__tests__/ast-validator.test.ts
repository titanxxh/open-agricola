import { describe, expect, it } from 'vitest'
import { validateCardCode } from '../ast-validator'

describe('ast-validator: CARD_IMPL hook/phase whitelisting', () => {
  it('accepts valid effect hooks', () => {
    const code = `
      const CARD_IMPL = {
        effect: {
          id: 'test',
          onBuy: (state, player) => {},
          onRoundStart: (state, player) => {},
          computeBonusScore: (state, player, ctx) => 0,
          onComputeAnimalZones: (player, zones) => {},
        },
      }
    `
    const result = validateCardCode(code)
    expect(result.valid).toBe(true)
  })

  it('rejects unknown effect hooks', () => {
    const code = `
      const CARD_IMPL = {
        effect: {
          id: 'test',
          onBuy: (state, player) => {},
          onMagicThing: (state, player) => {},
        },
      }
    `
    const result = validateCardCode(code)
    expect(result.valid).toBe(false)
    expect(result.valid === false && result.errors.some(e => e.includes("unknown effect hook 'onMagicThing'"))).toBe(true)
  })

  it('accepts valid listener phases', () => {
    const code = `
      const CARD_IMPL = {
        listeners: [
          {
            id: 'test-listener',
            phases: ['before', 'after', 'during'],
            handler: (ctx) => {},
          },
        ],
      }
    `
    const result = validateCardCode(code)
    expect(result.valid).toBe(true)
  })

  it('rejects unknown listener phases', () => {
    const code = `
      const CARD_IMPL = {
        listeners: [
          {
            id: 'test-listener',
            phases: ['before', 'superPhase'],
            handler: (ctx) => {},
          },
        ],
      }
    `
    const result = validateCardCode(code)
    expect(result.valid).toBe(false)
    expect(result.valid === false && result.errors.some(e => e.includes("unknown listener phase 'superPhase'"))).toBe(true)
  })

  it('accepts handHooks as a meta field', () => {
    const code = `
      const CARD_IMPL = {
        effect: {
          id: 'test',
          handHooks: ['onRoundStart'],
          beforeEndGameScope: 'allPlayers',
          beforeEndGameDispatchMode: 'select',
          beforeEndGameMandatory: true,
          onRoundStart: (state, player) => {},
        },
      }
    `
    const result = validateCardCode(code)
    expect(result.valid).toBe(true)
  })

  it('rejects scoringPriority as a deprecated meta field', () => {
    const code = `
      const CARD_IMPL = {
        effect: {
          id: 'test',
          scoringPriority: 50,
        },
      }
    `
    const result = validateCardCode(code)
    expect(result.valid).toBe(false)
    expect(result.valid === false && result.errors.some(e => e.includes("unknown effect hook 'scoringPriority'"))).toBe(true)
  })

  it('does not flag non-CARD_IMPL objects', () => {
    const code = `
      const OTHER = {
        effect: {
          onMagicThing: () => {},
        },
      }
    `
    const result = validateCardCode(code)
    expect(result.valid).toBe(true)
  })

  it('reports multiple unknown hooks at once', () => {
    const code = `
      const CARD_IMPL = {
        effect: {
          id: 'test',
          onFoo: () => {},
          onBar: () => {},
        },
      }
    `
    const result = validateCardCode(code)
    expect(result.valid).toBe(false)
    if (!result.valid) {
      const hookErrors = result.errors.filter(e => e.includes('unknown effect hook'))
      expect(hookErrors).toHaveLength(2)
    }
  })

  it('accepts all standard actionHookPhases', () => {
    const code = `
      const CARD_IMPL = {
        listeners: [
          {
            id: 'test',
            phases: ['before', 'during', 'immediatelyAfter', 'after', 'computeCosts', 'computeArgs', 'computeChoiceCandidates', 'computeReplace', 'isDoable'],
            handler: (ctx) => {},
          },
        ],
      }
    `
    const result = validateCardCode(code)
    expect(result.valid).toBe(true)
  })
})
