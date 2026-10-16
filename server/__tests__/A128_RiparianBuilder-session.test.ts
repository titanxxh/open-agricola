import { type SessionResponse, type GameSession } from '../game/authoritative-session'
import { type Resource, type GameState } from '../../shared/contract/types'
import { describe, expect, it } from 'vitest'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { A123_FrameBuilder } from '../../shared/cards/A/A123_FrameBuilder'
import { type ActionChoiceOption } from '../../shared/contract/types.ts'
import { setWorkersAtHome } from '../../shared/domain/player'
import { readCardResourceStats } from '../../shared/cards/helpers/card-state'
import { confirmPlayerSwitch } from './_helpers/pending-confirms'
import '../../shared/cards/A/A128_RiparianBuilder'
import { listener as trueActionListener } from '../../shared/cards/__stubs__/Stub_Construct_TrueAction'
import { requireActiveCardRegistry } from '../../shared/cards/active-registry'
import assert from 'node:assert/strict'
import { createWorkSession } from './_helpers/session-fixtures'
import { assertRejectedUnchanged, confirmNext, getChoiceOptions } from './_helpers/session-assertions'
import { createScenarioEvidence } from './_helpers/scenario-evidence'

const sessionEvidence = createScenarioEvidence(import.meta.url)

const CARD_ID = 'A128_RiparianBuilder'

const optionSourceCards = (option: ActionChoiceOption): string[] => {
  const preview = option.effectPreview
  return preview?.kind === 'payment' ? preview.sourceCards ?? [] : []
}

const chooseA128RoomPayment = (
  session: GameSession,
  playerIndex: number,
  resp: ReturnType<GameSession['commitSelectionChoice']>,
) => {
  expect(resp.ok).toBe(true)
  // ADR 0004 amendment: the dominated undiscounted room payment is pruned;
  // the sourced discount is the single option and the payment auto-resolves
  // straight into the next wait state.
  if (resp.interaction.stateId === 'wait' && resp.interaction.promptKey === 'prompt.selectPayment') {
    const paymentOption = getChoiceOptions(resp)?.find((option: ActionChoiceOption) =>
      optionSourceCards(option).includes(CARD_ID),
    )
    expect(paymentOption).toBeDefined()
    return session.resolveChoice(playerIndex, paymentOption!.value)
  }
  return resp
}

