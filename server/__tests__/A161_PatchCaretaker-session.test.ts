import { describe, expect, it, afterEach } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import '../../shared/cards/A/A161_PatchCaretaker'
import assert from 'node:assert/strict'
import { assertEmptyAccumulationRejected, assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit17Sequence from './_helpers/audit/ae-negative-17-sequence'

const CARD_ID = 'A161_PatchCaretaker'

const FILLER = '__test_placeholder__'

const setup = ({ played = true, actor = 0 }: { played?: boolean; actor?: number } = {}) => {
  const session = new GameSession(6161, undefined, { playerCount: 4 })
  const state = session.getState().state
  stabilizeRandomHands(state.players)
  state.currentPlayerIndex = actor
  state.round = 14
  state.roundPhase = 'work'
  state.actionSpaces.forEach((space) => { space.takenBy = [] })
  state.players.forEach((player) => {
    setWorkersAtHome(state, player, 2)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.resources = {
      ...player.resources, wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0,
      vegetable: 0, sheep: 0, boar: 0, cattle: 0,
    }
  })
  const owner = state.players[0]!
  owner.occupationHand = played ? [FILLER] : [CARD_ID]
  owner.occupationPlayed = played ? [CARD_ID] : []
  for (const [id, type] of [
    ['forest', 'wood'], ['grove', 'wood'], ['clay-pit', 'clay'], ['reed-bank', 'reed'],
    ['fishing', 'food'], ['traveling-players', 'food'],
  ] as const) {
    const space = state.actionSpaces.find((candidate) => candidate.id === id)
    if (!space) throw new Error(`missing ${id}`)
    space.resources[type] = 1
  }
  session.loadState(state)
  return session
}

const playOccupation = (session: GameSession) => {
  const response = session.takeAction(0, 'lessons')
  if (!response.state.players[0]!.occupationHand.includes(CARD_ID)) return response
  if (response.interaction.stateId !== 'wait') return response
  const option = response.interaction.request.options?.find((candidate) => candidate.value === CARD_ID)
  expect(option).toBeDefined()
  return session.resolveChoice(response.interaction.playerIndex, option!.value)
}

const takeAndConfirm = (session: GameSession, actor: number, actionId: string): SessionResponse => {
  let response = session.takeAction(actor, actionId)
  expect(response.ok, response.error).toBe(true)
  expect(response.interaction).toMatchObject({
    stateId: 'wait', request: { kind: 'confirm-next-player' },
  })
  if (response.interaction.stateId !== 'wait') return response
  response = session.resolveChoice(response.interaction.playerIndex, 'confirm')
  return response
}

describe('A161 Patch Caretaker parity', () => {
  it('A161 S1: Patch Caretaker is played as the first occupation in a four-player game', () => {
    const response = playOccupation(setup({ played: false }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.food).toBe(0)
  })

  it('A161 S2: the owners second wood accumulation space in one work phase gains one vegetable', () => {
    const session = setup()
    takeAndConfirm(session, 0, 'forest')
    takeAndConfirm(session, 1, 'clay-pit')
    takeAndConfirm(session, 2, 'day-laborer')
    takeAndConfirm(session, 3, 'fishing')

    const response = session.takeAction(0, 'grove')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.vegetable).toBe(1)
  })

  it('A161 S3: two owner accumulation spaces for different goods grant no vegetable', () => {
    const session = setup()
    takeAndConfirm(session, 0, 'forest')
    takeAndConfirm(session, 1, 'reed-bank')
    takeAndConfirm(session, 2, 'fishing')
    takeAndConfirm(session, 3, 'traveling-players')

    const response = session.takeAction(0, 'clay-pit')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.vegetable).toBe(0)
  })

  it('A161 S4: the owners first accumulation space grants no vegetable', () => {
    const response = setup().takeAction(0, 'forest')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.vegetable).toBe(0)
  })

  it('A161 S5: an opponents earlier wood accumulation does not count for the owner', () => {
    const session = setup({ actor: 1 })
    takeAndConfirm(session, 1, 'forest')
    takeAndConfirm(session, 2, 'clay-pit')
    takeAndConfirm(session, 3, 'day-laborer')

    const response = session.takeAction(0, 'grove')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.vegetable).toBe(0)
  })
})

describe('ae-negative-17-sequence', () => {
  const { PATCH, sessions, save, ok, setup, turn, patch } = audit17Sequence
  afterEach(()=>sessions.splice(0).forEach(s=>s.dispose()))
  it('A161 N1 second owner wood or food accumulation grants one vegetable only for nonempty entry',()=>{for(const[first,second]of[['forest','grove'],['fishing','traveling-players']]as const)for(const empty of[false,true]){if(empty){const blocked=setup(PATCH,state=>{const target=state.actionSpaces.find(a=>a.id===first)!;for(const key of['wood','food']as const)if(target.gainPerRound?.[key])target.resources[key]=0});const rejected=assertEmptyAccumulationRejected(blocked,0,first);assert.equal(rejected.state.players[0]!.resources.vegetable,0);save(`A161-N1-${first}-empty-first`,rejected)}const {start,r}=patch(first,second,true,empty);assert.equal(r.state.players[0]!.resources.vegetable,empty?0:1);assert.equal(r.state.players[1]!.resources.vegetable,0);save(`A161-N1-${first}-${empty}`,{start,r})}})
  it('A161 N2 different goods non accumulation earlier action and hand cannot grant vegetable',()=>{for(const[first,second,played]of[['forest','clay-pit',true],['grain-seeds','grove',true],['forest','grove',false]]as const){const s=setup(PATCH,undefined,played);const initial=turn(s,0,first);for(const[actor,space]of[[1,'reed-bank'],[2,'day-laborer'],[3,'fishing']]as const)turn(s,actor,space);const r=turn(s,0,second);assert.equal(r.state.players[0]!.resources.vegetable,0);save(`A161-N2-${first}-${played}`,{initial,r})}})
  it('A161 N3 actual opponent earlier wood never counts for owners first wood action',()=>{const s=setup(PATCH);turn(s,0,'grain-seeds');const opponent=turn(s,1,'forest');turn(s,2,'day-laborer');turn(s,3,'fishing');const r=turn(s,0,'grove');assert.equal(r.state.players[0]!.resources.vegetable,0);save('A161-N3',{opponent,r})})
  it('A161 N4 whole second action undo restores vegetable and one retry grants only once',()=>{const {s,r}=patch('forest','grove');assertRejectedUnchanged(s,()=>s.takeAction(0,'grove'));const undone=ok(s.undoAction());assert.equal(undone.state.players[0]!.resources.vegetable,0);const retry=turn(s,0,'grove');assert.equal(retry.state.players[0]!.resources.vegetable,1);save('A161-N4',{r,undone,retry})})
})
