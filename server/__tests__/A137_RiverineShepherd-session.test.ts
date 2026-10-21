import { describe, expect, it, afterEach } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { resolveTriggerIfPresent } from './_helpers/trigger-select'

import '../../shared/cards/A/A137_RiverineShepherd'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit15Spaces from './_helpers/audit/ae-negative-15-spaces'
import { createWorkSession } from './_helpers/session-fixtures'
import { getChoiceOptions } from './_helpers/session-assertions'
import { expectCardEffectBeforeHostCollect } from './_helpers/space-use-order'

const CARD_ID = 'A137_RiverineShepherd'
const FILLER = '__test_placeholder__'

const setup = ({ played = true, reed = 3, sheep = 2 } = {}) => {
    const session = new GameSession(5137, undefined, { playerCount: 3 })
    const state = session.getState().state
    stabilizeRandomHands(state.players)
    state.currentPlayerIndex = 0
    state.round = 14
    state.roundPhase = 'work'
    state.players.forEach((candidate) => {
      candidate.minorHand = [FILLER]
      candidate.occupationHand = [FILLER]
      setWorkersAtHome(state, candidate, 2)
    })

    const player = state.players[0]!
    player.occupationHand = played ? [FILLER] : [CARD_ID]
    player.occupationPlayed = played ? [CARD_ID] : []
    player.resources = {
      ...player.resources,
      wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0,
      sheep: 0, boar: 0, cattle: 0,
    }
    player.houseAnimals = {};
    player.stableAnimals = {}
    player.pastures = [
      {
        id: 'riverine-pasture',
        size: 1,
        tiles: [{ row: 0, col: 1 }],
        stables: 0,
        animalType: null,
        animalCount: 0,
      },
    ]

    state.actionSpaces.find((space) => space.id === 'sheep-market')!.resources.sheep = sheep
    state.actionSpaces.find((space) => space.id === 'reed-bank')!.resources.reed = reed

    session.loadState(state)
    return session
}

const playOccupation = (session: GameSession) => {
  const response = session.takeAction(0, 'lessons')
  expect(response.ok, response.error).toBe(true)
  if (!response.state.players[0]!.occupationHand.includes(CARD_ID)) return response
  if (response.interaction.stateId !== 'wait') return response
  const option = response.interaction.request.options?.find((candidate) => candidate.value === CARD_ID)
  expect(option, JSON.stringify(response.interaction)).toBeDefined()
  return session.resolveChoice(response.interaction.playerIndex, option!.value)
}

const placeSheep = (session: GameSession, response: SessionResponse) => {
  if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'animal-reorg') {
    return response
  }
  const pasture = response.interaction.request.zones.find((zone) => zone.id === 'riverine-pasture')
  expect(pasture).toBeDefined()
  return session.resolveChoice(response.interaction.playerIndex, 'confirm', {
    zones: [{
      id: 'riverine-pasture',
      zoneType: 'pasture',
      animalType: 'sheep',
      animalCount: response.state.players[0]!.resources.sheep,
    }],
  })
}

const resolveRiverine = (session: GameSession, initial: SessionResponse, accept: boolean) => {
  let response = initial
  let handled = false
  for (let step = 0; step < 8; step++) {
    if (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'animal-reorg') {
      response = placeSheep(session, response)
      continue
    }
    if (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'select-trigger') {
      const next = resolveTriggerIfPresent(session, response, CARD_ID)
      if (next === response) break
      response = next
      continue
    }
    if (response.interaction.stateId !== 'wait') break
    const cardOption = response.interaction.request.options?.find((option) =>
      option.sourceCard === CARD_ID && option.value !== '__skip__')
    if (!cardOption) break
    response = session.resolveChoice(
      response.interaction.playerIndex,
      accept ? cardOption.value : '__skip__',
    )
    handled = true
  }
  return { response, handled }
}

