import { describe, expect, it, afterEach } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { resolveTriggerIfPresent } from './_helpers/trigger-select'

import '../../shared/cards/A/A066_FeedingDish'
import assert from 'node:assert/strict'
import { assertRuleOutcome, assertUndoRestored, undoRuleSnapshot } from './_helpers/negative-rule-audit'
import * as audit09Sources from './_helpers/audit/ae-negative-09-sources'

const CARD_ID = 'A066_FeedingDish'
const FILLER = '__test_placeholder__'
type Animal = 'sheep' | 'boar' | 'cattle'

const MARKETS: Array<{ spaceId: string; animal: Animal }> = [
  { spaceId: 'sheep-market', animal: 'sheep' },
  { spaceId: 'pig-market', animal: 'boar' },
  { spaceId: 'cattle-market', animal: 'cattle' },
]

const setupPurchase = () => {
  const session = new GameSession(5066, undefined, { playerCount: 2 })
  const state = session.getState().state
  stabilizeRandomHands(state.players)
  state.currentPlayerIndex = 0
  state.roundPhase = 'work'
  state.availableMajorImprovements = []
  const player = state.players[0]!
  setWorkersAtHome(state, player, 2)
  player.minorHand = [CARD_ID]
  player.occupationHand = [FILLER]
  player.resources.wood = 1
  const opponent = state.players[1]!
  setWorkersAtHome(state, opponent, 2)
  opponent.minorHand = [FILLER]
  opponent.occupationHand = [FILLER]
  session.loadState(state)
  return session
}

const playMinor = (session: GameSession) => {
  let response = session.takeAction(0, 'major-improvement')
  expect(response.ok, response.error).toBe(true)
  if (response.interaction.stateId !== 'wait') return response
  const enter = response.interaction.request.options?.find((option) =>
    option.value.startsWith('action-improvement-'))
  if (enter) response = session.resolveChoice(0, enter.value)
  if (!response.state.players[0]!.minorHand.includes(CARD_ID)) return response
  if (response.interaction.stateId !== 'wait') return response
  const card = response.interaction.request.options?.find((option) => option.value === CARD_ID)
  expect(card).toBeDefined()
  return session.resolveChoice(0, card!.value)
}

const setupAction = ({
  spaceId,
  animal,
  ownedAnimal,
}: {
  spaceId: string
  animal?: Animal
  ownedAnimal?: Animal
}) => {
  const session = new GameSession(6066, undefined, { playerCount: 2 })
  const state = session.getState().state
  stabilizeRandomHands(state.players)
  state.currentPlayerIndex = 0
  state.round = 14
  state.roundPhase = 'work'
  const player = state.players[0]!
  setWorkersAtHome(state, player, 2)
  player.minorPlayed = [CARD_ID]
  player.minorHand = [FILLER]
  player.occupationHand = [FILLER]
  player.resources.grain = 0
  player.resources.sheep = ownedAnimal === 'sheep' ? 1 : 0
  player.resources.boar = ownedAnimal === 'boar' ? 1 : 0
  player.resources.cattle = ownedAnimal === 'cattle' ? 1 : 0
  player.houseAnimals = {};
  player.stableAnimals = {}
  player.pastures = ownedAnimal ? [{
    id: 'feeding-dish-pasture',
    tiles: [{ row: 0, col: 0 }, { row: 0, col: 1 }],
    animalType: ownedAnimal,
    animalCount: 1,
  }] : []
  const opponent = state.players[1]!
  setWorkersAtHome(state, opponent, 2)
  opponent.minorHand = [FILLER]
  opponent.occupationHand = [FILLER]
  const space = state.actionSpaces.find((candidate) => candidate.id === spaceId)
  if (!space) throw new Error(`missing action space ${spaceId}`)
  space.takenBy = []
  if (animal) space.resources[animal] = 1
  session.loadState(state)
  return session
}

const useSpace = (session: GameSession, spaceId: string, animal?: Animal): SessionResponse => {
  let response = session.takeAction(0, spaceId)
  expect(response.ok, response.error).toBe(true)
  for (let step = 0; step < 6 && response.interaction.stateId === 'wait'; step++) {
    if (response.interaction.request.kind === 'select-trigger') {
      response = resolveTriggerIfPresent(session, response, CARD_ID)
      continue
    }
    if (response.interaction.request.kind !== 'animal-reorg' || !animal) break
    const player = response.state.players[0]!
    const samePasture = player.pastures.find((pasture) => pasture.animalType === animal)
    const count = player.resources[animal]
    response = session.resolveChoice(0, 'confirm', {
      zones: samePasture
        ? [{ id: samePasture.id, zoneType: 'pasture', animalType: animal, animalCount: count }]
        : [{ id: 'house:1-0', zoneType: 'house', animalType: animal, animalCount: count }],
    })
  }
  return response
}

