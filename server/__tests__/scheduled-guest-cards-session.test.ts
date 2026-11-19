import { afterEach, describe, expect, it } from 'vitest'
import type { GameState } from '../../shared/contract/types'
import { rehydrateState, serializeSessionSnapshot } from '../../shared/session/serialization'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { playOccupation } from './_helpers/card-play-lifecycle'
import { confirmNextPlayer } from './_helpers/pending-confirms'
import { assertRejectedUnchanged, getChoiceOptions } from './_helpers/session-assertions'
import { createWorkSession } from './_helpers/session-fixtures'

const EMPLOYER = 'CNL061_Employer'
const ANATOMIST = 'CFL040_Anatomist'
const PLACEHOLDER = '__test_placeholder__'
const sessions: GameSession[] = []

afterEach(() => sessions.splice(0).forEach(session => session.dispose()))

function setup(round: number, cardId: string) {
  const session = createWorkSession({ seed: 62, configure(state) {
    state.round = round
    for (const player of state.players) {
      player.minorHand = [PLACEHOLDER]
      player.occupationHand = [PLACEHOLDER]
    }
    const owner = state.players[0]!
    owner.occupationHand = [cardId, PLACEHOLDER]
    owner.occupationPlayed = ['A117_WoodCarrier']
    owner.resources.food = 1
  } })
  sessions.push(session)
  return session
}

function playCard(session: GameSession, cardId: string) {
  const played = playOccupation(session, cardId)
  const owner = played.state.players[0]!
  expect(owner.occupationPlayed).toContain(cardId)
  expect(owner.occupationHand).toEqual([PLACEHOLDER])
  expect(owner.resources.food).toBe(0)
  expect(played.state.events).toContainEqual(expect.objectContaining({
    type: 'card.played', cardId, payment: expect.objectContaining({ resources: { food: 1 } }),
  }))
  return played
}

// Lessons used A's first family member. Finish that round via the normal rotation.
function finishPurchaseRound(session: GameSession) {
  expect(confirmNextPlayer(session).ok).toBe(true)
  for (const [seat, space] of [[1, 'day-laborer'], [0, 'forest'], [1, 'clay-pit']] as const) {
    expect(session.takeAction(seat, space).ok).toBe(true)
    expect(confirmNextPlayer(session).ok).toBe(true)
  }
}

function restore(session: GameSession) {
  const restored = new GameSession(rehydrateState(JSON.parse(JSON.stringify(serializeSessionSnapshot(session.state, session)))))
  sessions.push(restored)
  return restored
}

const grantRounds = (response: SessionResponse, cardId: string) => response.state.events.flatMap(event =>
  event.type === 'guest.granted' && event.cardId === cardId ? [event.targetRound] : [])

function guestChoice(response: SessionResponse, cardId: string) {
  const option = getChoiceOptions(response).find(candidate => candidate.labelParams?.guestCardId === cardId)
  expect(option).toBeDefined()
  return option!
}

function placeFamilies(session: GameSession, spaces: readonly [string, string, string, string]) {
  spaces.forEach((space, index) => {
    expect(session.getState().interaction.stateId).toBe('idle')
    const taken = session.takeAction(index % 2, space)
    expect(taken.ok, taken.error).toBe(true)
    expect(confirmNextPlayer(session).ok).toBe(true)
  })
  return session.getState()
}

function loadRound(session: GameSession, round: number, configure?: (state: GameState) => void) {
  const state = { ...session.getState().state, round }
  configure?.(state)
  const loaded = session.loadState(state)
  expect(loaded.ok, loaded.error).toBe(true)
}

describe('Employer', () => {
  it.each([[2, [6, 9, 12]], [4, [8, 11, 14]], [6, [10, 13]], [11, []]] as const)(
    'books its own-turn Guests when played in round %i', (round, expectedRounds) => {
      const played = playCard(setup(round, EMPLOYER), EMPLOYER)
      expect(played.state.players[0]!.guests ?? []).toEqual(expectedRounds.map((round, index) => ({
        id: `guest:${index + 1}`, sourceCardId: EMPLOYER, round,
      })))
      expect(grantRounds(played, EMPLOYER)).toEqual(expectedRounds)
    },
  )

  it('keeps its booking on the player through card removal, save and restore, and arrival in round 6', () => {
    const session = setup(2, EMPLOYER)
    const played = playCard(session, EMPLOYER)
    const guests = played.state.players[0]!.guests
    finishPurchaseRound(session)
    const state = session.getState().state
    state.players[0]!.occupationPlayed = ['A117_WoodCarrier']
    expect(session.loadState({ ...state, round: 5 }).interaction.stateId).toBe('idle')

    const booked = restore(session)
    expect(booked.state.players[0]!.guests).toEqual(guests)
    expect(booked.state.players[0]!.occupationPlayed).not.toContain(EMPLOYER)
    const arrived = placeFamilies(booked, ['forest', 'day-laborer', 'clay-pit', 'reed-bank'])
    expect(arrived.state.round).toBe(6)
    expect(arrived.state.players[0]!.guests).toEqual(guests)
    expect(arrived.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0 })

    const resumed = restore(booked)
    const choice = guestChoice(resumed.getState(), EMPLOYER)
    expect(resumed.resolveChoice(0, choice.value).ok).toBe(true)
    const dispatched = resumed.resolveChoice(0, 'fishing')
    expect(dispatched.ok, dispatched.error).toBe(true)
    expect(dispatched.state.actionSpaces.find(space => space.id === 'fishing')?.takenBy).toEqual([
      { playerId: dispatched.state.players[0]!.id, workerId: 'guest:1', guest: true },
    ])
    expect(dispatched.state.players[0]!.guests?.[0]).toMatchObject({ id: 'guest:1', dispatched: true })
  })
})

