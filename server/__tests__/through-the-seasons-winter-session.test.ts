import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import {
  familySize,
  newbornCount,
  setActiveWorkerCount,
  setWorkersAtHome,
} from '../../shared/domain/player'

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
    const tile = resp.interaction.farm.selectableTiles[0]
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
