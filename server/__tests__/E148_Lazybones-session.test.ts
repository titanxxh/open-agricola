import { readCardResourceStats, getReservedActionSpaces } from '../../shared/cards/helpers/card-state'
import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { setWorkersAtHome } from '../../shared/domain/player'
import { getAllTilePositions } from '../../shared/domain/farm'
import { getCardEffect } from '../../shared/cards/card-effects'
import { getAvailableStableSupplyCount } from '../../shared/domain/supply-tokens'
import { rehydrateState, serializeSessionSnapshot } from '../../shared/session/serialization'
import { type GameState } from '../../shared/contract/types'
import { confirmPlayerSwitch } from './_helpers/pending-confirms'
import '../../shared/cards/E/E148_Lazybones'
import assert from 'node:assert/strict'
import { createWorkSession } from './_helpers/session-fixtures'
import { assertRejectedUnchanged, confirmNext, getChoiceOptions, expectFarmSelection, expectTileFarmSelection } from './_helpers/session-assertions'
import { createPlayerActionSpaces } from '../../shared/cards/player-action-space'
import { createScenarioEvidence } from './_helpers/scenario-evidence'

const evidence = createScenarioEvidence(import.meta.url)

function requestOf(response: SessionResponse) {
  assert.ok(response.interaction.stateId === 'wait')
  return response.interaction.request
}

const CARD_ID = 'E148_Lazybones'
const TRIGGER_SPACES = ['grain-seeds', 'farmland', 'day-laborer', 'farm-expansion']
const CHOICE_PREFIX = 'lazybones:'

// Design: reuse a generic bounded choice multi-select; reservation stays card-local.
// Session coverage is required for pending refresh, supply reservation, and rejection.
const playLazybones = (remaining = 4) => {
  const session = evidence.track(createWorkSession({ seed: 8148, options: { playerCount: 2 } }))
  stabilizeRandomHands(session.state.players)
  const owner = session.state.players[0]!
  owner.occupationHand = [CARD_ID]
  owner.resources.food = 5
  owner.supplyTokensConsumed = { stable: 4 - remaining }
  let response = session.takeAction(0, 'lessons')
  if (!response.state.players[0]!.occupationPlayed.includes(CARD_ID)) response = session.resolveChoice(0, CARD_ID)
  expect(response.ok, response.error).toBe(true)
  return { session, response }
}

