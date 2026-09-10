import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { familySize, markAllWorkersUsed, setActiveWorkerCount, setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { resolveTriggerIfPresent } from './_helpers/trigger-select'
import type { PlayerState } from '../../shared/contract/types'

import '../../shared/cards/C/C090_FieldWatchman'
import '../../shared/cards/C/C091_PlowHero'
import '../../shared/cards/C/C097_SeedResearcher'
import '../../shared/cards/C/C100_Butler'
import '../../shared/cards/C/C122_Bricklayer'
import '../../shared/cards/C/C124_StoneImporter'
import '../../shared/cards/C/C125_Nightworker'
import '../../shared/cards/C/C126_Excavator'
import '../../shared/cards/C/C127_Lover'
import '../../shared/cards/C/C131_PrivateTeacher'
import '../../shared/cards/C/C134_CowPrince'
import '../../shared/cards/C/C135_Constable'

const FILLER = '__test_placeholder__'
const options = (response: SessionResponse) => response.interaction.stateId === 'wait'
  ? response.interaction.request.options ?? [] : []

const setup = ({ cardId, played = true, playerCount = 2, round = 5, resources = {} }: {
  cardId: string; played?: boolean; playerCount?: number; round?: number; resources?: Record<string, number>
}) => {
  const session = new GameSession(8000 + round, undefined, { playerCount })
  stabilizeRandomHands(session.state.players)
  const state = session.state; state.currentPlayerIndex = 0; state.round = round; state.roundPhase = 'work'
  state.actionSpaces.forEach((space) => { space.takenBy = [] })
  state.players.forEach((player, index) => {
    setWorkersAtHome(state, player, index === 0 ? 2 : 0)
    player.minorHand = [FILLER]; player.occupationHand = [FILLER]; player.minorPlayed = []; player.occupationPlayed = []; player.improvements = []; player.cardStates = {}
    player.fields = []; player.pastures = []; player.stableTiles = []; player.fenceSegments = []; player.houseAnimalType = null; player.houseAnimalCount = 0; player.stableAnimals = {}
    player.resources = { ...player.resources, wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0 }
  })
  const owner = state.players[0]!; owner.occupationHand = played ? [FILLER] : [cardId]; owner.occupationPlayed = played ? [cardId] : []; Object.assign(owner.resources, resources)
  session.loadState(state); return session
}

const choose = (session: GameSession, response: SessionResponse, predicate: (option: ReturnType<typeof options>[number]) => boolean) => {
  expect(response.interaction.stateId, JSON.stringify(response.interaction)).toBe('wait')
  if (response.interaction.stateId !== 'wait') return response
  const option = options(response).find(predicate); expect(option, JSON.stringify(response.interaction)).toBeDefined()
  return session.resolveChoice(response.interaction.playerIndex, option!.value)
}
const accept = (session: GameSession, response: SessionResponse, cardId: string) => {
  response = resolveTriggerIfPresent(session, response, cardId)
  return response.interaction.stateId === 'wait' ? choose(session, response, (option) => option.value !== '__skip__') : response
}
const decline = (session: GameSession, response: SessionResponse, cardId: string) => {
  response = resolveTriggerIfPresent(session, response, cardId)
  return response.interaction.stateId === 'wait' && options(response).some((option) => option.value === '__skip__')
    ? session.resolveChoice(response.interaction.playerIndex, '__skip__') : response
}
const playOccupation = (session: GameSession, cardId: string) => {
  let response = session.takeAction(0, 'lessons')
  if (response.state.players[0]!.occupationHand.includes(cardId) && response.interaction.stateId === 'wait') {
    const card = options(response).find((option) => option.value === cardId); if (card) response = session.resolveChoice(0, card.value)
  }
  return response
}
const commitPlow = (session: GameSession, response: SessionResponse) => {
  expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'farm-select', farm: { farmType: 'plow' } } })
  if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'farm-select') return response
  return session.commitSelectionChoice(response.interaction.playerIndex, { tile: response.interaction.request.farm.selectableTiles[0]! })
}
const bonus = (response: SessionResponse, cardId: string, playerIndex = 0) => response.scores[playerIndex]!.categories
  .find((category) => category.key === 'cardBonusVp')?.entries.find((entry) => entry.type === 'bonus' && entry.cardId === cardId)?.score ?? 0

