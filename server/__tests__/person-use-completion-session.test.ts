import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { familySize, setActiveWorkerCount, workersAvailable } from '../../shared/domain/player'
import { getRoundPersonPlacementDetails, recordRoundPlacement } from '../../shared/cards/helpers/round-placement'
import { rehydrateState, serializeSessionSnapshot } from '../../shared/session/serialization'
import { createWorkSession } from './_helpers/session-fixtures'
import { createScenarioEvidence } from './_helpers/scenario-evidence'
import { confirmNext, getChoiceOptions } from './_helpers/session-assertions'

const BROTHERS = 'D024_BrotherlyLove'
const CANAL = 'D103_CanalBoatman'
const { track, record } = createScenarioEvidence(import.meta.url)

const setup = (configure?: (state: GameSession['state']) => void) => track(createWorkSession({
  seed: 1299,
  configure: state => {
    state.round = 5
    const owner = state.players[0]!
    setActiveWorkerCount(owner, 4)
    owner.rooms = 4
    owner.roomTiles = [{ row: 1, col: 0 }, { row: 2, col: 0 }, { row: 1, col: 1 }, { row: 2, col: 1 }]
    for (const player of state.players) {
      player.minorHand = ['__test_placeholder__']
      player.occupationHand = ['__test_placeholder__']
      player.minorPlayed = []
      player.occupationPlayed = []
      player.cardStates = {}
      Object.assign(player.resources, { food: 0, wood: 0, clay: 0, reed: 0, stone: 0, grain: 0, vegetable: 0 })
    }
    owner.minorPlayed = [BROTHERS]
    owner.occupationPlayed = [CANAL]
    owner.resources.food = 1
    state.actionSpaces.find(space => space.id === 'forest')!.resources.wood = 1
    state.actionSpaces.find(space => space.id === 'clay-pit')!.resources.clay = 1
    state.actionSpaces.find(space => space.id === 'fishing')!.resources.food = 2
    configure?.(state)
  },
}))

const ok = (response: SessionResponse) => {
  expect(response.ok, response.error).toBe(true)
  return response
}
const choose = (session: GameSession, response: SessionResponse, value: string) => {
  if (response.interaction.stateId !== 'wait') throw new Error('Expected a person-use decision')
  expect(getChoiceOptions(response).some(option => option.value === value && !option.disabled)).toBe(true)
  return ok(session.resolveChoice(response.interaction.playerIndex, value))
}
const accept = (session: GameSession, response: SessionResponse) => {
  const option = getChoiceOptions(response).find(entry => !entry.value.startsWith('__') && !entry.disabled)
  if (!option) throw new Error(`Expected a person-use option: ${JSON.stringify(response.interaction)}`)
  return choose(session, response, option.value)
}
const restore = (session: GameSession) => track(new GameSession(rehydrateState(
  JSON.parse(JSON.stringify(serializeSessionSnapshot(session.state, session))),
)))

const cardThirdPerson = (session: GameSession, remaining = 1) => {
  let response = ok(session.takeAction(0, 'forest'))
  confirmNext(session, response)
  response = ok(session.takeAction(1, 'clay-pit'))
  confirmNext(session, response)
  response = ok(session.takeAction(0, 'fishing'))
  for (let step = 0; step < 3 && getRoundPersonPlacementDetails(response.state.players[0]!).length < 3; step++) {
    response = accept(session, response)
  }
  expect(getRoundPersonPlacementDetails(response.state.players[0]!).map(entry => entry.spaceId))
    .toEqual(['forest', 'fishing', `card:${CANAL}`])
  expect(response.state.players[0]!.resources).toMatchObject({ food: 2, stone: 0, grain: 0, vegetable: 0 })
  expect(workersAvailable(response.state, response.state.players[0]!)).toBe(remaining)
  record('third-person', response)
  return response
}

const source = (response: SessionResponse) => response.interaction.stateId === 'wait'
  ? response.interaction.sourceCard : undefined
const assertRewardWaiting = (response: SessionResponse) => {
  expect(source(response)).toBe(CANAL)
  expect(getChoiceOptions(response)).toHaveLength(2)
  expect(response.state.players[0]!.resources).toMatchObject({ stone: 0, grain: 0, vegetable: 0 })
}
const stoneReward = (session: GameSession, response: SessionResponse, placementLogs: 3 | 4 = 3) => {
  assertRewardWaiting(response)
  const result = accept(session, response)
  expect(result.state.players[0]!.resources).toMatchObject({ stone: 3, grain: 0, vegetable: 0 })
  expect(result.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'confirm-next-player' } })
  expect(result.state.events.filter(event => event.type === 'worker.useCompleted')).toEqual([
    expect.objectContaining({ actorPlayerId: 'p1', sourceCardId: CANAL, workerId: '3', placementOrdinal: 3 }),
  ])
  expect(result.state.log.filter(entry => entry.key === 'log.placeFarmer')).toHaveLength(placementLogs)
  expect(result.scores?.find(score => score.playerId === 'p1')?.total).toBe(-6)
  record('completed-person-use', result)
  return result
}
const twoPlaced = (state: GameSession['state']) => {
  const player = state.players[0]!
  for (const [spaceId, workerId] of [['forest', '1'], ['clay-pit', '2']] as const) {
    state.actionSpaces.find(space => space.id === spaceId)!.takenBy.push({ playerId: player.id, workerId })
    recordRoundPlacement(player, spaceId, workerId)
  }
}

