import { describe, expect, it, afterEach } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/E/E115_SeedServant'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit49Fields from './_helpers/audit/ae-negative-49-fields'

const CARD_ID = 'E115_SeedServant'
const FIREPLACE = 'Major_Fireplace1'
const FILLER = '__test_placeholder__'

const optionsOf = (response: SessionResponse) => response.interaction.stateId === 'wait'
  ? response.interaction.request.options ?? []
  : []

const setup = ({
  played = true, actor = 0, fireplace = true, field = true, grain = 0, vegetable = 0,
}: {
  played?: boolean
  actor?: number
  fireplace?: boolean
  field?: boolean
  grain?: number
  vegetable?: number
} = {}) => {
  const session = new GameSession(7115, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = actor
  state.round = 14
  state.roundPhase = 'work'
  state.actionSpaces.forEach((space) => { space.takenBy = [] })
  state.players.forEach((player, index) => {
    setWorkersAtHome(state, player, index === actor ? 2 : 0)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.improvements = []
    player.cardStates = {}
    player.fields = []
    Object.assign(player.resources, {
      wood: 0, clay: 0, reed: 0, stone: 0, food: 0,
      grain: index === actor ? grain : 0,
      vegetable: index === actor ? vegetable : 0,
      sheep: 0, boar: 0, cattle: 0, begging: 0,
    })
  })
  const owner = state.players[0]!
  owner.occupationHand = played ? [FILLER] : [CARD_ID]
  owner.occupationPlayed = played ? [CARD_ID] : []
  const actingPlayer = state.players[actor]!
  if (fireplace) {
    actingPlayer.improvements = [FIREPLACE]
    state.availableMajorImprovements = state.availableMajorImprovements
      .filter((id) => id !== FIREPLACE)
  }
  if (field) actingPlayer.fields = [{ row: 0, col: 0, stacks: [] }]
  session.loadState(state)
  return session
}

const resolveSeedServantTrigger = (session: GameSession, initial: SessionResponse) => {
  let response = initial
  if (response.interaction.stateId === 'wait'
    && response.interaction.request.kind === 'select-trigger') {
    const trigger = optionsOf(response).find((option) =>
      option.sourceCard === CARD_ID || option.value === CARD_ID)
    expect(trigger, JSON.stringify(response.interaction, null, 2)).toBeDefined()
    response = session.resolveChoice(response.interaction.playerIndex, trigger!.value)
  }
  return response
}

const acceptSeedServant = (session: GameSession, initial: SessionResponse) => {
  let response = resolveSeedServantTrigger(session, initial)
  if (response.interaction.stateId === 'wait' && response.interaction.sourceCard === CARD_ID) {
    const accept = optionsOf(response).find((option) => option.value !== '__skip__')
    expect(accept, JSON.stringify(response.interaction, null, 2)).toBeDefined()
    response = session.resolveChoice(response.interaction.playerIndex, accept!.value)
  }
  return response
}

const bakeSeedServantOnce = (session: GameSession, initial: SessionResponse) => {
  let response = acceptSeedServant(session, initial)
  if (response.interaction.stateId === 'wait'
    && response.interaction.promptKey === 'ui.interactionBakeBreadChoice') {
    const fireplace = optionsOf(response).find((option) => option.value === FIREPLACE)
    expect(fireplace, JSON.stringify(response.interaction, null, 2)).toBeDefined()
    response = session.resolveChoice(response.interaction.playerIndex, fireplace!.value)
  }
  if (response.interaction.stateId === 'wait'
    && response.interaction.promptKey === 'ui.interactionBakeBreadCount') {
    const one = optionsOf(response).find((option) => option.value === `count-${FIREPLACE}-1`)
    expect(one, JSON.stringify(response.interaction, null, 2)).toBeDefined()
    response = session.resolveChoice(response.interaction.playerIndex, one!.value)
  }
  return response
}

const sowSeedServant = (session: GameSession, initial: SessionResponse) => {
  const response = acceptSeedServant(session, initial)
  expect(response.interaction).toMatchObject({
    stateId: 'wait', request: { kind: 'farm-select', farm: { farmType: 'sow' } },
  })
  if (response.interaction.stateId !== 'wait'
    || response.interaction.request.farm.farmType !== 'sow') return response
  const field = response.interaction.request.farm.selectableFields[0]!.tile
  return session.commitSelectionChoice(0, { crops: [{ ...field, crop: 'vegetable' }] })
}

const declineSeedServant = (session: GameSession, initial: SessionResponse) => {
  const response = resolveSeedServantTrigger(session, initial)
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') return response
  expect(response.interaction.sourceCard).toBe(CARD_ID)
  expect(optionsOf(response).some((option) => option.value === '__skip__')).toBe(true)
  return session.resolveChoice(response.interaction.playerIndex, '__skip__')
}

const playSeedServant = (session: GameSession) => {
  let response = session.takeAction(0, 'lessons')
  if (response.interaction.stateId === 'wait'
    && response.state.players[0]!.occupationHand.includes(CARD_ID)) {
    const card = optionsOf(response).find((option) => option.value === CARD_ID)
    expect(card, JSON.stringify(response.interaction, null, 2)).toBeDefined()
    response = session.resolveChoice(response.interaction.playerIndex, card!.value)
  }
  return response
}

describe('E115 Seed Servant parity', () => {
  it('E115 S1: Seed Servant can be played as the first occupation without an immediate gain', () => {
    const response = playSeedServant(setup({ played: false }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 0, vegetable: 0, food: 0 })
  })

  it('E115 S2: after Grain Seeds the newly gained grain can be baked with a Fireplace', () => {
    const session = setup()

    const response = bakeSeedServantOnce(session, session.takeAction(0, 'grain-seeds'))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 0, food: 2 })
  })

  it('E115 S3: the Bake Bread action after Grain Seeds can be declined', () => {
    const session = setup()

    const response = declineSeedServant(session, session.takeAction(0, 'grain-seeds'))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 1, food: 0 })
  })

  it('E115 S4: without a baking improvement Grain Seeds offers no usable Bake Bread action', () => {
    const response = setup({ fireplace: false }).takeAction(0, 'grain-seeds')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 1, food: 0 })
    expect(response.interaction.stateId === 'wait' ? response.interaction.sourceCard : undefined)
      .not.toBe(CARD_ID)
  })

  it('E115 S5: after Vegetable Seeds the newly gained vegetable can be sown', () => {
    const session = setup()

    const response = sowSeedServant(session, session.takeAction(0, 'vegetable-seeds'))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.vegetable).toBe(0)
    expect(response.state.players[0]!.fields[0]!.stacks[0]).toMatchObject({
      kind: 'vegetable', remaining: 2,
    })
  })

  it('E115 S6: the Sow action after Vegetable Seeds can be declined', () => {
    const session = setup()

    const response = declineSeedServant(session, session.takeAction(0, 'vegetable-seeds'))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.vegetable).toBe(1)
    expect(response.state.players[0]!.fields[0]!.stacks).toEqual([])
  })

  it('E115 S7: without an empty field Vegetable Seeds offers no usable Sow action', () => {
    const response = setup({ field: false }).takeAction(0, 'vegetable-seeds')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.vegetable).toBe(1)
    expect(response.interaction.stateId === 'wait' ? response.interaction.sourceCard : undefined)
      .not.toBe(CARD_ID)
  })

  it('E115 S8: another action space triggers neither Bake Bread nor Sow', () => {
    const response = setup().takeAction(0, 'day-laborer')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.food).toBe(2)
    expect(response.interaction.stateId === 'wait' ? response.interaction.sourceCard : undefined)
      .not.toBe(CARD_ID)
  })

  it('E115 S9: an opponent using a seed space does not trigger the owners Seed Servant', () => {
    const response = setup({ actor: 1 }).takeAction(1, 'grain-seeds')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.grain).toBe(0)
    expect(response.state.players[1]!.resources.grain).toBe(1)
    expect(response.interaction.stateId === 'wait' ? response.interaction.sourceCard : undefined)
      .not.toBe(CARD_ID)
  })
})

