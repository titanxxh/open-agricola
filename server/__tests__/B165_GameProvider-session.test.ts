import { describe, expect, it, afterEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'

import { markAllWorkersUsed, setActiveWorkerCount, setWorkersAtHome } from '../../shared/domain/player'
import type { FarmTilePosition, PlayerState } from '../../shared/contract/types'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import '../../shared/cards/B/B165_GameProvider'
import '../../shared/cards/B/B113_PatchCaregiver'
import { resolveNonSkipChoice, resolveTriggerIfPresent } from './_helpers/trigger-select'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit31Plows from './_helpers/audit/ae-negative-31-plows'

const CARD_ID = 'B165_GameProvider'
const FILLER = '__test_placeholder__'

const setupHarvest = (
  fields: PlayerState['fields'] = [
    { row: 0, col: 0, stacks: [{ kind: 'grain', remaining: 3 }] },
    { row: 0, col: 1, stacks: [{ kind: 'grain', remaining: 3 }] },
    { row: 0, col: 2, stacks: [{ kind: 'grain', remaining: 3 }] },
  ],
) => {
  const session = new GameSession(5165, undefined, { playerCount: 4 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.round = 4
  state.currentPlayerIndex = 0
  state.players.forEach((player) => {
    markAllWorkersUsed(state, player)
    setActiveWorkerCount(player, 1)
    player.resources.food = player === state.players[0] ? 0 : 20
    player.resources.boar = 0
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
    player.fields = []
    player.pastures = []
    player.stableAnimals = {}
    player.houseAnimals = {};
  })

  const player = state.players[0]!
  player.occupationPlayed.push(CARD_ID)
  player.fields = fields
  session.loadState(state)
  return session
}

const acceptB165 = (session: GameSession) => {
  let resp = session.performRoundEnd()
  resp = resolveTriggerIfPresent(session, resp, CARD_ID)
  resp = resolveNonSkipChoice(session, resp)
  expect(resp.interaction.stateId).toBe('wait')
  if (resp.interaction.stateId !== 'wait') throw new Error('expected selection choice')
  expect(resp.interaction.sourceCard).toBe(CARD_ID)
  expect(resp.interaction.request.selection?.kind).toBe('farm-position')
  return resp
}

const selectPositions = (session: GameSession, positions: FarmTilePosition[]) =>
  session.commitSelectionChoice(0, { positions })

const fieldCounts = (player: PlayerState) =>
  player.fields.map((field) => field.stacks.at(-1)?.remaining ?? 0)

describe('B165_GameProvider session', () => {
  it('B165 S1: playing Game Provider through Lessons leaves it in play', () => {
    const session = new GameSession(5165, undefined, { playerCount: 4 })
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.currentPlayerIndex = 0
    state.round = 5
    state.roundPhase = 'work'
    state.players.forEach((player) => {
      setWorkersAtHome(state, player, 2)
      player.minorHand = [FILLER]
      player.occupationHand = [FILLER]
      player.resources.food = 5
    })
    state.players[0]!.occupationHand = [CARD_ID]
    session.loadState(state)

    let response = session.takeAction(0, 'lessons')
    expect(response.ok, response.error).toBe(true)
    if (response.state.players[0]!.occupationHand.includes(CARD_ID)) {
      expect(response.interaction.stateId).toBe('wait')
      if (response.interaction.stateId !== 'wait') return
      const option = response.interaction.request.options?.find((candidate) => candidate.value === CARD_ID)
      expect(option, JSON.stringify(response.interaction)).toBeDefined()
      response = session.resolveChoice(0, option!.value)
    }

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
  })

  it('B165 S2: lets player discard 1 grain field for 1 boar', () => {
    const session = setupHarvest([
      { row: 0, col: 0, stacks: [{ kind: 'grain', remaining: 2 }] },
    ])
    let resp = acceptB165(session)

    expect(resp.interaction.request.selection?.selectablePositions).toEqual([{ row: 0, col: 0 }])

    resp = selectPositions(session, [{ row: 0, col: 0 }])
    expect(resp.ok).toBe(true)

    const player = resp.state.players[0]!
    expect(player.resources.boar).toBe(1)
    expect(fieldCounts(player)).toEqual([1])
    expect(resp.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'animal-reorg' } })
  })

  it('lets player discard grain from one Card Field', () => {
    const session = setupHarvest([])
    const state = session.getState().state
    const player = state.players[0]!
    player.occupationPlayed.push('B113_PatchCaregiver')
    player.cardStates.B113_PatchCaregiver = {
      extraData: { cardFieldStacks: [{ crop: 'grain', remaining: 3 }] },
    }
    session.loadState(state)
    let resp = acceptB165(session)

    expect(resp.interaction.request.selection?.selectablePositions).toEqual([{
      row: -1,
      col: 2113,
      sourceCard: 'B113_PatchCaregiver',
      groupKey: 'B113_PatchCaregiver',
      cardFieldSlot: 0,
    }])
    resp = selectPositions(session, [{ row: -1, col: 2113 }])

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.boar).toBe(1)
    expect(resp.state.players[0]!.cardStates.B113_PatchCaregiver?.extraData?.cardFieldStacks).toEqual([
      { crop: 'grain', remaining: 2 },
    ])
    expect(resp.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'animal-reorg' } })
  })

  it('B165 S5: rejects exactly 2 selected grain fields without mutating grain or boar', () => {
    const session = setupHarvest()
    let resp = acceptB165(session)

    resp = selectPositions(session, [{ row: 0, col: 0 }, { row: 0, col: 1 }])
    expect(resp.ok).toBe(false)
    expect(resp.error).toBe('invalid selection count')
    expect(resp.interaction.stateId).toBe('wait')
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.sourceCard : undefined).toBe(CARD_ID)

    const player = resp.state.players[0]!
    expect(player.resources.boar).toBe(0)
    expect(fieldCounts(player)).toEqual([3, 3, 3])
  })

  it('B165 S3: selecting 3 grain fields gains 2 boars', () => {
    const session = setupHarvest([
      { row: 0, col: 0, stacks: [{ kind: 'grain', remaining: 2 }] },
      { row: 0, col: 1, stacks: [{ kind: 'grain', remaining: 2 }] },
      { row: 0, col: 2, stacks: [{ kind: 'grain', remaining: 2 }] },
    ])
    let resp = acceptB165(session)

    resp = selectPositions(session, [
      { row: 0, col: 0 },
      { row: 0, col: 1 },
      { row: 0, col: 2 },
    ])
    expect(resp.ok).toBe(true)

    const player = resp.state.players[0]!
    expect(player.resources.boar).toBe(2)
    expect(fieldCounts(player)).toEqual([1, 1, 1])
    expect(resp.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'animal-reorg' } })
  })

  it('B165 S4: selecting 4 grain fields gains 3 boars', () => {
    const session = setupHarvest([
      { row: 0, col: 0, stacks: [{ kind: 'grain', remaining: 2 }] },
      { row: 0, col: 1, stacks: [{ kind: 'grain', remaining: 2 }] },
      { row: 0, col: 2, stacks: [{ kind: 'grain', remaining: 2 }] },
      { row: 0, col: 3, stacks: [{ kind: 'grain', remaining: 2 }] },
    ])
    let resp = acceptB165(session)

    resp = selectPositions(session, [
      { row: 0, col: 0 },
      { row: 0, col: 1 },
      { row: 0, col: 2 },
      { row: 0, col: 3 },
    ])

    expect(resp.ok, resp.error).toBe(true)
    expect(resp.state.players[0]!.resources.boar).toBe(3)
    expect(fieldCounts(resp.state.players[0]!)).toEqual([1, 1, 1, 1])
    expect(resp.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'animal-reorg' } })
  })

  it('B165 S6: without a grain field Game Provider is not offered', () => {
    const response = setupHarvest([
      { row: 0, col: 0, stacks: [{ kind: 'vegetable', remaining: 2 }] },
    ]).performRoundEnd()

    expect(response.ok, response.error).toBe(true)
    expect(response.interaction.stateId === 'wait' ? response.interaction.sourceCard : undefined)
      .not.toBe(CARD_ID)
    expect(response.state.players[0]!.resources.boar).toBe(0)
  })

  it('rejects non-selectable crop field without partial mutation', () => {
    const session = setupHarvest([
      { row: 0, col: 0, stacks: [{ kind: 'grain', remaining: 3 }] },
      { row: 0, col: 1, stacks: [{ kind: 'vegetable', remaining: 2 }] },
    ])
    let resp = acceptB165(session)

    expect(resp.interaction.request.selection?.selectablePositions).toEqual([{ row: 0, col: 0 }])
    resp = selectPositions(session, [{ row: 0, col: 1 }])
    expect(resp.ok).toBe(false)
    expect(resp.error).toBe('invalid selection position')

    const player = resp.state.players[0]!
    expect(player.resources.boar).toBe(0)
    expect(fieldCounts(player)).toEqual([3, 2])
  })
})

