import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setActiveWorkerCount, setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { confirmPlayerSwitch } from './_helpers/pending-confirms'
import { resolveTriggerIfPresent } from './_helpers/trigger-select'

import '../../shared/cards/C/C136_RanchProvost'
import '../../shared/cards/C/C138_AnimalFeeder'
import '../../shared/cards/C/C143_StoneBuyer'
import '../../shared/cards/C/C144_ReedRoofRenovator'
import '../../shared/cards/C/C145_ForestReviewer'
import '../../shared/cards/C/C149_ResourceRecycler'
import '../../shared/cards/C/C151_SowingDirector'
import '../../shared/cards/C/C152_Puppeteer'
import '../../shared/cards/C/C153_PatternMaker'
import '../../shared/cards/C/C154_TwinResearcher'
import '../../shared/cards/C/C160_Outrider'
import '../../shared/cards/C/C163_MaterialDeliveryman'

const FILLER = '__test_placeholder__'
const options = (response: SessionResponse) => response.interaction.stateId === 'wait'
  ? response.interaction.request.options ?? [] : []

const setup = ({ cardId, played = true, playerCount = 4, round = 5, resources = {} }: {
  cardId: string; played?: boolean; playerCount?: number; round?: number; resources?: Record<string, number>
}) => {
  const session = new GameSession(8100 + round, undefined, { playerCount })
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
const switchToOwner = (session: GameSession, response: SessionResponse) => {
  while (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'confirm-player-switch') response = confirmPlayerSwitch(session)
  return response
}
const accept = (session: GameSession, response: SessionResponse, cardId: string) => {
  response = switchToOwner(session, response); response = resolveTriggerIfPresent(session, response, cardId)
  return response.interaction.stateId === 'wait' ? choose(session, response, (option) => option.value !== '__skip__') : response
}
const decline = (session: GameSession, response: SessionResponse, cardId: string) => {
  response = switchToOwner(session, response); response = resolveTriggerIfPresent(session, response, cardId)
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
const bonus = (response: SessionResponse, cardId: string, playerIndex = 0) => response.scores[playerIndex]!.categories
  .find((category) => category.key === 'cardBonusVp')?.entries.find((entry) => entry.type === 'bonus' && entry.cardId === cardId)?.score ?? 0
const activateActor = (session: GameSession, index: number) => {
  const actor = session.state.players[index]!
  session.state.actionSpaces.forEach((space) => { space.takenBy = space.takenBy.filter((ref) => ref.playerId !== actor.id) })
  setActiveWorkerCount(actor, 2); setWorkersAtHome(session.state, actor, 2); session.state.currentPlayerIndex = index
}

describe('C136 Ranch Provost parity', () => {
  it.each([{ round: 5, wood: 4 }, { round: 11, wood: 2 }])('C136 play in round $round gains $wood wood', ({ round, wood }) => expect(playOccupation(setup({ cardId: 'C136_RanchProvost', played: false, playerCount: 3, round }), 'C136_RanchProvost').state.players[0]!.resources.wood).toBe(wood))
  it('C136 S4: playing with six rounds left gains three wood', () => expect(playOccupation(setup({ cardId: 'C136_RanchProvost', played: false, playerCount: 3, round: 8 }), 'C136_RanchProvost').state.players[0]!.resources.wood).toBe(3))
  it('C136 S5: playing with two rounds left gains no wood', () => expect(playOccupation(setup({ cardId: 'C136_RanchProvost', played: false, playerCount: 3, round: 12 }), 'C136_RanchProvost').state.players[0]!.resources.wood).toBe(0))
  it('C136 S3: all players tied for greatest pasture capacity score three points', () => {
    const session = setup({ cardId: 'C136_RanchProvost', playerCount: 3, round: 14 })
    session.state.players[0]!.pastures = [{ id: 'p1', size: 2, tiles: [{ row: 0, col: 2 }, { row: 0, col: 3 }], stables: 0, animalType: null, animalCount: 0 }]
    session.state.players[1]!.pastures = [{ id: 'p2', size: 2, tiles: [{ row: 0, col: 2 }, { row: 0, col: 3 }], stables: 0, animalType: null, animalCount: 0 }]
    session.state.players[2]!.pastures = [{ id: 'p3', size: 1, tiles: [{ row: 0, col: 2 }], stables: 0, animalType: null, animalCount: 0 }]
    session.loadState(session.state); expect([0, 1, 2].map((index) => bonus(session.getState(), 'C136_RanchProvost', index))).toEqual([3, 3, 0])
  })
})

describe('C138 Animal Feeder parity', () => {
  it('C138 S1: Animal Feeder is played as the first occupation', () => expect(playOccupation(setup({ cardId: 'C138_AnimalFeeder', played: false, playerCount: 3 }), 'C138_AnimalFeeder').state.players[0]!.occupationPlayed).toContain('C138_AnimalFeeder'))
  it.each([{ resource: 'sheep', cost: 0 }, { resource: 'grain', cost: 0 }, { resource: 'boar', cost: 1 }, { resource: 'cattle', cost: 2 }])('C138 Day Laborer may choose $resource', ({ resource, cost }) => {
    const session = setup({ cardId: 'C138_AnimalFeeder', playerCount: 3, resources: { food: cost } })
    session.state.players[0]!.pastures = [{ id: 'p', size: 3, tiles: [{ row: 0, col: 2 }, { row: 0, col: 3 }, { row: 0, col: 4 }], stables: 1, animalType: null, animalCount: 0 }]; session.loadState(session.state)
    let response = session.takeAction(0, 'day-laborer'); response = resolveTriggerIfPresent(session, response, 'C138_AnimalFeeder'); response = choose(session, response, (option) => JSON.stringify(option).toLowerCase().includes(resource));
    expect(response.state.players[0]!.resources[resource]).toBe(1); expect(response.state.players[0]!.resources.food).toBe(2)
  })
})

describe('C143 Stone Buyer parity', () => {
  it('C143 S1: OA automatically buys two stone for one food when Stone Buyer is played', () => { const s = setup({ cardId: 'C143_StoneBuyer', played: false, playerCount: 3, resources: { food: 1 } }); const r = playOccupation(s, 'C143_StoneBuyer'); expect(r.state.players[0]!.resources).toMatchObject({ food: 0, stone: 2 }) })
  it('C143 S2: OA exposes no decline after playing Stone Buyer', () => { const s = setup({ cardId: 'C143_StoneBuyer', played: false, playerCount: 3, resources: { food: 1 } }); const r = playOccupation(s, 'C143_StoneBuyer'); expect(r.interaction.stateId === 'wait' ? options(r).some((option) => option.value === '__skip__') : false).toBe(false); expect(r.state.players[0]!.resources).toMatchObject({ food: 0, stone: 2 }) })
  it('C143 S3: next-round use buys one stone for two food once', () => { const s = setup({ cardId: 'C143_StoneBuyer', playerCount: 3, round: 6, resources: { food: 2 } }); const r = s.takeAnytimeAction(0, 'C143-stone-buyer-anytime'); expect(r.state.players[0]!.resources).toMatchObject({ food: 0, stone: 1 }); expect(r.interaction.anytimeActions.some((entry) => entry.id === 'C143-stone-buyer-anytime')).toBe(false) })
})

describe('C144 Reed Roof Renovator parity', () => {
  it('C144 S1: three-player play gains one reed', () => expect(playOccupation(setup({ cardId: 'C144_ReedRoofRenovator', played: false, playerCount: 3 }), 'C144_ReedRoofRenovator').state.players[0]!.resources.reed).toBe(1))
  it('C144 S2: four-player play gains no reed', () => expect(playOccupation(setup({ cardId: 'C144_ReedRoofRenovator', played: false, playerCount: 4 }), 'C144_ReedRoofRenovator').state.players[0]!.resources.reed).toBe(0))
  it('C144 S3: another players renovation gives the owner one reed', () => { const s = setup({ cardId: 'C144_ReedRoofRenovator', playerCount: 3, round: 14 }); activateActor(s, 1); Object.assign(s.state.players[1]!.resources, { clay: 2, reed: 1 }); s.loadState(s.state); let r = s.takeAction(1, 'house-redevelopment'); r = switchToOwner(s, r); r = resolveTriggerIfPresent(s, r, 'C144_ReedRoofRenovator'); expect(r.state.players[0]!.resources.reed).toBe(1) })
})

describe('C145 Forest Reviewer parity', () => {
  it('C145 S1: Forest Reviewer is played as the first occupation', () => expect(playOccupation(setup({ cardId: 'C145_ForestReviewer', played: false, playerCount: 3 }), 'C145_ForestReviewer').state.players[0]!.occupationPlayed).toContain('C145_ForestReviewer'))
  const grove = (forestOccupied: boolean) => { const s = setup({ cardId: 'C145_ForestReviewer', playerCount: 3 }); const actor = s.state.players[2]!; activateActor(s, 2); if (forestOccupied) s.state.actionSpaces.find((space) => space.id === 'forest')!.takenBy = [{ playerId: s.state.players[1]!.id, workerId: '1' }]; s.loadState(s.state); return switchToOwner(s, s.takeAction(2, 'grove')) }
  it('C145 S2: using Grove while Forest is occupied gives owner one reed', () => expect(grove(true).state.players[0]!.resources.reed).toBe(1))
  it('C145 S3: using Grove while Forest is vacant gives no reed', () => expect(grove(false).state.players[0]!.resources.reed).toBe(0))
  it('C145 S4: using Forest while Grove is occupied gives owner one reed', () => {
    const session = setup({ cardId: 'C145_ForestReviewer', playerCount: 3 })
    activateActor(session, 2)
    session.state.actionSpaces.find((space) => space.id === 'grove')!.takenBy = [{
      playerId: session.state.players[1]!.id, workerId: '1',
    }]
    session.loadState(session.state)
    const response = switchToOwner(session, session.takeAction(2, 'forest'))
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.reed).toBe(1)
  })
})

describe('C149 Resource Recycler parity', () => {
  it('C149 S1: Resource Recycler is played as the first occupation', () => expect(playOccupation(setup({ cardId: 'C149_ResourceRecycler', played: false }), 'C149_ResourceRecycler').state.players[0]!.occupationPlayed).toContain('C149_ResourceRecycler'))
  const renovate = (ownerHouse: 'wood' | 'clay', take: boolean) => { const s = setup({ cardId: 'C149_ResourceRecycler', round: 14, resources: { food: 2 } }); s.state.players[0]!.houseType = ownerHouse; activateActor(s, 1); Object.assign(s.state.players[1]!, { houseType: 'clay', resources: { ...s.state.players[1]!.resources, stone: 2, reed: 1 } }); s.loadState(s.state); let r = s.takeAction(1, 'house-redevelopment'); r = take ? accept(s, r, 'C149_ResourceRecycler') : decline(s, r, 'C149_ResourceRecycler'); if (take && r.interaction.stateId === 'wait' && r.interaction.request.kind === 'farm-select') r = s.commitSelectionChoice(0, { rooms: [r.interaction.request.farm.selectableTiles[0]!] }); return r }
  it('C149 S2: opponent stone renovation lets clay-house owner pay two food for a free room', () => { const r = renovate('clay', true); expect(r.state.players[0]!.rooms).toBe(3); expect(r.state.players[0]!.resources.food).toBe(0) })
  it('C149 S3: the free room may be declined', () => expect(renovate('clay', false).state.players[0]!.rooms).toBe(2))
  it('C149 S4: a non-clay owner receives no offer', () => expect(JSON.stringify(renovate('wood', false).interaction)).not.toContain('C149_ResourceRecycler'))
})

describe('C151 Sowing Director parity', () => {
  it('C151 S1: Sowing Director is played as the first occupation', () => expect(playOccupation(setup({ cardId: 'C151_SowingDirector', played: false }), 'C151_SowingDirector').state.players[0]!.occupationPlayed).toContain('C151_SowingDirector'))
  const opponentSow = (take: boolean) => { const s = setup({ cardId: 'C151_SowingDirector', resources: { grain: 1 } }); s.state.players[0]!.fields = [{ row: 0, col: 2, stacks: [] }]; activateActor(s, 1); Object.assign(s.state.players[1]!.resources, { grain: 1 }); s.state.players[1]!.fields = [{ row: 0, col: 2, stacks: [] }]; s.loadState(s.state); let r = s.takeAction(1, 'grain-utilization'); if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'farm-select') r = s.commitSelectionChoice(1, { crops: [{ row: 0, col: 2, crop: 'grain' }] }); r = take ? accept(s, r, 'C151_SowingDirector') : decline(s, r, 'C151_SowingDirector'); if (take && r.interaction.stateId === 'wait' && r.interaction.request.kind === 'farm-select') r = s.commitSelectionChoice(0, { crops: [{ row: 0, col: 2, crop: 'grain' }] }); return r }
  it('C151 S2: after opponent Grain Utilization owner may sow', () => expect(opponentSow(true).state.players[0]!.fields[0]!.stacks[0]).toMatchObject({ kind: 'grain', remaining: 3 }))
  it('C151 S3: the Sowing Director sow may be declined', () => expect(opponentSow(false).state.players[0]!.fields[0]!.stacks).toHaveLength(0))
})

