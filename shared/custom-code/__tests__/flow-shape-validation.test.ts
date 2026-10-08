import { describe, expect, it } from 'vitest'
import { validateCardCode } from '../ast-validator'

const leaf = "{ type: 'leaf', actionId: 'gain', params: { food: 1 }, sourceCard: CARD_ID }"
const source = (effect: string) => `const CARD_ID = 'CUSTOM_Flow'; const CARD_IMPL = { effect: { ${effect} } }`

describe('literal ActionFlow validation', () => {
  it.each(['seq', 'or', 'xor', 'parallel'])('rejects %s with items before sandbox execution', type => {
    const result = validateCardCode(source(`onBuy: () => ({ type: '${type}', items: [${leaf}] })`))
    expect(result).toMatchObject({ valid: false, errors: [expect.stringContaining('requires a children array')] })
  })

  it.each(['null', 'false', '1', "'invalid'", '{}'])('rejects statically non-array children: %s', children => {
    expect(validateCardCode(source(`onRoundStart() { return { type: 'seq', children: ${children} } }`)).valid).toBe(false)
  })

  it('checks nested groups, conditional returns and function expressions', () => {
    const result = validateCardCode(source(`resolveChoice: function(state) {
      return state.round ? ({ type: 'seq', children: [{ type: 'xor', steps: [${leaf}] }] }) : undefined
    }`))
    expect(result).toMatchObject({ valid: false, errors: [expect.stringContaining("ActionFlow 'xor'")] })
  })

  it.each(['flow', 'alternativeFlow'])('checks the listener %s result', field => {
    const result = validateCardCode(`const CARD_IMPL = { listeners: [{ phases: ['after'],
      handler: () => ({ ${field}: { type: 'seq', items: [] } }) }] }`)
    expect(result).toMatchObject({ valid: false, errors: [expect.stringContaining('children')] })
  })

  it('accepts valid groups and leaves while keeping private data outside flow validation', () => {
    expect(validateCardCode(source(`onBuy: () => ({ type: 'seq', children: [${leaf},
      { type: 'xor', optional: true, children: [${leaf}] },
      { type: 'leaf', actionId: 'special-effect', params: { kind: 'set-extra-data', key: 'record',
        value: { type: 'seq', items: [1, 2] } }, sourceCard: CARD_ID }
    ] })`)).valid).toBe(true)
  })

  it('does not infer dynamic flows, helper calls, spread children or unrelated nested function results', () => {
    expect(validateCardCode(source(`onBuy: state => {
      const data = () => ({ type: 'seq', items: [1, 2] })
      if (state.round === 1) return { type: 'seq', children: state.flows }
      if (state.round === 2) return { type: 'seq', ...state.flow }
      if (state.round === 3) return { type: 'seq', children: null, ...state.flow }
      if (state.round === 4) return { type: 'seq', [state.childrenKey]: state.flows }
      return gainLeaf(CARD_ID, { food: 1 })
    }, onBeforePlayerTurn: () => ({ skipTurn: true })`)).valid).toBe(true)
  })
})
