import { describe, expect, it } from 'vitest'
import { assertCustomFlow } from '../flow-admission'
import { SANDBOX_ALLOWED_ACTION_IDS } from '../sandbox-action-ids'

const CARD_ID = 'CUSTOM_Admission'
const leaf = (actionId: string, params: Record<string, unknown> = {}, rest: Record<string, unknown> = {}) =>
  ({ type: 'leaf', actionId, params, sourceCard: CARD_ID, ...rest })
const admit = (flow: unknown) => () => assertCustomFlow(flow, CARD_ID)

describe('assertCustomFlow', () => {
  it('accepts an absent flow', () => {
    expect(admit(undefined)).not.toThrow()
    expect(admit(null)).not.toThrow()
  })

  it.each(SANDBOX_ALLOWED_ACTION_IDS.filter(id => id !== 'special-effect'))('accepts the contract leaf %s', (actionId) => {
    expect(admit(leaf(actionId))).not.toThrow()
  })

  it.each(['plow', 'selection', 'card_E112_GrainThief_protect'])('rejects the native leaf %s', (actionId) => {
    expect(admit(leaf(actionId))).toThrow(`flow: actionId '${actionId}' is not in the Workshop Capability Contract`)
  })

  it('rejects the whole flow and names the nested node', () => {
    const flow = { type: 'seq', children: [leaf('gain', { food: 1 }), { type: 'or', children: [leaf('gain'), leaf('sow')] }] }
    expect(admit(flow)).toThrow("flow.children[1].children[1]: actionId 'sow' is not in the Workshop Capability Contract")
  })

  it('rejects malformed nodes', () => {
    expect(admit({ type: 'loop', children: [] })).toThrow("flow node type 'loop'")
    expect(admit({ type: 'seq', items: [] })).toThrow("'seq' requires a children array")
    expect(admit({ type: 'seq', children: [null] })).toThrow('flow.children[0]: must be an ActionFlow object')
    expect(admit('gain')).toThrow('flow: must be an ActionFlow object')
  })

  it('binds every node to the invoking card', () => {
    expect(admit({ type: 'leaf', actionId: 'gain', params: { food: 1 } })).not.toThrow()
    expect(admit(leaf('special-effect', { kind: 'set-flag', flag: true }, { sourceCard: 'E033_BeaverColony' })))
      .toThrow("flow: sourceCard must be this card's id")
    expect(admit({ type: 'seq', sourceCard: 'E033_BeaverColony', children: [] })).toThrow("flow: sourceCard must be this card's id")
    expect(admit({ type: 'seq', children: [leaf('gain', {}, { sourceCard: 'A001_Other' })] }))
      .toThrow("flow.children[0]: sourceCard must be this card's id")
  })

  it('accepts the open node fields and ignores fields the engine does not read', () => {
    expect(admit(leaf('pay', { cost: { food: 1 } }, {
      optional: true, promptKey: 'ui.interactionOptionalAction', anytimeWindow: { allowed: true },
      actionContext: { targetPlayerId: 'p2' }, note: 'ignored',
    }))).not.toThrow()
    expect(admit({ type: 'xor', optional: true, promptKey: 'prompt.choose', sourceCard: CARD_ID, children: [leaf('gain')], label: 'ignored' }))
      .not.toThrow()
  })

  it.each(['optionId', 'choiceLabelKey', 'choiceLabelParams', 'effectPreview', 'targetPlayerId', 'expandFlow'])(
    'rejects the native leaf field %s', (field) => {
      expect(admit(leaf('gain', {}, { [field]: 'x' }))).toThrow(`flow: flow field '${field}' is not in the Workshop Capability Contract`)
    })

  it.each(['mode', 'triggerSelectOnce', 'anytimeActionId', 'optionId', 'choiceLabelKey', 'choiceLabelParams', 'targetPlayerId'])(
    'rejects the native group field %s', (field) => {
      expect(admit({ type: 'parallel', [field]: 'x', children: [leaf('gain')] }))
        .toThrow(`flow: flow field '${field}' is not in the Workshop Capability Contract`)
    })

  it.each([
    { kind: 'increment-counter', key: 'uses', amount: 1 },
    { kind: 'set-counter', key: 'uses', value: 0 },
    { kind: 'set-flag', flag: false },
    { kind: 'set-infobox', text: '' },
    { kind: 'set-extra-data', key: 'note', value: { type: 'leaf', actionId: 'descriptive-tag' } },
    { kind: 'set-private-data', key: 'secret', value: null },
    { kind: 'increment-extra-data', key: 'total', amount: -2 },
  ])('accepts the documented special-effect shape $kind', (params) => {
    expect(admit(leaf('special-effect', params))).not.toThrow()
  })

  it.each([
    [{ kind: 'consume-supply-token', key: 'fence' }, "special-effect kind 'consume-supply-token' is not in the Workshop Capability Contract"],
    [{}, "special-effect kind 'undefined' is not in the Workshop Capability Contract"],
    [{ kind: 'set-flag', flag: 'yes' }, "special-effect 'set-flag' requires flag to be a boolean"],
    [{ kind: 'set-infobox', text: { a: 1 } }, "special-effect 'set-infobox' requires text to be a string"],
    [{ kind: 'increment-counter', key: 'uses', amount: '1' }, "special-effect 'increment-counter' requires amount to be a finite number"],
    [{ kind: 'set-counter', key: 'uses', value: null }, "special-effect 'set-counter' requires value to be a finite number"],
    [{ kind: 'increment-extra-data', amount: 1 }, "special-effect 'increment-extra-data' requires key to be a string"],
  ])('rejects a special-effect outside its documented shape', (params, message) => {
    expect(admit(leaf('special-effect', params))).toThrow(`flow: ${message}`)
  })
})
