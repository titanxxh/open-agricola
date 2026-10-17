import { describe, expect, it, afterEach } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { isCardFlagged, setCardFlag } from '../../shared/cards/helpers/card-state'
import { markAllWorkersUsed, setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/C/C084_PerennialRye'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit43Harvest from './_helpers/audit/ae-negative-43-harvest'

const CARD_ID = 'C084_PerennialRye'
const ANYTIME_ID = 'C84-perennial-rye-anytime'
const FILLER = '__test_placeholder__'

type SetupOptions = {
  played?: boolean
  food?: number
  grain?: number
  occupations?: number
  round?: number
  sheep?: number
  boar?: number
  flagged?: boolean
}

const setup = ({
  played = false, food = 1, grain = 1, occupations = 2, round = 2, sheep = 2, boar = 0,
  flagged = false,
}: SetupOptions = {}) => {
  const session = new GameSession(5084, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = round
  state.roundPhase = 'work'
  state.availableMajorImprovements = []
  state.players.forEach((player) => {
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.resources = {
      ...player.resources, wood: 0, clay: 0, reed: 0, stone: 0, food: 20, grain: 0,
      vegetable: 0, sheep: 0, boar: 0, cattle: 0,
    }
    player.pastures = []
    player.stableTiles = []
    setWorkersAtHome(state, player, 2)
  })
  const player = state.players[0]!
  player.minorHand = played ? [FILLER] : [CARD_ID]
  player.minorPlayed = played ? [CARD_ID] : []
  player.occupationPlayed = Array.from({ length: occupations }, (_, index) => `STUB_OCC_${index}`)
  player.resources.food = food
  player.resources.grain = grain
  player.resources.sheep = sheep
  player.resources.boar = boar
  if (sheep > 0) {
    player.stableTiles.push({ row: 0, col: 2 })
    player.pastures.push({
      id: 'sheep-pasture', size: 1, tiles: [{ row: 0, col: 2 }], stables: 1,
      animalType: 'sheep', animalCount: sheep,
    })
  }
  if (boar > 0) {
    player.stableTiles.push({ row: 0, col: 3 })
    player.pastures.push({
      id: 'boar-pasture', size: 1, tiles: [{ row: 0, col: 3 }], stables: 1,
      animalType: 'boar', animalCount: boar,
    })
  }
  if (flagged) setCardFlag(player, CARD_ID, true)
  session.loadState(state)
  return session
}

const enterMinor = (session: GameSession) => {
  let response = session.takeAction(0, 'major-improvement')
  if (response.interaction.stateId !== 'wait') return response
  const improvement = response.interaction.request.options?.find((candidate) =>
    candidate.value.startsWith('action-improvement-'))
  if (improvement) response = session.resolveChoice(response.interaction.playerIndex, improvement.value)
  return response
}

const play = (session: GameSession) => {
  let response = enterMinor(session)
  if (!response.state.players[0]!.minorHand.includes(CARD_ID)) return response
  if (response.interaction.stateId !== 'wait') return response
  const card = response.interaction.request.options?.find((candidate) => candidate.value === CARD_ID)
  if (card) response = session.resolveChoice(response.interaction.playerIndex, card.value)
  return response
}

const offered = (response: SessionResponse) => response.interaction.stateId === 'wait'
  && (response.interaction.request.options?.some((candidate) => candidate.value === CARD_ID) ?? false)

const enterActiveInteraction = (session: GameSession, playerIndex = 0) => {
  const response = session.takeAction(playerIndex, 'farmland')
  expect(response.ok, response.error).toBe(true)
  return response
}

const anytimeOffered = (response: SessionResponse) =>
  response.interaction.anytimeActions.some((action) => action.id === ANYTIME_ID)

const resolveAnimalReorganization = (
  session: GameSession,
  response: SessionResponse,
  sheep: number,
  boar: number,
) => {
  expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'animal-reorg' } })
  if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'animal-reorg') {
    throw new Error('expected native animal reorganization')
  }
  const zones = []
  if (sheep > 0) {
    zones.push({
      id: 'sheep-pasture', zoneType: 'pasture' as const, animalType: 'sheep' as const, animalCount: sheep,
    })
  }
  if (boar > 0) {
    zones.push({
      id: 'boar-pasture', zoneType: 'pasture' as const, animalType: 'boar' as const, animalCount: boar,
    })
  }
  return session.resolveChoice(response.interaction.playerIndex, 'confirm', zones)
}

