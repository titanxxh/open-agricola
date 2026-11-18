import { afterEach, describe, expect, it } from 'vitest'
import { CE203_Shepherd } from '../../shared/cards/classic/CE/CE203_Shepherd'
import { requireActiveCardRegistry } from '../../shared/cards/active-registry'
import { getTotalAnimalCapacity } from '../../shared/domain'
import { markAllWorkersUsed } from '../../shared/domain/player'
import type { GameState, PlayerState } from '../../shared/contract/types'
import type { GameSession, SessionResponse } from '../game/authoritative-session'
import { createWorkSession } from './_helpers/session-fixtures'

// Breeding has no room precheck (#1799): every eligible type produces its litter
// and the following animal reorganization decides which newborns are housed.
// Official cards cannot make effective parents outnumber room, so a test-only
// card adds parents that count only for breeding.
const SHEPHERD = CE203_Shepherd.meta.id
const EXTRA_PARENTS = 'TEST_ExtraBreedingParents'

const sessions: GameSession[] = []
afterEach(() => sessions.splice(0).forEach((session) => session.dispose()))

/** House pet cattle plus one sheep and one boar in two unfenced stables: room for three animals. */
function smallFarm(player: PlayerState) {
  const room = player.roomTiles[0]!
  player.houseAnimals = { [`${room.row}-${room.col}`]: 'cattle' }
  player.pastures = []
  player.stableTiles = [{ row: 0, col: 3 }, { row: 0, col: 4 }]
  player.stableAnimals = {
    '0-3': { animalType: 'sheep', animalCount: 1 },
    '0-4': { animalType: 'boar', animalCount: 1 },
  }
  Object.assign(player.resources, { sheep: 1, boar: 1, cattle: 1 })
}

function setup(extraParents: boolean) {
  const session = createWorkSession({
    seed: 1799,
    configure(state: GameState) {
      state.round = 4
      for (const player of state.players) {
        Object.assign(player.resources, { food: 40, sheep: 0, boar: 0, cattle: 0 })
        markAllWorkersUsed(state, player)
      }
      const owner = state.players[0]!
      owner.occupationPlayed = extraParents ? [SHEPHERD, EXTRA_PARENTS] : [SHEPHERD]
      smallFarm(owner)
    },
  })
  sessions.push(session)
  session.withCtx(() => {
    requireActiveCardRegistry('breeding without room precheck').loadImpl(EXTRA_PARENTS, {
      effect: {
        id: EXTRA_PARENTS,
        // Effective parents 4 sheep / 2 boar / 2 cattle: 2 + 1 + 1 newborns.
        computeBreedableAnimalCount: (_state, _player, type, count) =>
          type === 'sheep' ? count + 3 : type === 'boar' || type === 'cattle' ? count + 1 : undefined,
      },
    })
    const state = session.getState().state
    expect(getTotalAnimalCapacity(state.players[0]!, state)).toBe(3)
  })
  return session
}

function advanceToHousing(session: GameSession) {
  let response = session.performRoundEnd()
  for (let step = 0; step < 24; step++) {
    expect(response.ok, response.error).toBe(true)
    if (response.interaction.stateId !== 'wait') return response
    const { request, playerIndex } = response.interaction
    if (request.kind === 'animal-reorg') return response
    if (request.kind === 'feed') {
      response = session.resolveChoice(playerIndex, 'confirm', { selections: [] })
    } else if (request.kind === 'confirm-next-player' || request.kind === 'confirm-player-switch') {
      response = session.resolveChoice(playerIndex, 'confirm')
    } else if (request.kind === 'choice') {
      expect(request.options.map(option => option.value)).toContain('__skip__')
      response = session.resolveChoice(playerIndex, '__skip__')
    } else throw new Error(`Unexpected pre-breeding interaction: ${JSON.stringify(response.interaction)}`)
  }
  throw new Error('Breeding housing was not reached')
}

const harvestBirths = (response: SessionResponse) => response.state.events
  .filter(event => event.type === 'farm.animalBred' && event.source === 'harvest')

describe('harvest breeding without a room precheck', () => {
  it('breeds every eligible type when the litters exceed room, and the player chooses which newborns to keep', () => {
    const session = setup(true)
    const pending = advanceToHousing(session)

    expect(pending.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0, request: { kind: 'animal-reorg' } })
    expect(pending.state.players[0]!.resources).toMatchObject({ sheep: 3, boar: 2, cattle: 2 })
    expect(pending.state.harvestBreedSummary?.[pending.state.players[0]!.id]?.resources)
      .toEqual({ sheep: 2, boar: 1, cattle: 1 })
    expect(harvestBirths(pending)).toEqual([expect.objectContaining({
      actorPlayerId: pending.state.players[0]!.id, animals: { sheep: 2, boar: 1, cattle: 1 },
    })])

    // Keep both cattle (the calf in a stable) and one sheep; release the boar and two sheep.
    const room = pending.state.players[0]!.roomTiles[0]!
    const housed = session.resolveChoice(0, 'confirm', { zones: [
      { id: `house:${room.row}-${room.col}`, zoneType: 'house', animalType: 'cattle', animalCount: 1 },
      { id: 'stable:0-3', zoneType: 'stable', animalType: 'cattle', animalCount: 1 },
      { id: 'stable:0-4', zoneType: 'stable', animalType: 'sheep', animalCount: 1 },
    ] })

    expect(housed.ok, housed.error).toBe(true)
    const owner = housed.state.players[0]!
    expect(owner.resources).toMatchObject({ sheep: 1, boar: 0, cattle: 2 })
    // Placed Newborn Animals: the calf and one of the two lambs.
    expect(harvestBirths(housed)).toEqual([expect.objectContaining({
      actorPlayerId: owner.id, animals: { sheep: 1, cattle: 1 },
    })])
    // The live log row is regenerated with the housed newborns, matching the public fact.
    expect(housed.state.log.filter(entry => entry.key === 'log.harvestBreedDetail').map(entry => entry.params?.resources))
      .toEqual([{ sheep: 1, cattle: 1 }])
    expect(housed.state.round).toBe(5)
    expect(housed.interaction.stateId).toBe('idle')
  })

  it('does not breed a type without enough effective parents', () => {
    const session = setup(false)
    const response = advanceToHousing(session)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ sheep: 1, boar: 1, cattle: 1 })
    expect(harvestBirths(response)).toEqual([])
    expect(response.state.round).toBe(5)
    expect(response.interaction.stateId).toBe('idle')
  })
})
