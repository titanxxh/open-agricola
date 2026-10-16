import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setActiveWorkerCount, setWorkersAtHome, workersAvailable } from '../../shared/domain/player'
import { addWorkerRef, findActionSpaceById } from '../../shared/domain/space'
import { getRoundPersonPlacementDetails, recordRoundPlacement } from '../../shared/cards/helpers/round-placement'
import { createPlayerActionSpaces } from '../../shared/cards/player-action-space'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import '../../shared/cards/D/D094_HenpeckedHusband'
import '../../shared/cards/D/D127_HardworkingMan'
import '../../shared/cards/E/E014_WoodSaw'
import assert from 'node:assert/strict'
import { createWorkSession } from './_helpers/session-fixtures'
import { assertRejectedUnchanged, assertUndoRestored, confirmNext, undoRuleSnapshot, getChoiceOptions, expectFarmSelection } from './_helpers/session-assertions'
import { createScenarioEvidence } from './_helpers/scenario-evidence'

const evidence = createScenarioEvidence(import.meta.url)

const CARD_ID = 'D094_HenpeckedHusband'
const HARDWORKING_MAN = 'D127_HardworkingMan'
const FILLER = '__test_placeholder__'

type SetupOptions = {
  played?: boolean
  firstSpace?: string
  secondSpace?: string
  activeWorkers?: number
  hardworkingMan?: boolean
}

const setup = ({
  played = true,
  firstSpace,
  secondSpace,
  activeWorkers = 2,
  hardworkingMan = false,
}: SetupOptions = {}) => {
  const session = evidence.track(createWorkSession({ seed: 6094, options: { playerCount: hardworkingMan ? 3 : 2 } }))
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 14
  state.roundPhase = 'work'
  state.players.forEach((player) => {
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.cardStates = {}
    player.resources = {
      ...player.resources,
      wood: 0, clay: 0, reed: 0, stone: 0, food: 20, grain: 0, vegetable: 0,
      sheep: 0, boar: 0, cattle: 0, begging: 0,
    }
  })

  const player = state.players[0]!
  player.resources = { ...player.resources, wood: 20, reed: 10, food: 0 }
  player.occupationHand = played ? [FILLER] : [CARD_ID]
  player.occupationPlayed = played ? [CARD_ID] : []
  setActiveWorkerCount(player, activeWorkers)
  state.actionSpaces.forEach((space) => {
    space.takenBy = space.takenBy.filter((worker) => worker.playerId !== player.id)
  })
  setWorkersAtHome(state, player, activeWorkers)

  const placements = [firstSpace, secondSpace].filter((space): space is string => space !== undefined)
  placements.forEach((spaceId, index) => {
    const space = state.actionSpaces.find((candidate) => candidate.id === spaceId)
    const worker = player.workers
      .filter((candidate) => candidate.isActive)
      .sort((left, right) => Number(left.id) - Number(right.id))[index]
    if (!space || !worker) throw new Error(`missing D094 setup ${spaceId}`)
    addWorkerRef(space, player.id, worker.id)
    recordRoundPlacement(player, space.id, worker.id)
  })

  if (hardworkingMan) {
    player.occupationPlayed.push(HARDWORKING_MAN)
    state.players.slice(1).forEach((opponent) => { opponent.rooms = 4 })
    state.actionSpaces.push(...createPlayerActionSpaces(state).filter((space) =>
      !state.actionSpaces.some((existing) => existing.id === space.id),
    ))
  }

  session.loadState(state)
  return session
}

const options = (response: SessionResponse) => response.interaction.stateId === 'wait'
  ? getChoiceOptions(response) ?? []
  : []

const playOccupation = (session: GameSession) => {
  let response = session.takeAction(0, 'lessons')
  if (!response.state.players[0]!.occupationHand.includes(CARD_ID)) return response
  const card = options(response).find((option) => option.value === CARD_ID)
  if (card) {
    assert.ok(response.interaction.stateId === 'wait')
    response = session.resolveChoice(response.interaction.playerIndex, card.value)
  }
  return response
}