describe('E148_Lazybones session', () => {
  it.each([1, 2, 3, 4])('offers four independent spaces with %i stable tokens remaining', (remaining) => {
    const { session, response: offered } = playLazybones(remaining)
    expect(offered.state.players).toHaveLength(2)
    expect(offered.interaction).toMatchObject({
      stateId: 'wait', playerIndex: 0, sourceCard: CARD_ID,
      request: {
        kind: 'choice',
        options: TRIGGER_SPACES.map((value) => ({ value, labelKey: `actions.${value}.name` })),
        multiSelect: { valuePrefix: CHOICE_PREFIX, minSelections: 0, maxSelections: remaining },
        requiresExplicitChoice: true,
      },
    })
    const selected = TRIGGER_SPACES.slice(0, remaining)
    const response = session.resolveChoice(0, `${CHOICE_PREFIX}${selected.join(',')}`)
    expect(response.ok, response.error).toBe(true)
    expect((response.interaction.stateId === 'wait' ? response.interaction.sourceCard : undefined)).not.toBe(CARD_ID)
    expect(response.state.players[0]!.cardStates[CARD_ID]?.extraData?.reservedActionSpaces).toEqual(selected)
    expect(session.withCtx(() => getAvailableStableSupplyCount(response.state, response.state.players[0]!))).toBe(0)
    expect(response.state.players[0]!.stableTiles).toEqual([])
    expect(response.state.players[0]!.resources).toEqual(offered.state.players[0]!.resources)
    expect(response.scores).toEqual(offered.scores)
    expect(response.state.log.some((entry) => entry.key === 'log.cardEffectGain' && entry.params?.cardId === CARD_ID)).toBe(false)
  })

  it('skips the reservation interaction when supply is empty', () => {
    const { response } = playLazybones(0)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
    expect((response.interaction.stateId === 'wait' ? response.interaction.sourceCard : undefined)).not.toBe(CARD_ID)
    expect(response.state.players[0]!.cardStates[CARD_ID]?.extraData?.reservedActionSpaces).toBeUndefined()
  })

  it('allows confirming no spaces without reserving supply', () => {
    const { session, response: offered } = playLazybones()
    const response = session.resolveChoice(0, CHOICE_PREFIX)
    expect(response.ok, response.error).toBe(true)
    expect((response.interaction.stateId === 'wait' ? response.interaction.sourceCard : undefined)).not.toBe(CARD_ID)
    expect(response.state.players[0]!.cardStates[CARD_ID]?.extraData?.reservedActionSpaces).toBeUndefined()
    expect(session.withCtx(() => getAvailableStableSupplyCount(response.state, response.state.players[0]!))).toBe(4)
    expect(response.state.players[0]!.resources).toEqual(offered.state.players[0]!.resources)
    expect(response.scores).toEqual(offered.scores)
  })

  it('preserves the bounded multi-select across session restoration', () => {
    const { session } = playLazybones(2)
    const saved = serializeSessionSnapshot(session.state, session)
    const restored = evidence.track(new GameSession(rehydrateState(JSON.parse(JSON.stringify(saved)))))
    expect(restored.getState().interaction).toMatchObject({
      stateId: 'wait', sourceCard: CARD_ID,
      request: { kind: 'choice', multiSelect: { maxSelections: 2 } },
    })
    expect(restored.resolveChoice(0, 'lazybones:grain-seeds,farmland,day-laborer').ok).toBe(false)
    const accepted = restored.resolveChoice(0, 'lazybones:grain-seeds,farmland')
    expect(accepted.ok, accepted.error).toBe(true)
    expect(accepted.state.players[0]!.cardStates[CARD_ID]?.extraData?.reservedActionSpaces).toEqual(TRIGGER_SPACES.slice(0, 2))
  })

  it('undoes a reservation back to the four-candidate choice and allows a new subset', () => {
    const { session } = playLazybones(2)
    expect(session.resolveChoice(0, 'lazybones:grain-seeds,farmland').ok).toBe(true)
    const undone = session.undoStep()
    expect(undone.ok, undone.error).toBe(true)
    expect(undone.interaction).toMatchObject({
      stateId: 'wait', sourceCard: CARD_ID,
      request: { kind: 'choice', multiSelect: { maxSelections: 2 } },
    })
    expect(session.withCtx(() => getAvailableStableSupplyCount(undone.state, undone.state.players[0]!))).toBe(2)
    expect(undone.state.players[0]!.cardStates[CARD_ID]?.extraData?.reservedActionSpaces).toBeUndefined()
    const accepted = session.resolveChoice(0, 'lazybones:day-laborer')
    expect(accepted.ok, accepted.error).toBe(true)
    expect(accepted.state.players[0]!.cardStates[CARD_ID]?.extraData?.reservedActionSpaces).toEqual(['day-laborer'])
  })

  it.each([
    'lazybones:grain-seeds,farmland,day-laborer',
    'lazybones:grain-seeds,grain-seeds',
    'lazybones:forest',
    'lazybones:grain-seeds,',
    'grain-seeds',
  ])('rejects invalid multi-selection %s atomically and permits retry', (choice) => {
    const { session, response: offered } = playLazybones(2)
    const before = structuredClone({ players: offered.state.players, log: offered.state.log })
    const rejected = session.resolveChoice(0, choice)
    expect(rejected.ok).toBe(false)
    expect(rejected.state.players).toEqual(before.players)
    expect(rejected.state.log).toEqual(before.log)
    expect(rejected.scores).toEqual(offered.scores)
    expect(rejected.interaction).toMatchObject({ stateId: 'wait', sourceCard: CARD_ID, request: requestOf(offered) })
    const accepted = session.resolveChoice(0, 'lazybones:grain-seeds,farmland')
    expect(accepted.ok, accepted.error).toBe(true)
    expect(accepted.state.players[0]!.cardStates[CARD_ID]?.extraData?.reservedActionSpaces).toEqual(TRIGGER_SPACES.slice(0, 2))
  })

  it.each([1, 4])('refreshes reservation choices after constructing %i stables', (built) => {
    const session = evidence.track(createWorkSession({ seed: 8148, options: { playerCount: 2 } }))
    for (const player of session.state.players) {
      player.minorHand = ['__test_placeholder__']
      player.occupationHand = ['__test_placeholder__']
    }
    const owner = session.state.players[0]!
    owner.occupationHand = [CARD_ID]
    owner.occupationPlayed = ['C094_StableCleaner']
    owner.resources.food = 5
    owner.resources.wood = 4
    let response = session.takeAction(0, 'lessons')
    if (!response.state.players[0]!.occupationPlayed.includes(CARD_ID)) response = session.resolveChoice(0, CARD_ID)
    expect(response.ok, response.error).toBe(true)
    const fourSpaces = `${CHOICE_PREFIX}${TRIGGER_SPACES.join(',')}`
    expect(requestOf(response)).toMatchObject({ multiSelect: { maxSelections: 4 } })
    expect(getChoiceOptions(response).map((option) => option.value)).toEqual(TRIGGER_SPACES)
    response = session.takeAnytimeAction(0, 'C94-stable-cleaner-anytime')
    expect(response.ok, response.error).toBe(true)
    expect(requestOf(response).kind).toBe('farm-select')
    const tiles = expectTileFarmSelection(response, 'stable').selectableTiles.slice(0, built)
    response = session.commitSelectionChoice(0, { stables: tiles })
    expect(response.ok, response.error).toBe(true)
    if (built === 4) {
      expect(session.withCtx(() => getAvailableStableSupplyCount(response.state, response.state.players[0]!))).toBe(0)
      expect(response.state.players[0]!.cardStates[CARD_ID]?.extraData?.reservedActionSpaces).toBeUndefined()
      expect((response.interaction.stateId === 'wait' ? response.interaction.sourceCard : undefined)).not.toBe(CARD_ID)
      return
    }
    expect(session.withCtx(() => getAvailableStableSupplyCount(response.state, response.state.players[0]!))).toBe(3)
    expect(requestOf(response)).toMatchObject({ multiSelect: { maxSelections: 3 } })
    expect(getChoiceOptions(response).map((option) => option.value)).toEqual(TRIGGER_SPACES)
    const before = structuredClone(response.state.players)
    response = session.resolveChoice(0, fourSpaces)
    expect(response.ok).toBe(false)
    expect(response.state.players).toEqual(before)
    expect(response.interaction.stateId).toBe('wait')
    response = session.resolveChoice(0, `${CHOICE_PREFIX}${TRIGGER_SPACES.slice(0, 3).join(',')}`)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.cardStates[CARD_ID]?.extraData?.reservedActionSpaces).toEqual(TRIGGER_SPACES.slice(0, 3))
    expect(response.state.players[0]!.stableTiles).toEqual(tiles)
  })

  const setup = (reservedActionSpaces = TRIGGER_SPACES) => {
    const session = evidence.track(createWorkSession({ seed: 42 }))
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.currentPlayerIndex = 1

    const owner = state.players[0]!
    owner.occupationPlayed.push(CARD_ID)
    owner.cardStates = {
      ...owner.cardStates,
      [CARD_ID]: { extraData: { reservedActionSpaces } },
    }

    const opponent = state.players[1]!
    setWorkersAtHome(state, opponent, 2)
    session.loadState(state)
    return session
  }

  const placeLazybonesStable = (session: GameSession, actionId: string, chooseLast = false) => {
    let offered = session.takeAction(1, actionId)
    expect(offered.ok, offered.error).toBe(true)
    while (offered.interaction.stateId === 'wait' && requestOf(offered).kind === 'confirm-player-switch') {
      offered = confirmPlayerSwitch(session)
    }
    expect(offered.interaction.stateId).toBe('wait')
    expect(offered.interaction.stateId === 'wait' ? requestOf(offered).kind : undefined)
      .toBe('farm-select')
    if (offered.interaction.stateId !== 'wait' || requestOf(offered).kind !== 'farm-select') {
      throw new Error('expected Lazybones stable selection')
    }
    expect(offered.interaction.playerIndex).toBe(0)
    expect(expectFarmSelection(offered).farmType).toBe('stable')
    const tiles = expectTileFarmSelection(offered, 'stable').selectableTiles
    expect(tiles.length).toBeGreaterThan(1)
    const tile = chooseLast ? tiles.at(-1)! : tiles[0]!
    return { offered, tile, response: session.commitSelectionChoice(0, { stables: [tile] }) }
  }

  it('onBuy offers selectable action-space choices up to dynamic reserve', () => {
    const session = evidence.track(createWorkSession({ seed: 42 }))
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    const owner = state.players[0]!
    owner.stableTiles = [{ row: 0, col: 0 }, { row: 0, col: 1 }]
    const reserveBefore = session.withCtx(() => getAvailableStableSupplyCount(state, owner))

    const effect = session.withCtx(() => getCardEffect(CARD_ID))!
    const flow = session.withCtx(() => effect.onBuy!(state, owner))

    expect(flow?.type).toBe('leaf')
    assert.ok(flow?.type === 'leaf')
    const leaf = flow
    expect(leaf.actionId).toBe('emit-choice')
    expect(leaf.params?.options).toEqual(TRIGGER_SPACES.map(value => ({ value, labelKey: `actions.${value}.name`, sourceCard: CARD_ID })))
    expect(leaf.params?.multiSelect).toEqual({ valuePrefix: CHOICE_PREFIX, minSelections: 0, maxSelections: 2 })

    session.withCtx(() => effect.resolveChoice!(state, owner, CHOICE_PREFIX, { sourceCard: CARD_ID }))

    expect(owner.cardStates?.[CARD_ID]?.extraData?.reservedActionSpaces).toBeUndefined()
    expect(session.withCtx(() => getAvailableStableSupplyCount(state, owner))).toBe(reserveBefore)
  })

  it('onBuy returns nothing if dynamic reserve is empty', () => {
    const session = evidence.track(createWorkSession({ seed: 42 }))
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state

    const owner = state.players[0]!
    owner.stableTiles = [
      { row: 0, col: 0 }, { row: 0, col: 1 },
      { row: 0, col: 2 }, { row: 0, col: 3 },
    ]

    const flow = session.withCtx(() => session.withCtx(() => getCardEffect(CARD_ID))!.onBuy!(state, owner))

    expect(flow).toBeUndefined()
  })

  it('owner chooses any legal free stable position when opponent uses grain-seeds', () => {
    const session = setup()
    const woodBefore = session.state.players[0]!.resources.wood
    const { tile, response: resp } = placeLazybonesStable(session, 'grain-seeds', true)
    expect(resp.ok, resp.error).toBe(true)

    const owner = resp.state.players[0]!
    expect(owner.stableTiles).toEqual([tile])
    expect(owner.resources.wood).toBe(woodBefore)

    const spaces = getReservedActionSpaces(owner, CARD_ID)
    expect(spaces).not.toContain('grain-seeds')
    expect(spaces.length).toBe(3)
  })

  it('owner receives free stable when opponent uses day-laborer', () => {
    const session = setup()

    const { response: resp } = placeLazybonesStable(session, 'day-laborer')
    expect(resp.ok, resp.error).toBe(true)

    const owner = resp.state.players[0]!
    expect(owner.stableTiles.length).toBe(1)

    const spaces = getReservedActionSpaces(owner, CARD_ID)
    expect(spaces).not.toContain('day-laborer')
    expect(spaces.length).toBe(3)
  })

  it('no trigger for unmarked spaces', () => {
    const session = setup()

    const resp = session.takeAction(1, 'forest')
    expect(resp.ok).toBe(true)

    const owner = resp.state.players[0]!
    expect(owner.stableTiles.length).toBe(0)
    const spaces = getReservedActionSpaces(owner, CARD_ID)
    expect(spaces.length).toBe(4)
  })

  it('no trigger after stable already collected from a space', () => {
    const session = setup()

    let resp = placeLazybonesStable(session, 'grain-seeds').response
    expect(resp.ok, resp.error).toBe(true)
    expect(resp.state.players[0]!.stableTiles.length).toBe(1)

    const state = session.getState().state
    state.round += 1
    for (const space of state.actionSpaces) {
      space.takenBy = []
    }
    state.currentPlayerIndex = 1
    setWorkersAtHome(state, state.players[1]!, 2)
    session.loadState(state)

    resp = session.takeAction(1, 'grain-seeds')
    expect(resp.ok).toBe(true)

    const owner = resp.state.players[0]!
    expect(owner.stableTiles.length).toBe(1)
  })

  it('no trigger when owner uses their own marked space', () => {
    const session = setup()
    const state = session.getState().state
    state.currentPlayerIndex = 0
    setWorkersAtHome(state, state.players[0]!, 2)
    session.loadState(state)

    const resp = session.takeAction(0, 'grain-seeds')
    expect(resp.ok).toBe(true)

    const owner = resp.state.players[0]!
    expect(owner.stableTiles.length).toBe(0)
    const spaces = getReservedActionSpaces(owner, CARD_ID)
    expect(spaces).toContain('grain-seeds')
  })

  it('removes the reserved space without a stable gain log when owner has no empty tile', () => {
    const session = setup()
    const state = session.getState().state
    state.players[0]!.fields = getAllTilePositions().map((tile) => ({
      row: tile.row,
      col: tile.col,
      stacks: [],
    }))
    session.loadState(state)

    const resp = session.takeAction(1, 'grain-seeds')
    expect(resp.ok).toBe(true)

    const owner = resp.state.players[0]!
    expect(owner.stableTiles.length).toBe(0)
    const spaces = getReservedActionSpaces(owner, CARD_ID)
    expect(spaces).not.toContain('grain-seeds')
    expect(readCardResourceStats(owner, CARD_ID)?.used ?? 0).toBe(0)
    expect(resp.state.log.some((entry) =>
      entry.key === 'log.cardEffectGain' &&
      entry.params?.cardId === CARD_ID,
    )).toBe(false)
  })

  it('returns the stable to supply when every otherwise empty tile is placement-locked', () => {
    const session = setup()
    const state = session.getState().state
    const [locked, ...occupied] = getAllTilePositions()
    state.players[0]!.fields = occupied.map((tile) => ({
      row: tile.row,
      col: tile.col,
      stacks: [],
    }))
    state.players[0]!.farmyardSpaceStates = [{
      spaceKey: `${locked!.row}-${locked!.col}`,
      sourceCardId: '__test_lock__',
      kind: 'blocked-farmyard-space',
      blocksPlacement: true,
    }]
    session.loadState(state)

    const response = session.takeAction(1, 'grain-seeds')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.stableTiles).toEqual([])
    expect(response.state.players[0]!.cardStates[CARD_ID]?.extraData?.reservedActionSpaces)
      .not.toContain('grain-seeds')
    expect(response.interaction.stateId === 'wait' ? requestOf(response).kind : response.interaction.stateId)
      .not.toBe('farm-select')
  })

  it('rejects an illegal position atomically and allows the owner to retry', () => {
    const session = setup()
    let offered = session.takeAction(1, 'grain-seeds')
    while (offered.interaction.stateId === 'wait' && requestOf(offered).kind === 'confirm-player-switch') {
      offered = confirmPlayerSwitch(session)
    }
    expect(offered.interaction.stateId).toBe('wait')
    expect(offered.interaction.stateId === 'wait' ? requestOf(offered).kind : undefined)
      .toBe('farm-select')
    if (offered.interaction.stateId !== 'wait' || requestOf(offered).kind !== 'farm-select') {
      throw new Error('expected Lazybones stable selection')
    }
    const beforeOwner = structuredClone(offered.state.players[0])
    const beforeOpponent = structuredClone(offered.state.players[1])
    const beforeRequest = structuredClone(requestOf(offered))
    const rejected = session.commitSelectionChoice(0, { stables: [{ row: 99, col: 99 }] })
    expect(rejected.ok).toBe(false)
    expect(rejected.state.players[0]).toEqual(beforeOwner)
    expect(rejected.state.players[1]).toEqual(beforeOpponent)
    expect(rejected.interaction).toMatchObject({
      stateId: 'wait',
      playerIndex: 0,
      request: beforeRequest,
    })

    const tile = expectTileFarmSelection(offered, 'stable').selectableTiles.at(-1)!
    const accepted = session.commitSelectionChoice(0, { stables: [tile] })
    expect(accepted.ok, accepted.error).toBe(true)
    expect(accepted.state.players[0]!.stableTiles).toContainEqual(tile)
  })
})

