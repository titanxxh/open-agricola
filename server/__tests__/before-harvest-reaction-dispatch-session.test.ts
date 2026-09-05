import { describe, expect, it } from 'vitest'

import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { requireActiveCardRegistry } from '../../shared/cards/active-registry'
import type { CardEffect } from '../../shared/cards/card-effects'
import { markAllWorkersUsed, setActiveWorkerCount } from '../../shared/domain/player'
import { writeCardExtraData } from '../../shared/cards/helpers/card-state'
import { rehydrateState, serializeSessionSnapshot } from '../../shared/session/serialization'
import { confirmPlayerSwitch } from './_helpers/pending-confirms'

const OPTIONAL = 'TEST_BeforeHarvestOptional'
const MANDATORY = 'TEST_BeforeHarvestMandatory'
const SKIP_HARVEST_ROUND_KEY = 'skipHarvestRound'

const setPlaceholderHands = (session: GameSession) => {
  session.state.players.forEach((player) => {
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
    player.minorPlayed = []
    player.occupationPlayed = []
    player.improvements = []
    player.cardStates = {}
    player.resources.food = 20
    markAllWorkersUsed(session.state, player)
    setActiveWorkerCount(player, 0)
  })
}

const setupRoundFour = (playerCount = 3) => {
  const session = new GameSession(822, undefined, { playerCount })
  session.state.round = 4
  session.state.roundPhase = 'work'
  setPlaceholderHands(session)
  session.loadState(session.state)
  return session
}

const optionalEffect = (id: string): CardEffect => ({
  id,
  onBeforeHarvest: () => ({
    type: 'leaf',
    actionId: 'gain',
    params: { wood: 1 },
    sourceCard: id,
    optional: true,
  }),
})

const mandatoryEffect: CardEffect = {
  id: MANDATORY,
  onBeforeHarvest: () => ({
    type: 'leaf',
    actionId: 'gain',
    params: { food: 1 },
    sourceCard: MANDATORY,
  }),
}

const expectWait = (response: SessionResponse, playerIndex: number) => {
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') throw new Error('expected wait')
  expect(response.interaction.playerIndex).toBe(playerIndex)
  return response.interaction
}

