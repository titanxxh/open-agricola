import { createWorkSession } from './_helpers/session-fixtures'
import { describe, expect, it, afterEach } from 'vitest'
import type { GameSession, SessionResponse } from '../game/authoritative-session'
import { markAllWorkersUsed, setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { resolveTriggerIfPresent } from './_helpers/trigger-select'

import '../../shared/cards/B/B140_FarmyardWorker'
import '../../shared/cards/B/B012_Stockyard'
import '../../shared/cards/B/B113_PatchCaregiver'
import '../../shared/cards/M/M095_FallowFields'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit29Timing from './_helpers/audit/ae-negative-29-timing'

const CARD_ID = 'B140_FarmyardWorker'
const FILLER = '__test_placeholder__'
const ONE_CELL_FENCES = ['H-0-1', 'H-1-1', 'V-0-1', 'V-0-2']

const setup = ({
  played = true, resources = {}, field = false, pasture = false,
}: {
  played?: boolean
  resources?: Partial<Record<'wood' | 'reed' | 'grain', number>>
  field?: boolean
  pasture?: boolean
} = {}) => {
  const session = createWorkSession({ seed: 6140, options: { playerCount: 2 } })
  const state = session.getState().state
  stabilizeRandomHands(state.players)
  state.currentPlayerIndex = 0
  state.round = 10
  state.roundPhase = 'work'
  state.roundActionOrder = [
    'sheep-market', 'grain-utilization', 'fencing',
    ...state.roundActionOrder.filter((id) =>
      id !== 'sheep-market' && id !== 'grain-utilization' && id !== 'fencing'),
  ]
  state.actionSpaces.forEach((space) => { space.takenBy = [] })
  state.players.forEach((player, index) => {
    setWorkersAtHome(state, player, index === 0 ? 2 : 0)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.cardStates = {}
    player.fields = []
    player.pastures = []
    player.fenceSegments = []
    player.stableTiles = []
    player.houseAnimals = {};
    player.stableAnimals = {}
    Object.assign(player.resources, {
      wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0,
      sheep: 0, boar: 0, cattle: 0, begging: 0,
    })
  })
  const owner = state.players[0]!
  owner.occupationHand = played ? [FILLER] : [CARD_ID]
  owner.occupationPlayed = played ? [CARD_ID] : []
  Object.assign(owner.resources, resources)
  if (field) owner.fields = [{ row: 0, col: 1, stacks: [] }]
  if (pasture) {
    owner.fenceSegments = ONE_CELL_FENCES.map((edge) => ({ edge, type: 'fence' as const }))
    owner.pastures = [{
      id: 'farmyard-worker-pasture', size: 1, tiles: [{ row: 0, col: 1 }],
      stables: 0, animalType: null, animalCount: 0,
    }]
  }
  state.actionSpaces.find((space) => space.id === 'sheep-market')!.resources.sheep = 1
  session.loadState(state)
  return session
}

const options = (response: SessionResponse) => response.interaction.stateId === 'wait'
  ? response.interaction.request.options ?? []
  : []

const playOccupation = (session: GameSession) => {
  let response = session.takeAction(0, 'lessons')
  if (response.interaction.stateId === 'wait'
    && response.state.players[0]!.occupationHand.includes(CARD_ID)) {
    const card = options(response).find((option) => option.value === CARD_ID)
    expect(card, JSON.stringify(response.interaction)).toBeDefined()
    response = session.resolveChoice(response.interaction.playerIndex, card!.value)
  }
  return response
}

const settleFarmyardWorker = (session: GameSession, initial: SessionResponse) => {
  let response = resolveTriggerIfPresent(session, initial, CARD_ID)
  for (let remaining = 4; remaining > 0 && response.interaction.stateId === 'wait'; remaining -= 1) {
    if (response.interaction.request.kind === 'confirm-next-player'
      || response.interaction.request.kind === 'confirm-player-switch') break
    const card = options(response).find((option) =>
      option.value !== '__skip__' && (option.sourceCard === CARD_ID || option.value === CARD_ID))
    if (!card) break
    response = session.resolveChoice(response.interaction.playerIndex, card.value)
  }
  return response
}

const finishWorkPhase = (session: GameSession) => {
  const state = session.getState().state
  state.players.forEach((player) => markAllWorkersUsed(state, player))
  session.loadState(state)
  return session.performRoundEnd()
}

const buildRoom = (session: GameSession) => {
  let response = session.takeAction(0, 'farm-expansion')
  if (response.interaction.stateId === 'wait'
    && response.interaction.request.kind === 'choice') {
    const construct = options(response).find((option) => option.labelKey === 'actions.construct.name')
    expect(construct).toBeDefined()
    response = session.resolveChoice(response.interaction.playerIndex, construct!.value)
  }
  expect(response.interaction).toMatchObject({
    stateId: 'wait', request: { kind: 'farm-select', farm: { farmType: 'room' } },
  })
  if (response.interaction.stateId !== 'wait'
    || response.interaction.request.kind !== 'farm-select') return response
  const room = response.interaction.request.farm.selectableTiles[0]
  expect(room).toBeDefined()
  return settleFarmyardWorker(session, session.commitSelectionChoice(0, { rooms: [room!] }))
}

const buildStable = (session: GameSession) => {
  let response = session.takeAction(0, 'farm-expansion')
  if (response.interaction.stateId === 'wait'
    && response.interaction.request.kind === 'choice') {
    const stable = options(response).find((option) => option.labelKey === 'actions.stables.name')
    expect(stable).toBeDefined()
    response = session.resolveChoice(response.interaction.playerIndex, stable!.value)
  }
  expect(response.interaction).toMatchObject({
    stateId: 'wait', request: { kind: 'farm-select', farm: { farmType: 'stable' } },
  })
  if (response.interaction.stateId !== 'wait'
    || response.interaction.request.kind !== 'farm-select') return response
  const stable = response.interaction.request.farm.selectableTiles[0]
  expect(stable).toBeDefined()
  return settleFarmyardWorker(session, session.commitSelectionChoice(0, { stables: [stable!] }))
}

describe('B140 Farmyard Worker parity', () => {
  it('B140 S1: Farmyard Worker is played as the first occupation in a two-player game', () => {
    const response = playOccupation(setup({ played: false }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players).toHaveLength(2)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
  })

  it('B140 S2: taking and accommodating a new sheep grants two food at work phase end', () => {
    const session = setup({ pasture: true })
    let response = session.takeAction(0, 'sheep-market')
    expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'animal-reorg' } })
    response = session.resolveChoice(0, 'confirm', { zones: [
      {
        id: 'farmyard-worker-pasture', zoneType: 'pasture',
        animalType: 'sheep', animalCount: 1,
      },
    ] })
    settleFarmyardWorker(session, response)

    response = finishWorkPhase(session)

    expect(response.state.players[0]!.pastures[0]).toMatchObject({
      animalType: 'sheep', animalCount: 1,
    })
    expect(response.state.players[0]!.resources.food).toBe(2)
  })

  it('B140 S3: sowing a new grain onto an ordinary farm field grants two food at work phase end', () => {
    const session = setup({ field: true, resources: { grain: 1 } })
    let response = session.takeAction(0, 'grain-utilization')
    if (response.interaction.stateId === 'wait'
      && response.interaction.request.kind === 'choice') {
      const sow = options(response).find((option) =>
        option.value === 'sow' || option.labelKey === 'actions.sow.name')
      expect(sow).toBeDefined()
      response = session.resolveChoice(response.interaction.playerIndex, sow!.value)
    }
    response = session.commitSelectionChoice(0, {
      crops: [{ row: 0, col: 1, crop: 'grain' }],
    })
    settleFarmyardWorker(session, response)

    response = finishWorkPhase(session)

    expect(response.state.players[0]!.fields[0]!.stacks).toEqual([{ kind: 'grain', remaining: 3 }])
    expect(response.state.players[0]!.resources.food).toBe(2)
  })

  it('B140 S4: building a room grants no food at work phase end', () => {
    const session = setup({ resources: { wood: 5, reed: 2 } })
    const built = buildRoom(session)
    expect(built.state.players[0]!.rooms).toBe(3)

    const response = finishWorkPhase(session)

    expect(response.state.players[0]!.resources.food).toBe(0)
  })

  it('B140 S5: building a stable grants no food at work phase end', () => {
    const session = setup({ resources: { wood: 2 } })
    const built = buildStable(session)
    expect(built.state.players[0]!.stableTiles).toHaveLength(1)

    const response = finishWorkPhase(session)

    expect(response.state.players[0]!.resources.food).toBe(0)
  })

  it('B140 S6: building fences grants no food at work phase end', () => {
    const session = setup({ resources: { wood: 4 } })
    const pending = session.takeAction(0, 'fencing')
    expect(pending.interaction).toMatchObject({
      stateId: 'wait', request: { kind: 'farm-select', farm: { farmType: 'fence' } },
    })
    const built = settleFarmyardWorker(session, session.commitSelectionChoice(0, {
      edges: ONE_CELL_FENCES, palisadeEdges: [], }))
    expect(built.state.players[0]!.fenceSegments).toHaveLength(4)

    const response = finishWorkPhase(session)

    expect(response.state.players[0]!.resources.food).toBe(0)
  })

  it('B140 S7: plowing a field grants no food at work phase end', () => {
    const session = setup()
    const pending = session.takeAction(0, 'farmland')
    expect(pending.interaction).toMatchObject({
      stateId: 'wait', request: { kind: 'farm-select', farm: { farmType: 'plow' } },
    })
    if (pending.interaction.stateId !== 'wait'
      || pending.interaction.request.kind !== 'farm-select') return
    const tile = pending.interaction.request.farm.selectableTiles[0]
    expect(tile).toBeDefined()
    const plowed = settleFarmyardWorker(session, session.commitSelectionChoice(0, { tile }))
    expect(plowed.state.players[0]!.fields).toHaveLength(1)

    const response = finishWorkPhase(session)

    expect(response.state.players[0]!.resources.food).toBe(0)
  })
  it.each(['old-sheep', 'card-zone', 'cook'] as const)('%s does not place new goods on the farmyard', (scenario) => {
    const session = setup({ pasture: true })
    const state = session.getState().state
    const player = state.players[0]!
    if (scenario === 'old-sheep') {
      player.resources.sheep = 1
      player.houseAnimals = Object.fromEntries(player.roomTiles.slice(0, 1).map(tile => [`${tile.row}-${tile.col}`, 'sheep']));
    }
    if (scenario === 'card-zone') player.minorPlayed = ['B012_Stockyard']
    if (scenario === 'cook') player.improvements = ['Major_Fireplace1']
    session.loadState(state)
    let response = session.takeAction(0, 'sheep-market')
    expect(response.interaction.request.kind).toBe('animal-reorg')
    if (scenario === 'cook') {
      expect(session.takeAnytimeAction(0, 'exchange').ok).toBe(true)
      response = session.resolveChoice(0, 'bulk:0=1')
      expect(response.state.players[0]!.resources.food).toBe(2)
    }
    response = session.resolveChoice(0, 'confirm', { zones: scenario === 'cook' ? [] : [{
      id: scenario === 'card-zone' ? 'card:B012_Stockyard' : 'farmyard-worker-pasture',
      zoneType: scenario === 'card-zone' ? 'card' : 'pasture', animalType: 'sheep', animalCount: 1,
    }] })
    expect(response.ok, response.error).toBe(true)
    settleFarmyardWorker(session, response)
    expect(session.getState().state.players[0]!.cardStates[CARD_ID]?.flagged).not.toBe(true)
    expect(finishWorkPhase(session).state.players[0]!.resources.food).toBe(scenario === 'cook' ? 2 : 0)
  })

  it.each([false, true])('Fallow Fields goods on a card field (%s) count only on the farmyard', (cardField) => {
    const session = setup({ field: !cardField })
    const state = session.getState().state
    state.enableFarmersOfTheMoor = true
    const player = state.players[0]!
    player.minorHand = ['M095_FallowFields']
    if (cardField) player.occupationPlayed.push('B113_PatchCaregiver')
    session.loadState(state)
    let response = session.takeAction(0, 'meeting-place')
    const improvement = options(response).find((option) => option.value.startsWith('action-improvement-'))
    if (improvement) response = session.resolveChoice(0, improvement.value)
    expect(response.interaction.request.selection?.kind, JSON.stringify(response.interaction)).toBe('farm-position')
    response = session.commitSelectionChoice(0, { positions: [{ row: cardField ? -1 : 0, col: cardField ? 2113 : 1 }] })
    expect(response.ok, response.error).toBe(true)
    settleFarmyardWorker(session, response)
    expect(session.getState().state.players[0]!.resources.food).toBe(0)
    expect(finishWorkPhase(session).state.players[0]!.resources.food).toBe(cardField ? 0 : 2)
  })

  it('sowing only a card field gives no reward', () => {
    const session = setup({ resources: { grain: 1 } })
    const state = session.getState().state
    state.players[0]!.occupationPlayed.push('B113_PatchCaregiver')
    session.loadState(state)
    let response = session.takeAction(0, 'grain-utilization')
    const sow = options(response).find((option) => option.value === 'sow')
    if (sow) response = session.resolveChoice(0, sow.value)
    response = session.commitSelectionChoice(0, { crops: [{ row: -1, col: 2113, crop: 'grain' }] })
    expect(response.ok, response.error).toBe(true)
    settleFarmyardWorker(session, response)
    expect(finishWorkPhase(session).state.players[0]!.resources.food).toBe(0)
  })

  it.each(['forest', 'sheep-market'])('keeps one reward through a later %s worker and resets next round', (actionId) => {
    const session = setup({ field: true, resources: { grain: 1 } })
    let response = session.takeAction(0, 'grain-utilization')
    const sow = options(response).find((option) => option.value === 'sow')
    if (sow) response = session.resolveChoice(0, sow.value)
    response = session.commitSelectionChoice(0, { crops: [{ row: 0, col: 1, crop: 'grain' }] })
    response = settleFarmyardWorker(session, response)
    expect(response.state.players[0]!.resources.food).toBe(0)
    expect(response.state.players[0]!.cardStates[CARD_ID]?.flagged).toBe(true)
    if (response.interaction.request.kind === 'confirm-next-player') session.resolveChoice(0, 'confirm')
    response = session.takeAction(0, actionId)
    if (actionId === 'sheep-market') {
      response = session.resolveChoice(0, 'confirm', { zones: [{
        id: 'house:2-0', zoneType: 'house', animalType: 'sheep', animalCount: 1,
      }] })
      response = settleFarmyardWorker(session, response)
    }
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.cardStates[CARD_ID]?.flagged).toBe(true)
    response = finishWorkPhase(session)
    expect(response.state.players[0]!.resources.food).toBe(2)
    expect(response.state.players[0]!.cardStates[CARD_ID]?.flagged).toBe(false)
  })

})

