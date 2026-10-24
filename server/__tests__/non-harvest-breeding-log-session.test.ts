import { afterEach, describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { createWorkSession } from './_helpers/session-fixtures'
import { markAllWorkersUsed } from '../../shared/domain/player'
import type { GameState, PlayerState } from '../../shared/contract/types'
import { emptyResources } from '../../shared/session/state-bootstrap'
import { rehydrateState, serializeSessionSnapshot } from '../../shared/session/serialization'
import { buildReplayActionLogPresentation } from '../../client/app/replay-action-log-presentation'

const springAction = 'season-spring-animal-and-fruit'
const springSource = 'through-the-seasons:spring'
const pigBreeder = 'A165_PigBreeder'
const sessions: GameSession[] = []
afterEach(() => sessions.splice(0).forEach(session => session.dispose()))

const pasture = (player: PlayerState, animal: 'sheep' | 'boar') => {
  player.resources[animal] = 2
  player.pastures = [{ id: 'pen', tiles: [{ row: 0, col: 0 }, { row: 0, col: 1 }], animalType: animal, animalCount: 2 }]
  player.fenceSegments = ['H-0-0', 'H-0-1', 'H-1-0', 'H-1-1', 'V-0-0', 'V-0-2']
    .map(edge => ({ edge, type: 'fence', source: { kind: 'own', ownerPlayerId: player.id } }))
}

// Fresh two-player work games fix both hands before loading. No played cards,
// cardStates or occupied spaces are needed for spring; A165 is already played.
const setup = (source: 'spring' | 'card') => {
  const session = createWorkSession({ seed: 1379, options: { enableThroughTheSeasons: source === 'spring' }, configure: state => {
    state.players.forEach(player => {
      player.minorHand = ['__test_placeholder__']
      player.occupationHand = ['__test_placeholder__']
      player.resources = { ...emptyResources, food: 60 }
      pasture(player, source === 'spring' ? 'sheep' : 'boar')
    })
    const owner = state.players[0]!
    if (source === 'spring') {
      state.throughTheSeasons = { startSeason: 'spring', currentSeason: 'spring' }
      owner.fields = [{ row: 1, col: 1, stacks: [] }]
      owner.resources.grain = 1
    } else {
      state.round = 12
      owner.occupationPlayed = [pigBreeder]
      state.players.forEach(player => markAllWorkersUsed(state, player))
    }
  } })
  sessions.push(session)
  expect(session.state.players).toHaveLength(2)
  expect(session.getState().interaction.stateId).toBe('idle')
  return session
}

const birthRows = (state: Pick<GameState, 'log'>) => state.log.filter(entry => entry.key === 'log.animalBredFromSource')
const replayBirthRows = (state: GameState) => buildReplayActionLogPresentation({
  events: state.events, publicEventArchive: state.publicEventArchive, stateLog: state.log,
  currentRound: state.round, locale: 'en', replayFilter: 'all',
  playerNames: Object.fromEntries(state.players.map(player => [player.id, player.name])),
}).timelineBuckets.flatMap(bucket => bucket.rows).filter(row => row.logEntry?.key === 'log.animalBredFromSource')

const chooseSpringBreeding = (session: GameSession) => {
  const response = session.takeAction(0, springAction)
  expect(response.ok, response.error).toBe(true)
  expect(response.interaction.request.kind).toBe('choice')
  if (response.interaction.request.kind !== 'choice') throw new Error('Expected spring choice')
  const choice = response.interaction.request.options.find(option => option.labelKey === 'actions.breed.name')
  if (!choice) throw new Error('Missing spring breeding option')
  const bred = session.resolveChoice(0, choice.value)
  expect(bred.ok, bred.error).toBe(true)
  expect(bred.interaction.request.kind).toBe('animal-reorg')
  return bred
}

const houseNewborn = (session: GameSession, response: SessionResponse, animal: 'sheep' | 'boar') => {
  if (response.interaction.request.kind !== 'animal-reorg') throw new Error('Expected animal arrangement')
  const done = session.resolveChoice(0, 'confirm', { zones: response.interaction.request.zones.map(zone => ({
    id: zone.id, zoneType: zone.zoneType, animalType: zone.id === 'pen' ? animal : zone.animalType,
    animalCount: zone.id === 'pen' ? 3 : zone.animalCount,
  })) })
  expect(done.ok, done.error).toBe(true)
  expect(done.scores).toBeDefined()
  return done
}

describe('non-harvest birth results at the authoritative boundary', () => {
  it('keeps one actual spring newborn through recovery, rejected retry, undo and Replay', () => {
    let session = setup('spring')
    const opponent = structuredClone(session.state.players[1])
    let response = chooseSpringBreeding(session)
    const birth = response.state.events.find(event => event.type === 'farm.animalBred')!
    expect(birth).toMatchObject({ source: 'cardEffect', sourceCardId: springSource, animals: { sheep: 1 } })
    expect(birthRows(response.state)).toEqual([expect.objectContaining({
      params: { player: response.state.players[0]!.name, cardId: springSource, resources: { sheep: 1 } },
      sourceEvent: { occurrenceId: birth.occurrenceId, rowIndex: 0 },
    })])
    const saved = JSON.parse(JSON.stringify(serializeSessionSnapshot(session.state, session)))
    session = new GameSession(rehydrateState(saved))
    sessions.push(session)
    response = session.getState()
    expect(response.interaction.request.kind).toBe('animal-reorg')
    expect(session.resolveChoice(1, 'confirm', { zones: [] }).ok).toBe(false)
    response = houseNewborn(session, response, 'sheep')
    expect(response.state.players[0]!.resources.sheep).toBe(3)
    expect(response.state.players[1]).toEqual(opponent)
    expect(birthRows(response.state)).toHaveLength(1)
    expect(replayBirthRows(response.state).map(row => row.kind)).toEqual(['event'])

    const undone = session.undoAction()
    expect(undone.ok, undone.error).toBe(true)
    expect(undone.state.players[0]!.resources.sheep).toBe(2)
    expect(birthRows(undone.state)).toHaveLength(0)
    response = houseNewborn(session, chooseSpringBreeding(session), 'sheep')
    expect(response.state.players[0]!.resources.sheep).toBe(3)
    expect(response.state.events.filter(event => event.type === 'farm.animalBred')).toHaveLength(1)
    expect(birthRows(response.state)).toHaveLength(1)
    expect(replayBirthRows(response.state).map(row => row.kind === 'event' ? row.status : row.kind)).toEqual(['active', 'canceled'])
  })

  it('records one A165 newborn separately from the later allocation total', () => {
    const session = setup('card')
    const response = houseNewborn(session, session.performRoundEnd(), 'boar')
    expect(response.state.players[0]!.resources.boar).toBe(3)
    expect(response.state.players[1]!.resources.boar).toBe(2)
    expect(response.state.events.filter(event => event.type === 'farm.animalBred')).toEqual([
      expect.objectContaining({ sourceCardId: pigBreeder, animals: { boar: 1 } }),
    ])
    expect(birthRows(response.state)).toEqual([expect.objectContaining({
      params: { player: response.state.players[0]!.name, cardId: pigBreeder, resources: { boar: 1 } },
    })])
    expect(replayBirthRows(response.state)).toHaveLength(1)
    expect(response.state.harvestBreedSummary).toBeUndefined()
  })
})