describe('ae-negative-49-fields', () => {
  const { SEED, sessions, save, ok, finish, lesson, action, seeds, acceptSeed, bake } = audit49Fields
  afterEach(()=>sessions.splice(0).forEach(s=>s.dispose()))
  it('E115 N1 real purchase grants no seed and newly gained Grain Seeds can be baked once for exactly two Fireplace food or declined',()=>{const bought=lesson(seeds(false),SEED);assert.equal(bought.state.players[0]!.resources.grain,0);assert.equal(bought.state.players[0]!.resources.food,0);for(const accept of[true,false]){const s=seeds(),pending=ok(s.takeAction(0,'grain-seeds')),r=accept?bake(s,pending):finish(s,pending,false);assert.equal(r.state.players[0]!.resources.grain,accept?0:1);assert.equal(r.state.players[0]!.resources.food,accept?2:0);save(`E115-N1-${accept}`,{bought,pending,r})}})
  it('E115 N2 newly gained Vegetable Seeds can be sown into a real empty field while an occupied tile is rejected before legal retry and decline keeps the seed',()=>{const s=seeds(),pending=acceptSeed(s,ok(s.takeAction(0,'vegetable-seeds')));assert.ok(pending.interaction.stateId==='wait'&&pending.interaction.request.kind==='farm-select'&&pending.interaction.request.farm.farmType==='sow');const bad=assertRejectedUnchanged(s,()=>s.commitSelectionChoice(0,{crops:[{row:1,col:0,crop:'vegetable'}]})),r=finish(s,ok(s.commitSelectionChoice(0,{crops:[{row:0,col:2,crop:'vegetable'}]})));assert.equal(r.state.players[0]!.resources.vegetable,0);assert.deepEqual(r.state.players[0]!.fields[0]!.stacks,[{kind:'vegetable',remaining:2}]);const t=seeds(),declined=finish(t,ok(t.takeAction(0,'vegetable-seeds')),false);assert.equal(declined.state.players[0]!.resources.vegetable,1);assert.equal(declined.state.players[0]!.fields[0]!.stacks.length,0);save('E115-N2',{pending,bad,r,declined})})
  it('E115 N3 no oven no field card in hand unrelated action and actual opponent seed use cannot produce a free bake or sow',()=>{const s=seeds(true,false),noOven=finish(s,ok(s.takeAction(0,'grain-seeds')));assert.equal(noOven.state.players[0]!.resources.grain,1);assert.equal(noOven.state.players[0]!.resources.food,0);const t=seeds(true,true,false),noField=finish(t,ok(t.takeAction(0,'vegetable-seeds')));assert.equal(noField.state.players[0]!.resources.vegetable,1);const v=seeds(false),hand=finish(v,ok(v.takeAction(0,'grain-seeds')));assert.equal(hand.state.players[0]!.resources.grain,1);assert.equal(hand.state.players[0]!.resources.food,0);const q=seeds(true),other=action(q,0,'clay-pit');assert.equal(other.state.players[0]!.resources.grain,0);const opponent=action(q,1,'grain-seeds');assert.equal(opponent.state.players[1]!.resources.grain,1);assert.equal(opponent.state.players[1]!.resources.food,100);save('E115-N3',{noOven,noField,hand,other,opponent})})
})
