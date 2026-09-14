import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setActiveWorkerCount, setWorkersAtHome } from '../../shared/domain/player'
import { addWorkerRef } from '../../shared/domain/space'
import { getRoundPersonPlacementDetails, recordRoundPlacement } from '../../shared/cards/helpers/round-placement'
import { createPlayerActionSpaces } from '../../shared/cards/player-action-space'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/D/D094_HenpeckedHusband'
import '../../shared/cards/D/D127_HardworkingMan'
import '../../shared/cards/E/E014_WoodSaw'

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
  const session = new GameSession(6094, undefined, { playerCount: hardworkingMan ? 3 : 2 })
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
  ? response.interaction.request.options ?? []
  : []

const playOccupation = (session: GameSession) => {
  let response = session.takeAction(0, 'lessons')
  if (!response.state.players[0]!.occupationHand.includes(CARD_ID)) return response
  const card = options(response).find((option) => option.value === CARD_ID)
  if (card) response = session.resolveChoice(response.interaction.playerIndex, card.value)
  return response
}

const commitFarmSelection = (session: GameSession, response: SessionResponse) => {
  if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'farm-select') {
    return response
  }
  const farm = response.interaction.request.farm
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
  return response
}

const finishHardworkingConstruct = (session: GameSession) => {
  let response = session.takeAction(0, HARDWORKING_MAN)
  for (let remaining = 16; remaining > 0 && response.interaction.stateId === 'wait'; remaining -= 1) {
    if (response.interaction.request.kind === 'confirm-next-player') break
    if (response.interaction.request.kind === 'farm-select') {
      response = commitFarmSelection(session, response)
      continue
    }
    const choice = options(response).find((option) => option.labelKey === 'actions.construct.name')
      ?? options(response).find((option) => option.value === '__done__')
    if (!choice) break
    response = session.resolveChoice(response.interaction.playerIndex, choice.value)
  }
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

  it('D094 S2: a room built by the second placed person recalls the first person', () => {
    const session = setup({ firstSpace: 'forest' })
    const firstId = getRoundPersonPlacementDetails(session.state.players[0]!)[0]!.workerId

    const response = finishFarmExpansion(session, 'actions.construct.name')

    expect(response.ok, response.error).toBe(true)
    expect(workerOn(response, 'forest', firstId)).toBe(false)
    expect(workerOn(response, 'farm-expansion')).toBe(true)
    expect(response.state.players[0]!.rooms).toBe(3)
    expect(triggerCount(response)).toBe(1)
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

  it('D094 S7: the recalled first person building as the third placement is not recalled again', () => {
    const session = setup({ firstSpace: 'forest', hardworkingMan: true })
    const firstId = getRoundPersonPlacementDetails(session.state.players[0]!)[0]!.workerId
    const firstBuild = finishFarmExpansion(session, 'actions.construct.name')
    expect(workerOn(firstBuild, 'forest', firstId)).toBe(false)

    firstBuild.state.currentPlayerIndex = 0
    session.loadState(firstBuild.state)
    const response = finishHardworkingConstruct(session)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.rooms).toBe(4)
    expect(workerOn(response, HARDWORKING_MAN, firstId)).toBe(true)
    expect(getRoundPersonPlacementDetails(response.state.players[0]!)).toHaveLength(3)
    expect(triggerCount(response)).toBe(1)
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
