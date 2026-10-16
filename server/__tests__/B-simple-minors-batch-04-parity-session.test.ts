import { expectWait } from './_helpers/trigger-select'
import { describe, expect, it } from 'vitest'
import { type GameSession, type SessionResponse } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { familySize, markAllWorkersUsed, setActiveWorkerCount, setWorkersAtHome } from '../../shared/domain/player'
import { type GameState, type Resource, type InteractionAnimalReorgZone } from '../../shared/contract/types'

import '../../shared/cards/B/B005_StoreofExperience'
import '../../shared/cards/B/B008_MarketStall'
import '../../shared/cards/B/B014_Hawktower'
import '../../shared/cards/B/B023_FinalScenario'
import '../../shared/cards/B/B036_Bottles'
import '../../shared/cards/B/B041_Hauberg'
import '../../shared/cards/B/B044_ChickStable'
import '../../shared/cards/B/B084_AcornsBasket'
import { countRoomAnimals } from '../../shared/domain/animals'
import assert from 'node:assert/strict'
import { createWorkSession } from './_helpers/session-fixtures'
import { assertRejectedUnchanged, confirmNext, getChoiceOptions } from './_helpers/session-assertions'
import { createScenarioEvidence } from './_helpers/scenario-evidence'
const sessionEvidence = createScenarioEvidence(import.meta.url)
type CardId = 'B005_StoreofExperience' | 'B008_MarketStall' | 'B014_Hawktower'
  | 'B023_FinalScenario' | 'B036_Bottles' | 'B041_Hauberg'
  | 'B044_ChickStable' | 'B084_AcornsBasket'

const FILLER = '__test_placeholder__'
const OCCUPATIONS = [
  'A116_WoodCutter', 'B121_Geologist', 'C123_Freemason', 'D152_Patron',
  'A103_Portmonger', 'B119_Lumberjack', 'C141_SheepProvider',
]

const setupMinor = ({
  cardId, resources = {}, round = 5, occupationsPlayed = 0, occupationsInHand = 0,
}: {
  cardId: CardId
  resources?: Partial<Resource>
  round?: number
  occupationsPlayed?: number
  occupationsInHand?: number
}) => {
  const session = sessionEvidence.track(createWorkSession({ seed: 4044, options: { playerCount: 2 } }))
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = round
  state.roundPhase = 'work'
  state.players.forEach((player) => {
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    setWorkersAtHome(state, player, 2)
  })
  const player = state.players[0]!
  player.minorHand = [cardId]
  player.occupationHand = OCCUPATIONS.slice(0, occupationsInHand)
  if (occupationsInHand === 0) player.occupationHand = [FILLER]
  player.occupationPlayed = OCCUPATIONS.slice(0, occupationsPlayed)
  player.resources = {
    ...player.resources,
    wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0,
    sheep: 0, boar: 0, cattle: 0,
    ...resources,
  }
  const improvement = state.actionSpaces.find((space) => space.id === 'major-improvement')
  if (!improvement) throw new Error('major-improvement missing')
  improvement.takenBy = []
  state.availableMajorImprovements = []
  session.loadState(state)
  return session
}

const openImprovement = (session: GameSession, actionId: 'major-improvement' | 'meeting-place' = 'major-improvement') => {
  let response = session.takeAction(0, actionId)
  if (response.interaction.stateId !== 'wait') return response
  const option = getChoiceOptions(response)?.find((candidate) => candidate.value.startsWith('action-improvement-'))
  if (option) response = session.resolveChoice(0, option.value)
  return response
}

const playMinor = (session: GameSession, cardId: CardId) => {
  let response = openImprovement(session)
  if (!response.state.players[0]!.minorHand.includes(cardId)) return response
  if (response.interaction.stateId !== 'wait') return response
  const option = getChoiceOptions(response)?.find((candidate) => candidate.value === cardId)
  if (option) response = session.resolveChoice(0, option.value)
  return response
}

const cardIsOffered = (session: GameSession, cardId: CardId, actionId: 'major-improvement' | 'meeting-place' = 'major-improvement') => {
  const response = openImprovement(session, actionId)
  if (!response.state.players[0]!.minorHand.includes(cardId)) return true
  if (response.interaction.stateId !== 'wait') return false
  return getChoiceOptions(response)?.some((candidate) => candidate.value === cardId) ?? false
}

