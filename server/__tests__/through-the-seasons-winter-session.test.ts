import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import {
  familySize,
  newbornCount,
  markAllWorkersUsed,
  setActiveWorkerCount,
  setWorkersAtHome,
} from '../../shared/domain/player'
import { computeAllowedPlacementSpaces } from '../../shared/actions/helpers/placement-availability'
import { emptyResources } from '../../shared/session/state-bootstrap'
import { serializeSessionSnapshot, rehydrateState } from '../../shared/session/serialization'
import '../../shared/cards/E/E113_Godmother'
import '../../shared/cards/E/E155_Visionary'

type SeasonId = 'winter' | 'spring' | 'summer' | 'autumn'
type SeasonsState = {
  enableThroughTheSeasons?: boolean
  throughTheSeasons?: {
    startSeason: SeasonId
    currentSeason: SeasonId
  } | null
}

const winterActionId = 'season-winter-romantic-evening'

const seasonsOf = (session: GameSession) => session.state as typeof session.state & SeasonsState

const spaceOf = (session: GameSession, id: string) => {
  const space = session.state.actionSpaces.find((entry) => entry.id === id)
  if (!space) throw new Error(`missing action space ${id}`)
  return space
}

const setupWinter = (round: number) => {
  const session = new GameSession(350, undefined, {
    playerCount: 2,
    enableThroughTheSeasons: true,
  } as never)
  const state = seasonsOf(session)
  state.currentPlayerIndex = 0
  state.round = round
  state.roundPhase = 'work'
  state.throughTheSeasons = { startSeason: 'winter', currentSeason: 'winter' }
  state.players.forEach((player) => {
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
  })
  const player = state.players[0]!
  setActiveWorkerCount(player, 2)
  setWorkersAtHome(state, player, 2)
  session.loadState(state)
  return session
}

const availableIds = (session: GameSession, playerIndex = 0) =>
  session.getAvailableActions(playerIndex).map((action) => action.spaceId)

const auditClone = <T>(value: T): T => JSON.parse(JSON.stringify(value))
const auditWinter = (round = 1) => {
  const session = setupWinter(round)
  for (const player of session.state.players) player.resources = { ...emptyResources, food: 50 }
  return session
}
const auditRestore = (session: GameSession) => {
  const restored = new GameSession(350, undefined, { playerCount: 2 })
  const response = restored.loadState(rehydrateState(auditClone(serializeSessionSnapshot(session.state, session))))
  expect(response.ok, response.error).toBe(true)
  expect(response.interaction).toEqual(session.getState().interaction)
  return restored
}
const auditSettle = (session: GameSession) => {
  let response = session.getState()
  for (let step = 0; step < 20 && response.interaction.stateId === 'wait'; step++) {
    const request = response.interaction.request
    if (request.kind === 'confirm-next-player') response = session.resolveChoice(response.interaction.playerIndex, 'confirm')
    else if (request.kind === 'feed') response = session.resolveChoice(response.interaction.playerIndex, 'confirm', { selections: [] })
    else if (request.kind === 'choice') response = session.resolveChoice(response.interaction.playerIndex, '__skip__')
    else throw new Error(JSON.stringify(response.interaction))
    expect(response.ok, response.error).toBe(true)
  }
  return response
}