describe('C152 Puppeteer parity', () => {
  it('C152 S1: Puppeteer is played as the first occupation', () => expect(playOccupation(setup({ cardId: 'C152_Puppeteer', played: false }), 'C152_Puppeteer').state.players[0]!.occupationPlayed).toContain('C152_Puppeteer'))
  const visiting = (take: boolean) => { const s = setup({ cardId: 'C152_Puppeteer', resources: { food: 1 } }); s.state.players[0]!.occupationHand = ['A125_Priest']; activateActor(s, 1); s.state.actionSpaces.find((space) => space.id === 'traveling-players')!.resources.food = 2; s.loadState(s.state); let r = s.takeAction(1, 'traveling-players'); r = take ? accept(s, r, 'C152_Puppeteer') : decline(s, r, 'C152_Puppeteer'); if (take && r.interaction.stateId === 'wait' && options(r).some((o) => o.value === 'A125_Priest')) r = choose(s, r, (o) => o.value === 'A125_Priest'); return r }
  it('C152 S2: opponent Traveling Players lets owner pay food and play a free occupation', () => { const r = visiting(true); expect(r.state.players[0]!.occupationPlayed).toContain('A125_Priest'); expect(r.state.players[0]!.resources.food).toBe(0); expect(r.state.players[1]!.resources.food).toBe(3) })
  it('C152 S3: the Puppeteer response may be declined', () => expect(visiting(false).state.players[0]!.occupationHand).toContain('A125_Priest'))
})