describe('person-use completion', () => {
  it('finishes the card third person and its immediate fourth person before giving D103 rewards once', () => {
    const session = setup()
    let response = cardThirdPerson(session)
    expect(source(response)).toBe(BROTHERS)
    expect(response.scores?.find(score => score.playerId === 'p1')?.total).toBe(-6)
    response = accept(session, response)
    expect(getChoiceOptions(response).map(option => option.value)).toContain('grain-seeds')
    expect(getChoiceOptions(response).map(option => option.value)).not.toContain(`allow-occupied:card-worker:${CANAL}`)
    response = choose(session, response, 'grain-seeds')
    expect(getRoundPersonPlacementDetails(response.state.players[0]!)).toEqual([
      { spaceId: 'forest', workerId: '1' }, { spaceId: 'fishing', workerId: '2' },
      { spaceId: `card:${CANAL}`, workerId: '3' }, { spaceId: 'grain-seeds', workerId: '4' },
    ])
    expect(response.state.players[0]!.resources.grain).toBe(1)
    expect(source(response)).toBe(CANAL)
    expect(response.state.players[0]!.resources.stone).toBe(0)
    response = accept(session, response)
    expect(response.state.players[0]!.resources).toMatchObject({ stone: 3, grain: 1, vegetable: 0 })
    expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'confirm-next-player' } })
    expect(response.state.events.filter(event => event.type === 'worker.useCompleted')).toEqual([
      expect.objectContaining({ actorPlayerId: 'p1', sourceCardId: CANAL, workerId: '3', placementOrdinal: 3 }),
    ])
    expect(response.state.events.filter(event => event.type === 'worker.placed')).toHaveLength(4)
    expect(response.state.log.filter(entry => entry.key === 'log.placeFarmer')).toHaveLength(4)
    expect(response.scores?.find(score => score.playerId === 'p1')?.total).toBe(-4)
    record('fourth-before-reward', response)
  })

  it('declines the fourth person, gives D103 rewards once, and does not repeat at outer Fishing completion', () => {
    const session = setup()
    let response = cardThirdPerson(session)
    response = choose(session, response, '__skip__')
    response = stoneReward(session, response)
    expect(workersAvailable(response.state, response.state.players[0]!)).toBe(1)
    expect(getRoundPersonPlacementDetails(response.state.players[0]!)).toHaveLength(3)
    confirmNext(session, response)
    expect(session.getState().state.currentPlayerIndex).toBe(1)
  })

  it('restores JSON at the third, fourth and reward decisions without losing the frozen worker or repeating use', () => {
    let session = setup()
    cardThirdPerson(session)
    session = restore(session)
    let response = session.getState()
    expect(source(response)).toBe(BROTHERS)
    expect(workersAvailable(response.state, response.state.players[0]!)).toBe(1)
    accept(session, response)
    session = restore(session)
    response = session.getState()
    expect(response.interaction).toMatchObject({ stateId: 'wait', promptKey: 'ui.interactionPlaceFarmerExtra' })
    expect(getChoiceOptions(response).map(option => option.value)).not.toContain(`allow-occupied:card-worker:${CANAL}`)
    choose(session, response, 'day-laborer')
    session = restore(session)
    response = session.getState()
    assertRewardWaiting(response)
    response = stoneReward(session, response, 4)
    expect(workersAvailable(response.state, response.state.players[0]!)).toBe(0)
  })

  it('undoes the fourth placement and the reward choice while preserving the third person completion', () => {
    const session = setup()
    let response = cardThirdPerson(session)
    response = accept(session, response)
    response = choose(session, response, 'day-laborer')
    assertRewardWaiting(response)
    response = ok(session.undoStep())
    expect(response.interaction).toMatchObject({ stateId: 'wait', promptKey: 'ui.interactionPlaceFarmerExtra' })
    expect(workersAvailable(response.state, response.state.players[0]!)).toBe(1)
    expect(response.state.players[0]!.resources.food).toBe(2)
    response = choose(session, response, 'day-laborer')
    stoneReward(session, response, 4)
    response = ok(session.undoStep())
    assertRewardWaiting(response)
    response = stoneReward(session, response, 4)
    expect(workersAvailable(response.state, response.state.players[0]!)).toBe(0)
  })

  it('undoes the outer Fishing action before the fourth person and replays its person use only once', () => {
    const session = setup()
    cardThirdPerson(session)
    let response = ok(session.undoAction())
    expect(getRoundPersonPlacementDetails(response.state.players[0]!)).toEqual([{ spaceId: 'forest', workerId: '1' }])
    expect(response.state.players[0]!.resources).toMatchObject({ food: 1, stone: 0, grain: 0, vegetable: 0 })
    expect(workersAvailable(response.state, response.state.players[0]!)).toBe(3)
    expect(response.state.actionSpaces.find(space => space.id === 'fishing')!.takenBy).toEqual([])
    expect(response.state.events.filter(event => event.type === 'worker.useCompleted')).toEqual([])
    response = ok(session.takeAction(0, 'fishing'))
    for (let step = 0; step < 3 && getRoundPersonPlacementDetails(response.state.players[0]!).length < 3; step++) {
      response = accept(session, response)
    }
    expect(source(response)).toBe(BROTHERS)
    response = choose(session, response, '__skip__')
    stoneReward(session, response)
  })

  it('restores an ordinary third-person farm selection and waits for its entire action before offering the fourth', () => {
    let session = setup(state => {
      twoPlaced(state)
      state.players[0]!.occupationPlayed = []
    })
    let response = ok(session.takeAction(0, 'farmland'))
    expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'farm-select' } })
    expect(source(response)).not.toBe(BROTHERS)
    session = restore(session)
    response = session.getState()
    if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'farm-select') {
      throw new Error('Expected the third person to finish plowing')
    }
    const tile = response.interaction.request.farm.selectableTiles[0]!
    response = ok(session.commitSelectionChoice(0, { tile }))
    expect(response.state.players[0]!.fields).toHaveLength(1)
    expect(source(response)).toBe(BROTHERS)
    response = accept(session, response)
    expect(getChoiceOptions(response).map(option => option.value)).toContain('allow-occupied:farmland')
    expect(workersAvailable(response.state, response.state.players[0]!)).toBe(1)
    record('ordinary-completed', response)
  })

  it('counts a real temporary supply person as the third use without adding a family member', () => {
    const FOREST_HUT = 'M053_ForestHut'
    const session = setup(state => {
      twoPlaced(state)
      state.currentPlayerIndex = 1
      const owner = state.players[0]!
      owner.occupationPlayed = []
      owner.minorPlayed.push(FOREST_HUT)
      owner.workers.find(worker => worker.id === '5')!.supplyUse = {
        sourceCard: FOREST_HUT, disposition: 'return-to-supply', status: 'reserved', returnRound: 5,
      }
      owner.cardStates[FOREST_HUT] = { extraData: { temporaryWorkerId: '5', farmTerrainMarkers: [] } }
    })
    let response = ok(session.takeAction(1, 'reed-bank'))
    confirmNext(session, response)
    response = session.getState()
    for (let step = 0; step < 3 && response.interaction.stateId === 'wait'
      && response.interaction.promptKey !== 'ui.interactionPlaceFarmerExtra'; step++) {
      const option = getChoiceOptions(response).find(entry => entry.sourceCard === FOREST_HUT)
      if (!option) throw new Error(`Expected temporary-person turn: ${JSON.stringify(response.interaction)}`)
      response = choose(session, response, option.value)
    }
    response = choose(session, response, 'day-laborer')
    expect(familySize(response.state.players[0]!)).toBe(4)
    expect(getRoundPersonPlacementDetails(response.state.players[0]!)[2]).toEqual({ spaceId: 'day-laborer', workerId: '5' })
    expect(source(response)).toBe(BROTHERS)
    response = accept(session, response)
    expect(getChoiceOptions(response).map(option => option.value)).toContain('allow-occupied:day-laborer')
    expect(workersAvailable(response.state, response.state.players[0]!)).toBe(2)
    record('temporary-third', response)
  })

  it.each([
    { label: 'three people', people: 3, remaining: 0, played: true },
    { label: 'five people', people: 5, remaining: 2, played: true },
    { label: 'Brotherly Love in hand', people: 4, remaining: 1, played: false },
  ])('does not offer a fourth person with $label after D103 uses the third', ({ people, remaining, played }) => {
    const session = setup(state => {
      const owner = state.players[0]!
      setActiveWorkerCount(owner, people)
      if (!played) {
        owner.minorPlayed = []
        owner.minorHand = [BROTHERS]
      }
    })
    const response = cardThirdPerson(session, remaining)
    assertRewardWaiting(response)
    record('ineligible-third', response)
  })

  it('does not offer a fourth person when all four family members have already been used', () => {
    const session = setup(state => {
      twoPlaced(state)
      state.actionSpaces.find(space => space.id === 'day-laborer')!.takenBy.push({ playerId: 'p1', workerId: '4' })
      recordRoundPlacement(state.players[0]!, 'day-laborer', '4')
    })
    let response = ok(session.takeAction(0, 'fishing'))
    expect(source(response)).not.toBe(BROTHERS)
    expect(workersAvailable(response.state, response.state.players[0]!)).toBe(0)
    expect(response.state.players[0]!.resources.food).toBe(3)
    // Canal Boatman cannot spend another person; its optional flow is unavailable.
    expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'confirm-next-player' } })
    response = ok(session.undoAction())
    expect(workersAvailable(response.state, response.state.players[0]!)).toBe(1)
    expect(getRoundPersonPlacementDetails(response.state.players[0]!)).toHaveLength(3)
    expect(response.state.players[0]!.resources.food).toBe(1)
  })

  it('does not offer the owner a fourth person after the opponent uses a third person on D103', () => {
    const session = setup(state => {
      state.currentPlayerIndex = 1
      const opponent = state.players[1]!
      setActiveWorkerCount(opponent, 4)
      opponent.rooms = 4
      opponent.occupationPlayed = [CANAL]
      opponent.resources.food = 1
      for (const [spaceId, workerId] of [['forest', '1'], ['clay-pit', '2']] as const) {
        state.actionSpaces.find(space => space.id === spaceId)!.takenBy.push({ playerId: opponent.id, workerId })
        recordRoundPlacement(opponent, spaceId, workerId)
      }
    })
    let response = ok(session.takeAction(1, 'fishing'))
    response = accept(session, response)
    expect(response.interaction).toMatchObject({ stateId: 'wait', playerIndex: 1, sourceCard: CANAL })
    expect(response.state.players[0]!.resources.food).toBe(1)
    expect(getRoundPersonPlacementDetails(response.state.players[0]!)).toHaveLength(0)
    expect(workersAvailable(response.state, response.state.players[0]!)).toBe(4)
    record('opponent-use', response)
  })

  it('does not offer another fourth person when the third person is relocated after the offer was declined', () => {
    const SWAGMAN = 'A129_Swagman'
    const session = setup(state => {
      twoPlaced(state)
      state.players[0]!.occupationPlayed = [SWAGMAN]
      state.players[0]!.resources.wood = 2
    })
    let response = ok(session.takeAction(0, 'grain-seeds'))
    const brotherTrigger = getChoiceOptions(response).find(option => option.sourceCard === BROTHERS)
    if (source(response) !== BROTHERS) {
      if (!brotherTrigger) throw new Error('Expected Brotherly Love among third-person reactions')
      response = choose(session, response, brotherTrigger.value)
    }
    response = choose(session, response, '__skip__')
    for (let step = 0; step < 8 && response.interaction.stateId === 'wait'
      && response.interaction.request.kind !== 'confirm-next-player'; step++) {
      expect(source(response)).not.toBe(BROTHERS)
      if (response.interaction.request.kind === 'farm-select'
        && response.interaction.request.farm.farmType === 'stable') {
        response = ok(session.commitSelectionChoice(0, { stables: [response.interaction.request.farm.selectableTiles[0]!] }))
        continue
      }
      const options = getChoiceOptions(response)
      const option = options.find(entry => (entry.sourceCard === SWAGMAN || source(response) === SWAGMAN)
        && !entry.value.startsWith('__'))
        ?? options.find(entry => entry.value === '__skip__' || entry.value === 'skip')
      if (!option) throw new Error(`Expected Swagman or skip: ${JSON.stringify(response.interaction)}`)
      response = choose(session, response, option.value)
    }
    expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'confirm-next-player' } })
    expect(getRoundPersonPlacementDetails(response.state.players[0]!)).toEqual([
      { spaceId: 'forest', workerId: '1' }, { spaceId: 'clay-pit', workerId: '2' },
      { spaceId: 'grain-seeds', workerId: '3' },
    ])
    expect(response.state.actionSpaces.find(space => space.id === 'farm-expansion')!.takenBy)
      .toContainEqual({ playerId: 'p1', workerId: '3' })
    expect(response.state.players[0]!.stableTiles).toHaveLength(1)
    expect(response.state.players[0]!.resources.wood).toBe(0)
    expect(workersAvailable(response.state, response.state.players[0]!)).toBe(1)
    record('relocation-not-use', response)
  })

})
