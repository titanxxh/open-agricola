import { createWorkSession } from './_helpers/session-fixtures'
import { describe, expect, it, afterEach } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { markAllWorkersUsed, setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { resolveTriggerIfPresent } from './_helpers/trigger-select'
import type { Resource } from '../../shared/contract/types'

import '../../shared/cards/C/C103_GreenGrocer'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit46Preparation from './_helpers/audit/ae-negative-46-preparation'

const CARD_ID = 'C103_GreenGrocer'
const FILLER = '__test_placeholder__'

const setup = ({
  played = true, round = 1, resources = {},
}: {
  played?: boolean
  round?: number
  resources?: Partial<Resource>
} = {}) => {
  const session = createWorkSession({ seed: 5103, options: { playerCount: 2 } })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = round
  state.roundPhase = 'work'
  state.players.forEach((player) => {
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.improvements = []
    player.cardStates = {}
    player.fields = []
    player.pastures = []
    player.stableTiles = []
    player.stableAnimals = {}
    player.houseAnimals = {};
    player.resources = {
      ...player.resources, wood: 0, clay: 0, reed: 0, stone: 0, food: 20, grain: 0,
      vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    }
    setWorkersAtHome(state, player, 2)
  })
  const owner = state.players[0]!
  owner.occupationHand = played ? [FILLER] : [CARD_ID]
  owner.occupationPlayed = played ? [CARD_ID] : []
  owner.resources = { ...owner.resources, food: 0, ...resources }
  owner.pastures = [
    {
      id: 'green-grocer-pasture',
      size: 1,
      tiles: [{ row: 0, col: 2 }],
      stables: 0,
      animalType: owner.resources.sheep > 0 ? 'sheep' : null,
      animalCount: owner.resources.sheep,
    },
  ]
  if (owner.resources.cattle > 0) {
    owner.houseAnimals = Object.fromEntries(owner.roomTiles.slice(0, owner.resources.cattle).map(tile => [`${tile.row}-${tile.col}`, 'cattle']));
  }
  if (played) state.players.forEach((player) => markAllWorkersUsed(state, player))
  session.loadState(state)
  return session
}

const playGreenGrocer = (session: GameSession) => {
  const response = session.takeAction(0, 'lessons')
  expect(response.ok, response.error).toBe(true)
  if (!response.state.players[0]!.occupationHand.includes(CARD_ID)) return response
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') return response
  const card = response.interaction.request.options?.find((option) => option.value === CARD_ID)
  expect(card, JSON.stringify(response.interaction)).toBeDefined()
  return session.resolveChoice(response.interaction.playerIndex, card!.value)
}

const greenGrocerPrompt = (session: GameSession, start: SessionResponse) => {
  const response = resolveTriggerIfPresent(session, start, CARD_ID)
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') throw new Error('expected Green Grocer choice')
  expect(response.interaction.sourceCard).toBe(CARD_ID)
  return response
}

const chooseExchange = (
  session: GameSession,
  start: SessionResponse,
  paid: Partial<Resource>,
  gained: Partial<Resource>,
) => {
  let offered = greenGrocerPrompt(session, start)
  const source = offered.interaction.request.options?.find(option => option.labelKey === 'actions.activate-card-effect.name')
  if (source) {
    offered = session.resolveChoice(offered.interaction.playerIndex, source.value)
    expect(offered.ok, offered.error).toBe(true)
    if (offered.interaction.stateId !== 'wait') return offered
  }
  const exchange = offered.interaction.request.options?.find((option) =>
    option.effectPreview?.kind === 'resourceExchange'
      && Object.entries(paid).every(([resource, count]) =>
        option.effectPreview?.resourcesPaid?.[resource as keyof Resource] === count)
      && Object.entries(gained).every(([resource, count]) =>
        option.effectPreview?.resourcesGained?.[resource as keyof Resource] === count),
  )
  expect(exchange, JSON.stringify(offered.interaction)).toBeDefined()
  return session.resolveChoice(offered.interaction.playerIndex, exchange!.value)
}

describe('C103 Green Grocer parity', () => {
  it('C103 S1: Green Grocer can be played as the first occupation for no food', () => {
    const response = playGreenGrocer(setup({ played: false, round: 5, resources: { food: 0 } }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.food).toBe(0)
  })

  for (const [scenario, paid, gained] of [
    ['S2', { cattle: 1 }, { vegetable: 1 }],
    ['S3', { vegetable: 1 }, { cattle: 1 }],
    ['S4', { sheep: 2 }, { vegetable: 1 }],
    ['S5', { vegetable: 1 }, { sheep: 2 }],
    ['S6', { food: 2 }, { grain: 1 }],
    ['S7', { grain: 1 }, { food: 2 }],
  ] as const) {
    it(`C103 ${scenario}: the matching round-start exchange pays and gains exactly once`, () => {
      const session = setup({ resources: paid })

      const response = chooseExchange(session, session.performRoundEnd(), paid, gained)

      expect(response.ok, response.error).toBe(true)
      expect(response.state.round).toBe(2)
      const owner = response.state.players[0]!
      for (const [resource, count] of Object.entries(paid)) {
        expect(owner.resources[resource as keyof Resource]).toBe(0)
      }
      for (const [resource, count] of Object.entries(gained)) {
        expect(owner.resources[resource as keyof Resource]).toBe(count)
      }
      expect(response.interaction.stateId === 'wait' ? response.interaction.sourceCard : undefined)
        .not.toBe(CARD_ID)
    })
  }

  it('C103 S8: the round-start exchange may be declined', () => {
    const session = setup({ resources: { food: 2 } })
    const offered = greenGrocerPrompt(session, session.performRoundEnd())
    expect(offered.interaction.request.options?.some((option) => option.value === '__skip__')).toBe(true)

    const response = session.resolveChoice(offered.interaction.playerIndex, '__skip__')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.round).toBe(2)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 2, grain: 0 })
  })

  it('C103 S9: no payable exchange suppresses the Green Grocer offer', () => {
    const response = setup({ resources: { food: 0 } }).performRoundEnd()

    expect(response.ok, response.error).toBe(true)
    expect(response.state.round).toBe(2)
    expect(response.interaction.stateId === 'wait' ? response.interaction.sourceCard : undefined)
      .not.toBe(CARD_ID)
    expect(response.state.players[0]!.resources).toMatchObject({
      food: 0, grain: 0, vegetable: 0, sheep: 0, cattle: 0,
    })
  })
})