const usePerennialRye = (session: GameSession, animal: 'sheep' | 'boar' = 'sheep') => {
  const active = enterActiveInteraction(session)
  expect(anytimeOffered(active)).toBe(true)
  let response = session.takeAnytimeAction(0, ANYTIME_ID)
  expect(response.ok, response.error).toBe(true)
  if (response.interaction.stateId === 'wait' && response.interaction.request.kind !== 'animal-reorg') {
    const option = response.interaction.request.options?.find((candidate) =>
      JSON.stringify(candidate).toLowerCase().includes(animal))
    expect(option).toBeDefined()
    response = session.resolveChoice(response.interaction.playerIndex, option!.value)
  }
  const player = response.state.players[0]!
  return resolveAnimalReorganization(
    session, response,
    player.resources.sheep, player.resources.boar,
  )
}

describe('C084 Perennial Rye parity', () => {
  it('C084 S1: two occupations and one food play Perennial Rye', () => {
    const response = play(setup({ sheep: 0 }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.food).toBe(0)
  })

  it('C084 S2: one occupation keeps Perennial Rye unavailable without spending food', () => {
    const response = enterMinor(setup({ occupations: 1, sheep: 0 }))

    expect(offered(response)).toBe(false)
    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.food).toBe(1)
  })

  it('C084 S3: lacking food keeps Perennial Rye unavailable', () => {
    const response = enterMinor(setup({ food: 0, sheep: 0 }))

    expect(offered(response)).toBe(false)
    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.food).toBe(0)
  })

  it('C084 S4: in a non-harvest round one grain breeds one sheep and marks the card used', () => {
    const response = usePerennialRye(setup({ played: true }))
    const player = response.state.players[0]!

    expect(response.ok, response.error).toBe(true)
    expect(player.resources.grain).toBe(0)
    expect(player.resources.sheep).toBe(3)
    expect(isCardFlagged(player, CARD_ID)).toBe(true)
  })

  it('C084 S5: Perennial Rye cannot be used a second time in the same round', () => {
    const session = setup({ played: true, grain: 2 })
    const response = usePerennialRye(session)

    expect(anytimeOffered(response)).toBe(false)
    expect(session.takeAnytimeAction(0, ANYTIME_ID).ok).toBe(false)
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 1, sheep: 3 })
  })

  it('C084 S6: Perennial Rye is unavailable in a harvest round', () => {
    const session = setup({ played: true, round: 4 })
    const response = enterActiveInteraction(session)

    expect(anytimeOffered(response)).toBe(false)
    expect(session.takeAnytimeAction(0, ANYTIME_ID).ok).toBe(false)
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 1, sheep: 2 })
  })

  it('C084 S7: Perennial Rye is unavailable without grain or a breedable animal type', () => {
    const noGrain = enterActiveInteraction(setup({ played: true, grain: 0 }))
    const oneSheep = enterActiveInteraction(setup({ played: true, sheep: 1 }))

    expect(anytimeOffered(noGrain)).toBe(false)
    expect(anytimeOffered(oneSheep)).toBe(false)
  })

  it('C084 S8: with sheep and pigs breedable exactly one selected type breeds', () => {
    const response = usePerennialRye(setup({ played: true, sheep: 2, boar: 2 }), 'boar')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 0, sheep: 2, boar: 3 })
    expect(isCardFlagged(response.state.players[0]!, CARD_ID)).toBe(true)
  })

  it('C084 S9: the used marker clears at the next round start', () => {
    const session = setup({ played: true, grain: 2, flagged: true })
    const blocked = enterActiveInteraction(session)
    expect(anytimeOffered(blocked)).toBe(false)
    let completed = session.commitSelectionChoice(0, { tile: { row: 0, col: 0 } })
    expect(completed.ok, completed.error).toBe(true)
    if (completed.interaction.stateId === 'wait'
      && completed.interaction.request.kind === 'confirm-next-player') {
      completed = session.resolveChoice(completed.interaction.request.nextPlayerIndex, 'confirm')
      expect(completed.ok, completed.error).toBe(true)
    }
    session.state.players.forEach((player) => markAllWorkersUsed(session.state, player))

    const nextRound = session.performRoundEnd()
    expect(nextRound.ok, nextRound.error).toBe(true)
    expect(nextRound.state.round).toBe(3)
    expect(isCardFlagged(nextRound.state.players[0]!, CARD_ID)).toBe(false)

    const active = enterActiveInteraction(session, nextRound.state.currentPlayerIndex)
    expect(anytimeOffered(active)).toBe(true)
  })
})

