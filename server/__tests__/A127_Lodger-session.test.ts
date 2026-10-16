import assert from 'node:assert/strict'
import { afterEach, describe, expect, it } from 'vitest'
import type { GameState } from '../../shared/contract/types'
import { getExtraRoomCapacity } from '../../shared/cards/card-effects'
import { getWorkerHeldOnCard, holdWorkerOnCard } from '../../shared/cards/helpers/card-held-workers'
import { familySize, getFamilyTokenLimit, inactiveWorkersInSupply, setActiveWorkerCount } from '../../shared/domain/player'
import { addSyntheticLinkedOccupancyRef } from '../../shared/domain/space'
import { rehydrateState, serializeSessionSnapshot } from '../../shared/session/serialization'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { createWorkSession } from './_helpers/session-fixtures'

const LODGER = 'A127_Lodger'
const READER = 'D085_Reader'
const sessions: GameSession[] = []
afterEach(() => sessions.splice(0).forEach(session => session.dispose()))

// Approved seam: three-player Session for the 3+ card, natural work/return-home commands.
// Snapshots prepare round, rooms, family and card facts; no expiry handler is called directly.
const setup = (configure: (state: GameState) => void = () => {}) => {
  const session = createWorkSession({ seed: 4242, options: { playerCount: 3 }, configure(state) {
    state.round = 9
    for (const player of state.players) player.resources.food = 60
    const owner = state.players[0]!
    owner.occupationPlayed = [LODGER]
    owner.cardStates[LODGER] = { extraData: { hasRoom: true } }
    setActiveWorkerCount(owner, 3)
    configure(state)
  } })
  sessions.push(session)
  return session
}

const ok = (response: SessionResponse) => {
  assert.equal(response.ok, true, response.error)
  return response
}

const finishChoices = (session: GameSession, response: SessionResponse, stopAtReturnHome = false) => {
  for (let guard = 0; guard < 20 && response.interaction.stateId === 'wait'; guard++) {
    if (stopAtReturnHome && response.state.roundPhase === 'returning-home') return response
    const { playerIndex, request } = response.interaction
    switch (request.kind) {
      case 'confirm-next-player': response = ok(session.resolveChoice(playerIndex, 'confirm')); break
      case 'confirm-player-switch': response = ok(session.resolveChoice(request.fromPlayerIndex, 'confirm')); break
      case 'feed': response = ok(session.resolveChoice(playerIndex, 'confirm', { selections: [] })); break
      case 'animal-reorg': response = ok(session.resolveChoice(playerIndex, 'confirm', { zones: request.zones })); break
      case 'choice': {
        const skip = request.options.find(option => option.value === '__skip__' || option.value === '__done__')
        assert.ok(skip, JSON.stringify(response.interaction))
        response = ok(session.resolveChoice(playerIndex, skip.value))
        break
      }
      default: assert.fail(JSON.stringify(response.interaction))
    }
  }
  return response
}

const finishRound = (session: GameSession, stopAtReturnHome = false) => {
  const round = session.state.round
  const spaces = ['forest', 'clay-pit', 'reed-bank', 'fishing', 'day-laborer', 'grain-seeds',
    'vegetable-seeds', 'western-quarry', 'eastern-quarry', 'meeting-place']
  let response = session.getState()
  for (let guard = 0; guard < 30; guard++) {
    if (stopAtReturnHome && response.state.roundPhase === 'returning-home') return response
    if (response.state.round !== round) return response
    response = finishChoices(session, response, stopAtReturnHome)
    if (stopAtReturnHome && response.state.roundPhase === 'returning-home') return response
    if (response.state.round !== round) return response
    assert.equal(response.interaction.stateId, 'idle')
    const space = spaces.find(id => response.actionAvailability?.[id])
    assert.ok(space, 'Expected a free resource action')
    response = ok(session.takeAction(response.state.currentPlayerIndex, space))
  }
  assert.fail('Round did not advance')
}