const futureRounds = (state: GameState, cardId: CardId, resource: keyof Resource) =>
  state.futureMeeples
    .filter((entry) => entry.cardId === cardId && (entry.resources[resource] ?? 0) > 0)
    .flatMap((entry) => Array.from({ length: entry.resources[resource] ?? 0 }, () => entry.round))
    .sort((left, right) => left - right)

describe('B005 Store of Experience parity', () => {
  for (const [count, reward] of [[4, 'stone'], [5, 'reed'], [6, 'clay'], [7, 'wood']] as const) {
    it(`B005 S${count - 3}: ${count} occupations in hand grant one ${reward} and pass Store of Experience`, () => {
      const response = playMinor(setupMinor({
        cardId: 'B005_StoreofExperience', occupationsInHand: count,
      }), 'B005_StoreofExperience')
      expect(response.ok, response.error).toBe(true)
      expect(response.state.players[0]!.resources[reward]).toBe(1)
      expect(response.state.players[1]!.minorHand).toContain('B005_StoreofExperience')
    })
  }
})
describe('B008 Market Stall parity', () => {
  it('B008 S1: Market Stall pays one grain, gains one vegetable, and passes', () => {
    const response = playMinor(setupMinor({
      cardId: 'B008_MarketStall', resources: { grain: 1 },
    }), 'B008_MarketStall')
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 0, vegetable: 1 })
    expect(response.state.players[1]!.minorHand).toContain('B008_MarketStall')
  })
  it('B008 S2: no grain keeps Market Stall unavailable', () => {
    expect(cardIsOffered(setupMinor({ cardId: 'B008_MarketStall' }), 'B008_MarketStall')).toBe(false)
  })
})
describe('B014 Hawktower parity', () => {
  it('B014 S1: Hawktower can be played through round 7 and schedules a stone room for round 12', () => {
    const response = playMinor(setupMinor({
      cardId: 'B014_Hawktower', resources: { clay: 2 }, round: 7,
    }), 'B014_Hawktower')
    expect(response.state.players[0]!.resources.clay).toBe(0)
    expect(response.state.futureMeeples).toEqual([
      expect.objectContaining({ cardId: 'B014_Hawktower', round: 12, roomType: 'stone' }),
    ])
  })
  it('B014 S2: Hawktower is unavailable after round 7', () => {
    expect(cardIsOffered(setupMinor({
      cardId: 'B014_Hawktower', resources: { clay: 2 }, round: 8,
    }), 'B014_Hawktower')).toBe(false)
  })
  const due = (houseType: 'clay' | 'stone') => {
    const session = sessionEvidence.track(createWorkSession({ seed: 414, options: { playerCount: 2 } }))
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.round = 11
    state.roundPhase = 'work'
    state.players.forEach((player) => {
      markAllWorkersUsed(state, player)
      setActiveWorkerCount(player, 2)
      player.resources.food = 20
      player.minorHand = [FILLER]
      player.occupationHand = [FILLER]
    })
    const player = state.players[0]!
    player.minorPlayed = ['B014_Hawktower']
    player.houseType = houseType
    state.futureMeeples = [{
        id: 'hawktower-room', cardId: 'B014_Hawktower', playerId: player.id,
        round: 12, actionId: null, resources: {}, roomType: 'stone',
      }]
    session.loadState(state)
    return session
  }
  it('B014 S3: a stone-house owner may build the scheduled stone room for free in round 12', () => {
    const session = due('stone')
    const response = session.performRoundEnd()
    expect(response.state.players[0]!.rooms).toBe(3)
    expect(response.state.futureMeeples).toEqual([])
  })
  it('B014 S4: a non-stone-house owner discards the scheduled room in round 12', () => {
    const response = due('clay').performRoundEnd()
    expect(response.state.players[0]!.rooms).toBe(2)
    expect(response.state.futureMeeples).toEqual([])
  })
})
describe('B023 Final Scenario parity', () => {
  it('B023 S1: Final Scenario reveals round 14 and makes it exclusive to the owner', () => {
    const session = setupMinor({ cardId: 'B023_FinalScenario', round: 13 })
    const round14Id = session.state.roundActionOrder[13]!
    const response = playMinor(session, 'B023_FinalScenario')
    const space = response.state.actionSpaces.find((entry) => entry.id === round14Id)!
    expect(space.exclusiveUse).toEqual({ playerId: response.state.players[0]!.id, sourceCardId: 'B023_FinalScenario', untilRound: 14 })
    response.state.currentPlayerIndex = 1
    session.loadState(response.state)
    expect(session.takeAction(1, round14Id).ok).toBe(false)
  })
  it('B023 S2: Final Scenario is unavailable in round 14', () => {
    expect(cardIsOffered(setupMinor({ cardId: 'B023_FinalScenario', round: 14 }), 'B023_FinalScenario')).toBe(false)
  })
  it('B023 S3: round 14 clears Final Scenario exclusive use', () => {
    const session = setupMinor({ cardId: 'B023_FinalScenario', round: 13 })
    playMinor(session, 'B023_FinalScenario')
    const state = session.getState().state
    state.players.forEach((player) => { markAllWorkersUsed(state, player); player.resources.food = 20; })
    session.loadState(state)
    const response = session.performRoundEnd()
    const round14Id = response.state.roundActionOrder[13]!
    expect(response.state.actionSpaces.find((entry) => entry.id === round14Id)?.exclusiveUse).toBeUndefined()
  })
})
describe('B036 Bottles parity', () => {
  for (const family of [2, 3]) {
    it(`B036 S${family - 1}: ${family} people make Bottles cost ${family} clay and ${family} food`, () => {
      const session = setupMinor({ cardId: 'B036_Bottles', resources: { clay: family, food: family } })
      setActiveWorkerCount(session.state.players[0]!, family)
      setWorkersAtHome(session.state, session.state.players[0]!, family)
      session.loadState(session.state)
      const response = playMinor(session, 'B036_Bottles')
      expect(response.state.players[0]!.resources).toMatchObject({ clay: 0, food: 0 })
      expect(response.state.players[0]!.minorPlayed).toContain('B036_Bottles')
      expect(familySize(response.state.players[0]!)).toBe(family)
    })
  }
  it('B036 S3: insufficient food keeps Bottles unavailable without spending clay', () => {
    const session = setupMinor({ cardId: 'B036_Bottles', resources: { clay: 2, food: 1 } })
    const offered = cardIsOffered(session, 'B036_Bottles', 'meeting-place')
    expect(offered).toBe(false)
    expect(session.state.players[0]!.resources.clay).toBe(2)
  })
})
describe('B041 Hauberg parity', () => {
  it('B041 S1: choosing wood first schedules wood, pig, wood, pig', () => {
    const session = setupMinor({
      cardId: 'B041_Hauberg', resources: { food: 3 }, occupationsPlayed: 3, round: 5,
    })
    let response = playMinor(session, 'B041_Hauberg')
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait')
      throw new Error('expected Hauberg ordering choice')
    expect(response.interaction.sourceCard).toBe('B041_Hauberg')
    const choices = getChoiceOptions(response)?.filter((option) => option.value !== '__skip__') ?? []
    expect(choices).toHaveLength(2)
    response = session.resolveChoice(0, choices[0]!.value)
    expect(response.state.players[0]!.resources.food).toBe(0)
    expect(futureRounds(response.state, 'B041_Hauberg', 'wood')).toEqual([6, 6, 8, 8])
    expect(futureRounds(response.state, 'B041_Hauberg', 'boar')).toEqual([7, 9])
  })
  it('B041 S2: choosing pig first schedules pig, wood, pig, wood', () => {
    const session = setupMinor({
      cardId: 'B041_Hauberg', resources: { food: 3 }, occupationsPlayed: 3, round: 5,
    })
    let response = playMinor(session, 'B041_Hauberg')
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait')
      throw new Error('expected Hauberg ordering choice')
    const choices = getChoiceOptions(response)?.filter((option) => option.value !== '__skip__') ?? []
    expect(choices).toHaveLength(2)
    response = session.resolveChoice(0, choices[1]!.value)
    expect(futureRounds(response.state, 'B041_Hauberg', 'wood')).toEqual([7, 7, 9, 9])
    expect(futureRounds(response.state, 'B041_Hauberg', 'boar')).toEqual([6, 8])
  })
  it('B041 S3: fewer than three occupations keeps Hauberg unavailable', () => {
    expect(cardIsOffered(setupMinor({
      cardId: 'B041_Hauberg', resources: { food: 3 }, occupationsPlayed: 2,
    }), 'B041_Hauberg')).toBe(false)
  })
  it('B041 S4: late Hauberg keeps only the chosen sequence entry for round 14', () => {
    const session = setupMinor({
      cardId: 'B041_Hauberg', resources: { food: 3 }, occupationsPlayed: 3, round: 13,
    })
    let response = playMinor(session, 'B041_Hauberg')
    if (response.interaction.stateId !== 'wait')
      throw new Error('expected Hauberg ordering choice')
    const choice = getChoiceOptions(response)?.find((option) => option.value !== '__skip__')
    expect(choice).toBeDefined()
    response = session.resolveChoice(0, choice!.value)
    expect(futureRounds(response.state, 'B041_Hauberg', 'wood')).toEqual([14, 14])
    expect(futureRounds(response.state, 'B041_Hauberg', 'boar')).toEqual([])
  })
})
describe('B044 Chick Stable parity', () => {
  for (const [scenario, payment] of [['S1', 'wood'], ['S2', 'clay']] as const) {
    it(`B044 ${scenario}: Chick Stable can pay one ${payment} and schedules two food in rounds plus three and four`, () => {
      const response = playMinor(setupMinor({
        cardId: 'B044_ChickStable', resources: { [payment]: 1 }, round: 5,
      }), 'B044_ChickStable')
      expect(response.state.players[0]!.resources[payment]).toBe(0)
      expect(futureRounds(response.state, 'B044_ChickStable', 'food')).toEqual([8, 8, 9, 9])
    })
  }
  it('B044 S3: late Chick Stable drops target rounds after round 14', () => {
    const response = playMinor(setupMinor({
      cardId: 'B044_ChickStable', resources: { wood: 1 }, round: 11,
    }), 'B044_ChickStable')
    expect(futureRounds(response.state, 'B044_ChickStable', 'food')).toEqual([14, 14])
  })
})
describe('B084 Acorns Basket parity', () => {
  it('B084 S1: three occupations and one reed schedule pigs for the next two rounds', () => {
    const response = playMinor(setupMinor({
      cardId: 'B084_AcornsBasket', resources: { reed: 1 }, occupationsPlayed: 3, round: 5,
    }), 'B084_AcornsBasket')
    expect(response.state.players[0]!.resources.reed).toBe(0)
    expect(futureRounds(response.state, 'B084_AcornsBasket', 'boar')).toEqual([6, 7])
  })
  it('B084 S2: fewer than three occupations keeps Acorns Basket unavailable', () => {
    expect(cardIsOffered(setupMinor({
      cardId: 'B084_AcornsBasket', resources: { reed: 1 }, occupationsPlayed: 2,
    }), 'B084_AcornsBasket')).toBe(false)
  })
  it('B084 S3: Acorns Basket played in round 13 schedules only one pig for round 14', () => {
    const response = playMinor(setupMinor({
      cardId: 'B084_AcornsBasket', resources: { reed: 1 }, occupationsPlayed: 3, round: 13,
    }), 'B084_AcornsBasket')
    expect(futureRounds(response.state, 'B084_AcornsBasket', 'boar')).toEqual([14])
  })
})
describe("B084 command boundaries", () => {
  const A = 'B084_AcornsBasket'
  function setup(card: typeof A, configure: (s: GameState) => void = () => { }, played = true, round = 1) {
    return sessionEvidence.track(createWorkSession({ seed: 8424, options: { playerCount: 2 }, configure: state => {
        state.round = round
        state.availableMajorImprovements = []
        for (const p of state.players) {
          p.minorHand = ['__test_placeholder__']
          p.occupationHand = ['__test_placeholder__']
          Object.assign(p.resources, { wood: 0, clay: 0, reed: 0, stone: 0, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, food: 20 })
        }
        const p = state.players[0]!
        if (played)
          p.minorPlayed.push(card)
        else
          p.minorHand = [card]
        {
          p.occupationPlayed = ['A125_Priest', 'A124_Knapper', 'A120_ClayHutBuilder']
          p.resources.reed = 1
          p.stableTiles = [{ row: 0, col: 2 }]
        }
        configure(state)
      } }))
  }
  function wait(r: SessionResponse) { assert.equal(r.ok, true, r.error); assert.ok(r.interaction.stateId === 'wait'); return r.interaction; }
  function options(r: SessionResponse) { const i = wait(r); assert.ok(i.request.kind === 'choice'); return i.request.options; }
  function place(s: GameSession, actor: number, id: string) { const r = s.takeAction(actor, id); assert.equal(r.ok, true, r.error); return r; }
  function confirm(s: GameSession, r: SessionResponse) {
    const i = wait(r)
    if (i.request.kind === 'confirm-player-switch') {
      const n = s.resolveChoice(i.request.fromPlayerIndex, 'confirm')
      assert.equal(n.ok, true, n.error)
      return n
    }
    assert.ok(i.request.kind === 'confirm-next-player')
    return confirmNext(s, r)
  }
  function finish(s: GameSession, r: SessionResponse) {
    for (let n = 0; n < 6 && r.interaction.stateId === 'wait'; n++) {
      if (r.interaction.request.kind === 'confirm-next-player' || r.interaction.request.kind === 'confirm-player-switch')
        r = confirm(s, r)
      else if (r.interaction.request.kind === 'choice' && getChoiceOptions(r).some(o => o.value === '__skip__')) {
        r = s.resolveChoice(expectWait(r).interaction.playerIndex, '__skip__')
        assert.equal(r.ok, true, r.error)
      }
      else
        break
    }
    return r
  }
  function buy(s: GameSession, id: string) {
    let r = place(s, 0, 'meeting-place')
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice') {
      const b = getChoiceOptions(r).find(o => o.value.startsWith('action-improvement-') && !o.disabled)
      if (b) {
        r = s.resolveChoice(0, b.value)
        assert.equal(r.ok, true, r.error)
      }
    }
    if (!r.state.players[0]!.minorPlayed.includes(id)) {
      assert.ok(options(r).some(o => o.value === id && !o.disabled))
      r = s.resolveChoice(0, id)
      assert.equal(r.ok, true, r.error)
    }
    assert.ok(r.state.players[0]!.minorPlayed.includes(id))
    return r
  }
  function advanceBought(s: GameSession, r: SessionResponse) { finish(s, r); finish(s, place(s, 1, 'grain-seeds')); finish(s, place(s, 0, 'clay-pit')); return finish(s, place(s, 1, 'reed-bank')); }
  function settleAnimals(s: GameSession, r: SessionResponse) {
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'animal-reorg') {
      r = s.resolveChoice(expectWait(r).interaction.playerIndex, 'confirm', { zones: r.interaction.request.zones })
      assert.equal(r.ok, true, r.error)
    }
    return finish(s, r)
  }
  it("reed shortage and two occupations exclude the enabled card and forged requests while a legal buy schedules two pigs", () => {
    for (const config of ['fee', 'occupation']) {
      const s = setup(A, state => {
        if (config === 'fee')
          state.players[0]!.resources.reed = 0
        else
          state.players[0]!.occupationPlayed.pop()
      }, false)
      let r = place(s, 0, 'meeting-place')
      if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice') {
        const b = getChoiceOptions(r).find(o => o.value.startsWith('action-improvement-') && !o.disabled)
        if (b) {
          r = s.resolveChoice(0, b.value)
          assert.equal(r.ok, true, r.error)
        }
      }
      assert.equal(r.state.players[0]!.minorPlayed.includes(A), false)
      assert.equal(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice' && getChoiceOptions(r).some(o => o.value === A && !o.disabled), false)
      assertRejectedUnchanged(s, () => s.resolveChoice(0, A))
    }
    const s = setup(A, () => { }, false)
    const r = buy(s, A)
    assert.equal(r.state.players[0]!.resources.reed, 0)
    assert.equal(r.state.players[0]!.resources.boar, 0)
    assert.deepEqual(r.state.futureMeeples.filter(x => x.cardId === A).map(x => ({ round: x.round, resources: x.resources })), [{ round: 2, resources: { boar: 1 } }, { round: 3, resources: { boar: 1 } }])
  })
  it("two natural next rounds receive exactly one pig each for the owner without an early or duplicate award", () => {
    const s = setup(A, () => { }, false)
    let r = advanceBought(s, buy(s, A))
    assert.equal(r.state.round, 2)
    r = settleAnimals(s, r)
    assert.equal(r.state.players[0]!.resources.boar, 1)
    assert.equal(r.state.players[1]!.resources.boar, 0)
    assert.deepEqual(r.state.futureMeeples.filter(x => x.cardId === A).map(x => x.round), [3])
    finish(s, place(s, 0, 'forest'))
    finish(s, place(s, 1, 'grain-seeds'))
    finish(s, place(s, 0, 'clay-pit'))
    r = finish(s, place(s, 1, 'reed-bank'))
    assert.equal(r.state.round, 3)
    r = settleAnimals(s, r)
    assert.equal(r.state.players[0]!.resources.boar, 2)
    assert.equal(r.state.players[1]!.resources.boar, 0)
    assert.deepEqual(r.state.futureMeeples.filter(x => x.cardId === A), [])
    const p = r.state.players[0]!
    assert.equal(countRoomAnimals(p) + Object.values(p.stableAnimals).filter(v => v === 'boar').length, 2)
  })
  it("the first arrival rejects illegal housing and accepts one legal pig placement", () => {
    const s = setup(A, () => { }, false)
    let r = advanceBought(s, buy(s, A))
    const i = wait(r)
    assert.ok(i.request.kind === 'animal-reorg')
    const unknown: InteractionAnimalReorgZone = { id: 'not-a-storage-zone', zoneType: 'stable', animalType: 'boar', animalCount: 1, capacity: 1 }
    assertRejectedUnchanged(s, () => s.resolveChoice(0, 'confirm', { zones: [unknown] }))
    const tooMany = i.request.zones.map<InteractionAnimalReorgZone>(z => z.zoneType === 'house' ? { ...z, animalType: 'boar', animalCount: 2 } : z)
    assertRejectedUnchanged(s, () => s.resolveChoice(0, 'confirm', { zones: tooMany }))
    const cattle = i.request.zones.map<InteractionAnimalReorgZone>(z => z.zoneType === 'house' ? { ...z, animalType: 'cattle', animalCount: 1 } : z)
    assertRejectedUnchanged(s, () => s.resolveChoice(0, 'confirm', { zones: cattle }))
    r = settleAnimals(s, r)
    assert.equal(r.state.players[0]!.resources.boar, 1)
    assert.equal(r.state.players[0]!.resources.cattle, 0)
    assertRejectedUnchanged(s, () => s.resolveChoice(0, 'confirm', { zones: tooMany }))
  })
  it("late schedules retain only round fourteen and an already played card cannot duplicate future pigs", () => {
    for (const { round, expected } of [{ round: 13, expected: [14] }, { round: 14, expected: [] }]) {
      const s = setup(A, () => { }, false, round)
      const r = buy(s, A)
      assert.equal(r.state.players[0]!.resources.reed, 0)
      assert.deepEqual(r.state.futureMeeples.filter(x => x.cardId === A).map(x => x.round), expected)
      assertRejectedUnchanged(s, () => s.resolveChoice(0, A))
    }
  })
  it("undo of the actual buy restores its reed hand future supply and score", () => {
    const s = setup(A, () => { }, false)
    const before = JSON.stringify(s.getState().scores)
    buy(s, A)
    const r = s.undoAction()
    assert.equal(r.ok, true, r.error)
    assert.equal(r.state.players[0]!.resources.reed, 1)
    assert.ok(r.state.players[0]!.minorHand.includes(A))
    assert.deepEqual(r.state.futureMeeples, [])
    assert.equal(JSON.stringify(r.scores), before)
  })
  it("animal reorganization cannot move a not-yet-due future pig into the available supply", () => {
    const s = setup(A, () => { }, false)
    let r = advanceBought(s, buy(s, A))
    assert.equal(r.state.round, 2)
    assert.equal(r.state.players[0]!.resources.boar, 1)
    assert.equal(r.state.futureMeeples.filter(x => x.cardId === A).length, 1)
    const i = wait(r)
    assert.ok(i.request.kind === 'animal-reorg')
    const two = i.request.zones.map<InteractionAnimalReorgZone>(z => z.id === 'house:2-0' || z.zoneType === 'stable' ? { ...z, animalType: 'boar', animalCount: 1 } : z)
    assertRejectedUnchanged(s, () => s.resolveChoice(0, 'confirm', { zones: two }))
    r = settleAnimals(s, r)
    assert.deepEqual({ availablePig: r.state.players[0]!.resources.boar, futurePig: r.state.futureMeeples.filter(x => x.cardId === A).length, round: r.state.round }, { availablePig: 1, futurePig: 1, round: 2 })
  })
})
