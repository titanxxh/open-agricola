import { type SessionResponse } from '../game/authoritative-session'

import { describe, expect, it, afterEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import type { ActionFlow } from '../../shared/contract/types'
import { setActiveWorkerCount, setWorkersAtHome, familySize } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/D/D050_ForeignAid'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit37Food from './_helpers/audit/ae-negative-37-food'

const CARD_ID = 'D050_ForeignAid'

const setup = () => {
  const session = new GameSession(42)
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.round = 14
  state.roundPhase = 'work'
  state.currentPlayerIndex = 0
  state.roundActionOrder[11] = 'forest'
  state.roundActionOrder[12] = 'farmland'
  state.roundActionOrder[13] = 'day-laborer'
  state.players.forEach((player) => {
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
    setActiveWorkerCount(player, 2)
    setWorkersAtHome(state, player, 2)
  })
  state.players[0]!.minorPlayed.push(CARD_ID)
  session.loadState(state)
  return session
}

const startFlow = (session: GameSession, flow: ActionFlow) => {
  const internal = session as unknown as {
    createFlowEngine: (flow: ActionFlow) => unknown
    runEngineSteps: () => void
  }
  const spaceId = '__stage:d050'
  session.state.actionSpaces.push({
    id: spaceId,
    nameKey: 'test',
    descriptionKey: 'test',
    roundAvailable: 1,
    takenBy: [],
    gainPerRound: {},
    resources: {},
    canBeExecutedByPlayer: () => true,
    execute: () => ({ type: 'ok' }),
  } as never)
  session.pushEngineFrame({
    engine: internal.createFlowEngine(flow) as never,
    source: { kind: 'flow', flow },
    spaceId,
    ownerPlayerIndex: 0,
    stageResume: null,
    deferredPlayerSwitch: null,
    reason: 'card-draft',
  })
  internal.runEngineSteps()
}

describe('D050_ForeignAid session', () => {
  it('blocks the owner at direct entry while leaving other players and spaces unaffected', () => {
    const blocked = setup()
    const workersBefore = structuredClone(blocked.state.players[0]!.workers)
    const denied = blocked.takeAction(0, 'forest')

    expect(denied.ok).toBe(false)
    expect(denied.state.actionSpaces.find((space) => space.id === 'forest')?.takenBy).toEqual([])
    expect(denied.state.players[0]!.workers).toEqual(workersBefore)

    const allowed = setup()
    expect(allowed.takeAction(0, 'clay-pit').ok).toBe(true)

    const other = setup()
    other.state.currentPlayerIndex = 1
    expect(other.takeAction(1, 'forest').ok).toBe(true)
  })

  it('excludes blocked pending choices and revalidates a newly blocked choice', () => {
    const session = setup()
    startFlow(session, { type: 'leaf', actionId: 'place-farmer', sourceCard: CARD_ID })
    const pending = session.getState()

    expect(pending.interaction.stateId).toBe('wait')
    if (pending.interaction.stateId !== 'wait' || pending.interaction.request.kind !== 'choice') return
    expect(pending.interaction.request.options.some((option) => option.value === 'forest')).toBe(false)
    const newlyBlocked = pending.interaction.request.options.find((option) => option.value === 'clay-pit')
    expect(newlyBlocked).toBeDefined()

    session.state.roundActionOrder[11] = newlyBlocked!.value
    const denied = session.resolveChoice(0, newlyBlocked!.value)
    expect(denied.ok).toBe(false)
    expect(denied.state.actionSpaces.find((space) => space.id === newlyBlocked!.value)?.takenBy).toEqual([])
  })
})

describe('D050 Foreign Aid parity', () => {
  const CARD_ID = 'D050_ForeignAid'

  const FILLER = '__test_placeholder__'

  const BLOCKED_SPACES = ['forest', 'farmland', 'day-laborer'] as const

  const options = (response: SessionResponse) => response.interaction.stateId === 'wait'
    ? response.interaction.request.options ?? []
    : []

  const setup = ({ played = true, round = 14, actor = 0 } = {}) => {
    const session = new GameSession(6050, undefined, { playerCount: 2 })
    const state = session.getState().state
    stabilizeRandomHands(state.players)
    state.currentPlayerIndex = actor
    state.round = round
    state.roundPhase = 'work'
    state.roundActionOrder[11] = BLOCKED_SPACES[0]
    state.roundActionOrder[12] = BLOCKED_SPACES[1]
    state.roundActionOrder[13] = BLOCKED_SPACES[2]
    state.actionSpaces.forEach((space) => { space.takenBy = [] })
    state.players.forEach((player, index) => {
      setWorkersAtHome(state, player, index === actor ? 2 : 0)
      player.minorHand = [FILLER]
      player.occupationHand = [FILLER]
      player.minorPlayed = []
      player.occupationPlayed = []
      player.resources.food = 0
    })
    const owner = state.players[0]!
    owner.minorHand = played ? [FILLER] : [CARD_ID]
    owner.minorPlayed = played ? [CARD_ID] : []
    session.loadState(state)
    return session
  }

  const enterMinorChoice = (session: GameSession) => {
    let response = session.takeAction(0, 'meeting-place')
    if (response.interaction.stateId !== 'wait') return response
    const improvement = options(response).find((option) =>
      option.value.startsWith('action-improvement-'))
    if (improvement) response = session.resolveChoice(response.interaction.playerIndex, improvement.value)
    return response
  }

  const playMinor = (session: GameSession) => {
    let response = enterMinorChoice(session)
    if (response.interaction.stateId !== 'wait') return response
    const card = options(response).find((option) =>
      option.value === CARD_ID || option.value === `minor:${CARD_ID}`)
    if (card) response = session.resolveChoice(response.interaction.playerIndex, card.value)
    return response
  }

  it('D050 S1: Foreign Aid is played by round eleven and immediately gains six food', () => {
    const response = playMinor(setup({ played: false, round: 11 }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.food).toBe(6)
  })

  it('D050 S2: Foreign Aid cannot be played in round twelve', () => {
    const response = enterMinorChoice(setup({ played: false, round: 12 }))

    expect(options(response).some((option) =>
      option.value === CARD_ID || option.value === `minor:${CARD_ID}`)).toBe(false)
    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.food).toBe(0)
  })
})

describe('ae-negative-37-food', () => {
  const { sessions, save, setup, finish, improvement, take, prerequisites, hand, buy, printed, house, denyMinor } = audit37Food
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()));
  it('D050 N1 actual printed purchase pays exact cost and excludes unavailable resources', () => { const card = 'D050_ForeignAid', s = setup(card, 11, st => { hand(st, card); prerequisites(st, 0); Object.assign(st.players[0]!.resources, {}); }); const r = buy(s, card); assert.ok(r.state.players[0]!.minorPlayed.includes(card)); assert.equal(printed(r, card), 0); assert.equal(r.state.players[0]!.resources.food, 46); save('D050-N1-legal', r); const excluded = setup(card, 12, st => { hand(st, card); prerequisites(st, 0); Object.assign(st.players[0]!.resources, {}); }); denyMinor(excluded, card); save('D050-N1-prerequisite', excluded.getState()); });
  it('D050 N2 the owner cannot use urgent growth but an earlier quarry and hand or opponent growth remain legal', () => {
      const card = 'D050_ForeignAid', s = setup(card, 14, st => house(st, 3));
      assertRejectedUnchanged(s, () => s.takeAction(0, 'urgent-wish-children'));
      let r = finish(s, take(s, 'western-quarry'), true);
      assert.equal(r.state.players[0]!.resources.stone, 2);
      save('D050-N2-owner', r);
      for (const mode of ['hand', 'opponent']) {
          const t = setup(card, 14, st => {
              house(st, 3);
              if (mode === 'hand')
                  hand(st, card);
              else
                  st.currentPlayerIndex = 1;
          });
          r = finish(t, take(t, 'urgent-wish-children'), true);
          assert.equal(familySize(r.state.players[mode === 'opponent' ? 1 : 0]!), 3);
          save(`D050-N2-${mode}`, r);
      }
  });
  it('D050 N3 the three legal final stage actions are blocked while earlier improvement is legal', () => {
      const card = 'D050_ForeignAid', order = ['sheep-market', 'fencing', 'grain-utilization', 'major-improvement', 'wish-children', 'western-quarry', 'house-redevelopment', 'pig-market', 'vegetable-seeds', 'cattle-market', 'eastern-quarry', 'cultivation', 'urgent-wish-children', 'farm-redevelopment'];
      for (const space of ['cultivation', 'urgent-wish-children', 'farm-redevelopment']) {
          const s = setup(card, 14, st => { st.roundActionOrder = order; house(st, 3); Object.assign(st.players[0]!.resources, { clay: 3, reed: 1 }); st.players[0]!.minorHand = ['E050_WildGreens']; });
          assertRejectedUnchanged(s, () => s.takeAction(0, space));
          const r = improvement(s, take(s, 'major-improvement'), 'E050_WildGreens');
          assert.ok(r.state.players[0]!.minorPlayed.includes('E050_WildGreens'));
          save(`D050-N3-${space}`, r);
      }
  });
})
