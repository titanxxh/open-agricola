import { createWorkSession } from './_helpers/session-fixtures'
import { describe, expect, it, afterEach } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { markAllWorkersUsed, setWorkersAtHome } from '../../shared/domain/player'
import { computeScores } from '../../shared/domain/scoring'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import '../../shared/cards/C/C067_MineralFeeder'
import assert from 'node:assert/strict'
import * as audit40Crops from './_helpers/audit/ae-negative-40-crops'

const CARD_ID = 'C067_MineralFeeder'
const FILLER = '__test_placeholder__'

const setupPlaySession = (reed: number) => {
  const session = createWorkSession({ seed: 5067, options: { playerCount: 2 } })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 5
  state.roundPhase = 'work'
  state.availableMajorImprovements = []
  state.players.forEach((player) => {
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.resources.food = 20
    setWorkersAtHome(state, player, 2)
  })
  state.players[0]!.minorHand = [CARD_ID]
  state.players[0]!.resources.reed = reed
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

const printedVp = (session: GameSession, response: SessionResponse) => {
  const player = response.state.players[0]!
  const score = session.withCtx(() => computeScores(response.state)).find((summary) => summary.playerId === player.id)!
  const cards = score.categories.find((category) => category.key === 'cards')!
  return cards.entries.find((entry) => 'cardId' in entry && entry.cardId === CARD_ID)?.score
}

const setupRoundStartSession = (round = 1) => {
  const session = createWorkSession({ seed: 6067, options: { playerCount: 2 } })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.round = round
  state.currentPlayerIndex = 0
  state.players[0]!.startPlayer = true
  state.players[1]!.startPlayer = false
  state.players.forEach((player) => {
    markAllWorkersUsed(state, player)
    player.resources.food = 10
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
  })
  const player = state.players[0]!
  player.minorPlayed.push(CARD_ID)
  session.loadState(state)
  return { session, player: session.getState().state.players[0]! }
}

const addEmptyPasture = (player: ReturnType<typeof setupRoundStartSession>['player']) => {
  player.pastures = [{
    id: 'pasture-1',
    size: 1,
    tiles: [{ row: 2, col: 0 }],
    stables: 0,
    animalType: null,
    animalCount: 0,
  }]
}

describe('C067_MineralFeeder session', () => {
  it('C067 S1: paying one reed plays Mineral Feeder for one point', () => {
    const session = setupPlaySession(1)
    const response = play(session)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.reed).toBe(0)
    expect(printedVp(session, response)).toBe(1)
  })

  it('C067 S2: lacking reed keeps Mineral Feeder unavailable', () => {
    const response = enterMinor(setupPlaySession(0))

    expect(offered(response)).toBe(false)
    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.reed).toBe(0)
  })

  it('C067 S6: declining the offered reorganization leaves a house sheep outside the pasture and gains no grain', () => {
    const { session, player } = setupRoundStartSession()
    addEmptyPasture(player)
    player.resources.sheep = 1
    player.houseAnimals = Object.fromEntries(player.roomTiles.slice(0, 1).map(tile => [`${tile.row}-${tile.col}`, 'sheep']));
    session.loadState(session.getState().state)

    let resp = session.performRoundEnd()
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.sourceCard).toBe(CARD_ID)

    resp = session.resolveChoice(0, '__skip__')
    expect(resp.state.players[0]!.resources.grain).toBe(0)
  })

  it('C067 S7: accepting reorganization and moving a house sheep into the pasture gains one grain', () => {
    const { session, player } = setupRoundStartSession()
    addEmptyPasture(player)
    player.resources.sheep = 1
    player.houseAnimals = Object.fromEntries(player.roomTiles.slice(0, 1).map(tile => [`${tile.row}-${tile.col}`, 'sheep']));
    session.loadState(session.getState().state)

    let resp = session.performRoundEnd()
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    const accept = resp.interaction.request.options?.find((option) => option.value !== '__skip__')
    expect(accept).toBeDefined()

    resp = session.resolveChoice(0, accept!.value)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.request.kind).toBe('animal-reorg')

    resp = session.resolveChoice(0, 'confirm', [
      { id: 'pasture-1', zoneType: 'pasture', animalType: 'sheep', animalCount: 1 },
      { id: 'house:1-0', zoneType: 'house', animalType: null, animalCount: 0 },
    ])
    expect(resp.state.players[0]!.resources.grain).toBe(1)
    expect(resp.state.players[0]!.pastures[0]!.animalType).toBe('sheep')
  })

  it('C067 S3: a sheep already in a pasture gains one grain at a non-harvest round start', () => {
    const { session, player } = setupRoundStartSession()
    addEmptyPasture(player)
    player.resources.sheep = 1
    player.pastures[0]!.animalType = 'sheep'
    player.pastures[0]!.animalCount = 1
    session.loadState(session.getState().state)

    const resp = session.performRoundEnd()
    expect(resp.state.players[0]!.resources.grain).toBe(1)
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.request.kind : resp.interaction.stateId)
      .not.toBe('animal-reorg')
  })

  it('C067 S4: a sheep in a pasture gains no grain when the new round ends with a harvest', () => {
    const { session, player } = setupRoundStartSession(3)
    addEmptyPasture(player)
    player.resources.sheep = 1
    player.pastures[0]!.animalType = 'sheep'
    player.pastures[0]!.animalCount = 1
    session.loadState(session.getState().state)

    const resp = session.performRoundEnd()
    expect(resp.state.round).toBe(4)
    expect(resp.state.players[0]!.resources.grain).toBe(0)
  })

  it('C067 S5: an empty pasture with no sheep gains no grain', () => {
    const { session, player } = setupRoundStartSession()
    addEmptyPasture(player)
    session.loadState(session.getState().state)

    const resp = session.performRoundEnd()
    expect(resp.state.players[0]!.resources.grain).toBe(0)
  })
})