describe('Seasons batch 3 winter audit', () => {
  it.each([1, 4, 5, 7, 8, 9, 10, 11, 12, 13, 14])('round %i Romantic Evening pays for every still-pending harvest and creates one newborn', (round) => {
    let session = auditWinter(round)
    const food = ({ 1: 6, 4: 6, 5: 5, 7: 5, 8: 4, 9: 4, 10: 3, 11: 3, 12: 2, 13: 2, 14: 1 } as Record<number, number>)[round]!
    Object.assign(session.state.players[0]!.resources, { wood: 2, food })
    const other = auditClone(session.state.players[1])
    const response = session.takeAction(0, winterActionId)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toEqual(emptyResources)
    expect(familySize(response.state.players[0]!)).toBe(3)
    expect(newbornCount(response.state.players[0]!)).toBe(1)
    expect(response.state.players[0]!.rooms).toBe(2)
    expect(response.state.players[1]).toEqual(other)
    expect(spaceOf(session, winterActionId).takenBy).toHaveLength(2)
    expect(response.state.events.filter((event) => event.type === 'resource.paid')).toEqual([expect.objectContaining({ actorPlayerId: 'p1', resources: { wood: 2, food } })])
    expect(response.state.log.length).toBeGreaterThan(1)
    session = auditRestore(session)
    auditSettle(session)
    const before = auditClone(session.state)
    expect(session.takeAction(0, winterActionId).ok).toBe(false)
    expect(auditClone(session.state)).toEqual(before)
    session.state.players[0]!.resources.food = 50
    session.state.players.forEach((player) => markAllWorkersUsed(session.state, player))
    expect(session.loadState(session.state).ok).toBe(true)
    expect(session.performRoundEnd().ok).toBe(true)
    const after = auditSettle(session)
    expect(familySize(after.state.players[0]!)).toBe(3)
    if (round < 14) {
      expect(after.state.round).toBe(round + 1)
      expect(newbornCount(after.state.players[0]!)).toBe(0)
    } else {
      expect(after.state.gameOver).toBe(true)
      expect(after.scores![0]!.categories.find((category) => category.key === 'farmers')?.total).toBe(9)
      expect(after.scores![0]!.categories.some((category) => category.key === 'parentCards')).toBe(false)
      expect(session.buildSyncPayload(after, null).scores).toEqual(after.scores)
    }
  })

  it.each([1, 4, 5, 7, 8, 9, 10, 11, 12, 13, 14].flatMap((round) => ['food', 'wood'].map((missing) => ({ round, missing }))))(
    'round $round Romantic Evening rejects one missing $missing without partial payment', ({ round, missing }) => {
      const session = auditWinter(round)
      const food = ({ 1: 6, 4: 6, 5: 5, 7: 5, 8: 4, 9: 4, 10: 3, 11: 3, 12: 2, 13: 2, 14: 1 } as Record<number, number>)[round]!
      Object.assign(session.state.players[0]!.resources, { wood: missing === 'wood' ? 1 : 2, food: food - (missing === 'food' ? 1 : 0) })
      const before = auditClone(session.state)
      expect(session.takeAction(0, winterActionId).ok).toBe(false)
      expect(auditClone(session.state)).toEqual(before)
    },
  )

  it.each(['five-family', 'occupied', 'no-worker'] as const)('Romantic Evening respects %s limits', (condition) => {
    const session = auditWinter()
    session.state.players[0]!.resources.wood = 2
    if (condition === 'five-family') { setActiveWorkerCount(session.state.players[0]!, 5); setWorkersAtHome(session.state, session.state.players[0]!, 5) }
    if (condition === 'no-worker') markAllWorkersUsed(session.state, session.state.players[0]!)
    if (condition === 'occupied') spaceOf(session, winterActionId).takenBy.push({ playerId: 'p2', workerId: session.state.players[1]!.workers[0]!.id })
    expect(session.loadState(session.state).ok).toBe(true)
    const before = auditClone(session.state)
    expect(session.takeAction(0, winterActionId).ok).toBe(false)
    expect(auditClone(session.state)).toEqual(before)
  })

  it.each([10, 12])('winter Fishing round %i enforces availability and occupied-space limits', (round) => {
    const session = auditWinter(round)
    spaceOf(session, 'fishing').resources.food = 3
    const before = auditClone(session.state)
    const response = session.takeAction(0, 'fishing')
    expect(response.ok).toBe(round === 12)
    if (round === 10) expect(auditClone(session.state)).toEqual(before)
    else {
      expect(response.state.players[0]!.resources.food).toBe(53)
      expect(spaceOf(session, 'fishing').resources.food).toBe(0)
      auditSettle(session)
      const occupied = auditClone(session.state)
      expect(session.takeAction(1, 'fishing').ok).toBe(false)
      expect(auditClone(session.state)).toEqual(occupied)
    }
  })

  it('CHARACTERIZATION: winter Fishing remains blocked in round 11 pending a rules ruling', () => {
    const session = auditWinter(11)
    spaceOf(session, 'fishing').resources.food = 3
    const before = auditClone(session.state)
    expect(session.takeAction(0, 'fishing')).toMatchObject({ ok: false, error: 'space unavailable' })
    expect(auditClone(session.state)).toEqual(before)
  })

  it.each(['plow', 'sow', 'plow-sow', 'sow-plow'] as const)('winter Cultivation %s charges only for the new field', (order) => {
    let session = auditWinter(13)
    const player = session.state.players[0]!
    player.resources.food = order === 'sow' ? 0 : 1
    player.resources.grain = 1
    player.fields = [{ row: 0, col: 0, stacks: [] }]
    let response = session.takeAction(0, 'cultivation')
    expect(response.ok, response.error).toBe(true)
    session = auditRestore(session)
    for (const action of order.split('-')) {
      response = session.getState()
      if (response.interaction.request.kind === 'choice') {
        const option = response.interaction.request.options.find((entry) => entry.labelKey === `actions.${action}.name`)
        expect(option).toBeDefined()
        response = session.resolveChoice(0, option!.value)
      }
      expect(response.interaction.request.kind).toBe('farm-select')
      response = action === 'plow'
        ? session.commitSelectionChoice(0, { tile: { row: 0, col: 1 } })
        : session.commitSelectionChoice(0, { crops: [{ row: 0, col: 0, crop: 'grain' }] })
      expect(response.ok, response.error).toBe(true)
    }
    if (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'choice') {
      expect(response.interaction.request.options.map((option) => option.value)).toContain('__done__')
      expect(session.resolveChoice(0, '__done__').ok).toBe(true)
    }
    expect(session.state.players[0]!.resources.food).toBe(0)
    expect(session.state.players[0]!.resources.grain).toBe(order === 'plow' ? 1 : 0)
    expect(session.state.players[0]!.fields).toHaveLength(order === 'sow' ? 1 : 2)
    expect(session.state.events.filter((event) => event.type === 'farm.fieldPlowed')).toHaveLength(order === 'sow' ? 0 : 1)
    expect(session.state.events.filter((event) => event.type === 'farm.sown')).toHaveLength(order === 'plow' ? 0 : 1)
    expect(session.state.players[1]!.resources).toEqual({ ...emptyResources, food: 50 })
  })

  it.each([0, 1])('winter plowing with %i food validates position and charges once after restore', (food) => {
    let session = auditWinter()
    session.state.players[0]!.resources.food = food
    const before = auditClone(session.state)
    const response = session.takeAction(0, 'farmland')
    expect(response.ok).toBe(food === 1)
    if (food === 0) { expect(auditClone(session.state)).toEqual(before); return }
    session = auditRestore(session)
    const waiting = auditClone(session.state)
    const tile = { row: 0, col: 0 }
    expect(session.commitSelectionChoice(1, { tile }).ok).toBe(false)
    expect(session.commitSelectionChoice(0, { tile: session.state.players[0]!.roomTiles[0]! }).ok).toBe(false)
    expect(auditClone(session.state)).toEqual(waiting)
    const done = session.commitSelectionChoice(0, { tile })
    expect(done.ok, done.error).toBe(true)
    expect(done.state.players[0]!.resources.food).toBe(0)
    expect(done.state.players[0]!.fields).toEqual([{ ...tile, stacks: [] }])
    expect(done.state.players[1]).toEqual(before.players[1])
    expect(done.state.events.filter((event) => event.type === 'action.detailLogged' && event.actionId === 'farmland')).toEqual([expect.objectContaining({ actorPlayerId: 'p1', detailParts: { costs: { food: 1 }, effects: { plow: 1 } } })])
    auditSettle(session)
    session.state.round = 14
    session.state.players[0]!.resources.food = 50
    session.state.players.forEach((player) => markAllWorkersUsed(session.state, player))
    expect(session.loadState(session.state).ok).toBe(true)
    expect(session.performRoundEnd().ok).toBe(true)
    const final = auditSettle(session)
    expect(final.state.gameOver).toBe(true)
    expect(final.scores![0]!.categories.find((category) => category.key === 'fields')).toMatchObject({ quantity: 1, total: -1 })
    expect(final.scores!.every((score) => Number.isInteger(score.total))).toBe(true)
    for (const viewer of ['p1', 'p2', null]) expect(session.buildSyncPayload(final, viewer).scores).toEqual(final.scores)
  })
})

