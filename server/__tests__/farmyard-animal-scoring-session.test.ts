import { afterEach, describe, expect, it } from 'vitest'
import type { GameState, PlayerState } from '../../shared/contract/types'
import { emptyResources } from '../../shared/contract/state-constants'
import { getCardEffect } from '../../shared/cards/card-effects'
import { buildCardAnimalZoneId, buildHostedCardAnimalZoneId, computeAnimalZones } from '../../shared/domain/animal-zones'
import { countAnimalOccupiedFarmyardSpaces } from '../../shared/domain/animal-occupied-spaces'
import { positionKey } from '../../shared/domain/farmyard-geometry'
import { getActiveCardRegistry } from '../../shared/cards/active-registry'
import { serializeSessionSnapshot, rehydrateState } from '../../shared/session/serialization'
import { GameSession } from '../game/authoritative-session'
import { createWorkSession } from './_helpers/session-fixtures'

const sessions: GameSession[] = []
afterEach(() => { for (const session of sessions.splice(0)) session.dispose() })

const setup = (cardId: string, seed: number, configure?: (state: GameState) => void) => {
  const session = createWorkSession({ seed, options: { enableFarmersOfTheMoor: true }, configure(state) {
    state.round = 2
    for (const player of state.players) {
      player.resources = { ...emptyResources, food: 20, fuel: 20, horse: 0 }
      player.minorHand = ['__test_placeholder__']
      player.occupationHand = ['__test_placeholder__']
      player.minorPlayed = []
      player.occupationPlayed = []
      player.improvements = []
      player.cardStates = {}
      player.fields = []
      player.pastures = []
      player.fenceSegments = []
      player.stableTiles = []
      player.stableAnimals = {}
      player.houseAnimals = {}
      player.farmTerrain = []
    }
    if (cardId === 'D029_MuckRake') state.players[0]!.minorPlayed = [cardId]
    else state.players[0]!.occupationPlayed = [cardId]
    configure?.(state)
  } })
  sessions.push(session)
  return session
}

const score = (session: GameSession, cardId: string) => session.getState().scores[0]!.categories
  .flatMap(category => category.entries).filter(entry => entry.type === 'bonus' && entry.cardId === cardId)
  .reduce((sum, entry) => sum + entry.score, 0)

const expectPureScore = (session: GameSession, cardId: string, expected: number, {
  direct = true, install,
}: { direct?: boolean; install?: (session: GameSession) => void } = {}) => {
  const interaction = session.getState().interaction
  const before = JSON.stringify(session.state)
  if (direct) expect(session.withCtx(() => getCardEffect(cardId)?.computeBonusScore?.(
    session.state, session.state.players[0]!, { categories: [] },
  ))).toBe(expected)
  if (direct && cardId === 'C134_CowPrince') expect(session.withCtx(() =>
    countAnimalOccupiedFarmyardSpaces(session.state.players[0]!, session.state, 'cattle'))).toBe(expected)
  expect(score(session, cardId)).toBe(expected)
  expect(score(session, cardId)).toBe(expected)
  expect(JSON.stringify(session.state)).toBe(before)
  expect(session.getState().interaction).toEqual(interaction)
  const snapshot = session.withCtx(() => serializeSessionSnapshot(session.state, session))
  const restored = new GameSession(rehydrateState(snapshot))
  sessions.push(restored)
  install?.(restored)
  const restoredBefore = JSON.stringify(restored.state)
  expect(score(restored, cardId)).toBe(expected)
  expect(score(restored, cardId)).toBe(expected)
  expect(JSON.stringify(restored.state)).toBe(restoredBefore)
}

const farmHand = (player: PlayerState) => {
  player.occupationPlayed.push('B085_FarmHand')
  player.fields = [{ row: 0, col: 1 }, { row: 0, col: 2 }, { row: 1, col: 1 }, { row: 1, col: 2 }]
    .map(tile => ({ ...tile, stacks: [] }))
  player.cardStates.B085_FarmHand = { flagged: true, extraData: { position: { row: 0, col: 1 } } }
}

const homeWood = (player: PlayerState, count = 1) => {
  player.minorPlayed.push('M034_HomeWood')
  player.improvements = ['Major_Fireplace1', 'Major_Well', 'Major_Pottery']
  player.farmTerrain = [{ row: 0, col: 1, kind: 'forest' }]
  player.resources.cattle = count
  player.cardStates.M034_HomeWood = { extraData: { animalCountsByZone: {
    [buildCardAnimalZoneId('M034_HomeWood', { row: 0, col: 1 })]: { animalCounts: { cattle: count } },
  } } }
}