describe('A066 Feeding Dish parity', () => {
  it('A066 S1: paying one wood plays Feeding Dish', () => {
    const response = playMinor(setupPurchase())

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.wood).toBe(0)
  })

  it('A066 S2: every animal market grants one grain when its animal was already owned', () => {
    MARKETS.forEach((entry) => {
      const response = useSpace(setupAction({ ...entry, ownedAnimal: entry.animal }), entry.spaceId, entry.animal)

      expect(response.state.players[0]!.resources.grain, entry.spaceId).toBe(1)
    })
  })

  it('A066 S3: no grain when the animal market species was not already owned', () => {
    MARKETS.forEach((entry) => {
      const response = useSpace(setupAction(entry), entry.spaceId, entry.animal)

      expect(response.state.players[0]!.resources.grain, entry.spaceId).toBe(0)
    })
  })

  it('A066 S4: a different previously owned animal does not qualify', () => {
    const response = useSpace(setupAction({
      spaceId: 'pig-market',
      animal: 'boar',
      ownedAnimal: 'sheep',
    }), 'pig-market', 'boar')

    expect(response.state.players[0]!.resources.grain).toBe(0)
  })

  it('A066 S5: a non-animal accumulation space does not trigger Feeding Dish', () => {
    const response = useSpace(setupAction({ spaceId: 'forest' }), 'forest')

    expect(response.state.players[0]!.resources.grain).toBe(0)
    expect(response.state.players[0]!.resources.wood).toBeGreaterThan(0)
  })
})

describe('ae-negative-09-sources', () => {
  const { DISH, sessions, save, setup, buy, deny, turn, market, settle, collect, first, cook } = audit09Sources
  type Animal = audit09Sources.Animal
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()))
  it('A066 N1 actual purchase costs one wood and does not award grain', () => { deny(setup(DISH, { played: false }), DISH); const r = buy(setup(DISH, { played: false, resources: { wood: 1 } }), DISH); assert.equal(r.state.players[0]!.resources.wood, 0); assert.equal(r.state.players[0]!.resources.grain, 0); assert.ok(r.state.players[0]!.minorPlayed.includes(DISH)) })
  it('A066 N2 a preexisting animal grants one grain for a multiple animal collection', () => { for (const animal of ['sheep', 'boar', 'cattle'] satisfies Animal[]) { const r = collect(market(animal, 1, 3), animal); assert.equal(r.state.players[0]!.resources[animal], 4); assert.equal(r.state.players[0]!.pastures[0]!.animalCount, 4); assert.equal(r.state.players[0]!.resources.grain, 1); assert.equal(r.state.log.filter(e => e.key === 'log.cardTriggered' && e.params?.cardId === DISH).length, 1) } })
  it('A066 N3 first sheep from the space is not a preexisting animal', () => first('sheep', 'A066-N3'))
  it('A066 N4 first boar from the space is not a preexisting animal', () => first('boar', 'A066-N4'))
  it('A066 N5 first cattle from the space is not a preexisting animal', () => first('cattle', 'A066-N5'))
  it('A066 N6 an animal of a different type does not qualify', () => { const s = market('boar', 0, 1, true, state => { const p = state.players[0]!; p.resources.sheep = 1; p.houseAnimals = { '2-0': 'sheep' }}); const r = collect(s, 'boar'); assert.equal(r.state.players[0]!.resources.sheep, 1); assert.equal(r.state.players[0]!.resources.boar, 1); save('A066-N6', r); assertRuleOutcome({ grain: r.state.players[0]!.resources.grain }, { grain: 0 }) })
  it('A066 N7 animal received by playing Mud Patch is not a market use', () => { const s = market('boar', 0, 1, true, state => { state.players[0]!.minorHand = ['A011_MudPatch']; state.players[0]!.fields = [{ row: 0, col: 0, stacks: [] }] }); const r = settle(s, buy(s, 'A011_MudPatch')); assert.equal(r.state.players[0]!.resources.boar, 1); assert.equal(r.state.players[0]!.resources.grain, 0) })
  it('A066 N8 opponent use and unplayed owner do not award owner grain', () => { const s = market('sheep', 1); turn(s, 0, 'forest'); let r = collect(s, 'sheep', 1); assert.equal(r.state.players[0]!.resources.grain, 0); assert.equal(r.state.players[1]!.resources.grain, 0); r = collect(market('sheep', 1, 1, false), 'sheep'); assert.equal(r.state.players[0]!.resources.sheep, 2); assert.equal(r.state.players[0]!.resources.grain, 0) })
  it('A066 N9 cooking away the prior animal removes qualification', () => { const s = market('sheep', 1, 1, true, state => { state.players[0]!.improvements = ['Major_Fireplace1'] }); let r = cook(s); assert.equal(r.state.players[0]!.resources.sheep, 0); assert.equal(r.state.players[0]!.pastures[0]!.animalCount, 0); assert.equal(r.state.players[0]!.resources.food, 42); r = collect(s, 'sheep'); assert.equal(r.state.players[0]!.resources.sheep, 1); save('A066-N9', r); assertRuleOutcome({ grain: r.state.players[0]!.resources.grain }, { grain: 0 }) })
  it('A066 N10 actual market undo restores acquisition and permits one legal retry', () => { const s = market('sheep', 1); const before = undoRuleSnapshot(s.getState()); const r = collect(s, 'sheep'); assert.equal(r.state.players[0]!.resources.grain, 1); assertUndoRestored(before, s.undoAction()); const retry = collect(s, 'sheep'); assert.equal(retry.state.players[0]!.resources.sheep, 2); assert.equal(retry.state.players[0]!.resources.grain, 1); save('A066-N10-undo-retry', retry) })
})
