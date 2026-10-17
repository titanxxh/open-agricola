import { describe, expect, it, afterEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import '../../shared/cards/C/C048_Farmstead'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit36Native from './_helpers/audit/ae-negative-36-native'

const CARD_ID = 'C048_Farmstead'

const FILLER = '__test_placeholder__'

const STABLE_TILE = { row: 0, col: 2 }

const STABLE_FENCES = ['H-0-2', 'H-1-2', 'V-0-2', 'V-0-3']

const setup = ({
  played = true,
  occupation = true,
  resources = {},
}: {
  played?: boolean
  occupation?: boolean
  resources?: Partial<{ wood: number; reed: number; food: number }>
} = {}) => {
  const session = new GameSession(48, undefined, { playerCount: 2 })
  const state = session.getState().state
  stabilizeRandomHands(state.players)
  state.currentPlayerIndex = 0
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
      ...player.resources,
      wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0,
      sheep: 0, boar: 0, cattle: 0,
    }
  })

  const player = state.players[0]!
  player.minorHand = played ? [FILLER] : [CARD_ID]
  player.minorPlayed = played ? [CARD_ID] : []
  player.occupationPlayed = occupation ? ['B113_PatchCaregiver'] : []
  player.resources = { ...player.resources, ...resources }

  session.loadState(state)
  return session
}

const enterMinorChoice = (session: GameSession) => {
  let response = session.takeAction(0, 'meeting-place')
  if (response.interaction.stateId !== 'wait') return response
  const improvement = response.interaction.request.options?.find((option) =>
    option.value.startsWith('action-improvement-'))
  if (improvement) response = session.resolveChoice(response.interaction.playerIndex, improvement.value)
  return response
}

const playMinor = (session: GameSession) => {
  let response = enterMinorChoice(session)
  if (response.interaction.stateId !== 'wait') return response
  const card = response.interaction.request.options?.find((option) =>
    option.value === CARD_ID || option.value === 'minor:' + CARD_ID)
  if (card) response = session.resolveChoice(response.interaction.playerIndex, card.value)
  return response
}

const buildRoomAndStable = (session: GameSession) => {
  let response = session.takeAction(0, 'farm-expansion')
  let builtRoom = false
  let builtStable = false
  for (let guard = 0; guard < 20 && response.interaction.stateId === 'wait'; guard += 1) {
    if (response.interaction.request.kind === 'farm-select') {
      const tile = response.interaction.request.farm.selectableTiles[0]
      expect(tile).toBeDefined()
      if (response.interaction.request.farm.farmType === 'room') {
        response = session.commitSelectionChoice(response.interaction.playerIndex, { rooms: [tile!] })
        builtRoom = true
        continue
      }
      if (response.interaction.request.farm.farmType === 'stable') {
        response = session.commitSelectionChoice(response.interaction.playerIndex, { stables: [tile!] })
        builtStable = true
        continue
      }
    }
    const options = response.interaction.request.options ?? []
    const room = options.find((option) => option.labelKey === 'actions.construct.name')
    const stable = options.find((option) =>
      option.labelKey === 'actions.stables.name'
      || option.labelKey === 'actions.buildStables.name')
    const done = options.find((option) => option.value === '__done__')
    if (!builtRoom && room) {
      response = session.resolveChoice(response.interaction.playerIndex, room.value)
      continue
    }
    if (!builtStable && stable) {
      response = session.resolveChoice(response.interaction.playerIndex, stable.value)
      continue
    }
    if (done) {
      response = session.resolveChoice(response.interaction.playerIndex, done.value)
      continue
    }
    break
  }
  return response
}

describe('C048 Farmstead parity', () => {
  it('C048 S1: one occupation allows Farmstead to be played for free', () => {
    const session = setup({ played: false })
    const player = session.state.players[0]!
    const farmBefore = structuredClone({ rooms: player.roomTiles, fields: player.fields,
      stables: player.stableTiles, pastures: player.pastures })
    const response = playMinor(session)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.food).toBe(0)
    expect({ rooms: player.roomTiles, fields: player.fields, stables: player.stableTiles, pastures: player.pastures }).toEqual(farmBefore)
    expect(response.state.events.some((event) => event.type === 'resource.moved' && event.sourceCardId === CARD_ID)).toBe(false)
  })

  it('C048 S2: without an occupation Farmstead remains unavailable', () => {
    const response = enterMinorChoice(setup({ played: false, occupation: false }))

    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
    expect(response.interaction.stateId === 'wait'
      ? response.interaction.request.options?.some((option) =>
        option.value === CARD_ID || option.value === 'minor:' + CARD_ID) ?? false
      : false).toBe(false)
  })

  it('C048 S3: plowing one unused farmyard space gains one food', () => {
    const session = setup()
    let response = session.takeAction(0, 'farmland')
    expect(response.interaction).toMatchObject({
      stateId: 'wait', request: { kind: 'farm-select', farm: { farmType: 'plow' } },
    })
    if (response.interaction.stateId !== 'wait'
      || response.interaction.request.kind !== 'farm-select') return
    const tile = response.interaction.request.farm.selectableTiles[0]
    expect(tile).toBeDefined()
    response = session.commitSelectionChoice(response.interaction.playerIndex, { tile })

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.fields).toHaveLength(1)
    expect(response.state.players[0]!.resources.food).toBe(1)
  })

  it('C048 S4: building a room and stable in one turn gains only one food', () => {
    const response = buildRoomAndStable(setup({ resources: { wood: 7, reed: 2 } }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.rooms).toBe(3)
    expect(response.state.players[0]!.stableTiles).toHaveLength(1)
    expect(response.state.players[0]!.resources.food).toBe(1)
  })

  it('C048 S5: fencing an already used stable space gains no food', () => {
    const session = setup({ resources: { wood: 4 } })
    const state = session.getState().state
    state.players[0]!.stableTiles = [STABLE_TILE]
    session.loadState(state)

    let response = session.takeAction(0, 'fencing')
    expect(response.interaction).toMatchObject({
      stateId: 'wait', request: { kind: 'farm-select', farm: { farmType: 'fence' } },
    })
    response = session.commitSelectionChoice(0, {
      edges: STABLE_FENCES, palisadeEdges: [], extraWood: 0,
    })

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.pastures).toHaveLength(1)
    expect(response.state.players[0]!.resources.food).toBe(0)
  })

  it('C048 S6: a turn that uses no new farmyard space gains no food', () => {
    const response = setup().takeAction(0, 'day-laborer')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.food).toBe(2)
  })
})