describe('C090 Field Watchman parity', () => {
  it('C090 S1: Field Watchman is played as the first occupation', () => expect(playOccupation(setup({ cardId: 'C090_FieldWatchman', played: false }), 'C090_FieldWatchman').state.players[0]!.occupationPlayed).toContain('C090_FieldWatchman'))
  it('C090 S2: Grain Seeds may add one plowed field', () => { const s = setup({ cardId: 'C090_FieldWatchman' }); let r = accept(s, s.takeAction(0, 'grain-seeds'), 'C090_FieldWatchman'); r = commitPlow(s, r); expect(r.state.players[0]!.fields).toHaveLength(1); expect(r.state.players[0]!.resources.grain).toBe(1) })
  it('C090 S3: the extra plow may be declined', () => { const s = setup({ cardId: 'C090_FieldWatchman' }); const r = decline(s, s.takeAction(0, 'grain-seeds'), 'C090_FieldWatchman'); expect(r.state.players[0]!.fields).toHaveLength(0) })
})

describe('C091 Plow Hero parity', () => {
  it('C091 S1: Plow Hero is played as the first occupation', () => expect(playOccupation(setup({ cardId: 'C091_PlowHero', played: false }), 'C091_PlowHero').state.players[0]!.occupationPlayed).toContain('C091_PlowHero'))
  const use = (prior: boolean, take: boolean) => {
    const s = setup({ cardId: 'C091_PlowHero', resources: { food: 1 } }); const p = s.state.players[0]!
    if (prior) s.state.actionSpaces.find((space) => space.id === 'day-laborer')!.takenBy = [{ playerId: p.id, workerId: '1' }]
    s.loadState(s.state); let r = commitPlow(s, s.takeAction(0, 'farmland')); r = take ? accept(s, r, 'C091_PlowHero') : decline(s, r, 'C091_PlowHero'); if (take) r = commitPlow(s, r); return r
  }
  it('C091 S2: first-person Farmland may pay one food for an additional field', () => { const r = use(false, true); expect(r.state.players[0]!.fields).toHaveLength(2); expect(r.state.players[0]!.resources.food).toBe(0) })
  it('C091 S3: the paid field may be declined', () => expect(use(false, false).state.players[0]!.fields).toHaveLength(1))
  it('C091 S4: second-person Farmland gives no Plow Hero offer', () => expect(JSON.stringify(use(true, false).interaction)).not.toContain('C091_PlowHero'))
  it('C091 S5: first-person Cultivation may pay one food for an additional field', () => {
    const session = setup({ cardId: 'C091_PlowHero', resources: { food: 1 } })
    let response = commitPlow(session, session.takeAction(0, 'cultivation'))
    response = accept(session, response, 'C091_PlowHero')
    response = commitPlow(session, response)
    expect(response.state.players[0]!.fields).toHaveLength(2)
    expect(response.state.players[0]!.resources.food).toBe(0)
  })
})

describe('C097 Seed Researcher parity', () => {
  it('C097 S1: Seed Researcher is played as the first occupation', () => expect(playOccupation(setup({ cardId: 'C097_SeedResearcher', played: false }), 'C097_SeedResearcher').state.players[0]!.occupationPlayed).toContain('C097_SeedResearcher'))
  const returning = (both: boolean, playFree: boolean) => {
    const s = setup({ cardId: 'C097_SeedResearcher', round: 9, resources: { food: 20 } }); const owner = s.state.players[0]!; owner.occupationHand = ['A125_Priest']
    s.state.actionSpaces.find((space) => space.id === 'grain-seeds')!.takenBy = [{ playerId: s.state.players[1]!.id, workerId: '1' }]
    if (both) s.state.actionSpaces.find((space) => space.id === 'vegetable-seeds')!.takenBy = [{ playerId: owner.id, workerId: '1' }]
    s.state.players.forEach((player) => markAllWorkersUsed(s.state, player)); s.loadState(s.state); let r = s.performRoundEnd()
    if (both) { r = choose(s, r, (option) => playFree ? JSON.stringify(option).includes('actions.lessons.name') : !JSON.stringify(option).includes('actions.lessons.name')); if (playFree && r.interaction.stateId === 'wait' && options(r).some((option) => option.value === 'A125_Priest')) r = choose(s, r, (option) => option.value === 'A125_Priest') }
    return r
  }
  it('C097 S2: both seed spaces return to give food and a free occupation', () => { const r = returning(true, true); expect(r.state.players[0]!.occupationPlayed).toContain('A125_Priest'); expect(r.state.players[0]!.resources.food).toBe(18) })
  it('C097 S3: the owner may take only the two food', () => { const r = returning(true, false); expect(r.state.players[0]!.occupationHand).toContain('A125_Priest'); expect(r.state.players[0]!.resources.food).toBe(18) })
  it('C097 S4: only one occupied seed space gives no reward', () => expect(JSON.stringify(returning(false, false).interaction)).not.toContain('C097_SeedResearcher'))
})

