import { describe, expect, it, afterEach } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/A/A123_FrameBuilder'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit14Build from './_helpers/audit/ae-negative-14-build'

const CARD_ID = 'A123_FrameBuilder'

const setup = ({
  houseType = 'wood',
  resources = {},
  inHand = false,
}: {
  houseType?: 'wood' | 'clay' | 'stone'
  resources?: Partial<Record<'wood' | 'clay' | 'stone' | 'reed', number>>
  inHand?: boolean
} = {}) => {
  const session = new GameSession(123, undefined, { playerCount: 2 })
  const state = session.getState().state
  stabilizeRandomHands(state.players)
  state.currentPlayerIndex = 0
  state.round = 6
  const player = state.players[0]!
  setWorkersAtHome(state, player, 2)
  player.occupationHand = inHand ? [CARD_ID] : ['__test_placeholder__']
  player.occupationPlayed = inHand ? [] : [CARD_ID]
  player.houseType = houseType
  player.resources = {
    ...player.resources,
    wood: 0,
    clay: 0,
    stone: 0,
    reed: 0,
    ...resources,
  }
  session.loadState(state)
  return session
}

const chooseOption = (session: GameSession, response: SessionResponse, predicate: (option: NonNullable<SessionResponse['interaction']['request']['options']>[number]) => boolean) => {
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') return response
  const option = response.interaction.request.options?.find(predicate)
  expect(option).toBeDefined()
  return session.resolveChoice(0, option!.value)
}

const openRoomSelection = (session: GameSession) => {
  let response = session.takeAction(0, 'farm-expansion')
  if (
    response.interaction.stateId === 'wait'
    && response.interaction.request.options?.some((option) => option.labelKey === 'actions.construct.name')
  ) {
    response = chooseOption(session, response, (option) => option.labelKey === 'actions.construct.name')
  }
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') return response
  expect(response.interaction.request.farm.farmType).toBe('room')
  return response
}

const renovate = (session: GameSession) => {
  let response = session.takeAction(0, 'house-redevelopment')
  if (response.interaction.stateId === 'wait' && response.interaction.promptKey === 'ui.interactionChooseRenovationTarget') {
    response = session.resolveChoice(0, 'clay')
  }
  return response
}

describe('A123 Frame Builder parity', () => {
  it('A123 S1: playing Frame Builder through Lessons keeps the occupation in play', () => {
    const session = setup({ inHand: true })
    let response = session.takeAction(0, 'lessons')
    if (response.interaction.stateId === 'wait') {
      const option = response.interaction.request.options?.find((candidate) => candidate.value === CARD_ID)
      if (option) response = session.resolveChoice(0, option.value)
    }

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
  })

  it('A123 S2: each of two clay rooms can replace two clay with one wood', () => {
    const session = setup({ houseType: 'clay', resources: { clay: 6, wood: 2, reed: 4 } })
    const selection = openRoomSelection(session)
    if (selection.interaction.stateId !== 'wait' || selection.interaction.request.farm.farmType !== 'room') return
    const [roomA, roomB] = selection.interaction.request.farm.selectableTiles

    const response = session.commitSelectionChoice(0, { rooms: [roomA!, roomB!] })

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.rooms).toBe(4)
    expect(response.state.players[0]!.resources).toMatchObject({ clay: 0, wood: 0, reed: 0 })
  })

  it('A123 S3: a stone room can replace two stone with one wood', () => {
    const session = setup({ houseType: 'stone', resources: { stone: 3, wood: 1, reed: 2 } })
    const selection = openRoomSelection(session)
    if (selection.interaction.stateId !== 'wait' || selection.interaction.request.farm.farmType !== 'room') return
    const room = selection.interaction.request.farm.selectableTiles[0]!

    const response = session.commitSelectionChoice(0, { rooms: [room] })

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.rooms).toBe(3)
    expect(response.state.players[0]!.resources).toMatchObject({ stone: 0, wood: 0, reed: 0 })
  })

  it('A123 S4: renovation can replace two clay with one wood', () => {
    const response = renovate(setup({ resources: { wood: 1, reed: 1 } }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.houseType).toBe('clay')
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, reed: 0 })
  })

  it('A123 S5: renovation can decline the optional replacement', () => {
    const session = setup({ resources: { clay: 2, wood: 1, reed: 1 } })
    const payment = renovate(session)

    const response = chooseOption(session, payment, (option) => {
      const resources = option.labelParams?.resourcesPaid
      return resources?.clay === 2 && (resources.wood ?? 0) === 0
    })

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.houseType).toBe('clay')
    expect(response.state.players[0]!.resources).toMatchObject({ clay: 0, wood: 1, reed: 0 })
  })
})