describe('ae-negative-36-native', () => {
  const { sessions, traces, save, make, take, select, finish, ready, fill, purchase, rejectBuy, undo, resource, occupied, occupations, stables, square, enclose, plow, fence, expansion } = audit36Native
  afterEach(() => { sessions.splice(0).forEach(s => s.dispose()); traces.splice(0); });
  it("C048 N1 real free purchase and real plow fencing or room plus stable turns pay exactly one food", () => { const s = make('C048_Farmstead', st => occupations(st.players[0]!, 1), false), bought = purchase(s, 'C048_Farmstead'); resource(bought, { food: 100 }); fill(s); ready(s); const p = plow(s), r = finish(s, select(s, 0, { tile: { row: 0, col: 1 } })); resource(r, { food: 101 }); save('C048-N1-plow', { bought, p, r }); const f = make('C048_Farmstead', st => { st.players[0]!.resources.wood = 4; }), fenced = fence(f); resource(fenced, { food: 101, wood: 0 }); assert.equal(fenced.state.players[0]!.pastures.length, 1); save('C048-N1-fence', fenced); const b = make('C048_Farmstead', st => Object.assign(st.players[0]!.resources, { wood: 7, reed: 2 })), built = expansion(b, true); resource(built, { food: 101, wood: 0, reed: 0 }); assert.equal(built.state.players[0]!.rooms, 3); assert.equal(built.state.players[0]!.stableTiles.length, 1); assert.equal(occupied(built).length, 1); save('C048-N1-build', built); });
  it("C048 N2 already used pasture or stable foreign plow held card and unrelated work cannot earn Farmstead food", () => { const s = make('C048_Farmstead', st => { stables(st.players[0]!, 1); st.players[0]!.resources.wood = 4; }), fenced = fence(s); resource(fenced, { food: 100 }); save('C048-N2-usedStable', fenced); const t = make('C048_Farmstead', st => { const p = st.players[0]!; p.resources.wood = 2; p.pastures = [{ id: 'empty', tiles: [{ row: 0, col: 1 }], animalType: null, animalCount: 0 }]; enclose(p, square); }), built = expansion(t, false); resource(built, { wood: 0, food: 100 }); save('C048-N2-usedPasture', built); for (const mode of ['hand', 'opponent', 'unrelated']) {
      const a = mode === 'opponent' ? 1 : 0, b = make('C048_Farmstead', st => { st.currentPlayerIndex = a; occupations(st.players[0]!, 1); }, mode !== 'hand'), r = mode === 'unrelated' ? finish(b, take(b, 0, 'day-laborer')) : finish(b, plow(b, a, 'C048_Farmstead'), true, [], 'C048_Farmstead');
      resource(r, { food: mode === 'unrelated' ? 102 : 100 });
      save(`C048-N2-${mode}`, r);
  } });
  it("C048 N3 missing occupation and an illegal plow target reject before legal plow and public whole-action undo", () => { save('C048-N3-prerequisite', rejectBuy(make('C048_Farmstead', undefined, false), 'C048_Farmstead')); const s = make('C048_Farmstead'), p = plow(s), bad = assertRejectedUnchanged(s, () => s.commitSelectionChoice(0, { tile: { row: 1, col: 0 } })), r = finish(s, select(s, 0, { tile: { row: 0, col: 1 } })); resource(r, { food: 101 }); assert.equal(r.state.players[0]!.fields.length, 1); const u = undo(s); resource(u, { food: 100 }); assert.equal(u.state.players[0]!.fields.length, 0); assert.equal(occupied(u).length, 0); save('C048-N3', { p, bad, r, u }); });
})