describe('C100 Butler parity', () => {
  it('C100 S1: Butler is playable in round eleven', () => expect(playOccupation(setup({ cardId: 'C100_Butler', played: false, round: 11 }), 'C100_Butler').state.players[0]!.occupationPlayed).toContain('C100_Butler'))
  it('C100 S2: more rooms than people scores four points', () => { const s = setup({ cardId: 'C100_Butler', round: 14 }); s.state.players[0]!.rooms = 3; s.loadState(s.state); expect(bonus(s.getState(), 'C100_Butler')).toBe(4) })
  it('C100 S3: equal rooms and people scores zero', () => expect(bonus(setup({ cardId: 'C100_Butler', round: 14 }).getState(), 'C100_Butler')).toBe(0))
  it('C100 S4: after round eleven OA rejects Butler and preserves the placement state', () => {
    const session = setup({ cardId: 'C100_Butler', played: false, round: 12 })
    session.state.players[0]!.rooms = 3
    session.loadState(session.state)
    const before = JSON.stringify(session.getState().state)
    const response = playOccupation(session, 'C100_Butler')
    expect(response.ok).toBe(false)
    expect(JSON.stringify(response.state)).toBe(before)
    expect(response.state.players[0]!.occupationHand).toContain('C100_Butler')
    expect(response.state.players[0]!.occupationPlayed).not.toContain('C100_Butler')
    expect(bonus(response, 'C100_Butler')).toBe(0)
    expect(session.takeAction(0, 'day-laborer').ok).toBe(true)
  })
})