describe('farmyard animal scoring facts', () => {
  it('Stable Architect counts a standing Farm Hand stable without an ordinary stable tile', () => {
    const session = setup('A098_StableArchitect', 429005, state => farmHand(state.players[0]!))
    expect(session.state.players[0]!.stableTiles).toEqual([])
    expectPureScore(session, 'A098_StableArchitect', 1)
  })

  it.each([
    { mode: 'mixed', expected: 2 }, { mode: 'fenced', expected: 0 },
    { mode: 'returned', expected: 0 }, { mode: 'opponent', expected: 0 },
    { mode: 'hand', expected: 0 }, { mode: 'farm hand not played', expected: 0 },
  ])('Stable Architect uses own standing unfenced stables: $mode', ({ mode, expected }) => {
    const session = setup('A098_StableArchitect', 429005, state => {
      const player = state.players[0]!
      farmHand(mode === 'opponent' ? state.players[1]! : player)
      if (mode === 'mixed') player.stableTiles = [{ row: 2, col: 4 }]
      if (mode === 'returned' || mode === 'fenced') player.cardStates.B085_FarmHand = { flagged: true }
      if (mode === 'fenced') {
        player.stableTiles = [{ row: 0, col: 4 }]
        player.pastures = [{ id: 'fenced', tiles: [{ row: 0, col: 4 }], animalType: null, animalCount: 0 }]
        player.fenceSegments = ['H-0-4', 'H-1-4', 'V-0-4', 'V-0-5'].map(edge => ({ edge, type: 'fence' }))
      }
      if (mode === 'hand') {
        player.occupationPlayed = ['B085_FarmHand']
        player.occupationHand = ['A098_StableArchitect']
      }
      if (mode === 'farm hand not played') player.occupationPlayed = ['A098_StableArchitect']
    })
    expectPureScore(session, 'A098_StableArchitect', expected, { direct: mode !== 'hand' })
  })

  it('Muck Rake does not score two sheep in an enhanced loose stable', () => {
    const session = setup('D029_MuckRake', 429006, state => {
      const player = state.players[0]!
      player.occupationPlayed = ['C089_StableMaster']
      player.stableTiles = [{ row: 0, col: 4 }]
      player.stableAnimals = { '0-4': { animalType: 'sheep', animalCount: 2 } }
      player.resources.sheep = 2
    })
    expect(session.withCtx(() => computeAnimalZones(session.state.players[0]!, session.state))
      .filter(zone => zone.zoneType === 'stable')).toEqual([
      expect.objectContaining({ capacity: 3, animalType: 'sheep', animalCount: 2 }),
    ])
    expectPureScore(session, 'D029_MuckRake', 0)
  })

  it.each([{ count: 1, expected: 1 }, { count: 3, expected: 0 }])(
    'Muck Rake scores actual occupancy, not enhanced capacity: $count sheep', ({ count, expected }) => {
    const session = setup('D029_MuckRake', 429006, state => {
      const player = state.players[0]!
      player.occupationPlayed = ['C089_StableMaster']
      player.stableTiles = [{ row: 0, col: 4 }]
      player.stableAnimals = { '0-4': { animalType: 'sheep', animalCount: count } }
      player.resources.sheep = count
    })
    expectPureScore(session, 'D029_MuckRake', expected)
  })

  it.each([
    { mode: 'three species', expected: 3 }, { mode: 'duplicate sheep', expected: 1 },
    { mode: 'empty', expected: 0 }, { mode: 'house', expected: 0 }, { mode: 'fenced', expected: 0 },
    { mode: 'dangling assignment', expected: 0 }, { mode: 'horse', expected: 0 }, { mode: 'hand', expected: 0 },
  ])('Muck Rake excludes other holders and duplicate species: $mode', ({ mode, expected }) => {
    const session = setup('D029_MuckRake', 429006, state => {
      const player = state.players[0]!
      player.stableTiles = [{ row: 0, col: 4 }]
      player.stableAnimals = { '0-4': { animalType: 'sheep', animalCount: 1 } }
      player.resources.sheep = 1
      if (mode === 'three species' || mode === 'duplicate sheep') {
        player.stableTiles.push({ row: 0, col: 3 })
        player.stableAnimals['0-3'] = { animalType: mode === 'three species' ? 'boar' : 'sheep', animalCount: 1 }
        if (mode === 'three species') {
          player.stableTiles.push({ row: 1, col: 4 })
          player.stableAnimals['1-4'] = { animalType: 'cattle', animalCount: 1 }
          player.resources.boar = 1
          player.resources.cattle = 1
        } else player.resources.sheep = 2
      }
      if (mode === 'empty' || mode === 'house') {
        player.stableAnimals = {}
        if (mode === 'house') player.houseAnimals = { [positionKey(player.roomTiles[0]!)]: 'sheep' }
        else player.resources.sheep = 0
      }
      if (mode === 'fenced') {
        player.pastures = [{ id: 'fenced', tiles: [{ row: 0, col: 4 }], animalType: 'sheep', animalCount: 1 }]
        player.fenceSegments = ['H-0-4', 'H-1-4', 'V-0-4', 'V-0-5'].map(edge => ({ edge, type: 'fence' }))
      }
      if (mode === 'dangling assignment') player.stableTiles = []
      if (mode === 'horse') {
        player.stableAnimals = { '0-4': { animalType: 'horse', animalCount: 1 } }
        player.resources.sheep = 0
        player.resources.horse = 1
      }
      if (mode === 'hand') {
        player.minorPlayed = []
        player.minorHand = ['D029_MuckRake']
      }
    })
    expectPureScore(session, 'D029_MuckRake', expected, { direct: mode !== 'hand' })
  })

  it('Cow Prince scores a real forest space holding cattle through Home Wood', () => {
    const session = setup('C134_CowPrince', 429007, state => homeWood(state.players[0]!))
    expect(session.withCtx(() => computeAnimalZones(session.state.players[0]!, session.state))
      .filter(zone => zone.cardId === 'M034_HomeWood')).toEqual([
      expect.objectContaining({ farmPosition: { row: 0, col: 1 }, animalType: 'cattle', animalCount: 1 }),
    ])
    expectPureScore(session, 'C134_CowPrince', 1)
  })

  it.each([
    { mode: 'empty Home Wood', expected: 0 }, { mode: 'horse in Home Wood', expected: 0 },
    { mode: 'Home Wood not played', expected: 0 }, { mode: 'pure card zone', expected: 0 },
    { mode: 'two rooms', expected: 2 }, { mode: 'four cattle in two pasture spaces', expected: 2 },
    { mode: 'one cattle in two pasture spaces', expected: 1 }, { mode: 'loose stable', expected: 1 },
    { mode: 'Cow Prince in hand', expected: 0 }, { mode: 'opponent Home Wood', expected: 0 },
  ])('Cow Prince counts occupied physical spaces: $mode', ({ mode, expected }) => {
    const session = setup('C134_CowPrince', 429007, state => {
      const player = state.players[0]!
      if (mode.includes('Home Wood') || mode === 'Cow Prince in hand') {
        homeWood(mode === 'opponent Home Wood' ? state.players[1]! : player, mode === 'empty Home Wood' ? 0 : 1)
      }
      if (mode === 'horse in Home Wood') {
        player.resources.cattle = 0
        player.resources.horse = 1
        player.cardStates.M034_HomeWood = { extraData: { animalCountsByZone: {
          [buildCardAnimalZoneId('M034_HomeWood', { row: 0, col: 1 })]: { animalCounts: { horse: 1 } },
        } } }
      }
      if (mode === 'Home Wood not played') player.minorPlayed = []
      if (mode === 'pure card zone') {
        player.minorPlayed = ['M033_NightPasture']
        player.resources.cattle = 1
        player.cardStates.M033_NightPasture = { extraData: { animalCountsByZone: {
          [buildHostedCardAnimalZoneId('M033_NightPasture', player.id, player.id)]: {
            animalCounts: { cattle: 1 }, ownerPlayerId: player.id, animalOwnerPlayerId: player.id,
          },
        } } }
      }
      if (mode === 'two rooms') {
        player.occupationPlayed.push('A086_AnimalTamer')
        player.resources.cattle = 2
        player.houseAnimals = Object.fromEntries(player.roomTiles.map(tile => [positionKey(tile), 'cattle']))
      }
      if (mode.includes('pasture spaces')) {
        const count = mode.startsWith('four') ? 4 : 1
        player.resources.cattle = count
        player.pastures = [{ id: 'cow-pasture', tiles: [{ row: 0, col: 3 }, { row: 0, col: 4 }], animalType: 'cattle', animalCount: count }]
        player.fenceSegments = ['H-0-3', 'H-0-4', 'H-1-3', 'H-1-4', 'V-0-3', 'V-0-5'].map(edge => ({ edge, type: 'fence' }))
      }
      if (mode === 'loose stable') {
        player.stableTiles = [{ row: 0, col: 4 }]
        player.stableAnimals = { '0-4': { animalType: 'cattle', animalCount: 1 } }
        player.resources.cattle = 1
      }
      if (mode === 'Cow Prince in hand') {
        player.occupationPlayed = []
        player.occupationHand = ['C134_CowPrince']
      }
    })
    expectPureScore(session, 'C134_CowPrince', expected, { direct: mode !== 'Cow Prince in hand' })
  })

  it('Cow Prince deduplicates two different holder zones at the same real forest coordinate', () => {
    const extraCard = 'CUSTOM_DuplicateForestHolder'
    const position = { row: 0, col: 1 }
    const session = setup('C134_CowPrince', 429007, state => {
      const player = state.players[0]!
      homeWood(player)
      player.minorPlayed.push(extraCard)
      player.resources.cattle = 2
      player.cardStates[extraCard] = { extraData: { animalCountsByZone: {
        [buildCardAnimalZoneId(extraCard, position)]: { animalCounts: { cattle: 1 } },
      } } }
    })
    const install = (target: GameSession) => target.withCtx(() => getActiveCardRegistry()!.loadImpl(extraCard, { effect: {
      id: extraCard,
      onComputeAnimalZones: () => [{ id: buildCardAnimalZoneId(extraCard, position), zoneType: 'card',
        cardId: extraCard, farmPosition: position, capacity: 1, animalCount: 0, animalType: null,
        allowedAnimalType: null }],
    } }))
    install(session)
    expect(session.withCtx(() => computeAnimalZones(session.state.players[0]!, session.state))
      .filter(zone => zone.farmPosition?.row === 0 && zone.farmPosition.col === 1 && zone.animalCount === 1)).toHaveLength(2)
    expectPureScore(session, 'C134_CowPrince', 1, { install })
  })
})