const commitFarmSelection = (session: GameSession, response: SessionResponse) => {
  if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'farm-select') {
    return response
  }
  const farm = expectFarmSelection(response)
  if (farm.farmType === 'room') {
    return session.commitSelectionChoice(response.interaction.playerIndex, { rooms: [farm.selectableTiles[0]!] })
  }
  if (farm.farmType === 'stable') {
    return session.commitSelectionChoice(response.interaction.playerIndex, { stables: [farm.selectableTiles[0]!] })
  }
  throw new Error(`unexpected farm type ${farm.farmType}`)
}

const finishFarmExpansion = (
  session: GameSession,
  mode: 'actions.construct.name' | 'actions.stables.name',
) => {
  let response = session.takeAction(0, 'farm-expansion')
  for (let remaining = 16; remaining > 0 && response.interaction.stateId === 'wait'; remaining -= 1) {
    if (response.interaction.request.kind === 'confirm-next-player') break
    if (response.interaction.request.kind === 'farm-select') {
      response = commitFarmSelection(session, response)
      continue
    }
    const choice = options(response).find((option) => option.labelKey === mode)
      ?? options(response).find((option) => option.value === '__done__' || option.value === '__skip__')
    if (!choice) break
    response = session.resolveChoice(response.interaction.playerIndex, choice.value)
  }
  expect(response.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0, request: { kind: 'confirm-next-player' } })
  return response
}



const workerOn = (response: SessionResponse, spaceId: string, workerId?: string) =>
  response.state.actionSpaces.find((space) => space.id === spaceId)?.takenBy.some((worker) =>
    worker.playerId === response.state.players[0]!.id
    && (workerId === undefined || worker.workerId === workerId),
  ) ?? false

const triggerCount = (response: SessionResponse) => response.state.events.filter((event) =>
  event.type === 'card.triggered' && event.sourceCardId === CARD_ID,
).length

