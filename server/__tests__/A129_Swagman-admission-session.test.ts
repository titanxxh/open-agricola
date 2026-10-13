import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { createWorkSession } from './_helpers/session-fixtures'
import { setActiveWorkerCount } from '../../shared/domain/player'
import { recordRoundPlacement, getRoundPersonPlacementDetails } from '../../shared/cards/helpers/round-placement'
import '../../shared/cards/A/A129_Swagman'
import '../../shared/cards/A/A130_MummysBoy'
import '../../shared/cards/C/C158_ForestCampaigner'

const CARD_ID = 'A129_Swagman'
type Direction = 'farm-expansion' | 'grain-seeds'

// Approved Session seam: fresh two-player work fixtures, real stable payment,
// optional same-person jump, cursor restore, undo, and authoritative board state.
const setup = ({ source = 'farm-expansion', occupied = true, lastPerson = true,
  played = true, wood = 2 }: { source?: Direction; occupied?: boolean; lastPerson?: boolean; played?: boolean; wood?: number } = {}) => createWorkSession({
  seed: 129,
  configure: state => {
    state.currentPlayerIndex = 0
    const owner = state.players[0]!
    const opponent = state.players[1]!
    owner.occupationPlayed = played ? [CARD_ID] : []
    owner.resources = { ...owner.resources, wood, reed: 0, grain: 0 }
    if (lastPerson) state.actionSpaces.find(space => space.id === 'forest')!.takenBy = [
      { playerId: owner.id, workerId: owner.workers[0]!.id },
    ]
    if (occupied) state.actionSpaces.find(space => space.id === (
      source === 'farm-expansion' ? 'grain-seeds' : 'farm-expansion'))!.takenBy = [
      { playerId: opponent.id, workerId: opponent.workers[0]!.id },
    ]
  },
})

const buildStable = (session: GameSession, start: SessionResponse): SessionResponse => {
  let response = start
  expect(response.ok, response.error).toBe(true)
  if (response.interaction.stateId !== 'wait') throw new Error('expected Farm Expansion choice')
  if (response.interaction.request.kind === 'choice') {
    const stable = response.interaction.request.options.find(option => option.value.includes('stable'))
    expect(stable, JSON.stringify(response.interaction)).toBeDefined()
    response = session.resolveChoice(0, stable!.value)
    expect(response.ok, response.error).toBe(true)
  }
  if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'farm-select'
    || response.interaction.request.farm.farmType !== 'stable') {
    throw new Error(`expected stable farm selection: ${JSON.stringify(response.interaction)}`)
  }
  response = session.commitSelectionChoice(0, {
    stables: [response.interaction.request.farm.selectableTiles[0]!],
  })
  expect(response.ok, response.error).toBe(true)
  return response
}

const acceptJump = (session: GameSession, start: SessionResponse): SessionResponse => {
  let response = start
  for (let guard = 0; guard < 4; guard++) {
    if (response.interaction.stateId !== 'wait' || !['choice', 'select-trigger'].includes(response.interaction.request.kind)) break
    const accept = response.interaction.request.options?.find(option =>
      option.sourceCard === CARD_ID && option.value !== '__skip__')
      ?? (response.interaction.sourceCard === CARD_ID
        ? response.interaction.request.options?.find(option => option.value !== '__skip__') : undefined)
    if (!accept) break
    response = session.resolveChoice(0, accept.value)
    expect(response.ok, response.error).toBe(true)
  }
  return response
}

const startJump = (session: GameSession, source: Direction): SessionResponse => {
  const response = session.takeAction(0, source)
  const offered = source === 'farm-expansion' ? buildStable(session, response) : response
  expect(offered.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0, sourceCard: CARD_ID })
  return offered
}

