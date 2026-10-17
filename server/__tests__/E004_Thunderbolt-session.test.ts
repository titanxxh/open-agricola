import { describe, expect, it, afterEach } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/E/E004_Thunderbolt'
import '../../shared/cards/E/E070_CropRotationField'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit23Crop from './_helpers/audit/ae-negative-23-crop'

const CARD_ID = 'E004_Thunderbolt'
const CROP_ROTATION_FIELD = 'E070_CropRotationField'
const FIXED_HANDS = [
  { occupation: '__test_occupation_p1__', minor: CARD_ID },
  { occupation: '__test_occupation_p2__', minor: '__test_minor_p2__' },
  { occupation: '__test_occupation_p3__', minor: '__test_minor_p3__' },
  { occupation: '__test_occupation_p4__', minor: '__test_minor_p4__' },
]

const setup = () => {
  const session = new GameSession(404, undefined, { playerCount: 4 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 1
  state.roundPhase = 'work'
  state.players.forEach((entry, index) => {
    entry.occupationHand = [FIXED_HANDS[index]!.occupation]
    entry.minorHand = [FIXED_HANDS[index]!.minor]
    setWorkersAtHome(state, entry, index === 0 ? 2 : 0)
  })
  state.players[0]!.minorHand = [CARD_ID]
  session.loadState(state)
  return session
}

const buyThunderbolt = (session: GameSession) => {
  let response = session.takeAction(0, 'meeting-place')
  expect(response.ok, response.error).toBe(true)
  for (let step = 0; step < 6; step += 1) {
    if (!response.state.players[0]!.minorHand.includes(CARD_ID)) return response
    if (response.interaction.stateId !== 'wait') return response
    const card = response.interaction.request.options?.find((option) => option.value === CARD_ID)
    if (card) {
      response = session.resolveChoice(0, card.value)
      continue
    }
    const improvement = response.interaction.request.options?.find(
      (option) => option.value.startsWith('action-improvement-'),
    )
    if (improvement) {
      response = session.resolveChoice(0, improvement.value)
      continue
    }
    const proceed = response.interaction.request.options?.find((option) => option.value.startsWith('flow-'))
    if (!proceed) return response
    response = session.resolveChoice(0, proceed.value)
  }
  return response
}

const enterSelection = (session: GameSession, response: SessionResponse) => {
  let current = response
  for (let step = 0; step < 4; step += 1) {
    if (current.interaction.stateId !== 'wait') return current
    if (current.interaction.request.kind === 'selection') return current
    const proceed = current.interaction.request.options?.find((option) => option.value.startsWith('flow-'))
    if (!proceed) return current
    current = session.resolveChoice(0, proceed.value)
  }
  return current
}

describe('E004 Thunderbolt native session', () => {
  it('removes all grain from exactly one selected field and gains 2 wood per grain', () => {
    const session = setup()
    session.state.players[0]!.fields = [
      { row: 0, col: 2, stacks: [{ kind: 'grain', remaining: 3 }] },
      { row: 0, col: 3, stacks: [{ kind: 'vegetable', remaining: 2 }] },
      { row: 1, col: 2, stacks: [{ kind: 'grain', remaining: 1 }] },
    ]
    session.loadState(session.state)
    const woodBefore = session.state.players[0]!.resources.wood

    let response = enterSelection(session, buyThunderbolt(session))
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') return
    expect(response.interaction.request.kind).toBe('selection')
    const eventCount = response.state.events.length
    const logCount = response.state.log.length
    const scoresBefore = structuredClone(response.scores)

    response = session.commitSelectionChoice(0, { positions: [{ row: 0, col: 2 }] })

    expect(response.ok, response.error).toBe(true)
    const player = response.state.players[0]!
    expect(player.resources.wood).toBe(woodBefore + 6)
    expect(player.fields.find((field) => field.row === 0 && field.col === 2)?.stacks).toEqual([])
    expect(player.fields.find((field) => field.row === 0 && field.col === 3)?.stacks).toEqual([
      { kind: 'vegetable', remaining: 2 },
    ])
    expect(player.fields.find((field) => field.row === 1 && field.col === 2)?.stacks).toEqual([
      { kind: 'grain', remaining: 1 },
    ])
    expect(response.state.players[1]!.minorHand).toContain(CARD_ID)
    expect(response.state.events.slice(eventCount)).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'farm.cropRemoved',
        sourceCardId: CARD_ID,
        reason: 'cardEffect',
        crops: [{
          location: { kind: 'field', playerId: player.id, row: 0, col: 2 },
          crop: 'grain',
          amount: 3,
        }],
      }),
    ]))
    expect(response.state.log).toEqual(expect.arrayContaining([
      expect.objectContaining({
        key: 'log.farmCropRemoved',
        params: expect.objectContaining({ player: 'Player 1', crops: { grain: 3 } }),
      }),
    ]))
    expect(response.state.log.length).toBeGreaterThan(logCount)
    expect(response.scores.map((score) => score.playerId)).toEqual(scoresBefore.map((score) => score.playerId))
  })

  it('allows declining without changing any grain field', () => {
    const session = setup()
    session.state.players[0]!.fields = [
      { row: 0, col: 2, stacks: [{ kind: 'grain', remaining: 2 }] },
    ]
    session.loadState(session.state)
    const woodBefore = session.state.players[0]!.resources.wood

    let response = buyThunderbolt(session)
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') return
    expect(response.interaction.request.options?.some((option) => option.value === '__skip__')).toBe(true)
    const eventCount = response.state.events.length
    const scoresBefore = structuredClone(response.scores)
    response = session.resolveChoice(0, '__skip__')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.wood).toBe(woodBefore)
    expect(response.state.players[0]!.fields[0]!.stacks).toEqual([{ kind: 'grain', remaining: 2 }])
    expect(response.state.players[1]!.minorHand).toContain(CARD_ID)
    expect(response.state.events.slice(eventCount).some((event) => event.type === 'farm.cropRemoved')).toBe(false)
    expect(response.state.log.some((entry) => entry.key === 'log.farmCropRemoved')).toBe(false)
    expect(response.scores).toEqual(scoresBefore)
  })

  it('does not allow buying with no grain field', () => {
    const session = setup()
    const woodBefore = session.state.players[0]!.resources.wood
    const scoresBefore = structuredClone(session.getState().scores)

    const response = buyThunderbolt(session)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.wood).toBe(woodBefore)
    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
    expect(response.state.players[1]!.minorHand).not.toContain(CARD_ID)
    expect(response.interaction.stateId === 'wait' ? response.interaction.request.kind : response.interaction.stateId)
      .not.toBe('selection')
    expect(response.state.events.some((event) => event.type === 'farm.cropRemoved')).toBe(false)
    expect(response.state.log.some((entry) => entry.key === 'log.farmCropRemoved')).toBe(false)
    expect(response.scores).toEqual(scoresBefore)
  })

  it('removes E070 grain and offers its opposite-crop sow', () => {
    const session = setup()
    const player = session.state.players[0]!
    player.minorPlayed.push(CROP_ROTATION_FIELD)
    player.cardStates[CROP_ROTATION_FIELD] = {
      extraData: { cardFieldStacks: [{ crop: 'grain', remaining: 2 }] },
    }
    player.fields = [{ row: 0, col: 2, stacks: [] }]
    player.resources.vegetable = 1
    session.loadState(session.state)
    const woodBefore = player.resources.wood
    const scoresBefore = structuredClone(session.getState().scores)

    let response = enterSelection(session, buyThunderbolt(session))

    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') return
    expect(response.interaction.request.kind).toBe('selection')
    expect(response.interaction.request.selection?.selectablePositions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ row: -1, col: 5070, sourceCard: CROP_ROTATION_FIELD }),
      ]),
    )
    const eventCount = response.state.events.length
    const logCount = response.state.log.length

    response = session.commitSelectionChoice(0, { positions: [{ row: -1, col: 5070 }] })

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.wood).toBe(woodBefore + 4)
    expect(response.state.players[0]!.resources.vegetable).toBe(1)
    expect(response.state.players[0]!.cardStates[CROP_ROTATION_FIELD]?.extraData?.cardFieldStacks).toEqual([null])
    expect(response.scores).toEqual(scoresBefore)
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') return
    expect(response.interaction.promptKey).toBe('ui.interactionOptionalAction')
    const sowOption = response.interaction.request.options?.find(
      (option) => option.value !== '__skip__' && option.sourceCard === CROP_ROTATION_FIELD,
    )
    expect(sowOption).toBeDefined()

    response = session.resolveChoice(0, sowOption!.value)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.vegetable).toBe(0)
    expect(response.state.players[0]!.cardStates[CROP_ROTATION_FIELD]?.extraData?.cardFieldStacks).toEqual([
      { crop: 'vegetable', remaining: 2 },
    ])
    expect(response.state.players[0]!.fields[0]!.stacks).toEqual([])
    expect(response.state.players[1]!.minorHand).toContain(CARD_ID)
    expect(response.state.events.slice(eventCount)).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'farm.cropRemoved',
        sourceCardId: CARD_ID,
        reason: 'cardEffect',
        crops: [{
          location: { kind: 'card', playerId: player.id, cardId: CROP_ROTATION_FIELD },
          crop: 'grain',
          amount: 2,
        }],
      }),
      expect.objectContaining({
        type: 'farm.sown',
        sourceCardId: CROP_ROTATION_FIELD,
        sows: [{
          location: { kind: 'field', playerId: player.id, row: -1, col: 5070 },
          crop: 'vegetable',
          added: 2,
        }],
      }),
    ]))
    expect(response.state.log).toEqual(expect.arrayContaining([
      expect.objectContaining({
        key: 'log.farmCropRemoved',
        params: expect.objectContaining({ player: 'Player 1', crops: { grain: 2 } }),
      }),
      expect.objectContaining({ key: 'log.sow', params: { player: 'Player 1' } }),
    ]))
    expect(response.state.log.length).toBeGreaterThan(logCount)
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId === 'wait') {
      expect(response.interaction.request.kind).toBe('confirm-next-player')
    }
    expect(response.scores.map((score) => score.playerId)).toEqual(scoresBefore.map((score) => score.playerId))
    expect(response.scores[0]!.categories.find((category) => category.key === 'vegetables')?.quantity).toBe(0)
    expect(response.scores[0]!.total).toBe(scoresBefore[0]!.total - 2)
  })

  it('completes E070 removal without a sow interaction when vegetable is unavailable', () => {
    const session = setup()
    const player = session.state.players[0]!
    player.minorPlayed.push(CROP_ROTATION_FIELD)
    player.cardStates[CROP_ROTATION_FIELD] = {
      extraData: { cardFieldStacks: [{ crop: 'grain', remaining: 1 }] },
    }
    player.resources.vegetable = 0
    session.loadState(session.state)
    const woodBefore = player.resources.wood
    const scoresBefore = structuredClone(session.getState().scores)

    let response = enterSelection(session, buyThunderbolt(session))
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') return
    const eventCount = response.state.events.length
    const logCount = response.state.log.length

    response = session.commitSelectionChoice(0, { positions: [{ row: -1, col: 5070 }] })

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.wood).toBe(woodBefore + 2)
    expect(response.state.players[0]!.resources.vegetable).toBe(0)
    expect(response.state.players[0]!.cardStates[CROP_ROTATION_FIELD]?.extraData?.cardFieldStacks).toEqual([null])
    expect(response.state.events.slice(eventCount)).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'farm.cropRemoved', reason: 'cardEffect' }),
    ]))
    expect(response.state.log).toEqual(expect.arrayContaining([
      expect.objectContaining({
        key: 'log.farmCropRemoved',
        params: expect.objectContaining({ player: 'Player 1', crops: { grain: 1 } }),
      }),
    ]))
    expect(response.state.log.length).toBeGreaterThan(logCount)
    expect(response.state.events.slice(eventCount).some((event) => event.type === 'farm.sown')).toBe(false)
    expect(response.state.log.some((entry) => entry.key === 'log.sow')).toBe(false)
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId === 'wait') {
      expect(response.interaction.request.kind).toBe('confirm-next-player')
      expect(response.interaction.sourceCard).not.toBe(CROP_ROTATION_FIELD)
    }
    expect(response.state.players[1]!.minorHand).toContain(CARD_ID)
    expect(response.scores).toEqual(scoresBefore)
  })
})

