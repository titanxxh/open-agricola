import { describe, expect, it } from 'vitest'
import { admitCustomFlow } from '../flow-admission'
import { validateCustomListenerResult } from '../listener-result-validator'
import { SANDBOX_ALLOWED_ACTION_IDS, SANDBOX_NATIVE_ACTION_IDS } from '../sandbox-action-ids'

const CARD_ID = 'CUSTOM_Admission'
const leaf = (actionId: string, params: Record<string, unknown> = {}, rest: Record<string, unknown> = {}) =>
  ({ type: 'leaf', actionId, params, sourceCard: CARD_ID, ...rest })
const admit = (flow: unknown) => () => admitCustomFlow(flow, CARD_ID)

describe('admitCustomFlow', () => {
  it('accepts an absent flow', () => {
    expect(admit(undefined)).not.toThrow()
    expect(admit(null)).not.toThrow()
  })

  const DOCUMENTED_PARAMS: Record<string, Record<string, unknown>> = {
    gain: { food: 2, wood: 1 },
    pay: { grain: 1 },
    'bonus-vp': {},
    'bake-bread': {},
    'store-on-card': { grain: 6 },
    'take-from-card': { grain: 1 },
    'push-to-card-stack': { item: 'token' },
    'special-effect': { kind: 'set-flag', flag: true },
    'future-meeples': { __futureMeepleRequest: { cardId: CARD_ID, playerId: 'p1', startRound: 2, count: 3, resources: { food: 1 } } },
    improvement: { types: ['minor'] },
    occupation: { exactCost: { food: 1 } },
    'emit-choice': { options: [{ value: 'a', labelKey: 'A' }], promptKey: 'Pick one' },
  }

  it.each([...SANDBOX_ALLOWED_ACTION_IDS])('accepts the contract leaf %s with its documented params', (actionId) => {
    expect(admit(leaf(actionId, DOCUMENTED_PARAMS[actionId]))).not.toThrow()
  })

  it.each([
    ['gain', { food: 1, payerId: 'p2', recipientPlayerId: 'p1' }, "gain param 'payerId'"],
    ['store-on-card', { uses: 1 }, "store-on-card param 'uses'"],
    ['take-from-card', { grain: 1, targetCardId: 'A001_Other' }, "take-from-card param 'targetCardId'"],
    ['pay', { food: 1, costType: 'minor-improvement' }, "pay param 'costType'"],
    ['pay', { cost: { food: 1 }, paymentChoice: '0' }, "pay param 'paymentChoice'"],
    ['bonus-vp', { amount: 3 }, "bonus-vp param 'amount'"],
    ['bake-bread', { free: true }, "bake-bread param 'free'"],
    ['push-to-card-stack', { item: 'x', cardId: 'A001_Other' }, "push-to-card-stack param 'cardId'"],
    ['future-meeples', { __futureMeepleRequest: { cardId: CARD_ID }, extra: 1 }, "future-meeples param 'extra'"],
  ])('rejects the native-only %s parameter', (actionId, params, detail) => {
    expect(admit(leaf(actionId, params))).toThrow(`flow: ${detail} is not in the Workshop Capability Contract`)
  })

  it('accepts the payLeaf cost wrapper and leaves the cost itself to the payment solver', () => {
    expect(admit(leaf('pay', { cost: { fees: [{ food: 1 }, { wood: 1 }] } }))).not.toThrow()
  })

  it('binds a scheduled reward to the invoking card', () => {
    expect(admit(leaf('future-meeples', {}))).toThrow('flow: future-meeples requires params.__futureMeepleRequest')
    expect(admit(leaf('future-meeples', { __futureMeepleRequest: { cardId: 'A001_Other', playerId: 'p1' } })))
      .toThrow("flow: __futureMeepleRequest.cardId must be this card's id")
  })

  it.each(['place-farmer', 'collect', 'card_E112_GrainThief_protect'])('rejects the native leaf %s', (actionId) => {
    expect(admit(leaf(actionId))).toThrow(`flow: actionId '${actionId}' is not in the Workshop Capability Contract`)
  })

  it('rejects params that are not an object', () => {
    expect(admit(leaf('gain', 'food' as never))).toThrow('flow: params must be an object')
  })

  it('rejects the whole flow and names the nested node', () => {
    const flow = { type: 'seq', children: [leaf('gain', { food: 1 }), { type: 'or', children: [leaf('gain'), leaf('place-farmer')] }] }
    expect(admit(flow)).toThrow("flow.children[1].children[1]: actionId 'place-farmer' is not in the Workshop Capability Contract")
  })

  it('rejects malformed nodes', () => {
    expect(admit({ type: 'loop', children: [] })).toThrow("flow node type 'loop'")
    expect(admit({ type: 'seq', items: [] })).toThrow("'seq' requires a children array")
    expect(admit({ type: 'seq', children: [null] })).toThrow('flow.children[0]: must be an ActionFlow object')
    expect(admit('gain')).toThrow('flow: must be an ActionFlow object')
  })

  it('binds every node to the invoking card', () => {
    // A leaf that omits its source is attributed to the card rather than settled without one.
    const unbound = { type: 'seq', children: [{ type: 'leaf', actionId: 'gain', params: { food: 1 } }] }
    admitCustomFlow(unbound, CARD_ID)
    expect(unbound.children[0]).toEqual({ type: 'leaf', actionId: 'gain', params: { food: 1 }, sourceCard: CARD_ID })
    expect(admit(leaf('special-effect', { kind: 'set-flag', flag: true }, { sourceCard: 'E033_BeaverColony' })))
      .toThrow("flow: sourceCard must be this card's id")
    expect(admit({ type: 'seq', sourceCard: 'E033_BeaverColony', children: [] })).toThrow("flow: sourceCard must be this card's id")
    expect(admit({ type: 'seq', children: [leaf('gain', {}, { sourceCard: 'A001_Other' })] }))
      .toThrow("flow.children[0]: sourceCard must be this card's id")
  })

  it('accepts the open node fields', () => {
    expect(admit(leaf('pay', { cost: { food: 1 } }, {
      optional: true, promptKey: 'ui.interactionOptionalAction', anytimeWindow: { allowed: true },
      actionContext: { targetPlayerId: 'p2' },
    }))).not.toThrow()
    expect(admit({ type: 'xor', optional: true, promptKey: 'prompt.choose', sourceCard: CARD_ID, children: [leaf('gain')] }))
      .not.toThrow()
  })

  it('admits only the documented actionContext key', () => {
    expect(admit(leaf('gain', { food: 1 }, { actionContext: { targetPlayerId: 'p2' } }))).not.toThrow()
    expect(admit(leaf('gain', { food: 1 }, { actionContext: { __hostOwnedListenerPhases: true } })))
      .toThrow("flow: actionContext key '__hostOwnedListenerPhases' is not in the Workshop Capability Contract")
    expect(admit(leaf('gain', { food: 1 }, { actionContext: 'p2' }))).toThrow('flow: actionContext must be an object')
  })

  it('requires the open control fields to hold their documented types on leaves and groups', () => {
    const group = (rest: Record<string, unknown>) => ({ type: 'seq', children: [leaf('gain', { food: 1 })], ...rest })
    expect(admit(leaf('gain', { food: 1 }, { optional: true, promptKey: 'ui.prompt', anytimeWindow: { allowed: false } }))).not.toThrow()
    expect(admit(group({ optional: false, anytimeWindow: { allowed: true, blockedIds: ['CUSTOM_Other'] } }))).not.toThrow()

    // The engine reads optional by truthiness, so the string 'false' would make the step optional.
    expect(admit(leaf('gain', { food: 1 }, { optional: 'false' }))).toThrow('flow: optional must be a boolean')
    expect(admit(group({ optional: 1 }))).toThrow('flow: optional must be a boolean')
    expect(admit(group({ children: [leaf('gain', { food: 1 }, { optional: null })] })))
      .toThrow('flow.children[0]: optional must be a boolean')
    expect(admit(leaf('gain', { food: 1 }, { promptKey: 7 }))).toThrow('flow: promptKey must be a string')
    expect(admit(leaf('gain', { food: 1 }, { anytimeWindow: true })))
      .toThrow('flow: anytimeWindow must be { allowed: boolean, blockedIds?: string[] }')
    expect(admit(group({ anytimeWindow: { allowed: 'yes' } })))
      .toThrow('flow: anytimeWindow must be { allowed: boolean, blockedIds?: string[] }')
    expect(admit(group({ anytimeWindow: { allowed: true, blockedIds: [1] } })))
      .toThrow('flow: anytimeWindow must be { allowed: boolean, blockedIds?: string[] }')
    expect(admit(group({ anytimeWindow: { allowed: true, mode: 'all' } })))
      .toThrow('flow: anytimeWindow must be { allowed: boolean, blockedIds?: string[] }')
    expect(admit(leaf('gain', { food: 1 }, { actionContext: { targetPlayerId: 2 } })))
      .toThrow('flow: actionContext.targetPlayerId must be a string')
  })

  it('rejects a field that is not a node field at all, such as a misspelling', () => {
    expect(admit(leaf('gain', { food: 1 }, { optoinal: true })))
      .toThrow("flow: flow field 'optoinal' is not in the Workshop Capability Contract")
    expect(admit({ type: 'seq', childs: [], children: [leaf('gain')] }))
      .toThrow("flow: flow field 'childs' is not in the Workshop Capability Contract")
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
    { kind: 'pop-card-stack-top' },
    { kind: 'remove-future-meeples' },
    { kind: 'remove-future-meeples', rounds: [11, 12] },
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
    [{ kind: 'set-extra-data', key: 'note' }, "special-effect 'set-extra-data' requires value to be present"],
    [{ kind: 'set-private-data', key: 'secret', value: undefined }, "special-effect 'set-private-data' requires value to be present"],
    [{ kind: 'remove-future-meeples', rounds: 11 }, "special-effect 'remove-future-meeples' requires rounds to be an array of numbers"],
  ])('rejects a special-effect outside its documented shape', (params, message) => {
    expect(admit(leaf('special-effect', params))).toThrow(`flow: ${message}`)
  })

  it.each(['plow', 'sow', 'fence', 'stables', 'construct', 'renovate-house', 'family-growth', 'breed', 'reap', 'exchange',
    'set-first-player', 'selection', 'reorganize'])('rejects any param on the native action %s', (actionId) => {
    expect(admit(leaf(actionId, { exactCost: {} }))).toThrow(`flow: ${actionId} param 'exactCost' is not in the Workshop Capability Contract`)
  })

  it.each([
    ['improvement', { allowedPurchases: ['Major_Well'] }, "improvement param 'allowedPurchases' is not in the Workshop Capability Contract"],
    // A string would fall back to every improvement inside the native action.
    ['improvement', { types: 'minor' }, "improvement param 'types' must be a non-empty array of 'major' or 'minor'"],
    ['improvement', { types: ['occupation'] }, "improvement param 'types' must be a non-empty array of 'major' or 'minor'"],
    ['occupation', { allowedCards: ['A100_Curator'] }, "occupation param 'allowedCards' is not in the Workshop Capability Contract"],
    ['occupation', { exactCost: 'free' }, "occupation param 'exactCost' must be a resource object"],
    ['emit-choice', { options: 'a,b' }, "emit-choice param 'options' must be an array of { value: string, labelKey: string }"],
    // The options reach every client unchanged, so a malformed entry is refused here.
    ['emit-choice', { options: [null] }, "emit-choice param 'options' must be an array of { value: string, labelKey: string }"],
    ['emit-choice', { options: [{ value: 1, labelKey: 'One' }] }, "emit-choice param 'options' must be an array of { value: string, labelKey: string }"],
    ['emit-choice', { options: [{ value: 'a' }] }, "emit-choice param 'options' must be an array of { value: string, labelKey: string }"],
    ['emit-choice', { options: [{ value: 'a', labelKey: 'A', sourceCard: 'A100_Curator' }] },
      "emit-choice param 'options' must be an array of { value: string, labelKey: string }"],
    ['emit-choice', { options: [], promptKey: 1 }, "emit-choice param 'promptKey' must be a string"],
    ['emit-choice', { options: [], multiSelect: {} }, "emit-choice param 'multiSelect' is not in the Workshop Capability Contract"],
  ])('checks the documented params of %s', (actionId, params, message) => {
    expect(admit(leaf(actionId, params))).toThrow(`flow: ${message}`)
  })

  it('opens the selection candidates in actionContext for the selection leaf only', () => {
    const context = { selectableTiles: [{ row: 0, col: 2 }], minSelections: 1, maxSelections: 1 }
    expect(admit(leaf('selection', {}, { actionContext: context }))).not.toThrow()
    expect(admit(leaf('plow', {}, { actionContext: context })))
      .toThrow("flow: actionContext key 'selectableTiles' is not in the Workshop Capability Contract")
    expect(admit(leaf('selection', {}, { actionContext: { selectionKind: 'occupation-hand' } })))
      .toThrow("flow: actionContext key 'selectionKind' is not in the Workshop Capability Contract")
    expect(admit(leaf('selection', {}, { actionContext: { selectableTiles: '0-2' } })))
      .toThrow("flow: actionContext key 'selectableTiles' must be an array of { row, col }")
    expect(admit(leaf('selection', {}, { actionContext: { maxSelections: '2' } })))
      .toThrow("flow: actionContext key 'maxSelections' must be a finite number")
  })

  it('binds what a custom reap and breed mean, and admits the bound flow again', () => {
    const reap = leaf('reap', {}, { actionContext: { targetPlayerId: 'p2' } })
    const breed = leaf('breed')
    admitCustomFlow({ type: 'seq', children: [reap, breed] }, CARD_ID)

    expect(reap.actionContext).toEqual({ targetPlayerId: 'p2', trigger: { phase: 'private-field-phase' } })
    expect((breed as Record<string, unknown>).actionContext).toEqual({ sourceCard: CARD_ID })
    // Session dispatch admits a listener result a second time.
    expect(admit({ type: 'seq', children: [reap, breed] })).not.toThrow()

    // A card cannot present its reap as the Harvest field phase, or its breeding as Harvest breeding.
    expect(admit(leaf('reap', {}, { actionContext: { trigger: { phase: 'harvest' } } })))
      .toThrow("flow: actionContext key 'trigger' is not in the Workshop Capability Contract")
    expect(admit(leaf('breed', {}, { actionContext: { sourceCard: 'harvest' } })))
      .toThrow("flow: actionContext key 'sourceCard' is not in the Workshop Capability Contract")
  })

  it.each([...SANDBOX_NATIVE_ACTION_IDS])('accepts the native action %s only as a flow leaf', (actionId) => {
    // A replacement keeps the replaced action's context, and a follow-up entry has no node.
    expect(() => validateCustomListenerResult({ actionId }, CARD_ID))
      .toThrow(`actionId: actionId '${actionId}' must be returned as a flow leaf`)
    expect(() => validateCustomListenerResult({ followUpActions: ['gain', { actionId }] }, CARD_ID))
      .toThrow(`followUpActions[1]: actionId '${actionId}' must be returned as a flow leaf`)
    expect(() => validateCustomListenerResult({ flow: leaf(actionId, DOCUMENTED_PARAMS[actionId]) }, CARD_ID)).not.toThrow()
  })

  it('still accepts the goods and card-state actions as a replacement or a follow-up', () => {
    expect(() => validateCustomListenerResult({ actionId: 'bake-bread' }, CARD_ID)).not.toThrow()
    expect(() => validateCustomListenerResult({ followUpActions: ['gain', { actionId: 'bonus-vp' }] }, CARD_ID)).not.toThrow()
  })

  it('opens trueAction on any leaf as a boolean', () => {
    expect(admit(leaf('construct', {}, { actionContext: { trueAction: false } }))).not.toThrow()
    expect(admit(leaf('bake-bread', {}, { actionContext: { trueAction: false, targetPlayerId: 'p2' } }))).not.toThrow()
    // Only the boolean false marks a granted action; the string would be read as a true action.
    expect(admit(leaf('construct', {}, { actionContext: { trueAction: 'false' } })))
      .toThrow('flow: actionContext.trueAction must be a boolean')
    expect(admit(leaf('construct', {}, { actionContext: { trueAction: 0 } })))
      .toThrow('flow: actionContext.trueAction must be a boolean')
  })
})
