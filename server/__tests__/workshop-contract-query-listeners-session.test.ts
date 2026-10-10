import { afterEach, describe, expect, it } from 'vitest'
import { clearCustomCards } from '../../shared/cards/custom-registry'
import type { GameState } from '../../shared/contract/types'
import type { GameSession } from '../game/authoritative-session'
import { confirmNextPlayer } from './_helpers/pending-confirms'
import { compileContractCard, createRoundTenSession } from './_helpers/workshop-contract-card'

/**
 * ADR 0025 fixed behavior tests for the listener phases that answer a
 * question instead of reacting: isDoable, computeReplace,
 * computeChoiceCandidates and computeArgs. Each scenario is a two-player work
 * phase in round 10; player 0 has played a custom card with one listener.
 */

const CARD_ID = 'CUSTOM_QueryProbe'

const sessions: GameSession[] = []
afterEach(() => {
  for (const session of sessions.splice(0)) session.dispose()
  clearCustomCards()
})

const start = (
  listener: string,
  options: { workers?: [number, number]; configure?: (state: GameState) => void } = {},
) => {
  const session = createRoundTenSession(
    compileContractCard(CARD_ID, `const CARD_IMPL = { listeners: [{ cardIds: [CARD_ID], ${listener} }] }`),
    options,
  )
  sessions.push(session)
  return session
}

describe('Workshop Capability Contract query listeners', () => {
  it('isDoable: a veto makes the action space unavailable to the card owner only', () => {
    const session = start("actions: ['plow'], phases: ['isDoable'], handler: () => ({ doable: false })", { workers: [2, 2] })

    const vetoed = session.takeAction(0, 'farmland')

    expect(vetoed).toMatchObject({ ok: false, error: 'space unavailable' })
    expect(vetoed.state.actionSpaces.find(space => space.id === 'farmland')!.takenBy).toEqual([])

    // The owner can still act elsewhere, and the opponent can plow.
    expect(session.takeAction(0, 'forest').ok).toBe(true)
    confirmNextPlayer(session)
    expect(session.takeAction(1, 'farmland').interaction).toMatchObject({
      stateId: 'wait', playerIndex: 1, request: { kind: 'farm-select', farm: { farmType: 'plow' } },
    })
    expect(session.cardWarnings).toEqual([])
  })

  describe('computeReplace', () => {
    const DECLINE = `actions: ['plow'], phases: ['computeReplace'],
      handler: () => ({ decline: true, sourceCard: CARD_ID, alternativeFlow: gainLeaf(CARD_ID, { food: 3 }) })`

    const offer = (session: GameSession) => {
      const offered = session.takeAction(0, 'farmland')
      expect(offered.interaction).toMatchObject({
        stateId: 'wait', playerIndex: 0, promptKey: 'ui.interactionSelectReplacement', request: { kind: 'choice' },
      })
      if (offered.interaction.stateId !== 'wait') throw new Error('expected the replacement choice')
      const options = offered.interaction.request.options!
      expect(options.map(option => [option.labelKey, option.sourceCard])).toEqual([
        ['actions.gain.name', CARD_ID],
        ['ui.interactionDoNotReplace', undefined],
      ])
      return options
    }

    it('offers the alternative flow in place of the action', () => {
      const session = start(DECLINE)

      const replaced = session.resolveChoice(0, offer(session)[0]!.value)

      expect(replaced.ok).toBe(true)
      expect(replaced.state.players[0]!.resources.food).toBe(13)
      expect(replaced.state.players[0]!.fields).toEqual([])
      expect(replaced.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'confirm-next-player' } })
      expect(session.cardWarnings).toEqual([])
    })

    it('keeps the original action when the player declines the alternative', () => {
      const session = start(DECLINE)

      const kept = session.resolveChoice(0, offer(session)[1]!.value)

      expect(kept.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'farm-select', farm: { farmType: 'plow' } } })
      expect(kept.state.players[0]!.resources.food).toBe(10)
    })

    it('runs another contract action when the listener returns its actionId, attributed to the card', () => {
      const session = start("actions: ['plow'], phases: ['computeReplace'], handler: () => ({ actionId: 'bonus-vp' })")

      const replaced = session.takeAction(0, 'farmland')

      expect(replaced.ok).toBe(true)
      expect(replaced.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'confirm-next-player' } })
      expect(replaced.state.players[0]!.fields).toEqual([])
      expect(replaced.state.players[0]!.cardStates[CARD_ID]?.counters).toEqual({ bonusVp: 1 })
      expect(session.cardWarnings).toEqual([])
    })
  })

  it('computeChoiceCandidates: adds a major improvement to a minor improvement action', () => {
    const session = start(`actions: ['improvement'], phases: ['computeChoiceCandidates'],
      handler: () => ({ sourceCard: CARD_ID, extraOptions: [
        { value: 'Major_Fireplace1', labelKey: 'improvements.Major_Fireplace1.name', sourceCard: CARD_ID }] })`,
    { configure: (state) => { state.players[0]!.resources.clay = 2 } })

    // Meeting Place allows a minor improvement only; the hand holds none that can be played.
    const offered = session.takeAction(0, 'meeting-place')
    if (offered.interaction.stateId !== 'wait' || offered.interaction.request.kind !== 'choice') throw new Error('expected the optional improvement')
    const improvement = offered.interaction.request.options!.find(option => option.labelKey === 'actions.improvement.name')!

    const built = session.resolveChoice(0, improvement.value)

    expect(built.ok).toBe(true)
    expect(built.state.players[0]!.improvements).toEqual(['Major_Fireplace1'])
    expect(built.state.players[0]!.resources.clay).toBe(0)
    expect(built.state.availableMajorImprovements).not.toContain('Major_Fireplace1')
    expect(session.cardWarnings).toEqual([])
  })

  it('computeArgs: lets the owner place a worker on the occupied space the listener names', () => {
    const session = start(`actions: ['place-farmer'], phases: ['computeArgs'],
      handler: () => ({ sourceCard: CARD_ID, extraOptions: [
        { value: 'allow-occupied:forest', labelKey: 'actions.forest.name', sourceCard: CARD_ID }] })`,
    { workers: [2, 2], configure: (state) => { state.currentPlayerIndex = 1 } })

    expect(session.takeAction(1, 'forest').ok).toBe(true)
    confirmNextPlayer(session)
    const shared = session.takeAction(0, 'forest')

    expect(shared.ok).toBe(true)
    expect(shared.state.actionSpaces.find(space => space.id === 'forest')!.takenBy.map(ref => ref.playerId))
      .toEqual(shared.state.players.map(player => player.id).reverse())

    // Any other occupied space stays closed.
    confirmNextPlayer(session)
    expect(session.takeAction(1, 'clay-pit').ok).toBe(true)
    confirmNextPlayer(session)
    expect(session.takeAction(0, 'clay-pit')).toMatchObject({ ok: false })
    expect(session.cardWarnings).toEqual([])
  })
})
