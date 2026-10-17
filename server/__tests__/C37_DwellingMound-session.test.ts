import { describe, expect, it, afterEach } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { readCardResourceStats } from '../../shared/cards/helpers/card-state'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/A/A040_PottersYard'
import '../../shared/cards/C/C037_DwellingMound'
import '../../shared/cards/C/C158_ForestCampaigner'
import '../../shared/cards/D/D090_PlowMaker'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit34Scoring from './_helpers/audit/ae-negative-34-scoring'

const CARD_ID = 'C037_DwellingMound'
const FOREST_CAMPAIGNER_ID = 'C158_ForestCampaigner'
const PLOW_MAKER_ID = 'D090_PlowMaker'
const POTTERS_YARD_ID = 'A040_PottersYard'

const setupPlowMaker = (food: number, withPottersYard = false) => {
  const session = new GameSession(42)
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  const player = state.players[0]!
  player.minorPlayed.push(CARD_ID)
  player.occupationPlayed.push(PLOW_MAKER_ID)
  player.resources = { ...player.resources, food, clay: 0 }
  if (withPottersYard) {
    player.minorPlayed.push(POTTERS_YARD_ID)
    player.farmyardSpaceStates = ['0-0', '0-1'].map(spaceKey => ({
      spaceKey, sourceCardId: POTTERS_YARD_ID, kind: 'farmyard-goods-token',
      resources: { clay: 1 }, claimPolicy: 'when-no-longer-unused',
    }))
  }
  session.loadState(state)
  return session
}