describe('ae-negative-40-crops', () => {
  const { sessions, save, setup, finish, offer, hand, buy, noSource, accept, pasture, animalKeep, printed, denyMinor, advance } = audit40Crops
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()));
  it('C067 N1 actual hand purchase pays printed cost and meets each prerequisite', () => { const card = 'C067_MineralFeeder'; const s = setup(card, 14, st => { hand(st, card); Object.assign(st.players[0]!.resources, { "reed": 1 }); }); const r = buy(s, card); assert.ok(r.state.players[0]!.minorPlayed.includes(card)); assert.equal(printed(r, card), 1); assert.equal(r.state.players[0]!.resources.reed, 0); save("C067-N1-legal", r); const t = setup(card, 14, st => { hand(st, card); Object.assign(st.players[0]!.resources, { "reed": 0 }); }); denyMinor(t, card); save("C067-N1-short", t.getState()); });
  it('C067 N2 natural nonharvest round rewards a sheep in pasture and excludes harvest round hand or no sheep', () => { for (const mode of ['pasture', 'harvest', 'hand', 'empty']) {
      const card = 'C067_MineralFeeder', s = setup(card, mode === 'harvest' ? 6 : 5, st => { pasture(st, [{ row: 0, col: 3 }], mode === 'empty' ? null : 'sheep', mode === 'empty' ? 0 : 1); if (mode === 'hand')
          hand(st, card); });
      let r = advance(s);
      r = finish(s, r);
      assert.equal(r.state.round, mode === 'harvest' ? 7 : 6);
      assert.equal(r.state.players[0]!.resources.grain, mode === 'pasture' ? 1 : 0);
      noSource(r, card);
      save(`C067-N2-${mode}`, r);
  } });
  it('C067 N3 real round start reorganization can move a house sheep into pasture or decline without grain', () => { for (const use of [false, true]) {
      const card = 'C067_MineralFeeder', s = setup(card, 5, st => { pasture(st, [{ row: 0, col: 3 }]); st.players[0]!.resources.sheep = 1; st.players[0]!.houseAnimals = { '2-0': 'sheep' }; });
      let r = advance(s);
      save(`C067-N3-offer-${use}`, r);
      r = offer(s, r, card);
      if (use) {
          r = accept(s, r, card);
          assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'animal-reorg', JSON.stringify(r.interaction));
          r = animalKeep(s, r, req => { for (const z of req.zones) {
              z.animalType = z.zoneType === 'pasture' ? 'sheep' : null;
              z.animalCount = z.zoneType === 'pasture' ? 1 : 0;
          } });
          r = finish(s, r);
      }
      else
          r = finish(s, r);
      assert.equal(r.state.players[0]!.resources.grain, use ? 1 : 0);
      assert.equal(r.state.players[0]!.pastures[0]!.animalCount, use ? 1 : 0);
      assert.equal(r.state.players[0]!.resources.sheep, 1);
      save(`C067-N3-${use}`, r);
  } });
})