describe('Before-Harvest reaction dispatch', () => {
  it('starts from the Start Player Marker and wraps through seat order', () => {
    const session = setupRoundFour()
    session.state.players[1]!.startPlayer = true
    session.state.players[0]!.startPlayer = false
    session.state.players[0]!.occupationPlayed = [`${OPTIONAL}-p0`]
    session.state.players[1]!.occupationPlayed = [`${OPTIONAL}-p1`]
    requireActiveCardRegistry('before-harvest order test').setEffect(optionalEffect(`${OPTIONAL}-p0`))
    requireActiveCardRegistry('before-harvest order test').setEffect(optionalEffect(`${OPTIONAL}-p1`))
    session.loadState(session.state)

    const response = session.performRoundEnd()

    const interaction = expectWait(response, 1)
    expect(interaction.sourceCard).toBe(`${OPTIONAL}-p1`)
  })

  it('keeps the original player order after the window has started', () => {
    const session = setupRoundFour()
    session.state.players[1]!.startPlayer = true
    session.state.players[0]!.startPlayer = false
    session.state.players[0]!.occupationPlayed = [`${OPTIONAL}-p0`]
    session.state.players[1]!.occupationPlayed = [`${OPTIONAL}-p1`]
    session.state.players[2]!.occupationPlayed = [`${OPTIONAL}-p2`]
    for (const suffix of ['p0', 'p1', 'p2']) {
      requireActiveCardRegistry('before-harvest frozen order test')
        .setEffect(optionalEffect(`${OPTIONAL}-${suffix}`))
    }
    session.loadState(session.state)

    let response = session.performRoundEnd()
    expectWait(response, 1)

    session.state.players[1]!.startPlayer = false
    session.state.players[0]!.startPlayer = true
    response = session.resolveChoice(1, '__skip__')
    response = confirmPlayerSwitch(session)

    const interaction = expectWait(response, 2)
    expect(interaction.sourceCard).toBe(`${OPTIONAL}-p2`)
  })

  it('preserves the frozen player order across serialization', () => {
    const session = setupRoundFour()
    session.state.players[1]!.startPlayer = true
    session.state.players[0]!.startPlayer = false
    session.state.players[0]!.occupationPlayed = [`${OPTIONAL}-p0`]
    session.state.players[1]!.occupationPlayed = [`${OPTIONAL}-p1`]
    session.state.players[2]!.occupationPlayed = [`${OPTIONAL}-p2`]
    for (const suffix of ['p0', 'p1', 'p2']) {
      requireActiveCardRegistry('before-harvest serialized order test')
        .setEffect(optionalEffect(`${OPTIONAL}-${suffix}`))
    }
    session.loadState(session.state)

    expectWait(session.performRoundEnd(), 1)
    session.state.players[1]!.startPlayer = false
    session.state.players[0]!.startPlayer = true
    const snapshot = serializeSessionSnapshot(session.state, session)
    const restored = new GameSession(rehydrateState(JSON.parse(JSON.stringify(snapshot))))
    for (const suffix of ['p0', 'p1', 'p2']) {
      requireActiveCardRegistry('before-harvest restored order test')
        .setEffect(optionalEffect(`${OPTIONAL}-${suffix}`))
    }

    let response = restored.resolveChoice(1, '__skip__')
    response = confirmPlayerSwitch(restored)

    const interaction = expectWait(response, 2)
    expect(interaction.sourceCard).toBe(`${OPTIONAL}-p2`)
  })

  it('offers same-player effects through trigger-select and disables pass while a mandatory effect remains', () => {
    const session = setupRoundFour(2)
    const player = session.state.players[0]!
    player.occupationPlayed = [OPTIONAL, MANDATORY]
    requireActiveCardRegistry('before-harvest trigger-select test').setEffect(optionalEffect(OPTIONAL))
    requireActiveCardRegistry('before-harvest trigger-select test').setEffect(mandatoryEffect)
    session.loadState(session.state)

    const response = session.performRoundEnd()

    const interaction = expectWait(response, 0)
    expect(interaction.request.kind).toBe('select-trigger')
    expect(interaction.request.options).toEqual(expect.arrayContaining([
      expect.objectContaining({ value: OPTIONAL, sourceCard: OPTIONAL }),
      expect.objectContaining({ value: MANDATORY, sourceCard: MANDATORY }),
      expect.objectContaining({ value: '__pass__', disabled: true }),
    ]))

    const afterOptional = session.resolveChoice(0, OPTIONAL)
    expect(afterOptional.state.players[0]!.resources.wood).toBe(1)
    const remaining = expectWait(afterOptional, 0)
    expect(remaining.request.kind).toBe('select-trigger')
    expect(remaining.request.options).toEqual(expect.arrayContaining([
      expect.objectContaining({ value: MANDATORY, sourceCard: MANDATORY }),
      expect.objectContaining({ value: '__pass__', disabled: true }),
    ]))
    expect(remaining.request.options).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ value: OPTIONAL }),
    ]))
  })

  it('does not skip the Before-Harvest window for a player who skips the Harvest itself', () => {
    const session = setupRoundFour(2)
    const player = session.state.players[0]!
    player.occupationPlayed = [OPTIONAL]
    writeCardExtraData(player, 'TEST_HarvestSkip', SKIP_HARVEST_ROUND_KEY, 4)
    requireActiveCardRegistry('before-harvest skip test').setEffect(optionalEffect(OPTIONAL))
    session.loadState(session.state)

    const response = session.performRoundEnd()

    const interaction = expectWait(response, 0)
    expect(interaction.sourceCard).toBe(OPTIONAL)
  })
})