const addReader = (state: GameState) => {
  const owner = state.players[0]!
  owner.occupationPlayed.push(READER, 'A098_StableArchitect', 'A099_FellowGrazer',
    'A101_CookeryOutfitter', 'A133_Braggart')
  owner.cardStates[READER] = { extraData: { occupationThreshold: 6 } }
}

const removals = (response: SessionResponse) => response.state.events.filter(event =>
  event.type === 'worker.returned' && event.to === 'removed' && event.sourceCardId === LODGER)

const farmers = (response: SessionResponse) => response.scores?.[0]?.categories.find(category => category.key === 'farmers')

describe('A127 Lodger', () => {
  it.each([3, 4])('uses Reader room after Lodger expires with a family of %i', family => {
    const session = setup(state => {
      addReader(state)
      setActiveWorkerCount(state.players[0]!, family)
      state.players[0]!.houseType = 'clay'
    })
    expect(session.withCtx(() => getExtraRoomCapacity(session.state.players[0]!))).toBe(2)
    const response = finishRound(session)
    expect(response.state.round).toBe(10)
    expect(response.state.players[0]!.rooms).toBe(2)
    expect(session.withCtx(() => getExtraRoomCapacity(response.state.players[0]!))).toBe(1)
    expect(familySize(response.state.players[0]!)).toBe(3)
    expect(response.state.players[0]!.cardStates[LODGER]?.extraData?.hasRoom).toBe(false)
    expect(removals(response)).toHaveLength(family === 3 ? 0 : 1)
    expect(farmers(response)).toMatchObject({ quantity: 3, total: 9 })
    expect(response.scores?.[0]?.categories.find(category => category.key === 'clayRooms')).toMatchObject({ quantity: 2, total: 2 })
  })

  it('permanently removes one person from supply and later growth uses another token', () => {
    const session = setup()
    const expired = finishRound(session)
    expect(familySize(expired.state.players[0]!)).toBe(2)
    expect(getFamilyTokenLimit(expired.state.players[0]!)).toBe(4)
    const state = expired.state
    // Controlled post-expiry housing isolates later real growth; it does not simulate building five rooms.
    state.players[0]!.rooms = 5
    state.players[0]!.roomTiles = [
      { row: 1, col: 0 }, { row: 2, col: 0 }, { row: 1, col: 1 }, { row: 2, col: 1 }, { row: 0, col: 1 },
    ]
    state.currentPlayerIndex = 0
    state.roundActionOrder = state.roundActionOrder.map(id => id === 'wish-children' ? null : id)
    state.roundActionOrder[0] = 'wish-children'
    session.loadState(state)
    expect(inactiveWorkersInSupply(session.state.players[0]!).map(worker => worker.id)).toEqual(['4', '5'])
    const grown = ok(session.takeAction(0, 'wish-children'))
    expect(familySize(grown.state.players[0]!)).toBe(3)
    expect(grown.state.players[0]!.workers.filter(worker => worker.isActive && worker.isNewborn)
      .map(worker => worker.id)).toEqual(['4'])
    expect(getFamilyTokenLimit(grown.state.players[0]!)).toBe(4)
    expect(finishRound(session).state.round).toBe(11)
    const fourth = ok(session.takeAction(0, 'wish-children'))
    expect(familySize(fourth.state.players[0]!)).toBe(4)
    expect(fourth.state.players[0]!.workers.filter(worker => worker.isActive && worker.isNewborn)
      .map(worker => worker.id)).toEqual(['5'])
    expect(finishRound(session).state.round).toBe(12)
    const beforeRejected = structuredClone(session.state.players[0]!.workers)
    const fifth = session.takeAction(0, 'wish-children')
    expect(fifth.ok).toBe(false)
    expect(fifth.state.players[0]!.workers).toEqual(beforeRejected)
    expect(familySize(fifth.state.players[0]!)).toBe(4)
  })

  it('removes at most one person even when remaining housing is still insufficient', () => {
    const session = setup(state => {
      setActiveWorkerCount(state.players[0]!, 5)
      state.actionSpaces.find(space => space.id === 'western-quarry')!.resources.stone = 1
    })
    const response = finishRound(session)
    expect(familySize(response.state.players[0]!)).toBe(4)
    expect(getFamilyTokenLimit(response.state.players[0]!)).toBe(4)
    expect(removals(response)).toHaveLength(1)
    expect(response.state.players[0]!.workers[0]).toMatchObject({
      id: '1', isActive: false, isNewborn: false, removedFromSupply: true,
    })
    expect(farmers(response)).toMatchObject({ quantity: 4, total: 12 })
  })

  it('clears the selected held person and linked references before ordinary return-home cleanup, and undo restores them', () => {
    const session = setup(state => {
      const owner = state.players[0]!
      owner.minorPlayed = ['D018_SteamPlow', 'C022_BasketChair', 'A029_AleBenches']
      owner.resources.grain = 1
      holdWorkerOnCard(owner, 'C022_BasketChair', '1')
      const lessons = state.actionSpaces.find(space => space.id === 'lessons')!
      addSyntheticLinkedOccupancyRef(lessons, owner.id, '1', 'C132_JobContract')
      lessons.blockedBy = [{ playerId: owner.id, workerId: '1', sourceSpaceId: 'forest' }]
    })
    const entering = finishRound(session, true)
    expect(entering.interaction).toMatchObject({ stateId: 'wait', sourceCard: 'D018_SteamPlow' })
    expect(session.withCtx(() => getExtraRoomCapacity(entering.state.players[0]!))).toBe(1)
    const returning = ok(session.resolveChoice(0, '__skip__'))
    expect(returning.state.roundPhase).toBe('returning-home')
    expect(returning.interaction).toMatchObject({ stateId: 'wait', sourceCard: 'A029_AleBenches' })
    expect(returning.state.players[0]!.workers[0]).toMatchObject({
      id: '1', isActive: false, isNewborn: false, removedFromSupply: true,
    })
    expect(getWorkerHeldOnCard(returning.state.players[0]!, 'C022_BasketChair')).toBeUndefined()
    expect(returning.state.actionSpaces.some(space => space.takenBy.some(ref => ref.playerId === 'p1' && ref.workerId === '1'))).toBe(false)
    expect(returning.state.actionSpaces.some(space => space.blockedBy?.some(ref => ref.playerId === 'p1' && ref.workerId === '1'))).toBe(false)
    expect(returning.state.actionSpaces.some(space => space.takenBy.some(ref => ref.playerId === 'p1' && ref.workerId === '2'))).toBe(true)
    expect(removals(returning)).toEqual([expect.objectContaining({ workers: [{ playerId: 'p1', workerId: '1' }] })])
    expect(returning.state.log.filter(entry => entry.key === 'log.workerRemoved')).toHaveLength(1)
    expect(farmers(returning)).toMatchObject({ quantity: 2, total: 6 })

    const undone = ok(session.undoStep())
    expect(undone.state.roundPhase).toBe('returning-home')
    expect(undone.interaction).toMatchObject({ stateId: 'wait', sourceCard: 'D018_SteamPlow' })
    expect(session.withCtx(() => getExtraRoomCapacity(undone.state.players[0]!))).toBe(1)
    expect(getFamilyTokenLimit(undone.state.players[0]!)).toBe(5)
    expect(getWorkerHeldOnCard(undone.state.players[0]!, 'C022_BasketChair')).toBe('1')
    expect(undone.state.actionSpaces.find(space => space.id === 'lessons')!.blockedBy).toEqual([
      { playerId: 'p1', workerId: '1', sourceSpaceId: 'forest' },
    ])
    expect(undone.state.actionSpaces.find(space => space.id === 'lessons')!.takenBy).toHaveLength(1)
    expect(removals(undone)).toEqual([])
    expect(undone.state.log.some(entry => entry.key === 'log.workerRemoved')).toBe(false)
    expect(farmers(undone)).toMatchObject({ quantity: 3, total: 9 })
    expect(removals(ok(session.resolveChoice(0, '__skip__')))).toHaveLength(1)
  })

  it('can remove a newborn first in the stable family collection and does not feed or score it', () => {
    const session = setup(state => {
      const owner = state.players[0]!
      owner.workers[2]!.isNewborn = true
      owner.workers = [owner.workers[2]!, owner.workers[0]!, owner.workers[1]!, ...owner.workers.slice(3)]
      owner.minorPlayed = ['A029_AleBenches']
      owner.resources.grain = 1
      state.actionSpaces.find(space => space.id === 'wish-children')!.takenBy = [
        { playerId: owner.id, workerId: '2' }, { playerId: owner.id, workerId: '3' },
      ]
    })
    const returning = finishRound(session, true)
    expect(returning.state.players[0]!.workers[0]).toMatchObject({
      id: '3', isActive: false, isNewborn: false, removedFromSupply: true,
    })
    expect(returning.state.actionSpaces.find(space => space.id === 'wish-children')!.takenBy).toEqual([
      { playerId: 'p1', workerId: '2' },
    ])
    expect(removals(returning)).toEqual([expect.objectContaining({ workers: [{ playerId: 'p1', workerId: '3' }] })])
    expect(farmers(returning)).toMatchObject({ quantity: 2, total: 6 })
    const completed = finishChoices(session, returning)
    expect(completed.state.round).toBe(10)
    expect(completed.state.events).toContainEqual(expect.objectContaining({
      type: 'resource.paid', actorPlayerId: 'p1', paymentFor: 'feeding', resources: { food: 4 },
    }))
    expect(completed.state.players[0]!.resources.begging).toBe(0)
  })

  it('preserves capacity through round eight and removes one person only at round nine return-home', () => {
    const session = setup(state => { state.round = 8 })
    const nine = finishRound(session)
    expect(nine.state.round).toBe(9)
    expect(session.withCtx(() => getExtraRoomCapacity(nine.state.players[0]!))).toBe(1)
    expect(familySize(nine.state.players[0]!)).toBe(3)
    expect(removals(nine)).toHaveLength(0)
    const ten = finishRound(session)
    expect(ten.state.round).toBe(10)
    expect(session.withCtx(() => getExtraRoomCapacity(ten.state.players[0]!))).toBe(0)
    expect(familySize(ten.state.players[0]!)).toBe(2)
    expect(removals(ten)).toHaveLength(1)
    const restored = new GameSession(rehydrateState(
      JSON.parse(JSON.stringify(serializeSessionSnapshot(session.state, session))),
    ))
    sessions.push(restored)
    expect(familySize(restored.getState().state.players[0]!)).toBe(2)
    expect(removals(restored.getState())).toHaveLength(1)
  })

  it('keeps the third person in a physical room without adding room score for the expired card', () => {
    const session = setup(state => {
      const owner = state.players[0]!
      owner.houseType = 'clay'
      owner.rooms = 3
      owner.roomTiles.push({ row: 1, col: 1 })
    })
    const response = finishRound(session)
    expect(familySize(response.state.players[0]!)).toBe(3)
    expect(session.withCtx(() => getExtraRoomCapacity(response.state.players[0]!))).toBe(0)
    expect(response.scores?.[0]?.categories.find(category => category.key === 'clayRooms')).toMatchObject({ quantity: 3, total: 3 })
    expect(removals(response)).toEqual([])
  })

  it('does not create temporary room when played in round ten', () => {
    const session = setup(state => {
      state.round = 10
      const owner = state.players[0]!
      owner.occupationPlayed = []
      owner.occupationHand = [LODGER]
      owner.cardStates = {}
      setActiveWorkerCount(owner, 2)
    })
    let response = ok(session.takeAction(0, 'lessons'))
    if (response.state.players[0]!.occupationHand.includes(LODGER)) response = ok(session.resolveChoice(0, LODGER))
    expect(response.state.players[0]!.occupationPlayed).toEqual([LODGER])
    expect(session.withCtx(() => getExtraRoomCapacity(response.state.players[0]!))).toBe(0)
    expect(familySize(response.state.players[0]!)).toBe(2)
    expect(removals(response)).toEqual([])
  })
})
