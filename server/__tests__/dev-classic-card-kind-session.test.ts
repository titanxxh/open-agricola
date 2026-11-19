import { afterEach, describe, expect, it } from 'vitest'
import type { GameSession } from '../game/authoritative-session'
import { createWorkSession } from './_helpers/session-fixtures'

// Classic cards stay outside the deal catalog, so dev draw/play is the only way a game reaches them.
// Their kind must come from the classic source, not from the revised A–E ID pattern.
const SHEPHERD = 'CE203_Shepherd'
const SLAUGHTERHOUSE = 'CI097_Slaughterhouse'
const PLACEHOLDER = '__test_placeholder__'
const sessions: GameSession[] = []
afterEach(() => sessions.splice(0).forEach(session => session.dispose()))

function setup() {
  const session = createWorkSession({ seed: 97, configure(state) {
    for (const player of state.players) {
      player.minorHand = [PLACEHOLDER]
      player.occupationHand = [PLACEHOLDER]
      player.minorPlayed = []
      player.occupationPlayed = []
    }
  } })
  sessions.push(session)
  return session
}

describe('dev commands with classic cards', () => {
  it('draws a classic occupation into the occupation hand and a classic minor into the minor hand', () => {
    const session = setup()

    const occupation = session.devDrawCard(0, SHEPHERD)
    expect(occupation.ok, occupation.error).toBe(true)
    expect(occupation.state.players[0]!.occupationHand).toEqual([PLACEHOLDER, SHEPHERD])
    expect(occupation.state.players[0]!.minorHand).toEqual([PLACEHOLDER])
    expect(occupation.privateEvents).toEqual([expect.objectContaining({
      type: 'private.handChanged', recipientPlayerId: occupation.state.players[0]!.id, cardIds: [SHEPHERD], cardType: 'occupation', reason: 'dev-draw-card',
    })])

    const minor = session.devDrawCard(1, SLAUGHTERHOUSE)
    expect(minor.ok, minor.error).toBe(true)
    expect(minor.state.players[1]!.minorHand).toEqual([PLACEHOLDER, SLAUGHTERHOUSE])
    expect(minor.state.players[1]!.occupationHand).toEqual([PLACEHOLDER])
    expect(minor.privateEvents).toEqual([expect.objectContaining({
      type: 'private.handChanged', recipientPlayerId: minor.state.players[1]!.id, cardIds: [SLAUGHTERHOUSE], cardType: 'minor', reason: 'dev-draw-card',
    })])
  })

  it('plays a classic occupation as an occupation, so occupation counts include it', () => {
    const session = setup()

    const played = session.devPlayCard(0, SHEPHERD)
    expect(played.ok, played.error).toBe(true)
    expect(played.state.players[0]!.occupationPlayed).toEqual([SHEPHERD])
    expect(played.state.players[0]!.minorPlayed).toEqual([])

    const minor = session.devPlayCard(1, SLAUGHTERHOUSE)
    expect(minor.ok, minor.error).toBe(true)
    expect(minor.state.players[1]!.minorPlayed).toEqual([SLAUGHTERHOUSE])
    expect(minor.state.players[1]!.occupationPlayed).toEqual([])
  })

  it('keeps revised and unknown IDs on their existing paths', () => {
    const session = setup()

    expect(session.devDrawCard(0, 'A001_Shelter').state.players[0]!.minorHand).toEqual([PLACEHOLDER, 'A001_Shelter'])
    const unknown = session.devPlayCard(1, 'CE999_Missing')
    expect(unknown.state.players[1]!.minorPlayed).toEqual(['CE999_Missing'])
    expect(unknown.state.players[1]!.occupationPlayed).toEqual([])
  })
})
