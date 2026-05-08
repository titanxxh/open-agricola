import { describe, expect, it, beforeEach } from 'vitest'
import type { ActionDefinition } from '../../../contract/types'
import {
  registerAdHocAction,
  getAdHocAction,
  getAllAdHocActions,
  _resetAdHocRegistry,
} from '../../helpers/ad-hoc-action-registry'

const makeDef = (id: string): ActionDefinition => ({
  id,
  nameKey: 'actions.test.name',
  descriptionKey: 'actions.test.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  execute: () => ({ type: 'ok' }),
})

describe('ad-hoc action registry', () => {
  beforeEach(() => _resetAdHocRegistry())

  it('register + lookup correctly', () => {
    const def = makeDef('card_TestCard_action')
    registerAdHocAction(def)
    expect(getAdHocAction('card_TestCard_action')).toBe(def)
  })

  it('throws when id does not start with card_', () => {
    expect(() => registerAdHocAction(makeDef('plow'))).toThrow(/must start with 'card_'/)
  })

  it('throws on duplicate id', () => {
    const def = makeDef('card_X_y')
    registerAdHocAction(def)
    expect(() => registerAdHocAction(def)).toThrow(/already registered/)
  })

  it('returns undefined for unknown id', () => {
    expect(getAdHocAction('card_UnknownX')).toBeUndefined()
  })

  it('lists all registered via getAllAdHocActions', () => {
    registerAdHocAction(makeDef('card_A_x'))
    registerAdHocAction(makeDef('card_B_y'))
    expect(getAllAdHocActions().map(d => d.id).sort()).toEqual(['card_A_x', 'card_B_y'])
  })
})
