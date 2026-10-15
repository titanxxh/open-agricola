import { beforeEach, describe, expect, it } from 'vitest'
import { getActiveCardRegistry, setActiveCardRegistry, withActiveRegistry } from '../../shared/cards/active-registry'
import { getCardEffect } from '../../shared/cards/card-effects'
import { getListenerById, getRegisteredCardListeners } from '../../shared/cards/card-listeners'
import { getCardModifiers } from '../../shared/cards/card-modifiers'
import { meetsCardPrerequisites } from '../../shared/cards/helpers/prerequisites'
import { CardRegistry } from '../../shared/cards/registry'
import { getMinorImprovementEffectiveCost, getPrintedImprovementCostCandidates } from '../../shared/actions/helpers/improvement-helpers'
import { getCardDefinition } from '../../shared/cards/catalog'
import type { CustomCardData } from '../../shared/cards/session-card-context'
import { rehydrateState, serializeSessionSnapshot } from '../../shared/session/serialization'
import { GameSession } from '../game/authoritative-session'
import { validateAndCompileCustomCode } from '../custom-code/engine'
import { createWorkSession } from './_helpers/session-fixtures'

const CARD_ID = 'CUSTOM_SessionRuleEnvironment'
const customCard = (discount: number, reward: number): CustomCardData => {
  const compiled = validateAndCompileCustomCode(`
const CARD_ID = '${CARD_ID}'
const CARD_DEF = MinorImprovement({ id: CARD_ID, name: 'Session Rule Environment' })
const CARD_IMPL = { listeners: [{ cardIds: [CARD_ID], actions: ['collect'], phases: ['after'],
  handler: () => ({ flow: { type: 'seq', children: [
    { type: 'leaf', actionId: 'occupation', sourceCard: CARD_ID, params: { exactCost: { food: 3 } } },
    gainLeaf(CARD_ID, { grain: ${reward} }),
  ] } }) }] }
`, CARD_ID)
  if (!compiled.valid) throw new Error(compiled.errors.join('\n'))
  return {
    cardType: 'minor',
    cardJson: { id: CARD_ID, name: 'Session Rule Environment', deck: 'CUSTOM', number: 0, desc: [],
      modifier: { type: 'bonus', cardId: CARD_ID, appliesTo: ['occupation'], discount: { food: discount } } },
    compiledCode: compiled.compiledCode,
    codeManifest: compiled.manifest,
  }
}

const configuredSession = (card: CustomCardData) => createWorkSession({
  customCards: [card],
  configure: state => {
    state.players[0]!.minorPlayed = [CARD_ID]
    state.players[0]!.occupationHand = ['A102_Grocer', 'A118_Treegardener']
    Object.assign(state.players[0]!.resources, { food: 10, grain: 0, wood: 0 })
    state.actionSpaces.find(space => space.id === 'forest')!.resources = { wood: 3 }
  },
})

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

  it('rehydrates before rebuilding a custom card modifier in its restored Session', () => {
    const card = customCard(1, 2)
    const source = configuredSession(card)
    const snapshot = JSON.parse(JSON.stringify(serializeSessionSnapshot(source.state, source)))
    source.dispose()
    const restored = new GameSession(rehydrateState(snapshot), [card])
    expect(getActiveCardRegistry()).toBeNull()
    const offered = restored.takeAction(0, 'forest')
    expect(offered.ok, offered.error).toBe(true)
    expect(offered.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'choice' } })
    const response = restored.resolveChoice(0, 'A102_Grocer')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 8, grain: 2, wood: 3 })
    expect(restored.cardWarnings).toEqual([])
    restored.dispose()
  })
})
