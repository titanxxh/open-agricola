import { afterEach, describe, expect, it } from 'vitest'
import type { CustomCardData } from '../../shared/cards/session-card-context'
import { clearCustomCards } from '../../shared/cards/custom-registry'
import type { GameSession } from '../game/authoritative-session'
import { validateAndCompileCustomCode } from '../custom-code/engine'
import { createWorkSession } from './_helpers/session-fixtures'

/**
 * ADR 0025: a custom card result outside the Workshop Capability Contract is
 * rejected as a whole, through the existing hook-failure path. Each scenario is
 * a fresh two-player work-phase game (seed 42) with fixed placeholder hands,
 * the custom card already played by player 0, and Forest untaken.
 */

const CARD_ID = 'CUSTOM_ContractProbe'

// Leaves are assembled at runtime so that source validation cannot see them.
const sources = {
  listenerOutsideContract: `
    listeners: [{ cardIds: [CARD_ID], actions: ['collect'], phases: ['after'],
      handler: () => ({ sourceCard: CARD_ID, flow: { type: 'seq', children: [
        gainLeaf(CARD_ID, { food: 1 }),
        { type: 'leaf', actionId: ['pl', 'ow'].join(''), sourceCard: CARD_ID },
      ] } }) }],`,
  effectOutsideContract: `
    effect: { id: CARD_ID, onEndTurn: () => ({ type: 'seq', children: [
      gainLeaf(CARD_ID, { food: 1 }),
      { type: 'leaf', actionId: 'special-effect', sourceCard: CARD_ID,
        params: { kind: ['consume', 'supply', 'token'].join('-'), key: 'fence' } },
    ] }) },`,
  listenerInsideContract: `
    listeners: [{ cardIds: [CARD_ID], actions: ['collect'], phases: ['after'],
      handler: () => ({ sourceCard: CARD_ID, flow: gainLeaf(CARD_ID, { food: 1 }) }) }],`,
  unboundListener: `
    listeners: [{ actions: ['collect'], phases: ['after'],
      handler: () => ({ sourceCard: CARD_ID, flow: gainLeaf(CARD_ID, { food: 1 }) }) }],`,
  unfilteredListener: `
    listeners: [{ cardIds: [CARD_ID], phases: ['isDoable', 'after'],
      handler: (context) => {
        if (context.actionId === 'forest') throw new Error('received an action-space identity')
        if (context.phase === 'after' && context.actionId === 'collect') {
          return { sourceCard: CARD_ID, flow: gainLeaf(CARD_ID, { food: 1 }) }
        }
      } }],`,
}

const sessions: GameSession[] = []
afterEach(() => {
  for (const session of sessions.splice(0)) session.dispose()
  clearCustomCards()
})

const start = (impl: string, { savedWithoutActions = false, savedWithoutCardIds = false, inHand = false } = {}) => {
  const compiled = validateAndCompileCustomCode(`
const CARD_ID = '${CARD_ID}'
const CARD_DEF = MinorImprovement({ id: CARD_ID, name: 'Contract Probe' })
const CARD_IMPL = {${impl}
}
  `, CARD_ID)
  if (!compiled.valid) throw new Error(compiled.errors.join('\n'))
  const card: CustomCardData = {
    cardType: 'minor',
    cardJson: { id: CARD_ID, name: 'Contract Probe', deck: 'CUSTOM', number: 0, desc: [] },
    compiledCode: compiled.compiledCode,
    // A manifest saved before ADR 0025 carries no bound action filter or card binding.
    codeManifest: { ...compiled.manifest, listeners: compiled.manifest.listeners.map(({ actions, cardIds, ...listener }) => ({
      ...listener,
      ...(savedWithoutActions ? {} : { actions }),
      ...(savedWithoutCardIds ? {} : { cardIds }),
    })) },
  }
  const session = createWorkSession({
    customCards: [card],
    configure: (state) => {
      if (inHand) state.players[0]!.minorHand = [CARD_ID]
      else state.players[0]!.minorPlayed = [CARD_ID]
      state.players[0]!.resources.wood = 0
      state.players[0]!.resources.food = 0
      state.actionSpaces.find(space => space.id === 'forest')!.resources = { wood: 3 }
    },
  })
  sessions.push(session)
  return session
}

