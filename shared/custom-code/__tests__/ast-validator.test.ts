import { describe, expect, it } from 'vitest'
import { findMissingCostAttributionLines, validateCardCode } from '../ast-validator'

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

  it('rejects costs without cost attribution', () => {
    const result = validateCardCode(`
      const CARD_IMPL = {
        listeners: [{
          actions: ['construct'],
          phases: ['computeCosts'],
          handler: () => ({ costs: { wood: -2 }, sourceCard: 'CUSTOM_Test' }),
        }],
      }
    `)

    expect(result.valid).toBe(false)
    expect(result.valid === false && result.errors).toContain(
      'line 6: listener results with costs must include costAttribution',
    )
  })

  it('rejects a statically computed costs key without attribution', () => {
    const result = validateCardCode(`
      const CARD_IMPL = {
        listeners: [{
          actions: ['construct'],
          phases: ['computeCosts'],
          handler: () => ({ ['costs']: { wood: -1 } }),
        }],
      }
    `)

    expect(result.valid).toBe(false)
    expect(result.valid === false && result.errors).toContain(
      'line 6: listener results with costs must include costAttribution',
    )
  })

  it('rejects identifier-computed result keys that can be shadowed', () => {
    const result = validateCardCode(`
      const CARD_ID = 'CUSTOM_Test'
      const KEY = 'costs'
      const CARD_IMPL = {
        listeners: [{
          actions: ['construct'],
          phases: ['computeCosts'],
          handler: () => {
            const KEY = 'other'
            const costs = { wood: -1 }
            return {
              [KEY]: costs,
              costAttribution: [{ sourceCard: CARD_ID, costs }],
            }
          },
        }],
      }
    `)

    expect(result.valid).toBe(false)
    expect(result.valid === false && result.errors.some(
      error => error.includes('listener handlers must return statically inspectable objects'),
    )).toBe(true)
  })

  it.each([
    "Object.fromEntries([['costs', { wood: -1 }]])",
    "({ ['cost' + 's']: { wood: -1 } })",
    "({ __proto__: Object.fromEntries([['costs', { wood: -1 }]]) })",
  ])('rejects listener results that cannot be checked statically: %s', (resultExpression) => {
    const result = validateCardCode(`
      const CARD_IMPL = {
        listeners: [{
          actions: ['construct'],
          phases: ['computeCosts'],
          handler: () => ${resultExpression},
        }],
      }
    `)

    expect(result.valid).toBe(false)
    expect(result.valid === false && result.errors.some(
      error => error.includes('listener handlers must return statically inspectable objects'),
    )).toBe(true)
  })

  it('rejects costs assigned after object construction', () => {
    const result = validateCardCode(`
      const CARD_ID = 'CUSTOM_Test'
      const CARD_IMPL = {
        listeners: [{
          actions: ['construct'],
          phases: ['computeCosts'],
          handler: () => {
            const result = { sourceCard: CARD_ID }
            result.costs = { wood: -2 }
            return result
          },
        }],
      }
    `)

    expect(result.valid).toBe(false)
    expect(result.valid === false && result.errors.some(
      error => error.includes("assigning to 'costs' is not allowed"),
    )).toBe(true)
  })

  it('flags indirect compute-cost handler results in the production audit', () => {
    const lines = findMissingCostAttributionLines(`
      const discountHandler = () => {
        const result = { costs: { wood: -1 } }
        return result
      }
      const listener = {
        phases: ['computeCosts'],
        handler: discountHandler,
      }
    `)

    expect(lines).toHaveLength(1)
  })

  it('accepts an inspectable method-form listener handler', () => {
    const result = validateCardCode(`
      const CARD_ID = 'CUSTOM_Test'
      const CARD_IMPL = {
        listeners: [{
          actions: ['construct'],
          phases: ['computeCosts'],
          handler() {
            const costs = { wood: -1 }
            return {
              costs,
              costAttribution: [{ sourceCard: CARD_ID, costs }],
            }
          },
        }],
      }
    `, 'CUSTOM_Test')

    expect(result.valid).toBe(true)
  })

  it('accepts costs with explicit cost attribution', () => {
    const result = validateCardCode(`
      const CARD_ID = 'CUSTOM_Test'
      const CARD_IMPL = {
        listeners: [{
          actions: ['construct'],
          phases: ['computeCosts'],
          handler: () => ({
            costs: { wood: -2 },
            costAttribution: [{ sourceCard: CARD_ID, costs: { wood: -2 } }],
            sourceCard: CARD_ID,
          }),
        }],
      }
    `)

    expect(result.valid).toBe(true)
  })

  it('accepts equivalent attributed costs with different property order', () => {
    const result = validateCardCode(`
      const CARD_ID = 'CUSTOM_Test'
      const CARD_IMPL = {
        listeners: [{
          actions: ['construct'],
          phases: ['computeCosts'],
          handler: () => ({
            costs: { wood: -2, clay: -1 },
            costAttribution: [{ sourceCard: CARD_ID, costs: { clay: -1, wood: -2 } }],
          }),
        }],
      }
    `)

    expect(result.valid).toBe(true)
  })

  it('accepts a shared dynamic cost delta', () => {
    const result = validateCardCode(`
      const CARD_ID = 'CUSTOM_Test'
      const CARD_IMPL = {
        listeners: [{
          actions: ['construct'],
          phases: ['computeCosts'],
          handler: (context) => {
            const costs = { wood: -context.player.rooms }
            return {
              costs,
              costAttribution: [{ sourceCard: CARD_ID, costs }],
            }
          },
        }],
      }
    `)

    expect(result.valid).toBe(true)
  })

  it('rejects duplicate resolved cost properties', () => {
    const result = validateCardCode(`
      const CARD_ID = 'CUSTOM_Test'
      const KEY = 'costs'
      const CARD_IMPL = {
        listeners: [{
          actions: ['construct'],
          phases: ['computeCosts'],
          handler: () => ({
            costs: { wood: -1 },
            costAttribution: [{ sourceCard: CARD_ID, costs: { wood: -1 } }],
            [KEY]: { wood: -2 },
          }),
        }],
      }
    `)

    expect(result.valid).toBe(false)
  })

  it('rejects cost attribution without costs', () => {
    const result = validateCardCode(`
      const CARD_ID = 'CUSTOM_Test'
      const CARD_IMPL = {
        listeners: [{
          actions: ['construct'],
          phases: ['computeCosts'],
          handler: () => ({
            costAttribution: [{ sourceCard: CARD_ID, costs: { wood: -2 } }],
          }),
        }],
      }
    `)

    expect(result.valid).toBe(false)
    expect(result.valid === false && result.errors).toContain(
      'line 7: listener results with costAttribution must include costs',
    )
  })

  it.each([
    'null',
    '{}',
    '[]',
    "[{ sourceCard: CARD_ID, costs: { reed: -1 } }]",
    "[{ sourceCard: '', costs: { wood: -2 } }]",
  ])('rejects invalid or mismatched cost attribution: %s', (costAttribution) => {
    const result = validateCardCode(`
      const CARD_ID = 'CUSTOM_Test'
      const CARD_IMPL = {
        listeners: [{
          actions: ['construct'],
          phases: ['computeCosts'],
          handler: () => ({
            costs: { wood: -2 },
            costAttribution: ${costAttribution},
            sourceCard: CARD_ID,
          }),
        }],
      }
    `)

    expect(result.valid).toBe(false)
    expect(result.valid === false && result.errors.some(
      error => error.includes('costAttribution must contain one matching source entry'),
    )).toBe(true)
  })

  it('requires attribution sourceCard to resolve to the submitted CARD_ID', () => {
    const source = `
      const CARD_ID = 'CUSTOM_Test'
      const EMPTY = ''
      const CARD_IMPL = {
        listeners: [{
          actions: ['construct'],
          phases: ['computeCosts'],
          handler: () => ({
            costs: { wood: -2 },
            costAttribution: [{ sourceCard: EMPTY, costs: { wood: -2 } }],
            sourceCard: CARD_ID,
          }),
        }],
      }
    `

    expect(validateCardCode(source).valid).toBe(false)
    expect(validateCardCode(source.replace('CUSTOM_Test', 'CUSTOM_Other'), 'CUSTOM_Test').valid).toBe(false)
  })

  it('rejects attribution entries whose effective values can be overridden by spread', () => {
    const result = validateCardCode(`
      const CARD_ID = 'CUSTOM_Test'
      const override = { sourceCard: 'CUSTOM_Other' }
      const CARD_IMPL = {
        listeners: [{
          actions: ['construct'],
          phases: ['computeCosts'],
          handler: () => ({
            costs: { wood: -2 },
            costAttribution: [{
              sourceCard: CARD_ID,
              costs: { wood: -2 },
              ...override,
            }],
          }),
        }],
      }
    `)

    expect(result.valid).toBe(false)
    expect(result.valid === false && result.errors.some(
      error => error.includes('costAttribution must contain one matching source entry'),
    )).toBe(true)
  })

  it('resolves attribution CARD_ID from the top-level declaration', () => {
    const result = validateCardCode(`
      const CARD_ID = 'CUSTOM_Wrong'
      const CARD_IMPL = {
        listeners: [{
          actions: ['construct'],
          phases: ['computeCosts'],
          handler: () => {
            if (true) {
              const CARD_ID = 'CUSTOM_Test'
            }
            return {
              costs: { wood: -2 },
              costAttribution: [{ sourceCard: CARD_ID, costs: { wood: -2 } }],
              sourceCard: CARD_ID,
            }
          },
        }],
      }
    `, 'CUSTOM_Test')

    expect(result.valid).toBe(false)
  })

  it('rejects a listener-local CARD_ID that shadows the submitted card ID', () => {
    const result = validateCardCode(`
      const CARD_ID = 'CUSTOM_Test'
      const CARD_IMPL = {
        listeners: [{
          actions: ['construct'],
          phases: ['computeCosts'],
          handler: () => {
            const CARD_ID = 'CUSTOM_Other'
            const costs = { wood: -2 }
            return {
              costs,
              costAttribution: [{ sourceCard: CARD_ID, costs }],
            }
          },
        }],
      }
    `, 'CUSTOM_Test')

    expect(result.valid).toBe(false)
    expect(result.valid === false && result.errors.some(
      error => error.includes('CARD_ID must not be shadowed'),
    )).toBe(true)
  })

  it('ignores costs nested inside a listener result payload', () => {
    const result = validateCardCode(`
      const CARD_IMPL = {
        listeners: [{
          actions: ['collect'],
          phases: ['after'],
          handler: () => ({
            specialEffects: [{
              kind: 'set-extra-data',
              key: 'quote',
              value: { costs: { wood: 1 } },
            }],
          }),
        }],
      }
    `)

    expect(result.valid).toBe(true)
  })

  it.each([
    ['null costs', 'null', 'null'],
    ['non-resource costs', "{ unknown: -2 }", "{ unknown: -2 }"],
    ['non-numeric costs', "{ wood: 'two' }", "{ wood: 'two' }"],
  ])('rejects %s in attributed cost results', (_case, costs, attributedCosts) => {
    const result = validateCardCode(`
      const CARD_ID = 'CUSTOM_Test'
      const CARD_IMPL = {
        listeners: [{
          actions: ['construct'],
          phases: ['computeCosts'],
          handler: () => ({
            costs: ${costs},
            costAttribution: [{ sourceCard: CARD_ID, costs: ${attributedCosts} }],
            sourceCard: CARD_ID,
          }),
        }],
      }
    `, 'CUSTOM_Test')

    expect(result.valid).toBe(false)
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