describe('ae-negative-43-harvest', () => {
  const { RYE, sessions, save, ok, make, menu, purchase, yard, nextRound, rye } = audit43Harvest
  afterEach(()=>sessions.splice(0).forEach(s=>s.dispose()))
  it('C084 N1 real two occupation purchase pays one food and lesser prerequisite rejects before free alternative',()=>{const s=make(RYE,false,state=>{state.round=2;state.players[0]!.resources.food=1;state.players[0]!.occupationPlayed=['A110_Roughcaster','A116_WoodCutter']}),a=purchase(s,RYE);assert.equal(a.r.state.players[0]!.resources.food,0);for(const mode of['occupation','food']){const t=make(RYE,false,state=>{state.round=2;state.players[0]!.resources.food=mode==='food'?0:1;state.players[0]!.occupationPlayed=mode==='food'?['A110_Roughcaster','A116_WoodCutter']:['A110_Roughcaster']}),pending=menu(t),bad=assertRejectedUnchanged(t,()=>t.resolveChoice(0,RYE)),legal=ok(t.resolveChoice(0,'B004_WoodPile'));assert.ok(legal.state.players[0]!.minorHand.includes(RYE));save(`C084-N1-${mode}`,{pending,bad,legal})}save('C084-N1-buy',a)})
  it('C084 N2 exactly one species breeds per nonharvest round and repeat refuses before natural next round reset',()=>{const s=make(RYE,true,state=>{state.round=2;yard(state,2,2);state.players[0]!.resources.grain=2}),r=rye(s,'boar');assert.equal(r.state.players[0]!.resources.sheep,2);assert.equal(r.state.players[0]!.resources.boar,3);assert.equal(r.state.players[0]!.resources.grain,1);assert.equal(r.state.roundPhase,'work');assert.deepEqual(r.state.players[0]!.pastures.map(p=>[p.animalType,p.animalCount]),[['sheep',2],['boar',3]]);const bad=assertRejectedUnchanged(s,()=>s.takeAnytimeAction(0,'C84-perennial-rye-anytime')),three=nextRound(s,3);const again=rye(s);assert.equal(again.state.players[0]!.resources.grain,0);assert.equal(again.state.players[0]!.resources.sheep,3);assert.equal(again.state.players[0]!.resources.boar,3);save('C084-N2',{r,bad,three,again})})
  it('C084 N3 harvest rounds zero grain and one parent forbid anytime before a legal ordinary action',()=>{for(const mode of['harvest','grain','parent']){const s=make(RYE,true,state=>{state.round=mode==='harvest'?7:2;yard(state,mode==='parent'?1:2);state.players[0]!.resources.grain=mode==='grain'?0:1}),bad=assertRejectedUnchanged(s,()=>s.takeAnytimeAction(0,'C84-perennial-rye-anytime')),legal=ok(s.takeAction(0,'reed-bank'));assert.equal(legal.state.players[0]!.resources.sheep,mode==='parent'?1:2);assert.equal(legal.state.players[0]!.resources.grain,mode==='grain'?0:1);save(`C084-N3-${mode}`,{bad,legal})}})
})
