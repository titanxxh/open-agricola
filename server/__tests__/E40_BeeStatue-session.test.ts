import { type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'

import { describe, expect, it, afterEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { getCardStack } from '../../shared/cards/helpers/card-state'

import '../../shared/cards/E/E040_BeeStatue'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit35Placement from './_helpers/audit/ae-negative-35-placement'

describe('E040_BeeStatue session', () => {
  const setup = () => {
    const session = new GameSession(42)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1

    const player = state.players[0]!
    player.minorHand.push('E040_BeeStatue')
    player.resources.clay = 5
    session.loadState(state)
    session.devPlayCard(0, 'E040_BeeStatue')
    return session
  }

  it('onBuy places 5 goods on stack', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    const stack = getCardStack(player, 'E040_BeeStatue')
    expect(stack).toEqual(['vegetable', 'stone', 'grain', 'stone', 'grain'])
    expect(stack.length).toBe(5)
  })

  it('using day-laborer gains top good (grain) and stack shrinks', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    player.resources.grain = 0
    session.loadState(state)

    const resp = session.takeAction(0, 'day-laborer')
    expect(resp.ok).toBe(true)

    const updatedPlayer = resp.state.players[0]!
    // Day laborer gives 1 food, plus bee statue gives grain (top of stack)
    expect(updatedPlayer.resources.grain).toBe(1)
    const stack = getCardStack(updatedPlayer, 'E040_BeeStatue')
    expect(stack.length).toBe(4)
    expect(stack[stack.length - 1]).toBe('stone') // new top
  })

  it('no trigger when stack is empty', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    player.resources.grain = 0
    player.cardStates!['E040_BeeStatue']!.stack = []
    session.loadState(state)

    const resp = session.takeAction(0, 'day-laborer')
    expect(resp.ok).toBe(true)

    const updatedPlayer = resp.state.players[0]!
    // Only day laborer food, no grain from bee statue
    expect(updatedPlayer.resources.grain).toBe(0)
  })

  it('no trigger for other action spaces', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    player.resources.grain = 0
    session.loadState(state)

    // Use farmland instead of day-laborer
    const resp = session.takeAction(0, 'farmland')
    expect(resp.ok).toBe(true)

    const updatedPlayer = resp.state.players[0]!
    expect(updatedPlayer.resources.grain).toBe(0)
    const stack = getCardStack(updatedPlayer, 'E040_BeeStatue')
    expect(stack.length).toBe(5) // unchanged
  })
})