const setupPlay = (round: number) => {
  const session = new GameSession(37, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = round
  state.players.forEach((player) => {
    setWorkersAtHome(state, player, 2)
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
  })
  state.players[0]!.minorHand = [CARD_ID]
  state.players[0]!.resources.food = 1
  session.loadState(state)
  return session
}

const playMinor = (session: GameSession) => {
  let response: SessionResponse = session.takeAction(0, 'meeting-place')
  if (response.interaction.stateId !== 'wait') return response
  const improvement = response.interaction.request.options?.find((option) =>
    option.value.startsWith('action-improvement-'),
  )
  if (!improvement) return response
  response = session.resolveChoice(0, improvement.value)
  if (response.interaction.stateId !== 'wait') return response
  const card = response.interaction.request.options?.find((option) => option.value === CARD_ID)
  if (!card) return response
  return session.resolveChoice(0, card.value)
}

describe('C37 Dwelling Mound session', () => {
  it('C037 S1: Dwelling Mound can be played in round three for one food', () => {
    const response = playMinor(setupPlay(3))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.food).toBe(0)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
  })

  it('C037 S2: Dwelling Mound is unavailable after round three', () => {
    const response = playMinor(setupPlay(4))

    expect(response.state.players[0]!.resources.food).toBe(1)
    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
    expect(response.state.players[0]!.minorPlayed).not.toContain(CARD_ID)
  })

  it('C037 S3: each new field costs one food after Dwelling Mound is in play', () => {
    const session = new GameSession(42)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.resources = { ...player.resources, food: 1 }
    session.loadState(state)

    let resp = session.takeAction(0, 'farmland')
    expect(resp.ok).toBe(true)
    resp = session.commitSelectionChoice(0, { tile: { row: 0, col: 1 } })

    expect(resp.ok).toBe(true)
    const after = resp.state.players[0]!
    expect(after.resources.food).toBe(0)
    expect(after.fields).toContainEqual(expect.objectContaining({ row: 0, col: 1 }))
    expect(readCardResourceStats(after, CARD_ID)?.paid).toEqual({ food: 1 })
  })

  it('C037 S4: without food a new field cannot be placed', () => {
    const session = new GameSession(42)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.resources = { ...player.resources, food: 0 }
    session.loadState(state)

    const beforeResponse = session.getState()
    expect(beforeResponse.actionAvailability?.farmland).toBe(false)
    const beforeTakenBy = structuredClone(
      beforeResponse.state.actionSpaces.find((space) => space.id === 'farmland')?.takenBy,
    )
    const beforeWorkers = structuredClone(beforeResponse.state.players[0]!.workers)
    const beforeFields = structuredClone(beforeResponse.state.players[0]!.fields)
    const rejected = session.takeAction(0, 'farmland')
    expect(rejected.ok).toBe(false)
    expect(rejected.error).toBe('space unavailable')
    expect(rejected.interaction.stateId).toBe('idle')
    expect(rejected.state.actionSpaces.find((space) => space.id === 'farmland')?.takenBy)
      .toEqual(beforeTakenBy)
    expect(rejected.state.players[0]!.workers).toEqual(beforeWorkers)
    expect(rejected.state.players[0]!.fields).toEqual(beforeFields)
    expect(rejected.state.players[0]!.resources.food).toBe(0)
    expect(readCardResourceStats(rejected.state.players[0]!, CARD_ID)).toBeUndefined()
  })

  it('allows Farmland when a before-placement gain makes the plow payable', () => {
    const session = new GameSession(42, undefined, { playerCount: 4 })
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.currentPlayerIndex = 0
    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.occupationPlayed.push(FOREST_CAMPAIGNER_ID)
    player.resources = { ...player.resources, food: 0 }
    for (const space of state.actionSpaces) {
      if (Object.values(space.gainPerRound).some((amount) => (amount ?? 0) > 0)) {
        space.resources = { ...space.resources, wood: 0 }
      }
    }
    const forest = state.actionSpaces.find((space) => space.id === 'forest')!
    forest.resources = { ...forest.resources, wood: 7 }
    session.loadState(state)

    expect(session.getState().actionAvailability?.farmland).toBe(false)
    const eligibleState = session.getState().state
    const eligibleForest = eligibleState.actionSpaces.find((space) => space.id === 'forest')!
    eligibleForest.resources = { ...eligibleForest.resources, wood: 8 }
    session.loadState(eligibleState)

    expect(session.getState().actionAvailability?.farmland).toBe(true)
    let response = session.takeAction(0, 'farmland')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.food).toBe(1)

    response = session.commitSelectionChoice(0, { tile: { row: 0, col: 1 } })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.food).toBe(0)
    expect(response.state.players[0]!.fields).toContainEqual(expect.objectContaining({ row: 0, col: 1 }))
    expect(readCardResourceStats(response.state.players[0]!, FOREST_CAMPAIGNER_ID)?.gained)
      .toEqual({ food: 1 })
    expect(readCardResourceStats(response.state.players[0]!, CARD_ID)?.paid).toEqual({ food: 1 })
  })

  it('charges the Plow Maker extra field and the Farmland field separately', () => {
    const session = setupPlowMaker(3)

    let response = session.takeAction(0, 'farmland')
    expect(response.ok, response.error).toBe(true)
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') throw new Error('expected Plow Maker choice')
    const plowMaker = response.interaction.request.options?.find(
      (option) => option.sourceCard === PLOW_MAKER_ID && option.value !== '__skip__',
    )
    expect(plowMaker).toBeDefined()

    response = session.resolveChoice(0, plowMaker!.value)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.food).toBe(2)
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') throw new Error('expected first plow')
    const firstTile = response.interaction.request.farm?.selectableTiles[0]
    expect(firstTile).toBeDefined()

    response = session.commitSelectionChoice(0, { tile: firstTile })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.food).toBe(1)
    expect(response.state.players[0]!.fields).toHaveLength(1)
    expect(readCardResourceStats(response.state.players[0]!, CARD_ID)?.paid).toEqual({ food: 1 })
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') throw new Error('expected second plow')
    const secondTile = response.interaction.request.farm?.selectableTiles[0]
    expect(secondTile).toBeDefined()

    response = session.commitSelectionChoice(0, { tile: secondTile })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.food).toBe(0)
    expect(response.state.players[0]!.fields).toHaveLength(2)
    expect(readCardResourceStats(response.state.players[0]!, CARD_ID)?.paid).toEqual({ food: 2 })
    expect(readCardResourceStats(response.state.players[0]!, PLOW_MAKER_ID)?.paid).toEqual({ food: 1 })
  })

  it('settles Potter\'s Yard after the first field before charging the second field', () => {
    const session = setupPlowMaker(2, true)

    let response = session.takeAction(0, 'farmland')
    expect(response.ok, response.error).toBe(true)
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') throw new Error('expected Plow Maker choice')
    const plowMaker = response.interaction.request.options?.find(
      (option) => option.sourceCard === PLOW_MAKER_ID && option.value !== '__skip__',
    )
    expect(plowMaker).toBeDefined()

    response = session.resolveChoice(0, plowMaker!.value)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.food).toBe(1)
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') throw new Error('expected first plow')
    const firstTile = response.interaction.request.farm?.selectableTiles[0]
    expect(firstTile).toEqual({ row: 0, col: 0 })

    response = session.commitSelectionChoice(0, { tile: firstTile })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 0, clay: 1 })
    expect(response.state.players[0]!.fields).toHaveLength(1)
    expect(response.state.players[0]!.farmyardSpaceStates?.filter(token => token.sourceCardId === POTTERS_YARD_ID)
      .map(token => token.spaceKey)).toEqual(['0-1'])
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') throw new Error("expected Potter's Yard choice")
    const exchange = response.interaction.request.options?.find(
      (option) => option.sourceCard === POTTERS_YARD_ID && option.value !== '__skip__',
    )
    expect(exchange).toBeDefined()

    response = session.resolveChoice(0, exchange!.value)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 2, clay: 0 })
    expect(response.state.players[0]!.fields).toHaveLength(1)
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') throw new Error('expected second plow')
    const secondTile = response.interaction.request.farm?.selectableTiles[0]
    expect(secondTile).toEqual({ row: 0, col: 1 })

    response = session.commitSelectionChoice(0, { tile: secondTile })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 1, clay: 1 })
    expect(response.state.players[0]!.fields).toHaveLength(2)
    expect(response.state.players[0]!.farmyardSpaceStates?.filter(token => token.sourceCardId === POTTERS_YARD_ID)).toEqual([])
    expect(readCardResourceStats(response.state.players[0]!, CARD_ID)?.paid).toEqual({ food: 2 })
    expect(readCardResourceStats(response.state.players[0]!, PLOW_MAKER_ID)?.paid).toEqual({ food: 1 })
    expect(readCardResourceStats(response.state.players[0]!, POTTERS_YARD_ID)?.gained)
      .toEqual({ clay: 2, food: 2 })
  })
})