describe('Through the Seasons Winter rules', () => {
  it('blocks Fishing through round 11, including direct backend attempts', () => {
    const session = setupWinter(11)
    spaceOf(session, 'fishing').resources.food = 3

    expect(availableIds(session)).not.toContain('fishing')
    expect(session.takeAction(0, 'fishing')).toMatchObject({
      ok: false,
      error: 'space unavailable',
    })
    expect(spaceOf(session, 'fishing').resources.food).toBe(3)
  })

  it('blocks Fishing in generic extra placement choices through round 11', () => {
    const session = setupWinter(11)
    spaceOf(session, 'fishing').resources.food = 3

    const placements = computeAllowedPlacementSpaces(session.state, session.state.players[0]!)

    expect(placements.map((entry) => entry.spaceId)).not.toContain('fishing')
  })

  it('allows Fishing from round 12 onward when the ordinary action is available', () => {
    const session = setupWinter(12)
    spaceOf(session, 'fishing').resources.food = 3
    const beforeFood = session.state.players[0]!.resources.food

    expect(availableIds(session)).toContain('fishing')
    const resp = session.takeAction(0, 'fishing')

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.food).toBe(beforeFood + 3)
  })

  it('charges 1 food for ordinary plowing in Winter', () => {
    const session = setupWinter(1)
    const player = session.state.players[0]!
    player.resources.food = 1

    expect(availableIds(session)).toContain('farmland')
    let resp = session.takeAction(0, 'farmland')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') throw new Error('expected plow prompt')
    expect(resp.interaction.request.kind).toBe('farm-select')
    const tile = resp.interaction.request.farm.selectableTiles[0]
    expect(tile).toBeDefined()

    resp = session.commitSelectionChoice(0, { tile })

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.food).toBe(0)
    expect(resp.state.players[0]!.fields).toContainEqual({
      row: tile!.row,
      col: tile!.col,
      stacks: [],
    })
  })

  it('keeps ordinary plowing unavailable in Winter when the food cost cannot be paid', () => {
    const session = setupWinter(1)
    const player = session.state.players[0]!
    player.resources.food = 0

    expect(availableIds(session)).not.toContain('farmland')
    expect(session.takeAction(0, 'farmland')).toMatchObject({
      ok: false,
      error: 'space unavailable',
    })
    expect(spaceOf(session, 'farmland').takenBy).toHaveLength(0)
    expect(player.fields).toHaveLength(0)
  })

  it('uses the existing remaining-harvest convention for Romantic Evening cost', () => {
    const session = setupWinter(11)
    const player = session.state.players[0]!
    player.resources.food = 3
    player.resources.wood = 2
    player.rooms = 2

    expect(familySize(player)).toBe(2)
    expect(availableIds(session)).toContain(winterActionId)
    const resp = session.takeAction(0, winterActionId)

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.food).toBe(0)
    expect(resp.state.players[0]!.resources.wood).toBe(0)
    expect(familySize(resp.state.players[0]!)).toBe(3)
    expect(newbornCount(resp.state.players[0]!)).toBe(1)
    expect(spaceOf(session, winterActionId).takenBy).toHaveLength(2)
  })

  it('keeps Romantic Evening unavailable when its dynamic cost cannot be paid', () => {
    const session = setupWinter(11)
    const player = session.state.players[0]!
    player.resources.food = 2
    player.resources.wood = 2
    player.rooms = 2

    expect(availableIds(session)).not.toContain(winterActionId)
    expect(session.takeAction(0, winterActionId)).toMatchObject({
      ok: false,
      error: 'space unavailable',
    })
  })

  it('runs Romantic Evening availability through family-growth isDoable listeners', () => {
    const session = setupWinter(10)
    const player = session.state.players[0]!
    player.resources.food = 3
    player.resources.wood = 2
    player.rooms = 2
    player.occupationPlayed.push('E155_Visionary')

    expect(availableIds(session)).not.toContain(winterActionId)
    expect(session.takeAction(0, winterActionId)).toMatchObject({
      ok: false,
      error: 'space unavailable',
    })
  })

  it('dispatches Romantic Evening growth through family-growth after listeners', () => {
    const session = setupWinter(11)
    const player = session.state.players[0]!
    player.resources.food = 3
    player.resources.wood = 2
    player.resources.vegetable = 0
    player.rooms = 2
    player.occupationPlayed.push('E113_Godmother')

    const resp = session.takeAction(0, winterActionId)

    expect(resp.ok).toBe(true)
    expect(familySize(resp.state.players[0]!)).toBe(3)
    expect(resp.state.players[0]!.resources.vegetable).toBe(1)
  })

  it('keeps Romantic Evening subject to family supply and occupancy constraints', () => {
    const noSupplySession = setupWinter(11)
    const noSupplyPlayer = noSupplySession.state.players[0]!
    noSupplyPlayer.resources.food = 3
    noSupplyPlayer.resources.wood = 2
    noSupplyPlayer.rooms = 2
    noSupplyPlayer.workers.forEach((worker) => {
      if (!worker.isActive) worker.removedFromSupply = true
    })

    expect(availableIds(noSupplySession)).not.toContain(winterActionId)

    const occupiedSession = setupWinter(11)
    const occupiedPlayer = occupiedSession.state.players[0]!
    occupiedPlayer.resources.food = 3
    occupiedPlayer.resources.wood = 2
    occupiedPlayer.rooms = 2
    spaceOf(occupiedSession, winterActionId).takenBy.push({
      playerId: occupiedSession.state.players[1]!.id,
      workerId: occupiedSession.state.players[1]!.workers[0]!.id,
    })

    expect(availableIds(occupiedSession)).not.toContain(winterActionId)
    expect(occupiedSession.takeAction(0, winterActionId)).toMatchObject({
      ok: false,
      error: 'space unavailable',
    })
  })
})
