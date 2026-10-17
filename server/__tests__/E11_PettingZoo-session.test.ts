import { describe, expect, it, afterEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { computeAnimalZones } from '../../shared/domain/animal-zones'

import '../../shared/cards/E/E011_PettingZoo'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit27Holders from './_helpers/audit/ae-negative-27-holders'

describe('E011_PettingZoo session', () => {
  const setup = (options?: {
    pastures?: {
      id: string
      size: number
      tiles: { row: number; col: number }[]
      stables: number
      animalType: 'sheep' | 'boar' | 'cattle' | null
      animalCount: number
    }[]
    roomTiles?: { row: number; col: number }[]
    rooms?: number
  }) => {
    const session = new GameSession(42)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1

    const player = state.players[0]!
    player.minorPlayed.push('E011_PettingZoo')
    if (options?.pastures) {
      player.pastures = options.pastures
    }
    if (options?.roomTiles) {
      player.roomTiles = options.roomTiles
    }
    if (options?.rooms !== undefined) {
      player.rooms = options.rooms
    }
    session.loadState(state)
    return session
  }

  it('zone exists when pasture is adjacent to house, capacity = rooms', () => {
    // Default GameSession has rooms at (0,0) and (1,0)
    // Pasture tile at (0,1) is adjacent to room at (0,0)
    const session = setup({
      roomTiles: [{ row: 0, col: 0 }, { row: 1, col: 0 }],
      rooms: 2,
      pastures: [
        {
          id: 'p1',
          size: 1,
          tiles: [{ row: 0, col: 1 }],
          stables: 0,
          animalType: null,
          animalCount: 0,
        },
      ],
    })
    const state = session.getState().state
    const player = state.players[0]!

    const zones = session.withCtx(() => computeAnimalZones(player))
    const cardZone = zones.find(z => z.id === 'card:E011_PettingZoo')
    expect(cardZone).toBeDefined()
    expect(cardZone!.zoneType).toBe('card')
    expect(cardZone!.capacity).toBe(2)
    expect(cardZone!.animalType).toBeNull()
  })

  it('no zone when pasture is not adjacent to house', () => {
    const session = setup({
      roomTiles: [{ row: 0, col: 0 }, { row: 1, col: 0 }],
      rooms: 2,
      pastures: [
        {
          id: 'p1',
          size: 1,
          tiles: [{ row: 2, col: 2 }],
          stables: 0,
          animalType: null,
          animalCount: 0,
        },
      ],
    })
    const state = session.getState().state
    const player = state.players[0]!

    const zones = session.withCtx(() => computeAnimalZones(player))
    const cardZone = zones.find(z => z.id === 'card:E011_PettingZoo')
    expect(cardZone).toBeUndefined()
  })

  it('no zone when player has no pastures', () => {
    const session = setup({
      roomTiles: [{ row: 0, col: 0 }, { row: 1, col: 0 }],
      rooms: 2,
      pastures: [],
    })
    const state = session.getState().state
    const player = state.players[0]!

    const zones = session.withCtx(() => computeAnimalZones(player))
    const cardZone = zones.find(z => z.id === 'card:E011_PettingZoo')
    expect(cardZone).toBeUndefined()
  })

  it('capacity matches room count', () => {
    const session = setup({
      roomTiles: [{ row: 0, col: 0 }, { row: 1, col: 0 }, { row: 2, col: 0 }],
      rooms: 3,
      pastures: [
        {
          id: 'p1',
          size: 1,
          tiles: [{ row: 0, col: 1 }],
          stables: 0,
          animalType: null,
          animalCount: 0,
        },
      ],
    })
    const state = session.getState().state
    const player = state.players[0]!

    const zones = session.withCtx(() => computeAnimalZones(player))
    const cardZone = zones.find(z => z.id === 'card:E011_PettingZoo')
    expect(cardZone).toBeDefined()
    expect(cardZone!.capacity).toBe(3)
  })

  it('adjacent check works for pasture tile adjacent to second room', () => {
    // Room at (1,0), pasture tile at (1,1) — adjacent
    const session = setup({
      roomTiles: [{ row: 0, col: 0 }, { row: 1, col: 0 }],
      rooms: 2,
      pastures: [
        {
          id: 'p1',
          size: 1,
          tiles: [{ row: 1, col: 1 }],
          stables: 0,
          animalType: null,
          animalCount: 0,
        },
      ],
    })
    const state = session.getState().state
    const player = state.players[0]!

    const zones = session.withCtx(() => computeAnimalZones(player))
    const cardZone = zones.find(z => z.id === 'card:E011_PettingZoo')
    expect(cardZone).toBeDefined()
    expect(cardZone!.capacity).toBe(2)
  })
})

describe('ae-negative-27-holders', () => {
  const { ZOO, sessions, save, ok, setup, make, purchase, reorg, cardAssignment } = audit27Holders
  afterEach(()=>sessions.splice(0).forEach(s=>s.dispose()))
  it('E011 N1 actual one wood purchase preserves rooms and pasture and entire undo restores payment and hand',()=>{const s=make(ZOO,1,false),before=ok(s.getState()),a=purchase(s,ZOO),undone=ok(s.undoAction());assert.equal(a.r.state.players[0]!.resources.wood,0);assert.deepEqual(a.r.state.players[0]!.pastures,before.state.players[0]!.pastures);assert.equal(undone.state.players[0]!.resources.wood,1);assert.ok(undone.state.players[0]!.minorHand.includes(ZOO));save('E011-N1',{before,a,undone})})
  it('E011 N2 adjacent pasture permits mixed sheep and cattle up to real room count and rejects excess before legal housing',()=>{const ss=setup(ZOO,14,state=>{const p=state.players[0]!;p.minorHand=['__test_placeholder__'];p.occupationHand=['__test_placeholder__'];p.minorPlayed=[ZOO];p.pastures=[{id:'zoo-neighbor',tiles:[{row:0,col:0}],animalType:'sheep',animalCount:2}];p.fenceSegments=['H-0-0','H-1-0','V-0-0','V-0-1'].map(edge=>({edge,type:'fence' as const,source:{kind:'own' as const,ownerPlayerId:p.id}}));p.resources.sheep=2;state.actionSpaces.find(a=>a.id==='cattle-market')!.resources.cattle=1}),pending=reorg(ss,'cattle-market'),bad=assertRejectedUnchanged(ss,()=>ss.resolveChoice(0,'confirm',{zones:[cardAssignment(pending,ZOO,{sheep:2,cattle:1})]}));assert.ok(pending.interaction.stateId==='wait'&&pending.interaction.request.kind==='animal-reorg');const house=pending.interaction.request.zones.find(z=>z.zoneType==='house');assert.ok(house);const r=ok(ss.resolveChoice(0,'confirm',{zones:[cardAssignment(pending,ZOO,{sheep:1,cattle:1}),{...house,animalType:'sheep',animalCount:1}]}));assert.equal(r.state.players[0]!.resources.sheep,2);assert.equal(r.state.players[0]!.resources.cattle,1);save('E011-N2',{pending,bad,r})})
  it('E011 N3 no pasture nonadjacent pasture or card only in hand exposes no Petting Zoo holder',()=>{for(const mode of['none','distant','hand']){const s=make(ZOO,mode==='none'?0:1,mode!=='hand',1,2,mode!=='distant'),pending=reorg(s,'sheep-market');assert.ok(pending.interaction.stateId==='wait'&&pending.interaction.request.kind==='animal-reorg');assert.ok(!pending.interaction.request.zones.some(z=>z.cardId===ZOO));save(`E011-N3-${mode}`,pending)}})
  it('E011 N4 three real rooms permit exactly three same species on card and whole cattle action undo removes animals',()=>{const s=make(ZOO,2,true,1,3),before=ok(s.getState()),pending=reorg(s,'cattle-market'),r=ok(s.resolveChoice(0,'confirm',{zones:[cardAssignment(pending,ZOO,{cattle:3})]})),undone=ok(s.undoAction());assert.equal(r.state.players[0]!.resources.cattle,3);assert.equal(undone.state.players[0]!.resources.cattle,0);assert.deepEqual(undone.state.players[0]!.roomTiles,before.state.players[0]!.roomTiles);save('E011-N4',{before,pending,r,undone})})
})