describe('A129 same-person jump admission', () => {
  it.each([
    ['farm-expansion', true, true], ['farm-expansion', true, false],
    ['farm-expansion', false, true], ['farm-expansion', false, false],
    ['grain-seeds', true, true], ['grain-seeds', true, false],
    ['grain-seeds', false, true], ['grain-seeds', false, false],
  ] satisfies [Direction, boolean, boolean][])('%s jump: occupied=%s, last person=%s', (source, occupied, lastPerson) => {
    const session = setup({ source, occupied, lastPerson })
    const ownerId = session.state.players[0]!.id
    const workerId = session.state.players[0]!.workers[lastPerson ? 1 : 0]!.id
    const target = source === 'farm-expansion' ? 'grain-seeds' : 'farm-expansion'
    const opponentRefs = structuredClone(session.state.actionSpaces.find(space => space.id === target)!.takenBy)
    let response = acceptJump(session, startJump(session, source))
    if (source === 'grain-seeds') response = buildStable(session, response)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, grain: 1 })
    expect(response.state.players[0]!.stableTiles).toHaveLength(1)
    expect(response.state.actionSpaces.find(space => space.id === source)!.takenBy).toEqual([])
    expect(response.state.actionSpaces.find(space => space.id === target)!.takenBy).toEqual([
      ...opponentRefs, { playerId: ownerId, workerId },
    ])
    expect(getRoundPersonPlacementDetails(response.state.players[0]!)).toHaveLength(1)
    expect(response.interaction.sourceCard).not.toBe(CARD_ID)
  })

  it('offers no Farm Expansion jump when the owner cannot pay', () => {
    const session = setup({ source: 'grain-seeds', wood: 0 })
    const response = session.takeAction(0, 'grain-seeds')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.grain).toBe(1)
    expect(response.interaction.sourceCard).not.toBe(CARD_ID)
    expect(response.state.actionSpaces.find(space => space.id === 'farm-expansion')!.takenBy).toHaveLength(1)
  })

  it('declining leaves the worker on its original space', () => {
    const session = setup()
    const response = startJump(session, 'farm-expansion')
    const declined = session.resolveChoice(0, '__skip__')
    expect(declined.ok, declined.error).toBe(true)
    expect(declined.state.players[0]!.resources.grain).toBe(0)
    expect(declined.state.actionSpaces.find(space => space.id === 'farm-expansion')!.takenBy).toHaveLength(1)
    expect(declined.state.actionSpaces.find(space => space.id === 'grain-seeds')!.takenBy).toHaveLength(1)
    expect(response.state.players[0]!.stableTiles).toHaveLength(1)
  })

  it('restores the pending jump and undoes the whole action without duplicate payment', () => {
    let session = setup()
    const before = { players: structuredClone(session.state.players), actionSpaces: session.state.actionSpaces.map(space => ({ takenBy: structuredClone(space.takenBy) })) }
    startJump(session, 'farm-expansion')
    session = new GameSession(JSON.parse(JSON.stringify({
      state: session.getState().state, sessionCursor: session.createSessionPrivateCursor(),
    })))
    const response = acceptJump(session, session.getState())
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, grain: 1 })
    const undo = session.undoAction()
    expect(undo.ok, undo.error).toBe(true)
    expect(undo.state.players[0]!.resources).toEqual(before.players[0]!.resources)
    expect(undo.state.players[0]!.stableTiles).toEqual(before.players[0]!.stableTiles)
    expect(undo.state.actionSpaces.map(space => space.takenBy)).toEqual(before.actionSpaces.map(space => space.takenBy))
  })

  it('moves the newly placed person when another own person already occupies the source', () => {
    const session = createWorkSession({ seed: 129, configure: state => {
      const owner = state.players[0]!
      owner.occupationPlayed = [CARD_ID, 'A130_MummysBoy']
      owner.resources.wood = 2
      owner.resources.reed = 0
      setActiveWorkerCount(owner, 3)
      for (const [index, spaceId] of ['forest', 'grain-seeds'].entries()) {
        state.actionSpaces.find(space => space.id === spaceId)!.takenBy = [
          { playerId: owner.id, workerId: owner.workers[index]!.id },
        ]
        recordRoundPlacement(owner, spaceId, owner.workers[index]!.id)
      }
    } })
    let response = session.takeAction(0, 'grain-seeds')
    // Two after reactions may require choosing Swagman before its optional flow.
    response = acceptJump(session, response)
    response = buildStable(session, response)
    expect(response.ok, response.error).toBe(true)
    const owner = response.state.players[0]!
    expect(response.state.actionSpaces.find(space => space.id === 'grain-seeds')!.takenBy).toEqual([
      { playerId: owner.id, workerId: owner.workers[1]!.id },
    ])
    expect(response.state.actionSpaces.find(space => space.id === 'farm-expansion')!.takenBy).toEqual([
      { playerId: owner.id, workerId: owner.workers[2]!.id },
    ])
  })

  it('does not repeat new-placement-only Forest Campaigner before reactions on relocation', () => {
    const session = setup()
    const state = session.getState().state
    state.players[0]!.occupationPlayed.push('C158_ForestCampaigner')
    state.players[0]!.resources.food = 0
    state.actionSpaces.find(space => space.id === 'forest')!.resources.wood = 8
    session.loadState(state)
    const response = acceptJump(session, startJump(session, 'farm-expansion'))
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 1, grain: 1, wood: 0 })
  })

  it('ordinary placement remains blocked on occupied spaces without Swagman', () => {
    const session = setup({ played: false })
    const before = { players: structuredClone(session.state.players), actionSpaces: session.state.actionSpaces.map(space => ({ takenBy: structuredClone(space.takenBy) })) }
    const response = session.takeAction(0, 'grain-seeds')
    expect(response.ok).toBe(false)
    expect(response.state.players[0]!.resources).toEqual(before.players[0]!.resources)
    expect(response.state.actionSpaces.map(space => space.takenBy)).toEqual(before.actionSpaces.map(space => space.takenBy))
  })
})