describe('Anatomist', () => {
  const bookedRounds = (response: SessionResponse) =>
    [7, 10, 13].filter(round => response.state.players[0]!.cardStates[ANATOMIST]?.extraData?.[`guestRound${round}`] === round)
  // The public round-space markers, as clients receive them.
  const markerRounds = (session: GameSession, response: SessionResponse) => (session.buildSyncPayload(response, []).state.players[0]!.scheduledEffects ?? [])
    .filter(effect => effect.sourceCard === ANATOMIST).map(effect => effect.round)

  it.each([[5, [7, 10, 13]], [7, [10, 13]], [8, [10, 13]], [13, []]] as const)(
    'books only unrevealed rounds when played in round %i, shown on those round spaces', (round, expectedRounds) => {
      const session = setup(round, ANATOMIST)
      const played = playCard(session, ANATOMIST)
      // The card books the rounds itself; no Guest exists until its round's extra turn.
      expect(played.state.players[0]!.guests ?? []).toEqual([])
      expect(grantRounds(played, ANATOMIST)).toEqual([])
      expect(bookedRounds(played)).toEqual(expectedRounds)
      expect(markerRounds(session, played)).toEqual(expectedRounds)
    },
  )

  it('offers the Guest after both of its owner’s family members and limits placement to accumulation spaces', () => {
    const session = setup(8, ANATOMIST)
    playCard(session, ANATOMIST)
    finishPurchaseRound(session)
    loadRound(session, 10)

    expect(session.getState().interaction.stateId).toBe('idle')
    expect(session.takeAction(0, 'clay-pit').ok).toBe(true)
    expect(confirmNextPlayer(session).ok).toBe(true)
    expect(session.takeAction(1, 'grain-seeds').ok).toBe(true)
    expect(confirmNextPlayer(session).interaction.stateId).toBe('idle')
    expect(session.takeAction(0, 'day-laborer').ok).toBe(true)
    expect(confirmNextPlayer(session).ok).toBe(true)
    expect(session.takeAction(1, 'reed-bank').ok).toBe(true)
    const offered = confirmNextPlayer(session)
    expect(offered.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0 })
    expect(grantRounds(offered, ANATOMIST)).toEqual([10])

    const targets = session.resolveChoice(0, guestChoice(offered, ANATOMIST).value)
    expect(getChoiceOptions(targets).map(option => option.value)).toEqual([
      'forest', 'fishing', 'western-quarry', 'sheep-market', 'pig-market',
    ])
    assertRejectedUnchanged(session, () => session.resolveChoice(0, 'farmland'))
    const placed = session.resolveChoice(0, 'forest')
    expect(placed.ok, placed.error).toBe(true)
    expect(placed.state.actionSpaces.find(space => space.id === 'forest')?.takenBy).toEqual([
      { playerId: placed.state.players[0]!.id, workerId: 'guest:1', guest: true },
    ])
    // The round's Guest is used: it is not offered again, and only round 13 is still booked.
    expect(markerRounds(session, placed)).toEqual([13])
    expect(confirmNextPlayer(session).state.round).toBe(11)
  })

  it('lets the owner decline the round’s Guest and keeps the later booking', () => {
    const session = setup(8, ANATOMIST)
    playCard(session, ANATOMIST)
    finishPurchaseRound(session)
    loadRound(session, 10)
    const offered = placeFamilies(session, ['clay-pit', 'grain-seeds', 'day-laborer', 'reed-bank'])
    expect(offered.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0 })

    const decline = getChoiceOptions(offered).find(option => option.labelKey === 'ui.interactionDecline')
    expect(decline).toBeDefined()
    const declined = session.resolveChoice(0, decline!.value)
    expect(declined.ok, declined.error).toBe(true)
    expect(declined.state.players[0]!.guests).toEqual([])
    expect(declined.state.events).toContainEqual(expect.objectContaining({
      type: 'guest.voided', round: 10, cardId: ANATOMIST, guestId: 'guest:1',
    }))
    const next = confirmNextPlayer(session)
    expect(next.state.round).toBe(11)
    expect(markerRounds(session, next)).toEqual([13])
  })

  it('voids the due Guest when every accumulation space is occupied or reserved for B', () => {
    const session = setup(8, ANATOMIST)
    playCard(session, ANATOMIST)
    finishPurchaseRound(session)
    loadRound(session, 10, state => {
      const available = ['forest', 'clay-pit', 'reed-bank', 'fishing']
      for (const space of state.actionSpaces) {
        if (available.includes(space.id)) continue
        space.exclusiveUse = { playerId: state.players[1]!.id, sourceCardId: 'B023_FinalScenario', untilRound: 11 }
      }
    })
    // A's extra turn finds no accumulation space for the Guest, which is void; A then hands over as usual.
    const voidTurn = placeFamilies(session, ['forest', 'clay-pit', 'reed-bank', 'fishing'])
    expect(voidTurn.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0, request: { kind: 'confirm-next-player' } })
    const next = confirmNextPlayer(session)

    expect(next.state.round).toBe(11)
    expect(next.state.players[0]!.guests).toEqual([])
    expect(next.state.events).toContainEqual(expect.objectContaining({
      type: 'guest.voided', round: 10, cardId: ANATOMIST, guestId: 'guest:1',
    }))
    expect(markerRounds(session, next)).toEqual([13])
  })

  describe('next to Steam Machine', () => {
    const STEAM_MACHINE = 'C025_SteamMachine'
    const withSteamMachine = (state: GameState) => {
      const owner = state.players[0]!
      owner.minorPlayed = [...owner.minorPlayed, STEAM_MACHINE]
      owner.improvements = ['Major_Fireplace1']
      owner.resources.grain = 1
    }

    it('waits for the round\'s Guest while an accumulation space is free, then fires on the Guest\'s space', () => {
      const session = setup(8, ANATOMIST)
      playCard(session, ANATOMIST)
      finishPurchaseRound(session)
      loadRound(session, 10, withSteamMachine)
      // A's last family member takes Forest; Fishing is still free for the Guest, so Forest is not A's last space.
      const offered = placeFamilies(session, ['clay-pit', 'grain-seeds', 'forest', 'day-laborer'])
      expect(offered.state.players[0]!.resources.grain).toBe(1)
      expect(offered.state.players[0]!._extraTurnConsumedCountsByCard?.[ANATOMIST] ?? 0).toBe(0)
      expect(offered.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0 })
      const targets = session.resolveChoice(0, guestChoice(offered, ANATOMIST).value)
      expect(getChoiceOptions(targets).map(option => option.value)).toContain('fishing')
      const placed = session.resolveChoice(0, 'fishing')
      expect(placed.ok, placed.error).toBe(true)
      expect(placed.state.actionSpaces.find(space => space.id === 'fishing')?.takenBy).toEqual([
        { playerId: placed.state.players[0]!.id, workerId: 'guest:1', guest: true },
      ])
      // The Guest's Fishing is A's last action space and its own use: Steam Machine offers its bake now.
      expect(placed.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0, sourceCard: STEAM_MACHINE })
    })

    it('fires on the last free accumulation space, and leaves the round\'s Guest to be voided', () => {
      const session = setup(8, ANATOMIST)
      playCard(session, ANATOMIST)
      finishPurchaseRound(session)
      loadRound(session, 10, state => {
        withSteamMachine(state)
        const open = ['forest', 'clay-pit', 'reed-bank']
        for (const space of state.actionSpaces) {
          if (open.includes(space.id)) continue
          space.exclusiveUse = { playerId: state.players[1]!.id, sourceCardId: 'B023_FinalScenario', untilRound: 11 }
        }
      })
      for (const [seat, spaceId] of [[0, 'forest'], [1, 'clay-pit']] as const) {
        expect(session.takeAction(seat, spaceId).ok).toBe(true)
        expect(confirmNextPlayer(session).ok).toBe(true)
      }
      // Reed Bank is the last accumulation space: the Guest will find none, so Steam Machine offers its bake.
      const last = session.takeAction(0, 'reed-bank')
      expect(last.ok, last.error).toBe(true)
      expect(last.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0, sourceCard: STEAM_MACHINE })
      const skip = getChoiceOptions(last).find(option => option.value === '__skip__')
      expect(skip, JSON.stringify(last.interaction)).toBeDefined()
      const skipped = session.resolveChoice(0, skip!.value)
      expect(skipped.ok, skipped.error).toBe(true)
      // Steam Machine consumes no Guest: A's extra turn still comes, finds no space and voids the Guest.
      expect(skipped.state.players[0]!._extraTurnConsumedCountsByCard?.[ANATOMIST] ?? 0).toBe(0)
      expect(confirmNextPlayer(session).ok).toBe(true)
      expect(session.takeAction(1, 'day-laborer').ok).toBe(true)
      const next = confirmNextPlayer(session)
      expect(next.state.events).toContainEqual(expect.objectContaining({
        type: 'guest.voided', round: 10, cardId: ANATOMIST, guestId: 'guest:1',
      }))
    })
  })
})