describe('A128_RiparianBuilder session', () => {
  const setup = () => {
    const session = sessionEvidence.track(createWorkSession({ seed: 42 }))
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 3)
    state.currentPlayerIndex = 1

    const owner = state.players[0]!
    owner.occupationPlayed.push(CARD_ID)
    owner.houseType = 'clay'
    owner.rooms = 2
    owner.resources = { ...owner.resources, wood: 5, clay: 10, reed: 6 }

    const opponent = state.players[1]!
    setWorkersAtHome(state, opponent, 2)
    const reedBank = state.actionSpaces.find((s) => s.id === 'reed-bank')
    if (!reedBank) throw new Error('reed-bank space missing')
    reedBank.resources.reed = 3

    session.loadState(state)
    return session
  }

  it('triggers when an opponent uses the reed-bank accumulation space', () => {
    const session = setup()
    const resp = session.takeAction(1, 'reed-bank')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.request.kind : resp.interaction.stateId).toBe('confirm-player-switch')
    if (!(resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'confirm-player-switch')) return
    assert.ok(resp.interaction.stateId === 'wait')
    assert.ok(resp.interaction.request.kind === 'confirm-player-switch')
    expect(resp.interaction.request.fromPlayerIndex).toBe(1)
    expect(resp.interaction.request.toPlayerIndex).toBe(0)
    // The listener fires on `after place-farmer` for the opponent's owner —
    // the owner's per-card stats now record `used` immediately. The acting
    // player (players[1]) is not the listener owner, so their copy stays empty.
    expect(resp.state.players[0]!.cardStates?.A128_RiparianBuilder?.extraData)
      .toMatchObject({ resourceStats: { used: 1 } })
    expect(resp.state.players[1]!.cardStates?.A128_RiparianBuilder).toBeUndefined()
    const grantedLog = resp.state.log.find((entry) => entry.key === 'log.cardGrantedAction')
    expect(grantedLog?.params?.player).toBe(resp.state.players[0]!.name)
  })

  it('full flow: switch to owner, skip construct, switch back', () => {
    const session = setup()

    let resp = session.takeAction(1, 'reed-bank')
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId === 'wait') {
      expect(resp.interaction.request.kind).toBe('confirm-player-switch')
      assert.ok(resp.interaction.stateId === 'wait')
    assert.ok(resp.interaction.request.kind === 'confirm-player-switch')
    expect(resp.interaction.request.fromPlayerIndex).toBe(1)
      expect(resp.interaction.request.toPlayerIndex).toBe(0)
    }

    resp = confirmPlayerSwitch(session)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.playerIndex).toBe(0)

    resp = session.resolveChoice(0, '__skip__')
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.request.kind).toBe('confirm-player-switch')
    assert.ok(resp.interaction.stateId === 'wait')
    assert.ok(resp.interaction.request.kind === 'confirm-player-switch')
    expect(resp.interaction.request.fromPlayerIndex).toBe(0)
    expect(resp.interaction.request.toPlayerIndex).toBe(1)

    resp = confirmPlayerSwitch(session)
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.request.kind : resp.interaction.stateId).toBe('confirm-next-player')
  })

  it('limits the granted construct to one room and switches back after building', () => {
    const session = setup()

    let resp = session.takeAction(1, 'reed-bank')
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId === 'wait') {
      expect(resp.interaction.request.kind).toBe('confirm-player-switch')
      assert.ok(resp.interaction.stateId === 'wait')
    assert.ok(resp.interaction.request.kind === 'confirm-player-switch')
    expect(resp.interaction.request.fromPlayerIndex).toBe(1)
      expect(resp.interaction.request.toPlayerIndex).toBe(0)
    }

    resp = confirmPlayerSwitch(session)
    expect(resp.interaction.stateId).toBe('wait')

    // Choose to construct
    const constructOption = resp.interaction.stateId === 'wait'
      ? getChoiceOptions(resp)?.find((o: ActionChoiceOption) => o.value !== '__skip__')
      : undefined
    expect(constructOption).toBeDefined()
    resp = session.resolveChoice(0, constructOption!.value)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(roomFarm(resp).farmType).toBe('room')
    if (roomFarm(resp).farmType !== 'room') return
    // maxSelections=1 enforces the room cap on the engine path; an oversized
    // attempt fails (engine clears pending), so we directly build a single
    // room — the structural cap is already asserted via maxSelections above.
    expect(roomFarm(resp).maxSelections).toBe(1)

    // Build a room
    resp = chooseA128RoomPayment(
      session,
      0,
      session.commitSelectionChoice(0, { rooms: [{ row: 0, col: 0 }] }),
    )
    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.rooms).toBe(3)
    expect(resp.state.players[1]!.rooms).toBe(2)

    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.request.kind).toBe('confirm-player-switch')
    assert.ok(resp.interaction.stateId === 'wait')
    assert.ok(resp.interaction.request.kind === 'confirm-player-switch')
    expect(resp.interaction.request.fromPlayerIndex).toBe(0)
    expect(resp.interaction.request.toPlayerIndex).toBe(1)

    resp = confirmPlayerSwitch(session)
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.request.kind : resp.interaction.stateId).toBe('confirm-next-player')
  })

  it('records saved clay instead of paid resources after granted clay-room construct', () => {
    const session = setup()

    let resp = session.takeAction(1, 'reed-bank')
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.request.kind : resp.interaction.stateId).toBe('confirm-player-switch')

    resp = confirmPlayerSwitch(session)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return

    const constructOption = getChoiceOptions(resp)?.find((o: ActionChoiceOption) => o.value !== '__skip__')
    expect(constructOption).toBeDefined()
    resp = session.resolveChoice(0, constructOption!.value)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(roomFarm(resp).farmType).toBe('room')
    if (roomFarm(resp).farmType !== 'room') return

    const room = roomFarm(resp).selectableTiles[0]!
    resp = chooseA128RoomPayment(
      session,
      0,
      session.commitSelectionChoice(0, { rooms: [room] }),
    )

    expect(resp.ok).toBe(true)
    const stats = readCardResourceStats(resp.state.players[0]!, CARD_ID)
    expect(stats?.saved).toEqual({ clay: 1 })
    expect(stats?.paid).toEqual({})
  })

  it('records saved stone after granted stone-room construct', () => {
    const session = setup()
    const state = session.getState().state
    const owner = state.players[0]!
    owner.houseType = 'stone'
    owner.resources = { ...owner.resources, wood: 0, clay: 0, stone: 5, reed: 2 }
    session.loadState(state)

    let resp = session.takeAction(1, 'reed-bank')
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.request.kind : resp.interaction.stateId).toBe('confirm-player-switch')

    resp = confirmPlayerSwitch(session)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return

    const constructOption = getChoiceOptions(resp)?.find((o: ActionChoiceOption) => o.value !== '__skip__')
    expect(constructOption).toBeDefined()
    resp = session.resolveChoice(0, constructOption!.value)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(roomFarm(resp).farmType).toBe('room')
    if (roomFarm(resp).farmType !== 'room') return

    const room = roomFarm(resp).selectableTiles[0]!
    resp = chooseA128RoomPayment(
      session,
      0,
      session.commitSelectionChoice(0, { rooms: [room] }),
    )

    expect(resp.ok).toBe(true)
    const stats = readCardResourceStats(resp.state.players[0]!, CARD_ID)
    expect(stats?.saved).toEqual({ stone: 2 })
    expect(stats?.paid).toEqual({})
  })

  it('marks the gifted construct as non-trueAction for later listeners', () => {
    const session = setup()
    const state = session.getState().state
    state.players[0]!.occupationPlayed.push('Stub_Construct_TrueAction')
    session.withCtx(() => requireActiveCardRegistry('A128 trueAction test').registerListener(trueActionListener))
    session.loadState(state)

    let resp = session.takeAction(1, 'reed-bank')
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.request.kind : resp.interaction.stateId).toBe('confirm-player-switch')

    resp = confirmPlayerSwitch(session)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return

    const constructOption = getChoiceOptions(resp)?.find((o: ActionChoiceOption) => o.value !== '__skip__')
    expect(constructOption).toBeDefined()
    resp = session.resolveChoice(0, constructOption!.value)
    expect(resp.interaction.stateId).toBe('wait')

    resp = chooseA128RoomPayment(
      session,
      0,
      session.commitSelectionChoice(0, { rooms: [{ row: 0, col: 0 }] }),
    )
    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.cardStates?.Stub_Construct_TrueAction?.counters?.observedCount).toBeUndefined()
  })

  it('preserves sourceCard when granted construct enters room payment choice', () => {
    const session = setup()
    const state = session.getState().state
    const owner = state.players[0]!
    owner.houseType = 'stone'
    owner.resources = { ...owner.resources, wood: 1, stone: 5, reed: 2, clay: 0 }
    owner.occupationPlayed.push('A123_FrameBuilder')
    owner.activeModifiers = [
      ...(A123_FrameBuilder.impl.modifiers ?? []),
    ]
    session.loadState(state)

    let resp = session.takeAction(1, 'reed-bank')
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.request.kind : resp.interaction.stateId).toBe('confirm-player-switch')

    resp = confirmPlayerSwitch(session)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.sourceCard).toBe(CARD_ID)
    expect(resp.interaction.sourceCard).toBe(CARD_ID)

    const constructOption = getChoiceOptions(resp)?.find((o: ActionChoiceOption) => o.value !== '__skip__')
    expect(constructOption).toBeDefined()
    resp = session.resolveChoice(0, constructOption!.value)
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.sourceCard).toBe(CARD_ID)
    expect(resp.interaction.stateId).toBe('wait')
    expect(resp.interaction.sourceCard).toBe(CARD_ID)
    if (resp.interaction.stateId !== 'wait') return
    expect(roomFarm(resp).farmType).toBe('room')
    if (roomFarm(resp).farmType !== 'room') return
    expect(roomFarm(resp).maxSelections).toBe(1)

    const room = roomFarm(resp).selectableTiles[0]!
    resp = session.commitSelectionChoice(0, { rooms: [room] })
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.promptKey).toBe('prompt.selectPayment')
    expect(resp.interaction.sourceCard).toBe(CARD_ID)
    expect(resp.interaction.stateId).toBe('wait')
    expect(resp.interaction.sourceCard).toBe(CARD_ID)
    expect(getChoiceOptions(resp)?.length ?? 0).toBeGreaterThanOrEqual(2)
    expect(getChoiceOptions(resp)?.some((option: ActionChoiceOption) =>
      optionSourceCards(option).includes(CARD_ID),
    )).toBe(true)
  })

  it('re-enters room selection after undoing the granted construct choice', () => {
    const session = setup()

    let resp = session.takeAction(1, 'reed-bank')
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.request.kind : resp.interaction.stateId).toBe('confirm-player-switch')

    resp = confirmPlayerSwitch(session)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return

    let constructOption = getChoiceOptions(resp)?.find((o: ActionChoiceOption) => o.value !== '__skip__')
    expect(constructOption).toBeDefined()

    resp = session.resolveChoice(0, constructOption!.value)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(roomFarm(resp).farmType).toBe('room')

    resp = session.undoStep()
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.promptKey).toBe('ui.interactionRiparianBuilderConstruct')

    constructOption = getChoiceOptions(resp)?.find((o: ActionChoiceOption) => o.value !== '__skip__')
    expect(constructOption).toBeDefined()

    resp = session.resolveChoice(0, constructOption!.value)
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.request.kind).toBe('farm-select')
    expect(roomFarm(resp).farmType).toBe('room')
  })
})

