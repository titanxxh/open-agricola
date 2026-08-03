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

  it('rejects animal effect hooks that require unsupported sandbox arguments', () => {
    const code = `
      const CARD_IMPL = {
        effect: {
          id: 'test',
          computeBreedableAnimalCount: (state, player, animalType, currentCount) => currentCount,
        },
      }
    `
    const result = validateCardCode(code)
    expect(result.valid).toBe(false)
    expect(result.valid === false && result.errors.some(e => e.includes("unknown effect hook 'computeBreedableAnimalCount'"))).toBe(true)
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

  it('accepts supported listener actions', () => {
    const code = `
      const CARD_IMPL = {
        listeners: [
          {
            id: 'test-listener',
            actions: ['collect', 'improvement'],
            phases: ['computeCosts'],
            handler: (ctx) => {},
          },
        ],
      }
    `
    expect(validateCardCode(code).valid).toBe(true)
  })

  it('rejects unknown listener actions', () => {
    const code = `
      const CARD_IMPL = {
        listeners: [
          {
            id: 'test-listener',
            actions: ['improvement-any'],
            phases: ['computeCosts'],
            handler: (ctx) => {},
          },
        ],
      }
    `
    const result = validateCardCode(code)
    expect(result.valid).toBe(false)
    expect(result.valid === false && result.errors.some(e => e.includes("unknown listener action 'improvement-any'"))).toBe(true)
  })

  it('rejects indirect listener entries and spread properties', () => {
    const code = `
      const listener = {
        actions: ['improvement-any'],
        phases: ['computeCosts'],
        handler: (ctx) => {},
      }
      const CARD_IMPL = {
        listeners: [listener, { ...listener }],
      }
    `
    const result = validateCardCode(code)
    expect(result.valid).toBe(false)
    expect(result.valid === false && result.errors.some(e => e.includes('listener entries must be object literals'))).toBe(true)
    expect(result.valid === false && result.errors.some(e => e.includes('listener entries must not use spread properties'))).toBe(true)
  })

  it('rejects nonstandard listener action properties', () => {
    const code = `
      const actions = ['improvement-any']
      const CARD_IMPL = {
        listeners: [
          { actions, phases: ['computeCosts'], handler: (ctx) => {} },
          { ['actions']: ['improvement-any'], phases: ['computeCosts'], handler: (ctx) => {} },
          { actions() { return ['improvement-any'] }, phases: ['computeCosts'], handler: (ctx) => {} },
        ],
      }
    `
    const result = validateCardCode(code)
    expect(result.valid).toBe(false)
    expect(result.valid === false && result.errors.some(e => e.includes('listener actions must use a property assignment'))).toBe(true)
    expect(result.valid === false && result.errors.some(e => e.includes('listener properties must not use computed names'))).toBe(true)
  })

  it('rejects computeExchanges for sandbox custom cards', () => {
    const code = `
      const CARD_IMPL = {
        listeners: [
          {
            id: 'test-listener',
            phases: ['computeExchanges'],
            handler: (ctx) => {},
          },
        ],
      }
    `
    const result = validateCardCode(code)
    expect(result.valid).toBe(false)
    expect(result.valid === false && result.errors.some(e => e.includes("unknown listener phase 'computeExchanges'"))).toBe(true)
  })

  it('accepts handHooks as a meta field', () => {
    const code = `
      const CARD_IMPL = {
        effect: {
          id: 'test',
          handHooks: ['onRoundStart'],
          beforeEndGameScope: 'allPlayers',
          beforeEndGameMandatory: true,
          onRoundStart: (state, player) => {},
        },
      }
    `
    const result = validateCardCode(code)
    expect(result.valid).toBe(true)
  })

  it('rejects deprecated before-end dispatch meta field', () => {
    const deprecatedKey = 'beforeEndGame' + 'Dispatch' + 'Mode'
    const code = `
      const CARD_IMPL = {
        effect: {
          id: 'test',
          ${deprecatedKey}: 'select',
          onRoundStart: (state, player) => {},
        },
      }
    `
    const result = validateCardCode(code)
    expect(result.valid).toBe(false)
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