describe('A137 Riverine Shepherd parity', () => {
  it('A137 S1: Riverine Shepherd is played as the first occupation without paying food in a three-player game', () => {
    const response = playOccupation(setup({ played: false }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.food).toBe(0)
  })

  it('A137 S2: using Sheep Market may take exactly one reed from Reed Bank', () => {
    const session = setup({ reed: 3, sheep: 1 })

    const { response, handled } = resolveRiverine(session, session.takeAction(0, 'sheep-market'), true)

    expect(handled).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ sheep: 1, reed: 1 })
    expect(response.state.players[0]!.pastures[0]).toMatchObject({
      id: 'riverine-pasture', animalType: 'sheep', animalCount: 1,
    })
    expect(response.state.actionSpaces.find((space) => space.id === 'reed-bank')!.resources.reed).toBe(2)
  })

  it('A137 S3: using Reed Bank may take exactly one sheep from Sheep Market and keep it', () => {
    const session = setup({ reed: 2, sheep: 2 })

    const { response, handled } = resolveRiverine(session, session.takeAction(0, 'reed-bank'), true)

    expect(handled).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ reed: 2, sheep: 1 })
    expect(response.state.players[0]!.pastures[0]).toMatchObject({
      id: 'riverine-pasture', animalType: 'sheep', animalCount: 1,
    })
    expect(response.state.actionSpaces.find((space) => space.id === 'sheep-market')!.resources.sheep).toBe(1)
  })

  it('A137 S4: the extra good may be declined', () => {
    const session = setup({ reed: 3, sheep: 1 })

    const { response, handled } = resolveRiverine(session, session.takeAction(0, 'sheep-market'), false)

    expect(handled).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ sheep: 1, reed: 0 })
    expect(response.state.actionSpaces.find((space) => space.id === 'reed-bank')!.resources.reed).toBe(3)
  })

  it('A137 S5: an empty corresponding space offers no extra good', () => {
    const session = setup({ reed: 0, sheep: 1 })

    const { response, handled } = resolveRiverine(session, session.takeAction(0, 'sheep-market'), true)

    expect(handled).toBe(false)
    expect(response.state.players[0]!.resources).toMatchObject({ sheep: 1, reed: 0 })
  })

  it('A137 S6: a different action space offers no extra good', () => {
    const session = setup({ reed: 3, sheep: 2 })

    const { response, handled } = resolveRiverine(session, session.takeAction(0, 'day-laborer'), true)

    expect(handled).toBe(false)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 2, reed: 0, sheep: 0 })
    expect(response.state.actionSpaces.find((space) => space.id === 'reed-bank')!.resources.reed).toBe(3)
    expect(response.state.actionSpaces.find((space) => space.id === 'sheep-market')!.resources.sheep).toBe(2)
  })
})

describe('ae-negative-15-spaces', () => {
  const { sessions, save, ok, turn, finishOptional, shepherd } = audit15Spaces
  afterEach(()=>sessions.splice(0).forEach(s=>s.dispose()))
  it('A137 N1 Sheep Market takes exactly one reed from nonempty other pile',()=>{for(const amount of [1,4]){const s=shepherd(amount);const pending=turn(s,0,'sheep-market');const r=finishOptional(s,pending,true);assert.equal(r.state.players[0]!.resources.sheep,1);assert.equal(r.state.players[0]!.resources.reed,1);assert.equal(r.state.actionSpaces.find(a=>a.id==='reed-bank')!.resources.reed,amount-1);assert.equal(r.state.actionSpaces.find(a=>a.id==='reed-bank')!.takenBy.length,0);save(`A137-N1-${amount}`,{pending,r})}})
  it('A137 N2 Reed Bank can take one sheep without collecting or occupying other space',()=>{const s=shepherd(2);const r=finishOptional(s,turn(s,0,'reed-bank'),true);assert.equal(r.state.players[0]!.resources.reed,2);assert.equal(r.state.players[0]!.resources.sheep,1);assert.equal(r.state.actionSpaces.find(a=>a.id==='sheep-market')!.resources.sheep,0);assert.equal(r.state.actionSpaces.find(a=>a.id==='sheep-market')!.takenBy.length,0);save('A137-N2',r)})
  it('A137 N3 empty other pile and decline cannot create reserve reed',()=>{const zeroS=shepherd(0);const zero=finishOptional(zeroS,turn(zeroS,0,'sheep-market'),false);assert.equal(zero.state.players[0]!.resources.reed,0);const s=shepherd(4);const declined=finishOptional(s,turn(s,0,'sheep-market'),false);assert.equal(declined.state.players[0]!.resources.reed,0);assert.equal(declined.state.actionSpaces.find(a=>a.id==='reed-bank')!.resources.reed,4);save('A137-N3',{zero,declined})})
  it('A137 N4 hand unrelated and actual opponent cannot collect owner other pile',()=>{const hs=shepherd(4,false);const hand=finishOptional(hs,turn(hs,0,'sheep-market'),false);assert.equal(hand.state.players[0]!.resources.reed,0);const s=shepherd(4);const unrelated=turn(s,0,'day-laborer');const other=turn(s,1,'sheep-market');assert.equal(other.state.players[0]!.resources.reed,0);assert.equal(other.state.players[1]!.resources.reed,0);save('A137-N4',{hand,unrelated,other})})
  it('A137 N5 invalid choice rejects and whole undo returns source and animals before retry',()=>{const s=shepherd(4);const pending=turn(s,0,'sheep-market');assertRejectedUnchanged(s,()=>s.resolveChoice(0,'take-five'));const first=finishOptional(s,pending,true);const undone=ok(s.undoAction());assert.equal(undone.state.players[0]!.resources.sheep,0);assert.equal(undone.state.players[0]!.resources.reed,0);assert.equal(undone.state.actionSpaces.find(a=>a.id==='reed-bank')!.resources.reed,4);const retry=finishOptional(s,turn(s,0,'sheep-market'),true);assert.equal(retry.state.players[0]!.resources.reed,1);save('A137-N5',{first,undone,retry})})
})

