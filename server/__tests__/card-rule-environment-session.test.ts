import { beforeEach, describe, expect, it } from 'vitest'
import { getActiveCardRegistry, setActiveCardRegistry, withActiveRegistry } from '../../shared/cards/active-registry'
import { getCardEffect } from '../../shared/cards/card-effects'
import { getListenerById, getRegisteredCardListeners } from '../../shared/cards/card-listeners'
import { getCardModifiers } from '../../shared/cards/card-modifiers'
import { meetsCardPrerequisites } from '../../shared/cards/helpers/prerequisites'
import { CardRegistry } from '../../shared/cards/registry'
import { getMinorImprovementEffectiveCost, getPrintedImprovementCostCandidates } from '../../shared/actions/helpers/improvement-helpers'
import { getCardDefinition } from '../../shared/cards/catalog'
import { createWorkSession } from './_helpers/session-fixtures'

// These tests deliberately have no ambient rule environment. Session commands
// must bind their own registry; unrelated Sessions cannot supply a default.
beforeEach(() => setActiveCardRegistry(null))

describe('Session card rule environment', () => {
  it('creates and queries two-player games without publishing their card rules', async () => {
    const first = createWorkSession({ seed: 42 })
    expect(first.getState().state.players).toHaveLength(2)
    expect(getActiveCardRegistry()).toBeNull()
    expect(() => getCardEffect('B038_FutureBuildingSite')).toThrow('no active CardRegistry')

    const second = createWorkSession({ seed: 43 })
    expect(second.getAvailableActions(0)).not.toHaveLength(0)
    await Promise.resolve()
    expect(getActiveCardRegistry()).toBeNull()
    expect(() => getCardEffect('B038_FutureBuildingSite')).toThrow('no active CardRegistry')
    first.dispose()
    second.dispose()
  })

  it('distinguishes missing rule environments from valid empty registries and metadata', () => {
    const session = createWorkSession({ seed: 42 })
    const state = session.getState().state
    const player = state.players[0]!
    const card = { id: 'TEST_NoEffect', name: 'No effect', deck: 'test', number: 1, desc: [], cost: { wood: 2 } }
    const lookups = [
      () => getCardEffect(card.id),
      () => getRegisteredCardListeners(),
      () => getListenerById('missing-listener'),
      () => getCardModifiers(card.id),
      () => meetsCardPrerequisites(player, card, state.round, state),
      () => getPrintedImprovementCostCandidates(state, player, card.id),
      () => getMinorImprovementEffectiveCost(state, player, card),
    ]
    for (const lookup of lookups) expect(lookup).toThrow('no active CardRegistry')

    withActiveRegistry(new CardRegistry(), () => {
      expect(getCardEffect(card.id)).toBeNull()
      expect(getRegisteredCardListeners()).toEqual([])
      expect(getListenerById('missing-listener')).toBeUndefined()
      expect(getCardModifiers(card.id)).toEqual([])
      expect(meetsCardPrerequisites(player, card, state.round, state)).toBe(true)
      expect(getMinorImprovementEffectiveCost(state, player, card)).toEqual({ wood: 2 })
    })
    expect(getCardDefinition('B038_FutureBuildingSite')?.name).toBeDefined()
    expect(getActiveCardRegistry()).toBeNull()
    session.dispose()
  })
})