describe('A128 Riparian Builder parity', () => {
  const CARD_ID = 'A128_RiparianBuilder'

  const FILLER = '__test_placeholder__'

  const setup = ({
    actor = 1, played = true, houseType = 'wood', resources = {},
  }: {
    actor?: number
    played?: boolean
    houseType?: 'wood' | 'clay' | 'stone'
    resources?: Partial<Resource>
  } = {}) => {
    const session = sessionEvidence.track(createWorkSession({ seed: 6128, options: { playerCount: 3 } }))
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
      player.cardStates = {}
      player.resources = {
        ...player.resources, wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0,
        vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
      }
    })
    const owner = state.players[0]!
    owner.occupationHand = played ? [FILLER] : [CARD_ID]
    owner.occupationPlayed = played ? [CARD_ID] : []
    owner.houseType = houseType
    Object.assign(owner.resources, resources)
    const reedBank = state.actionSpaces.find((space) => space.id === 'reed-bank')
    if (!reedBank) throw new Error('reed-bank space missing')
    reedBank.resources.reed = 2
    session.loadState(state)
    return session
  }

  const enterGrantedConstruct = (session: GameSession, initial: SessionResponse) => {
    let response = initial
    while (response.interaction.stateId === 'wait'
      && response.interaction.request.kind === 'confirm-player-switch') {
      response = confirmPlayerSwitch(session)
    }
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') return response
    const construct = getChoiceOptions(response)?.find((option) =>
      option.value !== '__skip__' && option.sourceCard === CARD_ID)
      ?? getChoiceOptions(response)?.find((option) => option.value !== '__skip__')
    expect(construct, JSON.stringify(response.interaction)).toBeDefined()
    return session.resolveChoice(response.interaction.playerIndex, construct!.value)
  }

  const sourceCards = (option: ActionChoiceOption): string[] => {
    const preview = option.effectPreview
    return preview?.kind === 'payment' ? preview.sourceCards ?? [] : []
  }

  const buildGrantedRoom = (session: GameSession) => {
    let response = enterGrantedConstruct(session, session.takeAction(1, 'reed-bank'))
    expect(response.interaction).toMatchObject({
      stateId: 'wait', request: { kind: 'farm-select', farm: { farmType: 'room', maxSelections: 1 } },
    })
    if (response.interaction.stateId !== 'wait'
      || roomFarm(response)?.farmType !== 'room') return response
    const room = roomFarm(response).selectableTiles[0]
    expect(room).toBeDefined()
    response = session.commitSelectionChoice(response.interaction.playerIndex, { rooms: [room!] })
    if (response.interaction.stateId === 'wait'
      && response.interaction.promptKey === 'prompt.selectPayment') {
      const payment = getChoiceOptions(response)?.find((option) =>
        sourceCards(option).includes(CARD_ID))
      expect(payment, JSON.stringify(response.interaction)).toBeDefined()
      response = session.resolveChoice(response.interaction.playerIndex, payment!.value)
    }
    return response
  }

  for (const { scenario, houseType, resources } of [
    { scenario: 'S3', houseType: 'clay', resources: { clay: 4, reed: 2 } },
    { scenario: 'S4', houseType: 'stone', resources: { stone: 3, reed: 2 } },
    { scenario: 'S5', houseType: 'wood', resources: { wood: 5, reed: 2 } },
  ] as const) {
    it(`A128 ${scenario}: the granted ${houseType} room uses the card-specific cost`, () => {
      const response = buildGrantedRoom(setup({ houseType, resources }))

      expect(response.ok, response.error).toBe(true)
      expect(response.state.players[0]!.rooms).toBe(3)
      expect(response.state.players[0]!.resources).toMatchObject({
        wood: 0, clay: 0, stone: 0, reed: 0,
      })
      expect(response.state.players[1]!.resources.reed).toBe(2)
    })
  }

  it('A128 S6: the owners Reed Bank use and an opponents non-Reed action do not trigger it', () => {
    const ownUse = setup({ actor: 0 }).takeAction(0, 'reed-bank')
    expect(ownUse.state.players[0]!.rooms).toBe(2)
    expect(ownUse.interaction.stateId === 'wait' ? ownUse.interaction.sourceCard : undefined)
      .not.toBe(CARD_ID)

    const nonTarget = setup().takeAction(1, 'day-laborer')
    expect(nonTarget.state.players[0]!.rooms).toBe(2)
    expect(nonTarget.interaction.stateId === 'wait' ? nonTarget.interaction.sourceCard : undefined)
      .not.toBe(CARD_ID)
  })
})