describe('E040 Bee Statue parity', () => {
  const CARD_ID = 'E040_BeeStatue'

  const FILLER = '__test_placeholder__'

  const FULL_STACK = ['vegetable', 'stone', 'grain', 'stone', 'grain']

  const setup = ({ played = true, stack }: { played?: boolean; stack?: string[] } = {}) => {
    const session = new GameSession(6040, undefined, { playerCount: 2 })
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.currentPlayerIndex = 0
    state.round = 1
    state.roundPhase = 'work'
    state.availableMajorImprovements = []
    state.players.forEach((player, index) => {
      setWorkersAtHome(state, player, 2)
      player.minorHand = [FILLER]
      player.occupationHand = [FILLER]
      player.minorPlayed = []
      player.occupationPlayed = []
      player.cardStates = {}
      Object.assign(player.resources, {
        wood: 0, clay: 0, reed: 0, stone: 0, food: index === 0 ? 0 : 20,
        grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
      })
    })
    const owner = state.players[0]!
    owner.minorHand = played ? [FILLER] : [CARD_ID]
    owner.minorPlayed = played ? [CARD_ID] : []
    owner.resources.clay = played ? 0 : 2
    if (played) owner.cardStates[CARD_ID] = { stack: stack ?? [...FULL_STACK] }
    state.actionSpaces.forEach((space) => { space.takenBy = [] })
    session.loadState(state)
    return session
  }

  const options = (response: SessionResponse) => response.interaction.stateId === 'wait'
    ? response.interaction.request.options ?? []
    : []

  const playMinor = (session: GameSession) => {
    let response = session.takeAction(0, 'meeting-place')
    if (response.interaction.stateId !== 'wait') return response
    if (!options(response).some((option) => option.value === CARD_ID)) {
      const improvement = options(response).find((option) =>
        option.value.startsWith('action-improvement-'))
      if (improvement) response = session.resolveChoice(response.interaction.playerIndex, improvement.value)
    }
    if (!response.state.players[0]!.minorHand.includes(CARD_ID)) return response
    if (response.interaction.stateId !== 'wait') return response
    const card = options(response).find((option) => option.value === CARD_ID)
    expect(card).toBeDefined()
    return session.resolveChoice(response.interaction.playerIndex, card!.value)
  }

  it('E040 S1: paying two clay plays Bee Statue with its fixed five-good stack', () => {
    const response = playMinor(setup({ played: false }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.clay).toBe(0)
    expect(response.state.players[0]!.cardStates[CARD_ID]?.stack).toEqual(FULL_STACK)
  })

  it('E040 S2: successive Day Laborer uses take grain, stone, grain, stone, then vegetable', () => {
    let session = setup()
    const expected = ['grain', 'stone', 'grain', 'stone', 'vegetable'] as const

    for (const resource of expected) {
      const before = session.state.players[0]!.resources[resource]
      const response = session.takeAction(0, 'day-laborer')
      expect(response.ok, response.error).toBe(true)
      expect(response.state.players[0]!.resources[resource]).toBe(before + 1)
      if ((response.state.players[0]!.cardStates[CARD_ID]?.stack?.length ?? 0) > 0) {
        const next = setup({ stack: response.state.players[0]!.cardStates[CARD_ID]!.stack })
        next.state.players[0]!.resources = { ...response.state.players[0]!.resources }
        next.loadState(next.state)
        session = next
      }
    }

    expect(session.state.players[0]!.cardStates[CARD_ID]?.stack).toEqual([])
  })
})

describe('ae-negative-35-placement', () => {
  const { sessions, save, finish, ready, action, progress, buy, bee } = audit35Placement
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()));
  it('E040 N1 actual clay purchase creates the exact stack and five natural Day Laborer uses pop grain stone grain stone vegetable then a sixth gives nothing', () => {
      const s = bee(), bought = finish(s, buy(s, 'E040_BeeStatue'));
      assert.equal(bought.state.players[0]!.resources.clay, 0);
      assert.deepEqual(getCardStack(bought.state.players[0]!, 'E040_BeeStatue'), ['vegetable', 'stone', 'grain', 'stone', 'grain']);
      const opponent = action(s, 1, 'forest');
      ready(s);
      const rows = [];
      for (const [round, grain, stone, vegetable, remaining] of [[5, 1, 0, 0, 4], [6, 1, 1, 0, 3], [7, 2, 1, 0, 2], [8, 2, 2, 0, 1], [9, 2, 2, 1, 0], [10, 2, 2, 1, 0]] as const) {
          if (round > 5)
              progress(s, round, '', ['forest', 'reed-bank', 'grain-seeds', 'meeting-place']);
          const r = action(s, 0, 'day-laborer');
          assert.deepEqual([r.state.players[0]!.resources.grain, r.state.players[0]!.resources.stone, r.state.players[0]!.resources.vegetable, getCardStack(r.state.players[0]!, 'E040_BeeStatue').length], [grain, stone, vegetable, remaining]);
          rows.push(r);
      }
      save('E040-N1', { bought, opponent, rows });
  });
  it('E040 N2 real opponent Day Laborer and an unrelated owner action do not pop the stack created by actual purchase', () => { const s = bee(), bought = finish(s, buy(s, 'E040_BeeStatue')), opponent = action(s, 1, 'day-laborer'), owner = action(s, 0, 'reed-bank'); assert.equal(getCardStack(owner.state.players[0]!, 'E040_BeeStatue').length, 5); assert.deepEqual([owner.state.players[0]!.resources.grain, owner.state.players[0]!.resources.stone, owner.state.players[0]!.resources.vegetable], [0, 0, 0]); save('E040-N2', { bought, opponent, owner }); });
  it('E040 N3 insufficient clay cannot purchase and a held card gives no grain on a real Day Laborer use', () => { const s = bee(false, 1), p = buy(s, 'E040_BeeStatue'), bad = assertRejectedUnchanged(s, () => s.resolveChoice(0, 'E040_BeeStatue')); assert.ok(p.state.players[0]!.minorHand.includes('E040_BeeStatue')); const t = bee(), held = action(t, 0, 'day-laborer'); assert.deepEqual([held.state.players[0]!.resources.food, held.state.players[0]!.resources.grain, getCardStack(held.state.players[0]!, 'E040_BeeStatue').length], [102, 0, 0]); save('E040-N3', { p, bad, held }); });
})