describe('ae-negative-34-scoring', () => {
  const { sessions, save, setup, finish, take, prerequisites, hand, buy, printed, denyMinor } = audit34Scoring
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()));
  it('C037 N1 real printed purchase pays exact cost and excludes insufficient resources or prerequisite', () => { const card = 'C037_DwellingMound', s = setup(card, 3, st => { hand(st, card); prerequisites(st, 0); Object.assign(st.players[0]!.resources, { food: 1 }); }); const r = buy(s, card); assert.ok(r.state.players[0]!.minorPlayed.includes(card)); assert.equal(printed(r, card), 3); assert.equal(r.state.players[0]!.resources.food, 0); save('C037-N1-legal', r); {
      const t = setup(card, 3, st => { hand(st, card); prerequisites(st, 0); st.players[0]!.houseType = 'wood'; Object.assign(st.players[0]!.resources, { food: 0 }); });
      const q = denyMinor(t, card);
      assert.equal(printed(q, card), 0);
      save('C037-N1-resource', q);
  } {
      const t = setup(card, 4, st => { hand(st, card); prerequisites(st, 0); st.players[0]!.houseType = 'wood'; Object.assign(st.players[0]!.resources, { food: 1 }); });
      const q = denyMinor(t, card);
      assert.equal(printed(q, card), 0);
      save('C037-N1-late', q);
  } });
  it('C037 N2 each normal or card granted plow pays exactly one food per new field', () => { for (const extra of [false, true]) {
      const card = 'C037_DwellingMound', s = setup(card, 14, st => { st.players[0]!.resources.food = extra ? 2 : 1; if (extra)
          st.players[0]!.minorPlayed.push('C020_MolePlow'); });
      const r = finish(s, take(s, 'farmland'), true);
      assert.equal(r.state.players[0]!.fields.length, extra ? 2 : 1);
      assert.equal(r.state.players[0]!.resources.food, 0);
      save(`C037-N2-${extra}`, r);
  } });
  it('C037 N3 zero food force attempt refuses a field while hand-only and opponent plow remain free', () => { const card = 'C037_DwellingMound', s = setup(card, 14, st => st.players[0]!.resources.food = 0); assertRejectedUnchanged(s, () => s.takeAction(0, 'farmland')); assert.equal(s.state.players[0]!.fields.length, 0); save('C037-N3-short', s.getState()); for (const mode of ['hand', 'opponent']) {
      const t = setup(card, 14, st => { st.players[0]!.resources.food = 0; if (mode === 'hand')
          hand(st, card);
      else {
          st.currentPlayerIndex = 1;
          st.players[1]!.resources.food = 0;
      } });
      const r = finish(t, take(t, 'farmland'), true);
      assert.equal(r.state.players[mode === 'opponent' ? 1 : 0]!.fields.length, 1);
      assert.equal(r.state.players[0]!.resources.food, 0);
      save(`C037-N3-${mode}`, r);
  } });
})