describe('D094 Henpecked Husband parity', () => {
  it('D094 S1: Henpecked Husband can be played as the first occupation through Lessons', () => {
    const response = playOccupation(setup({ played: false }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.food).toBe(0)
  })



  it('D094 S3: preserves both workers for the Meeting Place exemption through a real second-person room build', () => {
    const session = setup({ firstSpace: 'meeting-place' })
    const placements = getRoundPersonPlacementDetails(session.state.players[0]!)
    const firstId = placements[0]!.workerId
    const secondId = session.state.players[0]!.workers
      .find((worker) => worker.isActive && worker.id !== firstId)!.id

    const response = finishFarmExpansion(session, 'actions.construct.name')

    expect(response.ok, response.error).toBe(true)
    expect(workerOn(response, 'meeting-place', firstId)).toBe(true)
    expect(workerOn(response, 'farm-expansion', secondId)).toBe(true)
    expect(response.state.players[0]!.rooms).toBe(3)
    expect(triggerCount(response)).toBe(0)
    expect(workersAvailable(response.state, response.state.players[0]!)).toBe(0)
  })

  it('D094 S4: a room built by the first placed person recalls nobody', () => {
    const session = setup()

    const response = finishFarmExpansion(session, 'actions.construct.name')

    expect(response.ok, response.error).toBe(true)
    expect(workerOn(response, 'farm-expansion')).toBe(true)
    expect(response.state.players[0]!.rooms).toBe(3)
    expect(triggerCount(response)).toBe(0)
  })

  it('D094 S5: a stable built by the second placed person does not recall the first person', () => {
    const session = setup({ firstSpace: 'forest' })
    const firstId = getRoundPersonPlacementDetails(session.state.players[0]!)[0]!.workerId

    const response = finishFarmExpansion(session, 'actions.stables.name')

    expect(response.ok, response.error).toBe(true)
    expect(workerOn(response, 'forest', firstId)).toBe(true)
    expect(response.state.players[0]!.stableTiles).toHaveLength(1)
    expect(triggerCount(response)).toBe(0)
    expect(response.state.players[0]!.rooms).toBe(2)
    expect(workersAvailable(response.state, response.state.players[0]!)).toBe(0)
  })

  it('D094 S6: a room built by the third placed person does not recall the first person', () => {
    const session = setup({ firstSpace: 'forest', secondSpace: 'clay-pit', activeWorkers: 3 })
    const firstId = getRoundPersonPlacementDetails(session.state.players[0]!)[0]!.workerId

    const response = finishFarmExpansion(session, 'actions.construct.name')

    expect(response.ok, response.error).toBe(true)
    expect(workerOn(response, 'forest', firstId)).toBe(true)
    expect(response.state.players[0]!.rooms).toBe(3)
    expect(triggerCount(response)).toBe(0)
  })



  it('D094 S8: a Wood Saw room build after the second placement does not recall the first person', () => {
    const session = setup({ firstSpace: 'forest' })
    const state = session.getState().state
    const player = state.players[0]!
    const firstId = getRoundPersonPlacementDetails(player)[0]!.workerId
    player.minorPlayed.push('E014_WoodSaw')
    setActiveWorkerCount(state.players[1]!, 3)
    session.loadState(state)

    let response = session.takeAction(0, 'farmland')
    expect(response.interaction.anytimeActions).toContainEqual(
      expect.objectContaining({ id: 'E14-wood-saw-anytime' }),
    )
    response = session.takeAnytimeAction(0, 'E14-wood-saw-anytime')
    if (response.interaction.stateId === 'wait'
      && response.interaction.request.kind === 'choice') {
      const accept = options(response).find((option) => option.value !== '__skip__')
      expect(accept).toBeDefined()
      response = session.resolveChoice(response.interaction.playerIndex, accept!.value)
    }
    response = commitFarmSelection(session, response)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.rooms).toBe(3)
    expect(workerOn(response, 'forest', firstId)).toBe(true)
    expect(triggerCount(response)).toBe(0)
  })
})