describe('E148 rule boundaries', () => {

  const D = 'D051_Archway', L = 'E148_Lazybones'

  function setup(card: string, round = 3, configure: (state: GameState) => void = () => { }, played = true) {
    return evidence.track(createWorkSession({
      seed: 8251, options: { playerCount: card === L ? 4 : 2 }, configure: state => {
        state.round = round
        state.availableMajorImprovements = []
        for (const p of state.players) {
          p.minorHand = ['__test_placeholder__']
          p.occupationHand = ['__test_placeholder__']
          p.resources = { ...p.resources, wood: 0, clay: 0, reed: 0, stone: 0, grain: 0, vegetable: 0, food: 20 }
        }
        const owner = state.players[0]!
        if (played)
          (card === L ? owner.occupationPlayed : owner.minorPlayed).push(card)
        else
          (card === L ? owner.occupationHand : owner.minorHand).splice(0, 1, card)
        configure(state)
        if (card === D && played)
          state.actionSpaces.push(...createPlayerActionSpaces(state))
      }
    }))
  }

  function wait(r: SessionResponse) { assert.equal(r.ok, true, r.error); assert.ok(r.interaction.stateId === 'wait'); return r.interaction }

  function finish(s: GameSession, initial: SessionResponse) {
    let r = initial
    for (let n = 0; n < 10 && r.interaction.stateId === 'wait'; n++) {
      const kind = r.interaction.request.kind
      if (kind === 'confirm-next-player')
        r = confirmNext(s, r)
      else if (kind === 'choice' && getChoiceOptions(r)?.some(o => o.value === '__skip__'))
        r = s.resolveChoice(r.interaction.playerIndex, '__skip__')
      else
        break
      assert.equal(r.ok, true, r.error)
    }
    return r
  }

  function place(s: GameSession, actor: number, id: string) {
    let r = s.takeAction(actor, id)
    assert.equal(r.ok, true, r.error)
    if (id === 'farmland') {
      wait(r)
      r = s.commitSelectionChoice(actor, { tile: { row: 0, col: 2 } })
      assert.equal(r.ok, true, r.error)
    }
    return r
  }

  it("invalid duplicate or excessive reservation is atomic and legal subset reserves stable quota", () => {
    const s = setup(L, 3, state => { state.players[0]!.stableTiles = [{ row: 0, col: 1 }, { row: 1, col: 1 }, { row: 2, col: 1 }] }, false)
    let r = s.takeAction(0, 'lessons')
    assert.equal(r.ok, true, r.error)
    if (!r.state.players[0]!.occupationPlayed.includes(L))
      r = s.resolveChoice(0, L)
    const reservation = wait(r)
    assert.ok(reservation.request.kind === 'choice')
    assert.equal(reservation.request.multiSelect?.maxSelections, 1)
    for (const value of ['lazybones:grain-seeds,farmland', 'lazybones:grain-seeds,grain-seeds', 'lazybones:forest'])
      assertRejectedUnchanged(s, () => s.resolveChoice(0, value))
    r = s.resolveChoice(0, 'lazybones:grain-seeds')
    assert.equal(r.ok, true, r.error)
    assert.deepEqual(r.state.players[0]!.cardStates[L]?.extraData?.reservedActionSpaces, ['grain-seeds'])
    assert.equal(s.withCtx(() => getAvailableStableSupplyCount(r.state, r.state.players[0]!)), 0)

    const completed = wait(r)
    assert.equal(completed.playerIndex, 0)
    assert.deepEqual(completed.request, { kind: 'confirm-next-player', nextPlayerIndex: 1 })
    assert.equal(r.state.currentPlayerIndex, 0)
    assertRejectedUnchanged(s, () => s.resolveChoice(0, 'lazybones:grain-seeds'))
  })

  it("owner use leaves its reservation intact and grants no stable", () => {
    const s = setup(L, 3, state => { state.players[0]!.cardStates[L] = { extraData: { reservedActionSpaces: ['grain-seeds'] } } })
    const r = place(s, 0, 'grain-seeds')
    assert.equal(r.state.players[0]!.resources.grain, 1)
    assert.deepEqual(r.state.players[0]!.cardStates[L]?.extraData?.reservedActionSpaces, ['grain-seeds'])
    assert.deepEqual(r.state.players[0]!.stableTiles, [])
    const next = wait(r)
    assert.equal(next.playerIndex, 0)
    assert.ok(next.request.kind === 'confirm-next-player')
    assert.equal(next.request.nextPlayerIndex, 1)
  })

  it("opponent target consumes only its token and exact free stable cannot be doubled or submitted by opponent", () => {
    for (const recoverPending of [false, true]) {
      const s = setup(L, 3, state => { state.players[0]!.cardStates[L] = { extraData: { reservedActionSpaces: ['grain-seeds', 'farmland', 'day-laborer', 'farm-expansion'] } } })
      finish(s, place(s, 0, 'reed-bank'))
      let r = place(s, 1, 'grain-seeds')
      while (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-player-switch') {
        r = s.resolveChoice(r.interaction.playerIndex, 'confirm')
        assert.equal(r.ok, true, r.error)
      }
      const i = wait(r)
      assert.equal(i.playerIndex, 0)
      assert.equal(i.request.kind, 'farm-select')
      assert.ok(i.request.kind === 'farm-select' && i.request.farm.farmType === 'stable')
      const tiles = i.request.farm.selectableTiles
      assert.ok(tiles.length > 1)
      assertRejectedUnchanged(s, () => s.commitSelectionChoice(1, { stables: [tiles[0]!] }))
      if (recoverPending) s.loadState(rehydrateState(JSON.parse(JSON.stringify(serializeSessionSnapshot(s.state, s)))))
      const before = s.getState()
      const beforeState = JSON.stringify(before.state)
      const beforeScores = JSON.stringify(before.scores)
      const beforePublic = JSON.stringify({ state: before.state, interaction: before.interaction, scores: before.scores })
      assert.deepEqual(before.interaction.allowedCommands, ['commitSelection'])
      const boundary = assertRejectedUnchanged(s, () => s.undoStep())
      assert.equal(boundary.error, 'cannot undo past boundary')
      const rejected = s.commitSelectionChoice(0, { stables: [tiles[0]!, tiles[1]!] })
      assert.equal(rejected.ok, false)
      assert.equal(rejected.error, 'log.buildStableFail')
      assert.equal(JSON.stringify(rejected.state), beforeState)
      assert.equal(JSON.stringify(rejected.scores), beforeScores)
      assert.deepEqual(wait(s.getState()).request, i.request)
      assert.deepEqual(rejected.interaction.allowedCommands, ['commitSelection'])
      const repeated = assertRejectedUnchanged(s, () => s.commitSelectionChoice(0, { stables: [tiles[0]!, tiles[1]!] }))
      assert.equal(repeated.error, 'log.buildStableFail')
      if (recoverPending) {
        const historyPop = s.undoStep()
        assert.equal(historyPop.ok, false)
        assert.equal(historyPop.error, 'cannot undo past boundary')
        assert.equal(JSON.stringify({ state: historyPop.state, interaction: historyPop.interaction, scores: historyPop.scores }), beforePublic)
      }
      r = s.commitSelectionChoice(0, { stables: [tiles[0]!] })
      assert.equal(r.ok, true, r.error)
      assert.equal(r.state.players[0]!.stableTiles.length, 1)
      assert.equal(r.state.players[0]!.resources.wood, 0)
      assert.deepEqual(r.state.players[0]!.cardStates[L]?.extraData?.reservedActionSpaces, ['farmland', 'day-laborer', 'farm-expansion'])
      assert.equal(s.withCtx(() => getAvailableStableSupplyCount(r.state, r.state.players[0]!)), 0)
      const switchBack = wait(r)
      assert.equal(switchBack.playerIndex, 0)
      assert.ok(switchBack.request.kind === 'confirm-player-switch')
      assert.equal(switchBack.request.fromPlayerIndex, 0)
      assert.equal(switchBack.request.toPlayerIndex, 1)
      assert.equal(r.state.currentPlayerIndex, 1)
      evidence.record('E148 over-max legal retry', { recoverPending })
    }
  })

  it("unavailable farm tile returns only the consumed reservation to supply", () => {
    const s = setup(L, 3, state => {
      const p = state.players[0]!
      p.cardStates[L] = { extraData: { reservedActionSpaces: ['grain-seeds', 'day-laborer'] } }
      for (let row = 0; row < 3; row++)
        for (let col = 0; col < 5; col++)
          if (!p.roomTiles.some(t => t.row === row && t.col === col))
            p.fields.push({ row, col, stacks: [] })
    })
    finish(s, place(s, 0, 'reed-bank'))
    let r = place(s, 1, 'grain-seeds')
    while (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-player-switch') {
      r = s.resolveChoice(r.interaction.playerIndex, 'confirm')
      assert.equal(r.ok, true, r.error)
    }
    assert.deepEqual(r.state.players[0]!.stableTiles, [])
    assert.deepEqual(r.state.players[0]!.cardStates[L]?.extraData?.reservedActionSpaces, ['day-laborer'])
    assert.equal(s.withCtx(() => getAvailableStableSupplyCount(r.state, r.state.players[0]!)), 3)
    const next = wait(r)
    assert.equal(next.playerIndex, 1)
    assert.ok(next.request.kind === 'confirm-next-player')
    assert.equal(next.request.nextPlayerIndex, 2)
    assert.equal(r.state.currentPlayerIndex, 1)
  })
})
