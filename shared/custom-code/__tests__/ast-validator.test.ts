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

  it('rejects indirect and non-string listener phases', () => {
    const code = `
      const phases = ['computeExchanges']
      const CARD_IMPL = {
        listeners: [
          { phases: phases, handler: (ctx) => {} },
          { phases: ['computeCosts', 1], handler: (ctx) => {} },
        ],
      }
    `
    const result = validateCardCode(code)
    expect(result.valid).toBe(false)
    expect(result.valid === false && result.errors.some(e => e.includes('listener phases must be a string literal array'))).toBe(true)
    expect(result.valid === false && result.errors.some(e => e.includes('listener phases must contain only string literals'))).toBe(true)
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

    const inheritedActions = validateCardCode(`
      const CARD_IMPL = {
        listeners: [{ __proto__: { actions: ['improvement-any'] }, phases: ['computeCosts'], handler: (ctx) => {} }],
      }
    `)
    expect(inheritedActions.valid).toBe(false)
    expect(inheritedActions.valid === false && inheritedActions.errors.some(e => e.includes('listener properties must not set __proto__'))).toBe(true)
  })

  it('rejects indirect CARD_IMPL listener definitions', () => {
    const listeners = `[{ actions: ['improvement-any'], phases: ['computeCosts'], handler: (ctx) => {} }]`
    const indirectCollection = validateCardCode(`
      const listeners = ${listeners}
      const CARD_IMPL = { listeners, ...{ listeners }, ['listeners']: listeners }
    `)
    expect(indirectCollection.valid).toBe(false)
    expect(indirectCollection.valid === false && indirectCollection.errors.some(e => e.includes('CARD_IMPL.listeners must use a property assignment'))).toBe(true)
    expect(indirectCollection.valid === false && indirectCollection.errors.some(e => e.includes('CARD_IMPL must not use spread properties'))).toBe(true)
    expect(indirectCollection.valid === false && indirectCollection.errors.some(e => e.includes('CARD_IMPL properties must not use computed names'))).toBe(true)

    const inheritedCollection = validateCardCode(`
      const CARD_IMPL = { __proto__: { listeners: ${listeners} } }
    `)
    expect(inheritedCollection.valid).toBe(false)
    expect(inheritedCollection.valid === false && inheritedCollection.errors.some(e => e.includes('CARD_IMPL properties must not set __proto__'))).toBe(true)

    const indirectImpl = validateCardCode(`
      const impl = { listeners: ${listeners} }
      const CARD_IMPL = impl
    `)
    expect(indirectImpl.valid).toBe(false)
    expect(indirectImpl.valid === false && indirectImpl.errors.some(e => e.includes('CARD_IMPL must be an object literal'))).toBe(true)

    const mutatedImpl = validateCardCode(`
      const CARD_IMPL = {}
      CARD_IMPL.listeners = ${listeners}
    `)
    expect(mutatedImpl.valid).toBe(false)
    expect(mutatedImpl.valid === false && mutatedImpl.errors.some(e => e.includes('CARD_IMPL must not be referenced outside its declaration'))).toBe(true)

    const nestedImpl = validateCardCode(`
      if (true) {
        var CARD_IMPL = { listeners: ${listeners} }
      }
    `)
    expect(nestedImpl.valid).toBe(false)
    expect(nestedImpl.valid === false && nestedImpl.errors.some(e => e.includes('CARD_IMPL must be declared as a top-level const'))).toBe(true)
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

  it('rejects handHooks that are not dispatched from cards in hand', () => {
    for (const hook of ['onBuy', 'onEndTurn', 'onBeforeEndGame', 'onBeforePlayerTurn']) {
      const result = validateCardCode(`
        const CARD_IMPL = {
          effect: {
            id: 'test',
            handHooks: ['${hook}'],
            ${hook}: () => {},
          },
        }
      `)
      expect(result.valid).toBe(false)
      expect(result.valid === false && result.errors.some(e => e.includes(`unsupported hand hook '${hook}'`))).toBe(true)
    }
  })

  it('rejects effect metadata hidden behind spread or computed properties', () => {
    const sources = [
      `
        const CARD_IMPL = {
          effect: {
            ...{ handHooks: ['onEndTurn'] },
            onEndTurn: () => {},
          },
        }
      `,
      `
        const CARD_IMPL = {
          effect: {
            ['handHooks']: ['onEndTurn'],
            onEndTurn: () => {},
          },
        }
      `,
      `
        const EFFECT = {
          handHooks: ['onEndTurn'],
          onEndTurn: () => {},
        }
        const CARD_IMPL = { effect: EFFECT }
      `,
      `
        const CARD_IMPL = {
          effect: {
            get handHooks() { return ['onEndTurn'] },
            onEndTurn: () => {},
          },
        }
      `,
    ]

    for (const source of sources) {
      expect(validateCardCode(source).valid).toBe(false)
    }
  })

  it('rejects sandbox candidate and settlement hooks that cannot complete across the JSON boundary', () => {
    for (const hook of [
      'onComputeSowableFields',
      'onSowExtraField',
      'getSpecialStablePositions',
      'applySpecialStable',
    ]) {
      const result = validateCardCode(`
        const CARD_IMPL = {
          effect: {
            id: 'test',
            ${hook}: () => true,
          },
        }
      `)
      expect(result.valid).toBe(false)
      expect(result.valid === false && result.errors.some(e => e.includes(`unknown effect hook '${hook}'`))).toBe(true)
    }
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
