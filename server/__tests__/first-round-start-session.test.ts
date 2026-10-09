import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { markAllWorkersUsed, workersAvailable } from '../../shared/domain/player'
import { countOccupations } from '../../shared/cards/helpers/prerequisites'
import { rehydrateState, serializeSessionSnapshot } from '../../shared/session/serialization'
import { resolveNonSkipChoice, resolveSkipChoice } from './_helpers/trigger-select'

const CARD_ID = 'E096_Elder'
const FILLER = '__test_placeholder__'
const modes = [
  { name: 'direct deal', draft: false, parents: false, draftParents: true },
  { name: 'ordinary draft', draft: true, parents: false, draftParents: true },
  { name: 'direct deal and parent selection', draft: false, parents: true, draftParents: true },
  { name: 'ordinary draft and parent selection', draft: true, parents: true, draftParents: true },
  { name: 'direct deal and dealt parents', draft: false, parents: true, draftParents: false },
  { name: 'ordinary draft and dealt parents', draft: true, parents: true, draftParents: false },
] as const

// Issue #1057: a real fresh two-player Session must enter all round-one stages.
// Fixed seeds give Elder to either seat; every irrelevant hand is explicitly
// replaced before the first action. Setup keeps the default resources/farm,
// two home workers, no played cards, no occupied spaces, and empty cardStates.
// Payment, optional choice, stage continuation and persistence require Session
// tests; directly calling the card hook would bypass the defect.
const start = (mode: typeof modes[number], ownerIndex: number) => {
  const session = new GameSession(ownerIndex === 0 ? 12 : 9, undefined, {
    playerCount: 2,
    deckIds: ['E'],
    draftMode: mode.draft ? 'simultaneous' : undefined,
    draftPoolSize: 7,
    enableParentCards: mode.parents,
    draftParents: mode.draftParents,
    parentSelectionSeed: 1,
  })
  let response = session.getState()
  while (response.state.phase === 'draft' && response.state.draft) {
    const draft = response.state.draft
    const seatId = draft.seatOrder.find((id) => {
      const pick = draft.pendingPicks[id]
      return !pick || (pick.occ === null && pick.minor === null)
    })!
    const pool = draft.pools[seatId]!
    response = session.submitDraftPick(seatId, {
      occCardId: pool.occ.includes(CARD_ID) ? CARD_ID : pool.occ[0],
      minorCardId: pool.minor[0],
    })
    expect(response.ok, response.error).toBe(true)
  }
  expect(session.state.players[ownerIndex]!.occupationHand).toContain(CARD_ID)
  for (const [index, player] of session.state.players.entries()) {
    player.minorHand = [FILLER]
    player.occupationHand = index === ownerIndex ? [CARD_ID] : [FILLER]
  }
  if (session.state.phase === 'parent-selection') {
    for (const [index, player] of session.state.players.entries()) {
      const candidates = session.state.parentSelection!.candidates[player.id]!
      response = session.submitParentSelection(index, {
        mother: candidates.mother[0]!, father: candidates.father[0]!,
      })
      expect(response.ok, response.error).toBe(true)
    }
  }
  response = session.getState()
  if (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'confirm-player-switch') {
    response = session.resolveChoice(response.interaction.playerIndex, 'confirm')
    expect(response.ok, response.error).toBe(true)
  }
  return session
}

const expectOffer = (response: SessionResponse, ownerIndex: number) => {
  expect(response.ok, response.error).toBe(true)
  expect(response.state.round).toBe(1)
  expect(response.state.phase).toBe('playing')
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') throw new Error('expected Elder offer')
  expect(response.interaction.playerIndex).toBe(ownerIndex)
  expect(response.interaction.request.kind).toBe('choice')
  expect(response.interaction.request.options?.some((option) => option.value === '__skip__')).toBe(true)
  expect(response.state.actionSpaces.every((space) => space.takenBy.length === 0)).toBe(true)
  expect(response.state.actionSpaces.find((space) => space.id === 'forest')!.resources.wood).toBe(3)
}

const accept = (session: GameSession) => {
  let response = resolveNonSkipChoice(session, session.getState())
  if (response.interaction.stateId === 'wait'
    && response.interaction.request.options?.some((option) => option.value === CARD_ID)) {
    response = session.resolveChoice(response.interaction.playerIndex, CARD_ID)
  }
  expect(response.ok, response.error).toBe(true)
  return response
}

const restore = (session: GameSession) => {
  const snapshot = serializeSessionSnapshot(session.state, session)
  return new GameSession(rehydrateState(JSON.parse(JSON.stringify(snapshot))))
}