const forest = (session: GameSession) => session.getState().state.actionSpaces.find(space => space.id === 'forest')!

describe('Workshop Capability Contract at the Session boundary', () => {
  it.each([
    ['listener', sources.listenerOutsideContract, "actionId 'plow' is not in the Workshop Capability Contract"],
    ['effect hook', sources.effectOutsideContract, "special-effect kind 'consume-supply-token' is not in the Workshop Capability Contract"],
  ])('rejects the command when a %s returns a flow outside the contract, then skips the card on retry', (_kind, impl, message) => {
    const session = start(impl)
    const { fields: fieldsBefore, cardStates: cardStatesBefore } = structuredClone(session.getState().state.players[0]!)

    const rejected = session.takeAction(0, 'forest')

    expect(rejected.ok).toBe(false)
    expect(rejected.error).toContain(message)
    expect(session.cardWarnings).toEqual([expect.stringContaining(message)])
    // The whole command is rolled back: no placement, no resources, and no part of the flow ran.
    expect(forest(session).takenBy).toEqual([])
    expect(forest(session).resources).toEqual({ wood: 3 })
    expect(rejected.state.players[0]!.resources).toMatchObject({ wood: 0, food: 0 })
    expect(rejected.state.currentPlayerIndex).toBe(0)
    expect(rejected.interaction.stateId).toBe('idle')

    const retried = session.takeAction(0, 'forest')

    // Deliberate: the repeated failure is not a new warning, so the game continues without the card.
    expect(retried.ok).toBe(true)
    expect(session.cardWarnings).toHaveLength(1)
    expect(forest(session).takenBy).toHaveLength(1)
    expect(retried.state.players[0]!.resources).toMatchObject({ wood: 3, food: 0 })
    expect(retried.state.players[0]!.fields).toEqual(fieldsBefore)
    expect(retried.state.players[0]!.cardStates[CARD_ID]).toEqual(cardStatesBefore[CARD_ID])
  })

  it.each([
    ['a newly compiled manifest', false],
    ['a manifest saved without an action filter', true],
  ])('binds an unfiltered listener to the listed actions for %s', (_label, savedWithoutActions) => {
    const session = start(sources.unfilteredListener, { savedWithoutActions })

    const response = session.takeAction(0, 'forest')

    // The listener never sees the action-space identity, and still reacts to the listed collect action.
    expect(response.ok).toBe(true)
    expect(session.cardWarnings).toEqual([])
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 3, food: 1 })
  })

  it.each([
    ['a newly compiled manifest', false],
    ['a manifest saved without a card binding', true],
  ])('runs a listener that omits cardIds only while its card is in play, for %s', (_label, savedWithoutCardIds) => {
    const played = start(sources.unboundListener, { savedWithoutCardIds })
    expect(played.takeAction(0, 'forest').state.players[0]!.resources).toMatchObject({ wood: 3, food: 1 })

    const inHand = start(sources.unboundListener, { savedWithoutCardIds, inHand: true })
    const response = inHand.takeAction(0, 'forest')

    expect(response.ok).toBe(true)
    expect(inHand.cardWarnings).toEqual([])
    expect(response.state.players[0]!.minorHand).toEqual([CARD_ID])
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 3, food: 0 })
  })

  it('runs a listener flow that stays inside the contract', () => {
    const session = start(sources.listenerInsideContract)

    const response = session.takeAction(0, 'forest')

    expect(response.ok).toBe(true)
    expect(session.cardWarnings).toEqual([])
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 3, food: 1 })
    expect(response.state.log.some(entry => JSON.stringify(entry).includes(CARD_ID))).toBe(true)
  })
})