describe('C153 Pattern Maker parity', () => {
  it('C153 S1: Pattern Maker is played as the first occupation', () => expect(playOccupation(setup({ cardId: 'C153_PatternMaker', played: false }), 'C153_PatternMaker').state.players[0]!.occupationPlayed).toContain('C153_PatternMaker'))
  const renovate = (take: boolean) => { const s = setup({ cardId: 'C153_PatternMaker', round: 14, resources: { wood: 2 } }); activateActor(s, 1); Object.assign(s.state.players[1]!, { resources: { ...s.state.players[1]!.resources, clay: 2, reed: 1 } }); s.loadState(s.state); let r = s.takeAction(1, 'house-redevelopment'); r = take ? accept(s, r, 'C153_PatternMaker') : decline(s, r, 'C153_PatternMaker'); return r }
  it('C153 S2: opponent renovation may exchange two wood for grain food and a point', () => { const r = renovate(true); expect(r.state.players[0]!.resources).toMatchObject({ wood: 0, grain: 1, food: 1 }); expect(bonus(r, 'C153_PatternMaker')).toBe(1) })
  it('C153 S3: the exchange may be declined', () => expect(renovate(false).state.players[0]!.resources.wood).toBe(2))
})

describe('C154 Twin Researcher parity', () => {
  it('C154 S1: Twin Researcher is played as the first occupation', () => expect(playOccupation(setup({ cardId: 'C154_TwinResearcher', played: false }), 'C154_TwinResearcher').state.players[0]!.occupationPlayed).toContain('C154_TwinResearcher'))
  const forest = (groveWood: number) => { const s = setup({ cardId: 'C154_TwinResearcher', resources: { food: 1 } }); s.state.actionSpaces.find((space) => space.id === 'forest')!.resources.wood = 3; s.state.actionSpaces.find((space) => space.id === 'grove')!.resources.wood = groveWood; s.loadState(s.state); let r = s.takeAction(0, 'forest'); if (groveWood === 3) r = accept(s, r, 'C154_TwinResearcher'); return r }
  it('C154 S2: equal Forest and Grove piles may buy one point for one food', () => { const r = forest(3); expect(r.state.players[0]!.resources.food).toBe(0); expect(bonus(r, 'C154_TwinResearcher')).toBe(1) })
  it('C154 S3: unequal paired piles give no offer', () => expect(JSON.stringify(forest(2).interaction)).not.toContain('C154_TwinResearcher'))
})