describe('ae-negative-14-build', () => {
  const { FRAME, sessions, save, ok, setup, optional, renovation, startBuild, build } = audit14Build
  afterEach(()=>sessions.splice(0).forEach(s=>s.dispose()))
  it('A123 N1 each of one and two clay or stone rooms substitutes at most once per room',()=>{for(const material of['clay','stone'] as const)for(const count of[1,2]){const s=setup(FRAME,state=>{const p=state.players[0]!;p.houseType=material;Object.assign(p.resources,{wood:count,clay:0,stone:0,reed:2*count});p.resources[material]=3*count});const r=build(s,count);assert.equal(r.state.players[0]!.rooms,2+count);assert.equal(r.state.players[0]!.resources[material],0);assert.equal(r.state.players[0]!.resources.wood,0);assert.equal(r.state.players[0]!.resources.reed,0);save(`A123-N1-${material}-${count}`,r)}})
  it('A123 N2 extra wood cannot replace a second pair in one room and legal retry keeps cost exact',()=>{const s=setup(FRAME,state=>{const p=state.players[0]!;p.houseType='clay';Object.assign(p.resources,{wood:2,clay:4,reed:2})});startBuild(s);assertRejectedUnchanged(s,()=>s.commitSelectionChoice(0,{rooms:[{row:1,col:1},{row:2,col:1}]}));const r=optional(s,ok(s.commitSelectionChoice(0,{rooms:[{row:1,col:1}]})));assert.equal(r.state.players[0]!.rooms,3);assert.equal(r.state.players[0]!.resources.clay,1);assert.equal(r.state.players[0]!.resources.wood,1);save('A123-N2',r)})
  it('A123 N3 wood room and unplayed card use ordinary room costs without substitution',()=>{const wood=build(setup(FRAME,state=>Object.assign(state.players[0]!.resources,{wood:5,reed:2})),1);assert.equal(wood.state.players[0]!.resources.wood,0);const hand=build(setup(FRAME,state=>{state.players[0]!.houseType='clay';Object.assign(state.players[0]!.resources,{clay:5,wood:1,reed:2})},false),1);assert.equal(hand.state.players[0]!.resources.clay,0);assert.equal(hand.state.players[0]!.resources.wood,1);save('A123-N3',{wood,hand})})
  it('A123 N4 actual two room renovation trades exactly two material for one wood once',()=>{for(const material of['wood','clay'] as const){const s=setup(FRAME,state=>{const p=state.players[0]!;p.houseType=material;Object.assign(p.resources,{wood:1,clay:0,stone:0,reed:1})},true,14);const r=renovation(s);assert.equal(r.state.players[0]!.houseType,material==='wood'?'clay':'stone');assert.equal(r.state.players[0]!.resources.wood,0);assert.equal(r.state.players[0]!.resources.reed,0);save(`A123-N4-${material}`,r)}})
  it('A123 N5 rejected room actor target and whole undo cannot retain paid replacement or room',()=>{const s=setup(FRAME,state=>{state.players[0]!.houseType='clay';Object.assign(state.players[0]!.resources,{wood:1,clay:3,reed:2})});startBuild(s);assertRejectedUnchanged(s,()=>s.commitSelectionChoice(1,{rooms:[{row:1,col:1}]}));assertRejectedUnchanged(s,()=>s.commitSelectionChoice(0,{rooms:[{row:99,col:99}]}));const first=optional(s,ok(s.commitSelectionChoice(0,{rooms:[{row:1,col:1}]})));const undone=ok(s.undoAction());assert.equal(undone.state.players[0]!.rooms,2);assert.equal(undone.state.players[0]!.resources.clay,3);assert.equal(undone.state.players[0]!.resources.wood,1);const retry=build(s,1);assert.equal(retry.state.players[0]!.resources.wood,0);save('A123-N5',{first,undone,retry})})
})