describe('ae-negative-23-crop', () => {
  const { THUNDER, ROTATION, sessions, save, ok, setup, finish, menu, FIRST, SECOND, THIRD, make, cropMenu } = audit23Crop
  afterEach(()=>sessions.splice(0).forEach(s=>s.dispose()))
  it('E004 N1 actual purchase removes all grain from one field for twice as much wood and preserves other crop stacks',()=>{const s=make(THUNDER,0,0,true,true);const a=cropMenu(s,THUNDER,'selection');for(const positions of[[FIRST,SECOND],[THIRD],[{row:99,col:99}]])assertRejectedUnchanged(s,()=>s.commitSelectionChoice(0,{positions}));assertRejectedUnchanged(s,()=>s.commitSelectionChoice(1,{positions:[FIRST]}));const r=finish(s,ok(s.commitSelectionChoice(0,{positions:[FIRST]})),false);assert.equal(r.state.players[0]!.resources.wood,6);assert.equal(r.state.players[0]!.resources.grain,0);assert.deepEqual(r.state.players[0]!.fields.map(f=>f.stacks),[[],[{kind:'grain',remaining:1}],[{kind:'vegetable',remaining:2}]]);assert.ok(r.state.log.some(e=>e.key==='log.farmCropRemoved'));assert.ok(r.state.players[1]!.minorHand.includes(THUNDER));save('E004-N1',{a,r})})
  it('E004 N2 no grain field refuses purchase while decline preserves entire grain stack and wood',()=>{const s=make(THUNDER,0,1),pending=menu(s),rejected=assertRejectedUnchanged(s,()=>s.resolveChoice(0,THUNDER)),legal=finish(s,ok(s.resolveChoice(0,'B004_WoodPile')));assert.ok(legal.state.players[0]!.minorHand.includes(THUNDER));const d=make(THUNDER,0,0,true),m=menu(d),chosen=ok(d.resolveChoice(0,THUNDER)),r=finish(d,chosen,false);assert.equal(r.state.players[0]!.resources.wood,0);assert.deepEqual(r.state.players[0]!.fields[0]!.stacks,[{kind:'grain',remaining:3}]);save('E004-N2',{pending,rejected,legal,m,chosen,r})})
  it('E004 N3 whole purchase undo restores removed crop stack wood and passing hands before one replay',()=>{const s=make(THUNDER,0,0,true),a=cropMenu(s,THUNDER,'selection'),r=finish(s,ok(s.commitSelectionChoice(0,{positions:[FIRST]})),false),undone=ok(s.undoAction());assert.equal(undone.state.players[0]!.resources.wood,0);assert.deepEqual(undone.state.players[0]!.fields[0]!.stacks,[{kind:'grain',remaining:3}]);assert.ok(undone.state.players[0]!.minorHand.includes(THUNDER));const b=cropMenu(s,THUNDER,'selection'),retry=finish(s,ok(s.commitSelectionChoice(0,{positions:[FIRST]})),false);assert.equal(retry.state.players[0]!.resources.wood,6);save('E004-N3',{a,r,undone,b,retry})})
  it('E004 N4 actual card field grain removal enables opposite crop only on the emptied Crop Rotation Field',()=>{const s=setup(THUNDER,8,state=>{const p=state.players[0]!;p.fields=[{...FIRST,stacks:[]}];p.minorPlayed=[ROTATION];p.occupationPlayed=['A110_Roughcaster'];p.cardStates[ROTATION]={extraData:{cardFieldStacks:[{crop:'grain',remaining:2}]}};p.resources.vegetable=1}),a=cropMenu(s,THUNDER,'selection');assert.ok(a.r.interaction.stateId==='wait'&&a.r.interaction.request.kind==='selection');assert.equal(a.r.interaction.request.selection.kind,'farm-position');assert.ok(a.r.interaction.request.selection.kind==='farm-position');const position=a.r.interaction.request.selection.selectablePositions[0]!;let r=ok(s.commitSelectionChoice(0,{positions:[position]}));assert.equal(r.state.players[0]!.resources.wood,4);const rotationPending=r;r=finish(s,r,true);assert.equal(r.state.players[0]!.resources.vegetable,0);assert.deepEqual(r.state.players[0]!.cardStates[ROTATION]!.extraData!.cardFieldStacks,[{crop:'vegetable',remaining:2}]);assert.deepEqual(r.state.players[0]!.fields[0]!.stacks,[]);save('E004-N4',{a,rotationPending,r,limitation:'Sole opposite crop target auto-sows after accepting Crop Rotation Field; no separate farm-selection request exists'})})
})
