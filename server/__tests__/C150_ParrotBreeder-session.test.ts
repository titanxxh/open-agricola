import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import {
  isCardFlagged,
  readCardExtraData,
  setCardFlag,
  writeCardExtraData,
} from '../../shared/cards/helpers/card-state'
import { getCardEffect } from '../../shared/cards/card-effects'
import { setWorkersAtHome } from '../../shared/domain/player'

import '../../shared/cards/C/C150_ParrotBreeder'
import type { AnytimeAction } from '../../shared/contract/types'

const CARD_ID = 'C150_ParrotBreeder'
const LISTENER_ID = 'C150-parrot-breeder-anytime'
const RIGHT_KEY = 'right'

describe('C150_ParrotBreeder session', () => {
  /**
   * 4-player setup where `state.players[0]` is the C150 owner and
   * `state.players[3]` is their right-neighbour (one seat back, wrapping).
   */
  const setup = () => {
    const session = new GameSession(undefined, undefined, { playerCount: 4 })
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    expect(state.players.length).toBe(4)
    state.currentPlayerIndex = 0
    state.round = 1
    state.roundPhase = 'work'

    for (const player of state.players) {
      setWorkersAtHome(state, player, 3)
      player.resources = { ...player.resources, food: 10, grain: 0 }
    }

    const owner = state.players[0]!
    owner.resources.grain = 3
    owner.occupationPlayed.push(CARD_ID)

    session.loadState(state)
    return session
  }

  const enterAnytimeWindow = (session: GameSession) => {
    // Farmland is free to take; its execute returns a straight gain which
    // opens an anytime-action window at the same breakpoint used by the
    // existing (legacy) C150 test.
    const resp = session.takeAction(0, 'farmland')
    expect(resp.ok).toBe(true)
    return resp
  }

  it('offers anytime when owner has grain, unflagged, and is in work phase', () => {
    const session = setup()
    const resp = enterAnytimeWindow(session)
    const anytimeIds = resp.interaction.anytimeActions.map(
      (a: AnytimeAction) => a.id,
    )
    expect(anytimeIds).toContain(LISTENER_ID)
  })

  it('does not offer anytime when already flagged', () => {
    const session = setup()
    const state = session.getState().state
    setCardFlag(state.players[0]!, CARD_ID, true)
    session.loadState(state)

    const resp = enterAnytimeWindow(session)
    const anytimeIds = resp.interaction.anytimeActions.map(
      (a: AnytimeAction) => a.id,
    )
    expect(anytimeIds).not.toContain(LISTENER_ID)
  })

  it('does not offer anytime without grain', () => {
    const session = setup()
    const state = session.getState().state
    state.players[0]!.resources.grain = 0
    session.loadState(state)

    const resp = enterAnytimeWindow(session)
    const anytimeIds = resp.interaction.anytimeActions.map(
      (a: AnytimeAction) => a.id,
    )
    expect(anytimeIds).not.toContain(LISTENER_ID)
  })

  it('activating the anytime action pays 1 grain (no refund) and flags the card', () => {
    const session = setup()
    enterAnytimeWindow(session)

    const resp = session.takeAnytimeAction(0, LISTENER_ID)
    expect(resp.ok).toBe(true)

    const owner = resp.state.players[0]!
    expect(owner.resources.grain).toBe(2) // 3 − 1, no regain
    expect(isCardFlagged(owner, CARD_ID)).toBe(true)
  })

  it('records the right-neighbour space id after they place a farmer', () => {
    const session = setup()
    // Turn over to the right-neighbour (seat (0 − 1 + 4) % 4 = seat 3).
    const state = session.getState().state
    state.currentPlayerIndex = 3
    session.loadState(state)

    const resp = session.takeAction(3, 'forest')
    expect(resp.ok).toBe(true)

    const owner = resp.state.players[0]!
    const right = readCardExtraData<string | null>(owner, CARD_ID, RIGHT_KEY)
    expect(right).toBe('forest')
  })

  it('clears the tracker when a non-right opponent places', () => {
    const session = setup()
    // Pre-populate tracker so we can watch it clear.
    const state = session.getState().state
    writeCardExtraData(state.players[0]!, CARD_ID, RIGHT_KEY, 'forest')
    state.currentPlayerIndex = 1 // seat 1 is NOT the owner's right-neighbour
    session.loadState(state)

    const resp = session.takeAction(1, 'clay-pit')
    expect(resp.ok).toBe(true)

    const owner = resp.state.players[0]!
    const right = readCardExtraData<string | null>(owner, CARD_ID, RIGHT_KEY)
    expect(right).toBeNull()
  })

  it('clears flag and tracker when the owner places a farmer', () => {
    const session = setup()
    const state = session.getState().state
    setCardFlag(state.players[0]!, CARD_ID, true)
    writeCardExtraData(state.players[0]!, CARD_ID, RIGHT_KEY, 'copse')
    session.loadState(state)

    // Forest is a no-interaction space so the engine reaches `done` and
    // `runPlaceFarmerAfterHooks` fires synchronously.
    const resp = session.takeAction(0, 'forest')
    expect(resp.ok).toBe(true)

    const owner = resp.state.players[0]!
    expect(isCardFlagged(owner, CARD_ID)).toBe(false)
    expect(readCardExtraData<string | null>(owner, CARD_ID, RIGHT_KEY)).toBeNull()
  })

  it('lets the owner place on the tracked space even while occupied by the right neighbour', () => {
    const session = setup()
    const state = session.getState().state
    const owner = state.players[0]!
    setCardFlag(owner, CARD_ID, true)
    writeCardExtraData(owner, CARD_ID, RIGHT_KEY, 'forest')
    // Simulate the right-neighbour having already taken forest: mark it occupied.
    const forest = state.actionSpaces.find((s) => s.id === 'forest')!
    const rightId = state.players[3]!.id
    const rightWorker = state.players[3]!.workers[0]!.id
    forest.takenBy = [{ playerId: rightId, workerId: rightWorker }]
    session.loadState(state)

    // Without C150 the space would be unavailable. computeArgs:place-farmer
    // injects an allow-occupied extraOption, and `takeAction` consumes it.
    const resp = session.takeAction(0, 'forest')
    expect(resp.ok).toBe(true)

    const updated = resp.state.players[0]!
    // Placement went through: owner's first worker is on forest alongside
    // the right-neighbour's worker.
    const forestAfter = resp.state.actionSpaces.find((s) => s.id === 'forest')!
    const ownerOnForest = forestAfter.takenBy.some((r) => r.playerId === updated.id)
    expect(ownerOnForest).toBe(true)
    // The after-place listener cleared both flag and tracker.
    expect(isCardFlagged(updated, CARD_ID)).toBe(false)
    expect(readCardExtraData<string | null>(updated, CARD_ID, RIGHT_KEY)).toBeNull()
  })

  it('blocks re-use of a Meeting-Place tracker (BGA exclusion)', () => {
    const session = setup()
    const state = session.getState().state
    const owner = state.players[0]!
    setCardFlag(owner, CARD_ID, true)
    writeCardExtraData(owner, CARD_ID, RIGHT_KEY, 'meeting-place')
    const meeting = state.actionSpaces.find((s) => s.id === 'meeting-place')!
    const rightId = state.players[3]!.id
    const rightWorker = state.players[3]!.workers[0]!.id
    meeting.takenBy = [{ playerId: rightId, workerId: rightWorker }]
    session.loadState(state)

    // Owner tries to take Meeting Place via the C150 "copy right" path:
    // computeArgs:place-farmer must refuse to inject meeting-place, so
    // takeAction rejects it as occupied.
    const resp = session.takeAction(0, 'meeting-place')
    expect(resp.ok).toBe(false)
    expect(resp.error).toBe('space unavailable')
  })

  it('onBeforeStartOfTurn clears both flag and tracker', () => {
    const session = setup()
    const state = session.getState().state
    const owner = state.players[0]!
    setCardFlag(owner, CARD_ID, true)
    writeCardExtraData(owner, CARD_ID, RIGHT_KEY, 'forest')

    const effect = getCardEffect(CARD_ID)
    effect!.onBeforeStartOfTurn!(state, owner)

    expect(isCardFlagged(owner, CARD_ID)).toBe(false)
    expect(readCardExtraData<string | null>(owner, CARD_ID, RIGHT_KEY)).toBeNull()
  })
})
