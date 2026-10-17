import { describe, expect, it, afterEach } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import '../../shared/cards/B/B016_MiningHammer'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit18Construction from './_helpers/audit/ae-negative-18-construction'

const CARD_ID = 'B016_MiningHammer'

const FILLER = '__test_placeholder__'

const setup = ({
  played = true, fullFarmyard = false,
}: { played?: boolean; fullFarmyard?: boolean } = {}) => {
  const session = new GameSession(6016, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 14
  state.roundPhase = 'work'
  state.availableMajorImprovements = []
  state.players.forEach((player) => {
    setWorkersAtHome(state, player, 2)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.fields = []
    player.pastures = []
    player.stableTiles = []
    player.resources = {
      ...player.resources,
      wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0,
      sheep: 0, boar: 0, cattle: 0, begging: 0,
    }
  })
  const owner = state.players[0]!
  owner.minorHand = played ? [FILLER] : [CARD_ID]
  owner.minorPlayed = played ? [CARD_ID] : []
  if (played) {
    owner.houseType = 'wood'
    owner.resources = { ...owner.resources, wood: 5, clay: 2, reed: 1 }
  } else {
    owner.resources.wood = 1
  }
  if (fullFarmyard) {
    const occupied = new Set(owner.roomTiles.map((tile) => `${tile.row},${tile.col}`))
    owner.fields = Array.from({ length: 3 }, (_, row) =>
      Array.from({ length: 5 }, (_, col) => ({ row, col })))
      .flat()
      .filter((tile) => !occupied.has(`${tile.row},${tile.col}`))
      .map((tile) => ({ ...tile, stacks: [] }))
  }
  session.loadState(state)
  return session
}

const options = (response: SessionResponse) => response.interaction.stateId === 'wait'
  ? response.interaction.request.options ?? []
  : []

const enterMinor = (session: GameSession) => {
  let response = session.takeAction(0, 'meeting-place')
  if (response.interaction.stateId !== 'wait') return response
  const improvement = options(response).find((option) =>
    option.value.startsWith('action-improvement-'))
  if (improvement) response = session.resolveChoice(response.interaction.playerIndex, improvement.value)
  return response
}

const playMinor = (session: GameSession) => {
  let response = enterMinor(session)
  if (!response.state.players[0]!.minorHand.includes(CARD_ID)) return response
  if (response.interaction.stateId === 'wait') {
    const card = options(response).find((option) => option.value === CARD_ID)
    if (card) response = session.resolveChoice(response.interaction.playerIndex, card.value)
  }
  return response
}

const renovate = (session: GameSession) => session.takeAction(0, 'house-redevelopment')

const acceptStable = (session: GameSession, response: SessionResponse) => {
  if (response.interaction.stateId !== 'wait') return response
  const option = options(response).find((candidate) =>
    candidate.sourceCard === CARD_ID && candidate.value !== '__skip__')
  expect(option).toBeDefined()
  return session.resolveChoice(response.interaction.playerIndex, option!.value)
}

describe('B016 Mining Hammer parity', () => {
  it('B016 S1: paying one wood plays Mining Hammer and immediately gains one food', () => {
    const response = playMinor(setup({ played: false }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, food: 1 })
  })

  it('B016 S2: after renovating Mining Hammer builds one stable for free', () => {
    const session = setup()
    let response = acceptStable(session, renovate(session))
    expect(response.interaction).toMatchObject({
      stateId: 'wait', promptKey: 'ui.interactionStableSelect', sourceCard: CARD_ID,
    })
    if (response.interaction.stateId !== 'wait') return
    const stable = response.interaction.request.farm.selectableTiles[0]
    expect(stable).toBeDefined()
    response = session.commitSelectionChoice(response.interaction.playerIndex, { stables: [stable!] })

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.houseType).toBe('clay')
    expect(response.state.players[0]!.stableTiles).toEqual([stable])
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 5, clay: 0, reed: 0 })
  })

  it('B016 S3: the free stable after renovation may be declined', () => {
    const session = setup()
    const pending = renovate(session)
    expect(options(pending).some((option) => option.value === '__skip__')).toBe(true)

    const response = session.resolveChoice(pending.interaction.playerIndex, '__skip__')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.houseType).toBe('clay')
    expect(response.state.players[0]!.stableTiles).toEqual([])
    expect(response.state.players[0]!.resources.wood).toBe(5)
  })

  it('B016 S4: OA skips Mining Hammer when a full farmyard has no stable position', () => {
    const response = renovate(setup({ fullFarmyard: true }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.houseType).toBe('clay')
    expect(response.state.players[0]!.stableTiles).toEqual([])
    expect(response.state.players[0]!.resources.wood).toBe(5)
    expect(options(response).some((option) => option.sourceCard === CARD_ID)).toBe(false)
    expect(response.interaction.sourceCard).not.toBe(CARD_ID)
  })
})