describe('D094 rule boundaries', () => {

  const D094 = 'D094_HenpeckedHusband'

  function ok(r: SessionResponse) { assert.equal(r.ok, true, r.error); return r }

  function ready(session: GameSession, actor: number) {
    let r = session.getState()
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player')
      r = confirmNext(session, r)
    assert.equal(r.interaction.stateId, 'idle')
    assert.equal(r.state.currentPlayerIndex, actor)
    return r
  }

  function turn(session: GameSession, actor: number, space: string) {
    ready(session, actor)
    let r = ok(session.takeAction(actor, space))
    if (space === 'meeting-place' && r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice') {
      const skip = getChoiceOptions(r).find(o => o.value === '__skip__' || o.value === '__done__')
      assert.ok(skip)
      r = ok(session.resolveChoice(actor, skip.value))
    }
    return r
  }

  function occupants(r: SessionResponse, space: string) {
    return findActionSpaceById(r.state, space)!.takenBy.filter(w => w.playerId === r.state.players[0]!.id)
  }

  function husbandSetup(hardworking = false) {
    const session = evidence.track(createWorkSession({
      seed: 42, options: { playerCount: 3 }, configure: state => {
        state.round = 10
        state.players.forEach(p => { p.resources.food = 20 })
        const p = state.players[0]!
        p.occupationPlayed = hardworking ? [D094, 'D127_HardworkingMan'] : [D094]
        p.resources.wood = 20
        p.resources.reed = 10
        state.players.slice(1).forEach(other => {
          other.rooms = 4
          other.roomTiles = [{ row: 1, col: 0 }, { row: 2, col: 0 }, { row: 1, col: 1 }, { row: 2, col: 1 }]
        })
      }
    }))
    return session
  }

  function husbandFirst(session: GameSession, first = 'forest') {
    turn(session, 0, first)
    turn(session, 1, 'clay-pit')
    turn(session, 2, 'reed-bank')
    ready(session, 0)
    const firstPlacement = getRoundPersonPlacementDetails(session.state.players[0]!)[0]
    assert.ok(firstPlacement)
    return firstPlacement.workerId
  }

  function choose(session: GameSession, r: SessionResponse, labelKey: string) {
    assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice', JSON.stringify(r.interaction))
    const option = getChoiceOptions(r).find(o => o.labelKey === labelKey)
    assert.ok(option, JSON.stringify(r.interaction))
    return ok(session.resolveChoice(0, option.value))
  }

  function finishFarm(session: GameSession, mode: 'room' | 'stable', space = 'farm-expansion', rejectTile = false) {
    let r = turn(session, 0, space)
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice') {
      r = choose(session, r, mode === 'room' ? 'actions.construct.name' : 'actions.stables.name')
    }
    assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'farm-select')
    const farm = expectFarmSelection(r)
    assert.equal(farm.farmType, mode)
    assert.ok(farm.farmType === 'room' || farm.farmType === 'stable')
    const tile = farm.selectableTiles[0]!
    assert.ok(tile)
    if (rejectTile)
      assertRejectedUnchanged(session, () => session.commitSelectionChoice(0, { rooms: [{ row: 1, col: 0 }] }))
    r = ok(session.commitSelectionChoice(0, mode === 'room' ? { rooms: [tile] } : { stables: [tile] }))
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice') {
      const done = getChoiceOptions(r).find(o => o.value === '__done__' || o.value === '__skip__')
      assert.ok(done, JSON.stringify(r.interaction))
      r = ok(session.resolveChoice(0, done.value))
    }
    assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player')
    return r
  }

  function firstAt(r: SessionResponse, space: string, workerId: string) {
    return occupants(r, space).some(w => w.workerId === workerId)
  }

  it("second room build recalls first and rejects invalid room before undo and retry", () => {
    const s = husbandSetup()
    const first = husbandFirst(s)
    const before = undoRuleSnapshot(s.getState())
    const r = finishFarm(s, 'room', 'farm-expansion', true)
    assert.equal(r.state.players[0]!.rooms, 3)
    assert.equal(firstAt(r, 'forest', first), false)
    assert.equal(workersAvailable(r.state, r.state.players[0]!), 1)
    assert.equal(r.state.players[0]!.resources.reed, 8)
    assert.equal(occupants(r, 'farm-expansion').length, 1)
    assert.equal(r.state.events.filter(e => e.type === 'card.triggered' && e.sourceCardId === D094).length, 1)
    const undone = s.undoAction()
    assertUndoRestored(before, undone)
    assert.equal(undone.interaction.stateId, 'idle')
    assert.equal(undone.state.currentPlayerIndex, 0)
    const retried = finishFarm(s, 'room')
    assert.equal(retried.state.players[0]!.rooms, 3)
    assert.equal(firstAt(retried, 'forest', first), false)
  })





  it("recalled first person building on third placement is not recalled again", () => {
    const s = husbandSetup(true)
    const first = husbandFirst(s)
    const recall = finishFarm(s, 'room')
    assert.equal(firstAt(recall, 'forest', first), false)
    turn(s, 1, 'grain-seeds')
    turn(s, 2, 'fishing')
    const r = finishFarm(s, 'room', 'D127_HardworkingMan')
    assert.equal(r.state.players[0]!.rooms, 4)
    assert.equal(firstAt(r, 'D127_HardworkingMan', first), true)
    assert.equal(workersAvailable(r.state, r.state.players[0]!), 0)
    assert.equal(getRoundPersonPlacementDetails(r.state.players[0]!).length, 3)
    assert.equal(r.state.events.filter(e => e.type === 'card.triggered' && e.sourceCardId === D094).length, 1)
    assert.ok(r.scores)
    assert.equal(r.scores.length, 3)
  })
})