describe('ae-negative-29-timing', () => {
  const { sessions, save, ok, make, finish, progress, farmworker, sow } = audit29Timing
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()));
  it('B140 N1 real ordinary field sow adds no early food and grants two exactly once at end of work', () => { const s = farmworker(), sown = sow(s); assert.equal(sown.state.players[0]!.resources.food, 100); assert.deepEqual(sown.state.players[0]!.fields[0]!.stacks, [{ kind: 'grain', remaining: 3 }]); const r = progress(s, 15); assert.equal(r.state.players[0]!.resources.food, 98); assert.equal(r.state.gameOver, true); save('B140-N1', { sown, r }); });
  it('B140 N2 plowing does not place a good and sowing a card field or sowing with the card held grants no reward', () => { const s = farmworker(), plow = ok(s.takeAction(0, 'farmland')); assert.ok(plow.interaction.stateId === 'wait' && plow.interaction.request.kind === 'farm-select'); ok(s.commitSelectionChoice(0, { tile: { row: 0, col: 2 } })); const r = progress(s, 15); assert.equal(r.state.players[0]!.resources.food, 96); const t = farmworker(false), sown = sow(t), hand = progress(t, 15); assert.equal(hand.state.players[0]!.resources.food, 96); const q = make('B140_FarmyardWorker', true, state => { state.round = 14; state.players[0]!.occupationPlayed.push('B141_FieldCaretaker'); state.players[0]!.resources.grain = 1; }), card = sow(q, true), virtual = progress(q, 15); assert.equal(virtual.state.players[0]!.resources.food, 96); save('B140-N2', { plow, r, sown, hand, card, virtual }); });
  it('B140 N3 a newly collected housed sheep rewards once while an unchanged existing sheep gives no reward and pure anytime reorganization is unavailable', () => { const rows = []; for (const old of [false, true]) {
      const s = make('B140_FarmyardWorker', true, state => { const p = state.players[0]!; p.stableTiles = [{ row: 0, col: 1 }]; state.actionSpaces.find(a => a.id === 'sheep-market')!.resources.sheep = 1; if (old) {
          p.resources.sheep = 1;
          const t = p.roomTiles[0]!;
          p.houseAnimals = { [`${t.row}-${t.col}`]: 'sheep' };
      } });
      let pending: SessionResponse;
      if (old) {
          const unavailable = assertRejectedUnchanged(s, () => s.takeAnytimeAction(0, 'reorganize'));
          assert.equal(unavailable.error, 'anytime action unavailable');
          const r = progress(s, 6);
          assert.equal(r.state.players[0]!.resources.food, 100);
          rows.push({ unavailable, r });
          continue;
      }
      else
          pending = ok(s.takeAction(0, 'sheep-market'));
      assert.ok(pending.interaction.stateId === 'wait' && pending.interaction.request.kind === 'animal-reorg');
      const stable = pending.interaction.request.zones.find(z => z.zoneType === 'stable');
      assert.ok(stable);
      const moved = finish(s, ok(s.resolveChoice(0, 'confirm', { zones: [{ ...stable, animalType: 'sheep', animalCount: 1 }] })));
      assert.equal(moved.state.players[0]!.resources.food, 100);
      const r = progress(s, 6);
      assert.equal(r.state.players[0]!.resources.food, old ? 100 : 102);
      assert.equal(r.state.players[0]!.resources.sheep, 1);
      assert.deepEqual(r.state.players[0]!.stableAnimals['0-1'], { animalType: 'sheep', animalCount: 1 });
      rows.push({ pending, moved, r });
  } save('B140-N3', rows); });
})