describe('C122 Bricklayer parity', () => {
  it('C122 S1: Bricklayer is played as the first occupation', () => expect(playOccupation(setup({ cardId: 'C122_Bricklayer', played: false }), 'C122_Bricklayer').state.players[0]!.occupationPlayed).toContain('C122_Bricklayer'))
  it('C122 S2: Fireplace costs one clay less', () => { const s = setup({ cardId: 'C122_Bricklayer', resources: { clay: 1 } }); s.state.availableMajorImprovements = ['Major_Fireplace1']; s.loadState(s.state); let r = s.takeAction(0, 'major-improvement'); if (r.interaction.stateId === 'wait' && options(r).some((o) => o.value === 'Major_Fireplace1')) r = choose(s, r, (o) => o.value === 'Major_Fireplace1'); expect(r.state.players[0]!.improvements).toContain('Major_Fireplace1'); expect(r.state.players[0]!.resources.clay).toBe(0) })
  it('C122 S3: a clay room costs two clay less', () => { const s = setup({ cardId: 'C122_Bricklayer', round: 14, resources: { clay: 3, reed: 2 } }); s.state.players[0]!.houseType = 'clay'; s.loadState(s.state); let r = s.takeAction(0, 'farm-expansion'); if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice') r = choose(s, r, (o) => o.labelKey === 'actions.construct.name'); if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'farm-select') r = s.commitSelectionChoice(0, { rooms: [r.interaction.request.farm.selectableTiles[0]!] }); expect(r.state.players[0]!.rooms).toBe(3); expect(r.state.players[0]!.resources.clay).toBe(0) })
  it('C122 S4: renovation costs one clay less', () => { const s = setup({ cardId: 'C122_Bricklayer', round: 14, resources: { clay: 1, reed: 1 } }); const r = s.takeAction(0, 'house-redevelopment'); expect(r.state.players[0]!.houseType).toBe('clay'); expect(r.state.players[0]!.resources.clay).toBe(0) })
})

describe('C124 Stone Importer parity', () => {
  it('C124 S1: Stone Importer is played as the first occupation', () => expect(playOccupation(setup({ cardId: 'C124_StoneImporter', played: false }), 'C124_StoneImporter').state.players[0]!.occupationPlayed).toContain('C124_StoneImporter'))
  it.each([
    { scenario: 'S2', round: 4, cost: 2 },
    { scenario: 'S5', round: 7, cost: 2 },
    { scenario: 'S6', round: 9, cost: 3 },
    { scenario: 'S7', round: 11, cost: 3 },
    { scenario: 'S8', round: 13, cost: 4 },
    { scenario: 'S3', round: 14, cost: 1 },
  ])('C124 $scenario: harvest in round $round buys two stone for $cost food', ({ round, cost }) => { const s = setup({ cardId: 'C124_StoneImporter', round, resources: { food: 20 + cost } }); s.state.players.forEach((p) => { p.resources.food = p === s.state.players[0] ? 20 + cost : 20; markAllWorkersUsed(s.state, p) }); s.loadState(s.state); const r = accept(s, s.performRoundEnd(), 'C124_StoneImporter'); expect(r.state.players[0]!.resources).toMatchObject({ food: 16, stone: 2 }) })
  it('C124 S4: the purchase may be declined', () => { const s = setup({ cardId: 'C124_StoneImporter', round: 4, resources: { food: 22 } }); s.state.players.forEach((p) => { p.resources.food = p === s.state.players[0] ? 22 : 20; markAllWorkersUsed(s.state, p) }); s.loadState(s.state); const r = decline(s, s.performRoundEnd(), 'C124_StoneImporter'); expect(r.state.players[0]!.resources).toMatchObject({ food: 18, stone: 0 }) })
})

describe('C125 Nightworker parity', () => {
  it('C125 S1: Nightworker is played as the first occupation', () => expect(playOccupation(setup({ cardId: 'C125_Nightworker', played: false }), 'C125_Nightworker').state.players[0]!.occupationPlayed).toContain('C125_Nightworker'))
  const nextRound = (allResources: boolean, take: boolean) => { const s = setup({ cardId: 'C125_Nightworker', round: 5, resources: allResources ? { wood: 1, clay: 1, reed: 1, stone: 1, food: 20 } : { food: 20 } }); s.state.players.forEach((p) => markAllWorkersUsed(s.state, p)); s.loadState(s.state); let r = s.performRoundEnd(); if (!allResources) { r = take ? accept(s, r, 'C125_Nightworker') : decline(s, r, 'C125_Nightworker'); if (take && r.interaction.stateId === 'wait') r = choose(s, r, (o) => JSON.stringify(o).includes('forest')) } return r }
  it('C125 S2: before work may place on a missing-resource accumulation space', () => { const r = nextRound(false, true); expect(r.state.players[0]!.resources.wood).toBeGreaterThan(0) })
  it('C125 S3: the placement may be declined', () => expect(nextRound(false, false).state.round).toBe(6))
  it('C125 S4: owning every building resource suppresses Nightworker', () => expect(JSON.stringify(nextRound(true, false).interaction)).not.toContain('C125_Nightworker'))
})

describe('C126 Excavator parity', () => {
  it('C126 S1: Excavator is played as the first occupation', () => expect(playOccupation(setup({ cardId: 'C126_Excavator', played: false }), 'C126_Excavator').state.players[0]!.occupationPlayed).toContain('C126_Excavator'))
  const day = (buy: boolean) => { const s = setup({ cardId: 'C126_Excavator', resources: { food: 1 } }); let r = s.takeAction(0, 'day-laborer'); r = resolveTriggerIfPresent(s, r, 'C126_Excavator'); if (buy) r = accept(s, r, 'C126_Excavator'); else r = decline(s, r, 'C126_Excavator'); return r }
  it('C126 S2: Day Laborer gains wood and clay and may buy stone', () => expect(day(true).state.players[0]!.resources).toMatchObject({ food: 2, wood: 1, clay: 1, stone: 1 }))
  it('C126 S3: declining stone keeps mandatory wood and clay', () => expect(day(false).state.players[0]!.resources).toMatchObject({ food: 3, wood: 1, clay: 1, stone: 0 }))
})

describe('C127 Lover parity', () => {
  it('C127 S1: round-ten Lover may pay four food for family growth without room', () => { const s = setup({ cardId: 'C127_Lover', played: false, playerCount: 3, round: 10, resources: { food: 4 } }); let r = playOccupation(s, 'C127_Lover'); r = accept(s, r, 'C127_Lover'); expect(familySize(r.state.players[0]!)).toBe(3); expect(r.state.players[0]!.resources.food).toBe(0) })
  it('C127 S2: the Lover growth may be declined', () => { const s = setup({ cardId: 'C127_Lover', played: false, playerCount: 3, round: 10, resources: { food: 4 } }); const r = decline(s, playOccupation(s, 'C127_Lover'), 'C127_Lover'); expect(familySize(r.state.players[0]!)).toBe(2); expect(r.state.players[0]!.resources.food).toBe(4) })
})

describe('C131 Private Teacher parity', () => {
  it('C131 S1: Private Teacher is played as the first occupation', () => expect(playOccupation(setup({ cardId: 'C131_PrivateTeacher', played: false, playerCount: 3 }), 'C131_PrivateTeacher').state.players[0]!.occupationPlayed).toContain('C131_PrivateTeacher'))
  const grain = (occupied: boolean) => { const s = setup({ cardId: 'C131_PrivateTeacher', playerCount: 3, resources: { food: 1 } }); s.state.players[0]!.occupationHand = ['A125_Priest']; if (occupied) s.state.actionSpaces.find((space) => space.id === 'lessons')!.takenBy = [{ playerId: s.state.players[1]!.id, workerId: '1' }]; s.loadState(s.state); let r = s.takeAction(0, 'grain-seeds'); if (occupied) { r = accept(s, r, 'C131_PrivateTeacher'); if (r.interaction.stateId === 'wait' && options(r).some((o) => o.value === 'A125_Priest')) r = choose(s, r, (o) => o.value === 'A125_Priest') } return r }
  it('C131 S2: occupied Lessons lets Grain Seeds play an occupation for one food', () => { const r = grain(true); expect(r.state.players[0]!.occupationPlayed).toContain('A125_Priest'); expect(r.state.players[0]!.resources.food).toBe(0) })
  it('C131 S3: vacant Lessons gives no offer', () => expect(JSON.stringify(grain(false).interaction)).not.toContain('C131_PrivateTeacher'))
})

describe('C134 Cow Prince parity', () => {
  it('C134 S1: Cow Prince is played as the first occupation', () => expect(playOccupation(setup({ cardId: 'C134_CowPrince', played: false, playerCount: 3 }), 'C134_CowPrince').state.players[0]!.occupationPlayed).toContain('C134_CowPrince'))
  it('C134 S2: two cattle held in two house rooms score two points', () => { const s = setup({ cardId: 'C134_CowPrince', playerCount: 3, round: 14 }); Object.assign(s.state.players[0]!, { houseAnimalType: 'cattle', houseAnimalCount: 2 }); s.loadState(s.state); expect(bonus(s.getState(), 'C134_CowPrince')).toBe(2) })
  it('C134 S3: two cattle spread across a two-space pasture score two points', () => { const s = setup({ cardId: 'C134_CowPrince', playerCount: 3, round: 14 }); Object.assign(s.state.players[0]!, { resources: { ...s.state.players[0]!.resources, cattle: 2 }, pastures: [{ id: 'p', size: 2, tiles: [{ row: 0, col: 2 }, { row: 0, col: 3 }], stables: 0, animalType: 'cattle', animalCount: 2 }] }); s.loadState(s.state); expect(bonus(s.getState(), 'C134_CowPrince')).toBe(1) })
})

describe('C135 Constable parity', () => {
  it.each([{ round: 5, wood: 4 }, { round: 11, wood: 2 }, { round: 14, wood: 0 }])('C135 round $round play gains $wood wood', ({ round, wood }) => expect(playOccupation(setup({ cardId: 'C135_Constable', played: false, playerCount: 3, round }), 'C135_Constable').state.players[0]!.resources.wood).toBe(wood))
  it.each([{ scenario: 'S6', round: 8, wood: 3 }, { scenario: 'S7', round: 13, wood: 1 }])('C135 $scenario: round $round play gains $wood wood', ({ round, wood }) => expect(playOccupation(setup({ cardId: 'C135_Constable', played: false, playerCount: 3, round }), 'C135_Constable').state.players[0]!.resources.wood).toBe(wood))
  const removeNegativeLines = (player: PlayerState) => {
    const roomTiles = [{ row: 2, col: 0 }, { row: 2, col: 1 }]
    player.roomTiles = roomTiles
    player.rooms = roomTiles.length
    player.fields = Array.from({ length: 15 }, (_, index) => ({
      row: Math.floor(index / 5), col: index % 5, crop: null, remaining: 0, stacks: [],
    })).filter((field) => !roomTiles.some((room) => room.row === field.row && room.col === field.col))
    player.pastures = [{
      id: 'complete-pasture', size: 1, tiles: [{ row: 0, col: 0 }],
      stables: 0, animalType: null, animalCount: 0,
    }]
    Object.assign(player.resources, { grain: 1, vegetable: 1, sheep: 1, boar: 1, cattle: 1, begging: 0 })
  }
  it('C135 S4: OA awards the shared no-negative-lines bonus only to the Constable owner', () => {
    const session = setup({ cardId: 'C135_Constable', playerCount: 3, round: 14 })
    session.state.players.forEach(removeNegativeLines)
    session.loadState(session.state)
    expect([0, 1, 2].map((index) => bonus(session.getState(), 'C135_Constable', index))).toEqual([3, 0, 0])
  })
  it('C135 S5: OA awards no other player even when only the owner has a negative line', () => {
    const session = setup({ cardId: 'C135_Constable', playerCount: 3, round: 14 })
    session.state.players.slice(1).forEach(removeNegativeLines)
    session.loadState(session.state)
    expect([0, 1, 2].map((index) => bonus(session.getState(), 'C135_Constable', index))).toEqual([0, 0, 0])
  })
})
