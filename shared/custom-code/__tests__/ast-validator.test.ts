import { describe, expect, it } from 'vitest'
import { findInvalidCostAttributionLines, validateCardCode } from '../ast-validator'

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

  it('accepts the query hooks that receive a fourth and fifth argument', () => {
    const result = validateCardCode(`
      const CARD_IMPL = {
        effect: {
          id: 'test',
          computeBreedThreshold: (state, player, animalType, ctx) => 1,
          computeBreedableAnimalCount: (state, player, animalType, currentCount, ctx) => currentCount,
          computeAnimalScoreAdjustment: (state, player, animalType, ctx) => 0,
          onComputeSharedAnimalZones: (owner, animalOwner, zones, state) => [],
          computeResourceCommitments: (state, owner) => [],
          countExtraTurns: () => 1,
          enforceReorganizeOnLastHarvest: () => false,
        },
      }
    `)
    expect(result).toEqual({ valid: true })
  })

  it('rejects effect hooks whose native settlement writes authoritative state', () => {
    const code = `
      const CARD_IMPL = {
        effect: {
          id: 'test',
          consumeAnimalPayment: (state, player, animalType, amount) => amount,
        },
      }
    `
    const result = validateCardCode(code)
    expect(result.valid).toBe(false)
    expect(result.valid === false && result.errors.some(e => e.includes("unknown effect hook 'consumeAnimalPayment'"))).toBe(true)
  })

  it('accepts valid listener phases', () => {
    const code = `
      const CARD_IMPL = {
        listeners: [
          {
            id: 'test-listener',
            phases: ['before', 'after'],
            handler: (ctx) => {},
          },
        ],
      }
    `
    const result = validateCardCode(code)
    expect(result.valid).toBe(true)
  })

  it.each(['superPhase', 'during'])('rejects unsupported listener phase %s', (phase) => {
    const code = `
      const CARD_IMPL = {
        listeners: [
          {
            id: 'test-listener',
            phases: ['before', '${phase}'],
            handler: (ctx) => {},
          },
        ],
      }
    `
    const result = validateCardCode(code)
    expect(result.valid).toBe(false)
    expect(result.valid === false && result.errors.some(e => e.includes(`unknown listener phase '${phase}'`))).toBe(true)
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
      error => error.includes('listener handlers must return statically inspectable objects'),
    )).toBe(true)
  })

  it('accepts nested payload cost fields outside listener results', () => {
    const result = validateCardCode(`
      const CARD_IMPL = {
        listeners: [{
          phases: ['after'],
          handler: () => {
            const payload = {}
            payload.costs = { wood: 1 }
            return { extraData: payload }
          },
        }],
      }
    `)

    expect(result.valid).toBe(true)
  })

  it('accepts local result variables from non-cost listeners', () => {
    const result = validateCardCode(`
      const CARD_IMPL = {
        listeners: [{
          phases: ['after'],
          handler: () => {
            const result = { extraData: { ok: true } }
            return result
          },
        }],
      }
    `)

    expect(result.valid).toBe(true)
  })

  it('flags indirect compute-cost handler results in the production audit', () => {
    const lines = findInvalidCostAttributionLines(`
      const COMPUTE_COSTS = 'computeCosts'
      const discountHandler = () => {
        const result = { costs: { wood: -1 } }
        return result
      }
      const listener = {
        phases: [COMPUTE_COSTS as ActionHookPhase],
        handler: discountHandler,
      }
    `)

    expect(lines).toHaveLength(1)
  })

  it('flags invalid cost attribution entries in the production audit', () => {
    const lines = findInvalidCostAttributionLines(`
      const CARD_ID = 'D000_Test'
      const listener = {
        phases: ['computeCosts'],
        handler: () => ({
          costs: { wood: -1 },
          costAttribution: [],
        }),
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
      const CARD_ID = 'CUSTOM_Test' as const
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
      const phases = ['computeCosts']
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

  it('accepts the computeExchanges phase and rejects a phase the engine does not have', () => {
    const listenerWithPhase = (phase: string) => validateCardCode(`
      const CARD_IMPL = {
        listeners: [{ id: 'test-listener', phases: ['${phase}'], handler: (ctx) => ({ extraExchanges: [] }) }],
      }
    `)
    expect(listenerWithPhase('computeExchanges')).toEqual({ valid: true })
    const retired = listenerWithPhase('during')
    expect(retired.valid).toBe(false)
    expect(retired.valid === false && retired.errors.some(e => e.includes("unknown listener phase 'during'"))).toBe(true)
  })

  it('accepts handHooks as a meta field', () => {
    const code = `
      const CARD_IMPL = {
        effect: {
          id: 'test',
          handHooks: ['onRoundStart'],
          onRoundStart: (state, player) => {},
        },
      }
    `
    const result = validateCardCode(code)
    expect(result.valid).toBe(true)
  })

  it('accepts the effect metadata beside the hooks', () => {
    const result = validateCardCode(`
      const CARD_IMPL = {
        effect: {
          id: 'test',
          beforeEndGameScope: 'allPlayers',
          beforeEndGameMandatory: false,
          preHarvestGoodsWanted: ['grain'],
          preHarvestGoodsWantedBeforeReap: ['vegetable'],
          maySkipHarvestFieldPhase: true,
          extraTurnBeforeWorkers: true,
          onBeforeEndGame: () => {},
        },
      }
    `)
    expect(result).toEqual({ valid: true })
  })

  it.each(['paymentPaths', 'projectInteractionRequest', 'computePastureCapacityModifiers'])('rejects the unopened effect key %s', (key) => {
    const result = validateCardCode(`
      const CARD_IMPL = {
        effect: {
          id: 'test',
          ${key}: [],
          onBeforeEndGame: () => {},
        },
      }
    `)
    expect(result).toEqual({ valid: false, errors: [expect.stringContaining(`unknown effect hook '${key}'`)] })
  })

  it.each(['allowAnytimeReentry', 'monotoneFenceCost', 'cardCostCandidateMandatory', 'order', 'deriveCardCostCandidate'])(
    'rejects the listener field %s instead of dropping it', (field) => {
      const result = validateCardCode(`
        const CARD_IMPL = {
          listeners: [{ actions: ['collect'], phases: ['after'], ${field}: 1, handler: () => {} }],
        }
      `)
      expect(result).toEqual({ valid: false, errors: [expect.stringContaining(`unsupported listener field '${field}'`)] })
    })

  it('accepts the listener fields the manifest keeps', () => {
    const result = validateCardCode(`
      const CARD_ID = 'CUSTOM_Test'
      const CARD_IMPL = {
        listeners: [{ id: 'label', cardIds: [CARD_ID], actions: ['collect'], phases: ['after'], scope: 'any', handler: () => {} },
          { phases: ['anytime'], zones: ['hand', 'played'], mandatory: true, preScoring: true, replacesTurn: false,
            blockedAnytimeInteractionKinds: ['animal-reorg'], handler: () => {} }],
      }
    `)
    expect(result.valid).toBe(true)
  })

  it.each(["['E033_BeaverColony']", '[CARD_ID, OTHER]', 'OTHER_IDS'])('rejects listener cardIds %s', (cardIds) => {
    const result = validateCardCode(`
      const CARD_ID = 'CUSTOM_Test'
      const OTHER = 'E033_BeaverColony'
      const OTHER_IDS = [OTHER]
      const CARD_IMPL = {
        listeners: [{ cardIds: ${cardIds}, actions: ['collect'], phases: ['after'], handler: () => {} }],
      }
    `)
    expect(result).toEqual({ valid: false, errors: [expect.stringContaining('listener cardIds must be [CARD_ID]')] })
  })

  it('rejects an unsupported listener scope', () => {
    const result = validateCardCode(`
      const CARD_IMPL = {
        listeners: [{ actions: ['collect'], phases: ['after'], scope: 'everyone', handler: () => {} }],
      }
    `)
    expect(result).toEqual({ valid: false, errors: [expect.stringContaining('listener scope must be a supported string literal')] })
  })

  it('rejects statically visible leaves outside the contract in flow positions', () => {
    const result = validateCardCode(`
      const CARD_ID = 'CUSTOM_Test'
      const PLACE = 'place-farmer'
      const CARD_IMPL = {
        effect: {
          onBuy: () => ({ type: 'leaf', actionId: 'collect', sourceCard: CARD_ID }),
          onRoundStart: () => ({ type: 'seq', children: [
            { type: 'leaf', actionId: PLACE, sourceCard: CARD_ID },
            { type: 'leaf', actionId: 'special-effect', params: { kind: 'consume-supply-token', key: 'fence' }, sourceCard: CARD_ID },
            { type: 'leaf', actionId: 'special-effect', params: { kind: 'set-flag', flag: true }, sourceCard: 'E033_BeaverColony' },
            gainLeaf(CARD_ID, { food: 1 }),
          ] }),
        },
        listeners: [{ actions: ['collect'], phases: ['after'],
          handler: () => ({ flow: { type: 'leaf', actionId: 'receive', sourceCard: CARD_ID } }) }],
      }
    `)
    expect(result.valid).toBe(false)
    expect(result.valid === false && result.errors).toEqual([
      "line 6: actionId 'collect' is not available to Workshop cards",
      "line 8: actionId 'place-farmer' is not available to Workshop cards",
      "line 9: special-effect kind 'consume-supply-token' is not available to Workshop cards",
      'line 10: leaf sourceCard must be CARD_ID',
      "line 15: actionId 'receive' is not available to Workshop cards",
    ])
  })

  it('rejects unknown and unopened node fields on literals in flow positions', () => {
    const result = validateCardCode(`
      const CARD_ID = 'CUSTOM_Test'
      const CARD_IMPL = {
        effect: {
          onRoundStart: () => ({ type: 'seq', mode: 'trigger-select', children: [
            { type: 'leaf', actionId: 'gain', params: { food: 1 }, sourceCard: CARD_ID, optoinal: true },
          ] }),
        },
      }
    `)
    expect(result.valid).toBe(false)
    expect(result.valid === false && result.errors).toEqual([
      "line 5: flow field 'mode' is not available to Workshop cards",
      "line 6: flow field 'optoinal' is not available to Workshop cards",
    ])
  })

  it('checks literal leaves returned by contributeExtraTurn and literal actionContext keys', () => {
    const result = validateCardCode(`
      const CARD_ID = 'CUSTOM_Test'
      const CARD_IMPL = {
        effect: {
          contributeExtraTurn: () => ({ type: 'leaf', actionId: 'place-farmer', sourceCard: CARD_ID }),
          onRoundStart: () => ({ type: 'leaf', actionId: 'gain', params: { food: 1 }, sourceCard: CARD_ID,
            actionContext: { targetPlayerId: 'p2', __hostOwnedListenerPhases: true } }),
          onRoundEnd: () => ({ type: 'seq', children: [
            { type: 'leaf', actionId: 'selection', sourceCard: CARD_ID, actionContext: { selectableTiles: [{ row: 0, col: 2 }] } },
            { type: 'leaf', actionId: 'plow', sourceCard: CARD_ID, actionContext: { selectableTiles: [] } },
            { type: 'leaf', actionId: 'reap', sourceCard: CARD_ID, actionContext: { trigger: { phase: 'harvest' } } },
          ] }),
        },
      }
    `)
    expect(result.valid).toBe(false)
    expect(result.valid === false && result.errors).toEqual([
      "line 5: actionId 'place-farmer' is not available to Workshop cards",
      "line 7: actionContext key '__hostOwnedListenerPhases' is not available to Workshop cards",
      // selectableTiles belongs to the selection leaf only; a card never writes the reap trigger.
      "line 10: actionContext key 'selectableTiles' is not available to Workshop cards",
      "line 11: actionContext key 'trigger' is not available to Workshop cards",
    ])
  })

  it('rejects a literal of the wrong type in an open control field, and leaves computed values to the executors', () => {
    const result = validateCardCode(`
      const CARD_ID = 'CUSTOM_Test'
      const skippable = 'false'
      const CARD_IMPL = {
        effect: {
          onRoundStart: () => ({ type: 'seq', optional: 'false', promptKey: 7, anytimeWindow: true, children: [
            { type: 'leaf', actionId: 'gain', params: { food: 1 }, sourceCard: CARD_ID, optional: null },
            { type: 'leaf', actionId: 'gain', params: { food: 1 }, sourceCard: CARD_ID, optional: true, promptKey: 'ui.prompt',
              anytimeWindow: { allowed: false } },
            { type: 'leaf', actionId: 'gain', params: { food: 1 }, sourceCard: CARD_ID, optional: skippable },
          ] }),
        },
      }
    `)
    expect(result.valid).toBe(false)
    expect(result.valid === false && result.errors).toEqual([
      'line 6: optional must be a boolean',
      'line 6: promptKey must be a string',
      'line 6: anytimeWindow must be { allowed: boolean, blockedIds?: string[] }',
      'line 7: optional must be a boolean',
    ])
  })

  it('checks the literals nested in anytimeWindow and actionContext', () => {
    const result = validateCardCode(`
      const CARD_ID = 'CUSTOM_Test'
      const blocked = ['CUSTOM_Other']
      const leaf = (rest) => ({ type: 'leaf', actionId: 'gain', params: { food: 1 }, sourceCard: CARD_ID, ...rest })
      const CARD_IMPL = {
        effect: {
          onRoundStart: (state, player) => ({ type: 'seq', children: [
            { type: 'leaf', actionId: 'gain', sourceCard: CARD_ID, anytimeWindow: { allowed: 'yes' } },
            { type: 'leaf', actionId: 'gain', sourceCard: CARD_ID, anytimeWindow: { allowed: true, blockedIds: [1] } },
            { type: 'leaf', actionId: 'gain', sourceCard: CARD_ID, anytimeWindow: { allowed: true, blockedIds: 'CUSTOM_Other' } },
            { type: 'leaf', actionId: 'gain', sourceCard: CARD_ID, anytimeWindow: { blockedIds: [] } },
            { type: 'leaf', actionId: 'gain', sourceCard: CARD_ID, anytimeWindow: { allowed: true, mode: 'all' } },
            { type: 'leaf', actionId: 'gain', sourceCard: CARD_ID, actionContext: { targetPlayerId: 2 } },
            { type: 'leaf', actionId: 'gain', sourceCard: CARD_ID, actionContext: 'p2' },
            { type: 'leaf', actionId: 'gain', sourceCard: CARD_ID, anytimeWindow: { allowed: false },
              actionContext: { targetPlayerId: 'p2' } },
            { type: 'leaf', actionId: 'gain', sourceCard: CARD_ID, anytimeWindow: { allowed: state.round > 3, blockedIds: blocked },
              actionContext: { targetPlayerId: player.id } },
            { type: 'leaf', actionId: 'gain', sourceCard: CARD_ID, anytimeWindow: { allowed: true, blockedIds: ['CUSTOM_Other', player.id] } },
          ] }),
        },
      }
    `)
    const window = 'anytimeWindow must be { allowed: boolean, blockedIds?: string[] }'
    expect(result.valid).toBe(false)
    expect(result.valid === false && result.errors).toEqual([
      `line 8: ${window}`,
      `line 9: ${window}`,
      `line 10: ${window}`,
      `line 11: ${window}`,
      `line 12: ${window}`,
      'line 13: actionContext.targetPlayerId must be a string',
      'line 14: actionContext must be an object',
    ])
  })

  it('sees through parentheses and type assertions around control literals', () => {
    const result = validateCardCode(`
      const CARD_ID = 'CUSTOM_Test'
      const CARD_IMPL = {
        effect: {
          onRoundStart: () => ({ type: 'seq', children: [
            { type: 'leaf', actionId: 'gain', sourceCard: CARD_ID, optional: ('false') },
            { type: 'leaf', actionId: 'gain', sourceCard: CARD_ID, anytimeWindow: { allowed: ('yes') } },
            { type: 'leaf', actionId: 'gain', sourceCard: CARD_ID, anytimeWindow: ({ allowed: true, blockedIds: ([(1)]) } as const) },
            { type: 'leaf', actionId: 'gain', sourceCard: CARD_ID, actionContext: ({ targetPlayerId: 2 } as const) },
            { type: 'leaf', actionId: 'gain', sourceCard: CARD_ID, optional: (true), promptKey: ('ui.prompt' as string),
              anytimeWindow: ({ allowed: (false) }), actionContext: ({ targetPlayerId: ('p2') } as const) },
          ] }),
        },
      }
    `)
    expect(result.valid).toBe(false)
    expect(result.valid === false && result.errors).toEqual([
      'line 6: optional must be a boolean',
      'line 7: anytimeWindow must be { allowed: boolean, blockedIds?: string[] }',
      'line 8: anytimeWindow must be { allowed: boolean, blockedIds?: string[] }',
      'line 9: actionContext.targetPlayerId must be a string',
    ])
  })

  it('does not treat card data shaped like a leaf as a flow', () => {
    const result = validateCardCode(`
      const CARD_ID = 'CUSTOM_Test'
      const TAG = { type: 'leaf', actionId: 'descriptive-tag' }
      const CARD_IMPL = {
        effect: {
          onRoundStart: () => ({ type: 'leaf', actionId: 'special-effect', sourceCard: CARD_ID,
            params: { kind: 'set-extra-data', key: 'tag', value: { type: 'leaf', actionId: 'descriptive-tag' } } }),
        },
      }
    `)
    expect(result.valid).toBe(true)
  })

  it('does not treat other objects carrying an actionId as flow leaves', () => {
    const result = validateCardCode(`
      const CARD_IMPL = {
        listeners: [{ actions: ['collect'], phases: ['after'],
          handler: (context) => context.actionId === 'plow' ? { doable: true } : undefined }],
      }
    `)
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
            phases: ['before', 'immediatelyAfter', 'after', 'computeCosts', 'computeArgs', 'computeChoiceCandidates', 'computeReplace', 'isDoable'],
            handler: (ctx) => {},
          },
        ],
      }
    `
    const result = validateCardCode(code)
    expect(result.valid).toBe(true)
  })
})