describe('A137 before timing (#1322)', () => {
  const sessions: GameSession[] = []
  afterEach(() => sessions.splice(0).forEach(session => session.dispose()))
  const make = (actor: number) => {
    const session = createWorkSession({ seed: 1322137, options: { playerCount: 3 }, configure: state => {
      state.round = 14
      state.currentPlayerIndex = actor
      state.players.forEach(player => Object.assign(player.resources, { reed: 0, sheep: 0 }))
      const owner = state.players[0]!
      owner.occupationPlayed = [CARD_ID]
      owner.pastures = [{ id: 'riverine-pasture', tiles: [{ row: 0, col: 1 }], animalType: null, animalCount: 0 }]
      state.actionSpaces.find(space => space.id === 'reed-bank')!.resources.reed = 2
      state.actionSpaces.find(space => space.id === 'sheep-market')!.resources.sheep = 2
    } })
    sessions.push(session)
    return session
  }
  const pile = (response: SessionResponse, id: string, type: 'reed' | 'sheep') =>
    response.state.actionSpaces.find(space => space.id === id)!.resources[type]

  it('offers the Sheep Market sheep while the Reed Bank reed is still on the space', () => {
    const session = make(0)
    const offered = session.takeAction(0, 'reed-bank')

    expect(offered.ok, offered.error).toBe(true)
    const option = getChoiceOptions(offered).find(candidate => candidate.sourceCard === CARD_ID && candidate.value !== '__skip__')
    expect(option, JSON.stringify(offered.interaction)).toBeDefined()
    expect(offered.state.players[0]!.resources.reed).toBe(0)
    expect(pile(offered, 'reed-bank', 'reed')).toBe(2)

    const response = placeSheep(session, session.resolveChoice(0, option!.value))
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ reed: 2, sheep: 1 })
    expect(pile(response, 'sheep-market', 'sheep')).toBe(1)
    expect(response.interaction.stateId === 'wait' && response.interaction.request.kind).toBe('confirm-next-player')
    expectCardEffectBeforeHostCollect(response, { cardId: CARD_ID, spaceId: 'reed-bank', type: 'resource.moved' })
  })

  it('does not offer the owner card when an opponent uses Reed Bank', () => {
    const response = make(1).takeAction(1, 'reed-bank')

    expect(response.ok, response.error).toBe(true)
    expect(getChoiceOptions(response).some(option => option.sourceCard === CARD_ID)).toBe(false)
    expect(response.state.players[1]!.resources.reed).toBe(2)
    expect(pile(response, 'sheep-market', 'sheep')).toBe(2)
  })
})