describe('C160 Outrider parity', () => {
  it('C160 S1: Outrider is played as the first occupation', () => expect(playOccupation(setup({ cardId: 'C160_Outrider', played: false }), 'C160_Outrider').state.players[0]!.occupationPlayed).toContain('C160_Outrider'))
  it('C160 S2: using the most recently revealed action space gains one grain', () => { const s = setup({ cardId: 'C160_Outrider', round: 5 }); s.state.roundActionOrder[4] = 'farmland'; s.loadState(s.state); expect(s.takeAction(0, 'farmland').state.players[0]!.resources.grain).toBe(1) })
  it('C160 S3: another space grants no grain', () => expect(setup({ cardId: 'C160_Outrider' }).takeAction(0, 'day-laborer').state.players[0]!.resources.grain).toBe(0))
})

describe('C163 Material Deliveryman parity', () => {
  it('C163 S1: Material Deliveryman is played as the first occupation', () => expect(playOccupation(setup({ cardId: 'C163_MaterialDeliveryman', played: false }), 'C163_MaterialDeliveryman').state.players[0]!.occupationPlayed).toContain('C163_MaterialDeliveryman'))
  const collect = (count: number) => { const s = setup({ cardId: 'C163_MaterialDeliveryman' }); activateActor(s, 1); s.state.actionSpaces.find((space) => space.id === 'forest')!.resources.wood = count; s.loadState(s.state); return switchToOwner(s, s.takeAction(1, 'forest')) }
  it.each([{ count: 5, resource: 'wood' }, { count: 6, resource: 'clay' }, { count: 7, resource: 'reed' }, { count: 8, resource: 'stone' }])('C163 collecting $count goods gives owner one $resource', ({ count, resource }) => expect(collect(count).state.players[0]!.resources[resource]).toBe(1))
  it('C163 S6: collecting four goods gives no reward', () => expect(collect(4).state.players[0]!.resources).toMatchObject({ wood: 0, clay: 0, reed: 0, stone: 0 }))
})