function roomFarm(response: SessionResponse) {
  assert.ok(response.interaction.stateId === 'wait')
  assert.ok(response.interaction.request.kind === 'farm-select')
  const farm = response.interaction.request.farm
  assert.ok(farm.farmType === 'room')
  return farm
}
describe("A128 command boundaries", () => {
  const RIPARIAN = 'A128_RiparianBuilder'
  function ok(r: SessionResponse) {
    assert.equal(r.ok, true, r.error)
    return r
  }
  function setup(configure: (state: GameState) => void = () => {
  }, played = true) {
    const s = sessionEvidence.track(createWorkSession({ seed: 4242, options: { playerCount: 3 }, configure(state) {
        state.round = 14
        for (const p of state.players)
          Object.assign(p.resources, { food: 40, wood: 10, clay: 10, reed: 4, stone: 10, grain: 0, vegetable: 0 })
        state.players[0]!.occupationPlayed = played ? [RIPARIAN] : []
        state.players[0]!.occupationHand = played ? ['__test_placeholder__'] : [RIPARIAN, 'A110_Roughcaster']
        configure(state)
      } }))
    assert.equal(s.getState().state.players.length, 3)
    return s
  }
  function turn(s: GameSession, actor: number, space: string) {
    let r = s.getState()
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player')
      r = confirmNext(s, r)
    assert.equal(r.interaction.stateId, 'idle')
    assert.equal(r.state.currentPlayerIndex, actor)
    return ok(s.takeAction(actor, space))
  }
  function switchActor(s: GameSession, initial: SessionResponse) {
    let response = initial
    for (let n = 0; n < 6 && response.interaction.stateId === 'wait' && response.interaction.request.kind === 'confirm-player-switch'; n++) {
      response = ok(s.resolveChoice(response.interaction.request.fromPlayerIndex, 'confirm'))
    }
    return response
  }
  function select(s: GameSession, r: SessionResponse, accept = true) {
    r = switchActor(s, r)
    assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice', JSON.stringify(r.interaction))
    const actor = r.interaction.playerIndex
    const o = getChoiceOptions(r).find(o => accept ? o.value !== '__skip__' && o.value !== '__done__' : o.value === '__skip__' || o.value === '__done__')
    assert.ok(o)
    return ok(s.resolveChoice(actor, o.value))
  }
  function close(s: GameSession, r: SessionResponse) {
    for (let n = 0; n < 10 && r.interaction.stateId === 'wait'; n++) {
      if (r.interaction.request.kind === 'confirm-player-switch') r = switchActor(s, r)
      else if (r.interaction.request.kind === 'choice') {
        assert.equal(r.interaction.promptKey, 'ui.interactionFarmExpansionSelect')
        assert.deepEqual(getChoiceOptions(r).map(option => option.labelKey), ['actions.stables.name', 'ui.interactionFlowDone'])
        r = ok(s.resolveChoice(r.interaction.playerIndex, '__done__'))
      } else break
    }
    return r
  }
  function riparian(material: 'wood' | 'clay' | 'stone', amount: number, played = true) {
    return setup(state => {
      const p = state.players[0]!
      p.houseType = material
      Object.assign(p.resources, { wood: 0, clay: 0, stone: 0, reed: 2 })
      p.resources[material] = amount
    }, played)
  }
  function offer(s: GameSession) {
    turn(s, 0, 'day-laborer')
    return switchActor(s, turn(s, 1, 'reed-bank'))
  }
  function commitRoom(s: GameSession, r: SessionResponse) {
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice')
      r = select(s, r)
    assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'farm-select' && r.interaction.request.farm.farmType === 'room')
    r = ok(s.commitSelectionChoice(0, { rooms: [{ row: 1, col: 1 }] }))
    if (r.interaction.stateId === 'wait' && r.interaction.promptKey === 'prompt.selectPayment')
      r = select(s, r)
    return close(s, r)
  }
  it("opponent Reed Bank offers exactly one clay stone or ordinary wood room with exact payment", () => {
    for (const [material, cost] of [['clay', 4], ['stone', 3], ['wood', 5]] as const) {
      const s = riparian(material, cost)
      const pending = offer(s)
      assert.ok(pending.interaction.stateId === 'wait' && pending.interaction.playerIndex === 0)
      const r = commitRoom(s, pending)
      assert.ok(r.interaction.stateId === 'wait')
      assert.deepEqual(r.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: 2 })
      assert.equal(r.interaction.playerIndex, 1)
      assert.equal(r.state.currentPlayerIndex, 1)
      assert.equal(r.state.players[0]!.rooms, 3)
      assert.equal(r.state.players[0]!.resources[material], 0)
      assert.equal(r.state.players[0]!.resources.reed, 0)
      assert.equal(r.state.players[1]!.rooms, 2)
      assert.ok(r.state.log.some(e => e.key === 'log.cardGrantedAction'))

      sessionEvidence.record(`A128-N1-${material}`, { pending, r })
    }
  })
  it("own Reed Bank unrelated opponent and hand cannot offer owner construction", () => {
    const own = turn(riparian('clay', 4), 0, 'reed-bank')
    assert.ok(own.interaction.stateId === 'wait')
    assert.deepEqual(own.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: 1 })
    assert.equal(own.interaction.playerIndex, 0)
    assert.equal(own.state.currentPlayerIndex, 0)
    assert.equal(own.state.players[0]!.rooms, 2)
    const s = riparian('clay', 4)
    turn(s, 0, 'day-laborer')
    const unrelated = turn(s, 1, 'grain-seeds')
    assert.ok(unrelated.interaction.stateId === 'wait')
    assert.deepEqual(unrelated.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: 2 })
    assert.equal(unrelated.interaction.playerIndex, 1)
    assert.equal(unrelated.state.currentPlayerIndex, 1)
    assert.equal(unrelated.state.players[0]!.rooms, 2)
    assert.ok(unrelated.interaction.stateId === 'wait' && unrelated.interaction.request.kind === 'confirm-next-player')
    const hs = riparian('clay', 4, false)
    const hand = offer(hs)
    assert.ok(hand.interaction.stateId === 'wait')
    assert.deepEqual(hand.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: 2 })
    assert.equal(hand.interaction.playerIndex, 1)
    assert.equal(hand.state.currentPlayerIndex, 1)
    assert.equal(hand.state.players[0]!.rooms, 2)
    assert.ok(hand.interaction.stateId === 'wait' && hand.interaction.request.kind === 'confirm-next-player')

    sessionEvidence.record('A128-N2', { own, unrelated, hand })
  })
  it("decline and insufficient resources cannot leave a room or consume resources", () => {
    const s = riparian('clay', 4)
    const pending = offer(s)
    const declined = close(s, select(s, pending, false))
    assert.ok(declined.interaction.stateId === 'wait')
    assert.deepEqual(declined.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: 2 })
    assert.equal(declined.interaction.playerIndex, 1)
    assert.equal(declined.state.currentPlayerIndex, 1)
    assert.equal(declined.state.players[0]!.rooms, 2)
    assert.equal(declined.state.players[0]!.resources.clay, 4)
    const poor = riparian('clay', 3)
    const denied = offer(poor)
    assert.ok(denied.interaction.stateId === 'wait')
    assert.deepEqual(denied.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: 2 })
    assert.equal(denied.interaction.playerIndex, 1)
    assert.equal(denied.state.currentPlayerIndex, 1)
    assert.equal(denied.state.players[0]!.rooms, 2)

    sessionEvidence.record('A128-N3', { declined, denied })
  })
  it("wrong actor illegal tile and two room payload reject before one legal room", () => {
    const s = setup(state => state.players[0]!.houseType = 'clay')
    let pending = offer(s)
    pending = select(s, pending)
    assert.ok(pending.interaction.stateId === 'wait' && pending.interaction.request.kind === 'farm-select')
    assertRejectedUnchanged(s, () => s.commitSelectionChoice(1, { rooms: [{ row: 1, col: 1 }] }))
    assertRejectedUnchanged(s, () => s.commitSelectionChoice(0, { rooms: [{ row: 99, col: 99 }] }))
    assertRejectedUnchanged(s, () => s.commitSelectionChoice(0, { rooms: [{ row: 1, col: 1 }, { row: 2, col: 1 }] }))
    const r = commitRoom(s, s.getState())
    assert.ok(r.interaction.stateId === 'wait')
    assert.deepEqual(r.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: 2 })
    assert.equal(r.interaction.playerIndex, 1)
    assert.equal(r.state.currentPlayerIndex, 1)
    assert.equal(r.state.players[0]!.rooms, 3)
    assert.equal(r.state.players[0]!.resources.clay, 6)

    sessionEvidence.record('A128-N4', { pending, r })
  })
  it("ordinary Farm Expansion cannot use the opponent trigger discount", () => {
    const poor = riparian('clay', 4)
    assertRejectedUnchanged(poor, () => poor.takeAction(0, 'farm-expansion'))
    const s = riparian('clay', 5)
    let r = turn(s, 0, 'farm-expansion')
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice') {
      const o = getChoiceOptions(r).find(o => o.labelKey === 'actions.construct.name')
      assert.ok(o)
      r = ok(s.resolveChoice(0, o.value))
    }
    r = commitRoom(s, r)
    assert.ok(r.interaction.stateId === 'wait')
    assert.deepEqual(r.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: 1 })
    assert.equal(r.interaction.playerIndex, 0)
    assert.equal(r.state.currentPlayerIndex, 0)
    assert.equal(r.state.players[0]!.resources.clay, 0)
    assert.equal(r.state.players[0]!.rooms, 3)

    sessionEvidence.record('A128-N5', r)
  })
})