describe('ae-negative-18-construction', () => {
  const { HAMMER, sessions, save, ok, setup, turn, choose, renovation, stable } = audit18Construction
  afterEach(()=>sessions.splice(0).forEach(s=>s.dispose()))
  it('B016 N1 real one wood purchase gains one food only once with no stable',()=>{const s=setup(HAMMER,state=>state.players[0]!.resources.wood=1,false);let pending=turn(s,0,'meeting-place');if(pending.interaction.stateId==='wait'&&pending.interaction.request.kind==='choice'){const o=pending.interaction.request.options.find(o=>o.value.startsWith('action-improvement-'));if(o)pending=ok(s.resolveChoice(0,o.value))}const r=ok(s.resolveChoice(0,HAMMER));assert.ok(r.state.players[0]!.minorPlayed.includes(HAMMER));assert.equal(r.state.players[0]!.resources.wood,0);assert.equal(r.state.players[0]!.resources.food,21);assert.equal(r.state.players[0]!.stableTiles.length,0);assertRejectedUnchanged(s,()=>s.resolveChoice(0,HAMMER));save('B016-N1',{pending,r})})
  it('B016 N2 either real renovation pays normal fee then exactly one stable costs zero wood',()=>{for(const type of['wood','clay']as const){const s=renovation(type),pending=turn(s,0,'house-redevelopment'),r=stable(s,pending);assert.equal(r.state.players[0]!.houseType,type==='wood'?'clay':'stone');assert.equal(r.state.players[0]!.resources.reed,0);assert.equal(r.state.players[0]!.resources[type==='wood'?'clay':'stone'],0);assert.equal(r.state.players[0]!.resources.wood,0);assert.equal(r.state.players[0]!.stableTiles.length,1);save(`B016-N2-${type}`,{pending,r})}})
  it('B016 N3 decline hand and full farm produce no additional stable after real renovation',()=>{for(const mode of['decline','hand','full']as const){const s=renovation('wood',mode!=='hand',state=>{if(mode==='full'){const p=state.players[0]!;p.fields=Array.from({length:3},(_,row)=>Array.from({length:5},(_,col)=>({row,col,stacks:[]}))).flat().filter(t=>!p.roomTiles.some(r=>r.row===t.row&&r.col===t.col))}});const pending=turn(s,0,'house-redevelopment'),r=choose(s,pending,undefined,false);assert.equal(r.state.players[0]!.houseType,'clay');assert.equal(r.state.players[0]!.stableTiles.length,0);assert.equal(r.state.players[0]!.resources.wood,0);save(`B016-N3-${mode}`,{pending,r})}})
  it('B016 N4 two stables illegal tile and wrong actor reject then one stable succeeds with undo',()=>{const s=renovation(),pending=choose(s,turn(s,0,'house-redevelopment'));assert.ok(pending.interaction.stateId==='wait'&&pending.interaction.request.kind==='farm-select');for(const tiles of[[{row:0,col:1},{row:0,col:2}],[{row:99,col:99}]])assertRejectedUnchanged(s,()=>s.commitSelectionChoice(0,{stables:tiles}));assertRejectedUnchanged(s,()=>s.commitSelectionChoice(1,{stables:[{row:0,col:1}]}));const r=stable(s,pending),undone=ok(s.undoAction());assert.equal(undone.state.players[0]!.houseType,'wood');assert.equal(undone.state.players[0]!.resources.clay,2);assert.equal(undone.state.players[0]!.resources.reed,1);assert.equal(undone.state.players[0]!.stableTiles.length,0);const retry=stable(s,turn(s,0,'house-redevelopment'));assert.equal(retry.state.players[0]!.stableTiles.length,1);save('B016-N4',{pending,r,undone,retry})})
})