describe.each(modes)('Elder round-one lifecycle: $name', (mode) => {
  it.each([0, 1])('offers seat %i free play after preparation without placing a person', (ownerIndex) => {
    const session = start(mode, ownerIndex)
    const before = session.getState()
    expectOffer(before, ownerIndex)
    const resourcesBefore = structuredClone(before.state.players.map((player) => player.resources))
    const workersBefore = before.state.players.map((player) => workersAvailable(before.state, player))
    const scoresBefore = before.scores.map((score) => score.total)
    if (mode.parents) {
      // Parent seed 1 gives seat 0 PR10: its round-one wood must arrive before Elder.
      expect(before.state.players[0]!.resources.wood).toBe(1)
      expect(before.state.futureMeeples.some((entry) => entry.cardId === 'PR10')).toBe(false)
    }

    const response = accept(session)
    const player = response.state.players[ownerIndex]!
    expect(player.occupationHand).not.toContain(CARD_ID)
    expect(player.occupationPlayed).toEqual([CARD_ID])
    expect(countOccupations(player)).toBe(1)
    expect(response.state.players.map((candidate) => candidate.resources)).toEqual(resourcesBefore)
    expect(response.state.players.map((candidate) => workersAvailable(response.state, candidate))).toEqual(workersBefore)
    expect(response.state.actionSpaces.every((space) => space.takenBy.length === 0)).toBe(true)
    expect(response.state.actionSpaces.find((space) => space.id === 'forest')!.resources.wood).toBe(3)
    expect(response.state.log.filter((entry) => entry.key === 'log.playOccupation')).toEqual([
      expect.objectContaining({ playerId: player.id, params: expect.objectContaining({ occupations: CARD_ID, costResources: {} }) }),
    ])
    expect(response.scores.map((score) => score.total)).toEqual(scoresBefore)
    expect(response.interaction.stateId).toBe('idle')
    expect(response.state.currentPlayerIndex).toBe(0)
    expect(restore(session).getState().interaction.stateId).toBe('idle')
  })

  it('declining keeps Elder in hand without another offer this round or next', () => {
    const session = start(mode, 1)
    expectOffer(session.getState(), 1)
    const response = resolveSkipChoice(session, session.getState())
    expect(response.state.players[1]!.occupationHand).toEqual([CARD_ID])
    expect(response.state.players[1]!.occupationPlayed).toEqual([])
    expect(response.state.log.some((entry) => entry.key === 'log.playOccupation')).toBe(false)
    expect(response.interaction.stateId).toBe('idle')
    expect(session.takeAction(0, 'forest').ok).toBe(true)
    const nextPlayer = session.resolveChoice(0, 'confirm')
    expect(nextPlayer.ok, nextPlayer.error).toBe(true)
    expect(nextPlayer.interaction.stateId).toBe('idle')
    expect(session.takeAction(1, 'day-laborer').ok).toBe(true)

    const state = session.state
    state.players.forEach((player) => markAllWorkersUsed(state, player))
    session.loadState(state)
    let nextRound = session.performRoundEnd()
    // A selected mother can offer a separate round-two action; finish only
    // its skip/seat-confirmation windows and reject any repeated Elder offer.
    for (let step = 0; step < 4 && nextRound.interaction.stateId === 'wait'; step++) {
      const interaction = nextRound.interaction
      expect(interaction.sourceCard).not.toBe(CARD_ID)
      expect(interaction.request.options?.some((option) =>
        option.sourceCard === CARD_ID || option.value === 'action-occupation-0')).not.toBe(true)
      nextRound = interaction.request.kind === 'confirm-player-switch'
        ? session.resolveChoice(interaction.playerIndex, 'confirm')
        : resolveSkipChoice(session, nextRound)
    }
    expect(nextRound.ok, nextRound.error).toBe(true)
    expect(nextRound.state.round).toBe(2)
    expect(nextRound.interaction.stateId).toBe('idle')
    expect(nextRound.state.players[1]!.occupationHand).toEqual([CARD_ID])
  })

  it('restores the pending offer and resumes without repeating setup', () => {
    const session = start(mode, 1)
    expectOffer(session.getState(), 1)
    const resources = structuredClone(session.state.players.map((player) => player.resources))
    const restored = restore(session)
    expectOffer(restored.getState(), 1)
    const response = accept(restored)
    expect(response.state.players.map((player) => player.resources)).toEqual(resources)
    expect(response.state.players[1]!.occupationPlayed).toEqual([CARD_ID])
    expect(response.state.actionSpaces.find((space) => space.id === 'forest')!.resources.wood).toBe(3)
    expect(response.state.log.filter((entry) => entry.key === 'log.playOccupation')).toHaveLength(1)
    expect(response.interaction.stateId).toBe('idle')
  })
})