describe('ae-negative-31-plows', () => {
  const { sessions, ok, actor, save, setup, choose, finish, completeRound, lesson, offer, noSource, animalKeep, grainHarvest, harvestOffer } = audit31Plows
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()))
  it('B165 N1 natural harvest distinct one three and four grain fields yield exact pigs with normal harvest and breeding', () => {
    for (const n of [1, 3, 4]) {
      const card = 'B165_GameProvider', s = setup(card, 4, st => grainHarvest(st, card))
      let r = harvestOffer(s, card)
      save(`B165-N1-pending-${n}`, r)
      const positions = s.state.players[0]!.fields.slice(0, n).map(({ row, col }) => ({ row, col }))
      r = ok(s.commitSelectionChoice(actor(r), { positions }))
      save(`B165-N1-after-discard-${n}`, r)
      assert.equal(r.state.round, 4)
      assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'animal-reorg')
      assert.equal(r.interaction.playerIndex, 0)
      assert.equal(r.state.players[0]!.resources.boar, n === 1 ? 1 : n === 3 ? 2 : 3)
      assert.deepEqual(r.state.players[0]!.fields.map(f => f.stacks[0]?.remaining ?? 0), [0, 1, 2, 3].map(i => i < n ? 2 : 3))
      assert.equal(r.state.events.filter(event => event.type === 'resource.moved' && event.sourceCardId === card && event.resources.boar).length, 1)
      r = animalKeep(s, r, req => {
        for (const z of req.zones)
          if (z.id === 'p1') {
            z.animalType = 'boar'
            z.animalCount = r.state.players[0]!.resources.boar
          }
      })
      r = finish(s, r)
      assert.equal(r.state.round, 5)
      assert.deepEqual(r.state.players[0]!.fields.map(f => f.stacks[0]?.remaining ?? 0), [0, 1, 2, 3].map(i => i < n ? 1 : 2))
      const gainIndex = r.state.events.findIndex(event => event.type === 'resource.moved' && event.sourceCardId === card && event.resources.boar)
      const housedIndex = r.state.events.findIndex(event => event.type === 'farm.animalMoved' && event.actorPlayerId === r.state.players[0]!.id && event.animals.boar)
      const reapIndex = r.state.events.findIndex(event => event.type === 'farm.cropRemoved' && event.actorPlayerId === r.state.players[0]!.id && event.reason === 'reap')
      const breedingIndex = r.state.events.findIndex(event => event.type === 'harvest.phaseStarted' && event.harvestPhase === 'breeding')
      assert.ok(gainIndex >= 0 && gainIndex < housedIndex && housedIndex < reapIndex && reapIndex < breedingIndex)
      assert.equal(r.state.events.filter(event => event.type === 'resource.moved' && event.sourceCardId === card && event.resources.boar).length, 1)
      save(`B165-N1-unassigned-${n}`, r)
      assert.deepEqual({ pigs: r.state.players[0]!.resources.boar, assigned: r.state.players[0]!.pastures.reduce((n, p) => n + (p.animalType === 'boar' ? p.animalCount : 0), 0) + Object.values(r.state.players[0]!.houseAnimals).filter(a => a === 'boar').length + Object.values(r.state.players[0]!.stableAnimals).reduce((sum, a) => sum + (a.animalType === 'boar' ? a.animalCount : 0), 0) }, { pigs: n === 1 ? 1 : n === 3 ? 3 : 4, assigned: n === 1 ? 1 : n === 3 ? 3 : 4 })
      save(`B165-N1-${n}`, r)
    }
  })
  it('B165 N2 two fields duplicate field and vegetable target reject before legal one field retry', () => {
    const card = 'B165_GameProvider', s = setup(card, 4, st => { grainHarvest(st, card); st.players[0]!.fields[3]!.stacks = [{ kind: 'vegetable', remaining: 2 }]; })
    let r = harvestOffer(s, card)
    for (const positions of [[{ row: 0, col: 2 }, { row: 0, col: 3 }], [{ row: 0, col: 2 }, { row: 0, col: 2 }], [{ row: 1, col: 4 }]])
      assertRejectedUnchanged(s, () => s.commitSelectionChoice(actor(r), { positions }))
    r = ok(s.commitSelectionChoice(actor(r), { positions: [{ row: 0, col: 2 }] }))
    assert.equal(r.state.players[0]!.resources.boar, 1)
    r = finish(s, r)
    assert.equal(r.state.players[0]!.resources.boar, 1)
    assert.equal(r.state.players[0]!.fields[0]!.stacks[0]!.remaining, 1)
    save('B165-N2', r)
  })
  it('B165 N3 decline hand-only and no grain exclude card discard while ordinary harvest still occurs', () => {
    for (const mode of ['decline', 'hand', 'vegetable']) {
      const card = 'B165_GameProvider', s = setup(card, 4, st => {
        grainHarvest(st, card, mode === 'hand')
        if (mode === 'vegetable')
          st.players[0]!.fields.forEach(f => f.stacks = [{ kind: 'vegetable', remaining: 2 }])
      })
      let r = completeRound(s, ['forest', 'clay-pit', 'reed-bank', 'day-laborer', 'fishing', 'grain-seeds', 'copse', 'hollow-4'])
      if (mode === 'decline')
        r = choose(s, offer(s, r, card), o => o.value === '__skip__')
      else
        noSource(r, card)
      r = finish(s, r, true)
      assert.equal(r.state.players[0]!.resources.boar, 0)
      assert.deepEqual(r.state.players[0]!.fields.map(f => f.stacks[0]!.remaining), Array(4).fill(mode === 'vegetable' ? 1 : 2))
      save(`B165-N3-${mode}`, r)
    }
  })
  it('B165 N4 real first occupation play grants no pig before the harvest', () => { const card = 'B165_GameProvider', s = setup(card, 4, st => { st.players[0]!.occupationPlayed = []; st.players[0]!.occupationHand = [card]; }); const r = finish(s, lesson(s, card), true); assert.ok(r.state.players[0]!.occupationPlayed.includes(card)); assert.equal(r.state.players[0]!.resources.boar, 0); assert.equal(r.state.players[0]!.resources.food, 20); save('B165-N4', r); })
  it('B165 N5 three duplicate references cannot satisfy different field payment', () => {
    const card = 'B165_GameProvider', s = setup(card, 4, st => grainHarvest(st, card))
    let r = harvestOffer(s, card)
    const tile = { row: 0, col: 2 }
    assertRejectedUnchanged(s, () => s.commitSelectionChoice(actor(r), { positions: [tile, tile, tile] }))
    assert.equal(s.state.players[0]!.resources.boar, 0)
    assert.deepEqual(s.state.players[0]!.fields.map(f => f.stacks[0]!.remaining), [3, 3, 3, 3])
    r = ok(s.commitSelectionChoice(actor(r), { positions: [tile] }))
    assert.equal(r.state.round, 4)
    assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'animal-reorg')
    assert.equal(r.interaction.playerIndex, 0)
    assert.equal(r.state.players[0]!.resources.boar, 1)
    assert.equal(r.state.players[0]!.fields[0]!.stacks[0]!.remaining, 2)
    save('B165-N5-before-housing', r)
    r = animalKeep(s, r, req => {
      const zone = req.zones.find(zone => zone.id === 'p1')
      assert.ok(zone)
      zone.animalType = 'boar'
      zone.animalCount = 1
    })
    r = finish(s, r)
    assert.equal(r.state.round, 5)
    assert.equal(r.state.players[0]!.resources.boar, 1)
    assert.equal(r.state.players[0]!.pastures[0]!.animalType, 'boar')
    assert.equal(r.state.players[0]!.pastures[0]!.animalCount, 1)
    assert.equal(r.state.players[0]!.fields[0]!.stacks[0]!.remaining, 1)
    assert.equal(r.state.events.filter(event => event.type === 'resource.moved' && event.sourceCardId === card && event.resources.boar).length, 1)
    save('B165-N5', r)
  })
})