describe('ae-negative-46-preparation', () => {
  const { GREEN, sessions, save, ok, finish, lesson, bonus, isCardPending, boundary, prepMake, garden, exchange } = audit46Preparation
  afterEach(()=>sessions.splice(0).forEach(s=>s.dispose()))
  it('C103 N1 actual Lessons grants no immediate exchange and all six native next round recipes pay and gain exactly once',()=>{const a=lesson(prepMake(GREEN,()=>{},false),GREEN);assert.equal(bonus(a,GREEN),0);for(const[costKey,cost,gainKey,gain]of[['cattle',1,'vegetable',1],['vegetable',1,'cattle',1],['sheep',2,'vegetable',1],['vegetable',1,'sheep',2],['food',2,'grain',1],['grain',1,'food',2]] as const){const s=prepMake(GREEN,state=>{const p=state.players[0]!;Object.assign(p.resources,{food:0,grain:0,vegetable:0});garden(state,costKey==='sheep'?2:0,costKey==='cattle'?1:0);p.resources[costKey]=cost}),pending=boundary(s,GREEN),r=exchange(s,pending,GREEN,{[costKey]:cost},{[gainKey]:gain});assert.equal(r.state.players[0]!.resources[costKey],0);assert.equal(r.state.players[0]!.resources[gainKey],gain);assert.ok(!isCardPending(r,GREEN));assert.equal(r.state.round,9);assert.equal(r.state.players[1]!.resources[gainKey],pending.state.players[1]!.resources[gainKey]);save(`C103-N1-${costKey}-${gainKey}`,{a,pending,r})}})
  it('C103 N2 decline zero stock and card only in hand never exchange and a forged recipe leaves the live choice before legal retry',()=>{const s=prepMake(GREEN,state=>{Object.assign(state.players[0]!.resources,{food:0,grain:1})}),pending=boundary(s,GREEN),bad=assertRejectedUnchanged(s,()=>s.resolveChoice(0,'__invalid_green_recipe__')),declined=finish(s,pending,false);assert.equal(declined.state.players[0]!.resources.grain,1);assert.equal(declined.state.players[0]!.resources.food,0);for(const mode of['stock','hand']){const t=prepMake(GREEN,state=>Object.assign(state.players[0]!.resources,{food:0,grain:mode==='stock'?0:1}),mode!=='hand'),r=boundary(t,GREEN);assert.ok(!isCardPending(r,GREEN));assert.equal(r.state.players[0]!.resources.food,0);assert.equal(r.state.players[0]!.resources.grain,mode==='stock'?0:1);save(`C103-N2-${mode}`,r)}save('C103-N2',{pending,bad,declined})})
  it('C103 N3 a trade cannot trigger a second reciprocal trade or repeat during ordinary work in that round',()=>{const s=prepMake(GREEN,state=>Object.assign(state.players[0]!.resources,{food:2,grain:0})),pending=boundary(s,GREEN),r=exchange(s,pending,GREEN,{food:2},{grain:1});assert.equal(r.state.players[0]!.resources.grain,1);assert.equal(r.state.players[0]!.resources.food,0);const bad=assertRejectedUnchanged(s,()=>s.resolveChoice(0,'__old_green_recipe__')),mid=ok(s.takeAction(0,'meeting-place'));assert.equal(mid.state.players[0]!.resources.grain,1);assert.equal(mid.state.players[0]!.resources.food,0);save('C103-N3',{pending,r,bad,mid})})
})
