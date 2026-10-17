import { describe, expect, it, afterEach } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import type { ActionChoiceOption } from '../../shared/contract/types'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/E/E015_NailBasket'
import assert from 'node:assert/strict'
import { assertEmptyAccumulationRejected, assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit31Plows from './_helpers/audit/ae-negative-31-plows'

const CARD_ID = 'E015_NailBasket'
const FILLER = '__test_placeholder__'
const FENCE_EDGES = ['H-0-1', 'H-1-1', 'V-0-1', 'V-0-2']

const setup = ({
  played = false, reed = 1, stone = 0, wood = 0, actor = 0, playerCount = 2,
  forestWood = 3,
}: {
  played?: boolean
  reed?: number
  stone?: number
  wood?: number
  actor?: number
  playerCount?: number
  forestWood?: number
} = {}) => {
  const session = new GameSession(7015, undefined, { playerCount })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = actor
  state.round = 14
  state.roundPhase = 'work'
  state.availableMajorImprovements = []
  state.actionSpaces.forEach((space) => {
    space.takenBy = []
    if (space.id === 'forest') {
      space.resources.wood = forestWood
      space.resources.stone = 0
    }
    if (space.id === 'clay-pit') space.resources.clay = 2
    if (space.id === 'copse') {
      space.resources.wood = 2
      space.resources.stone = 0
    }
  })
  state.players.forEach((player, index) => {
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.improvements = []
    player.cardStates = {}
    Object.assign(player.resources, {
      wood: 0, clay: 0, reed: 0, stone: 0, food: 20,
      grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    })
    setWorkersAtHome(state, player, index === actor ? 2 : 0)
  })
  const owner = state.players[0]!
  owner.minorHand = played ? [FILLER] : [CARD_ID]
  owner.minorPlayed = played ? [CARD_ID] : []
  Object.assign(owner.resources, { reed, stone, wood })
  session.loadState(state)
  return session
}

const options = (response: SessionResponse) => response.interaction.stateId === 'wait'
  ? response.interaction.request.options ?? []
  : []

const enterMinor = (session: GameSession) => {
  let response = session.takeAction(0, 'major-improvement')
  if (response.interaction.stateId !== 'wait') return response
  if (!options(response).some((option) => option.value === CARD_ID)) {
    const branch = options(response).find((option) => option.value.startsWith('action-improvement-'))
    if (branch) response = session.resolveChoice(response.interaction.playerIndex, branch.value)
  }
  return response
}

const play = (session: GameSession) => {
  let response = enterMinor(session)
  if (!response.state.players[0]!.minorHand.includes(CARD_ID)) return response
  if (response.interaction.stateId !== 'wait') return response
  const card = options(response).find((option) => option.value === CARD_ID)
  if (card) response = session.resolveChoice(response.interaction.playerIndex, card.value)
  return response
}

const nailOption = (response: SessionResponse) => options(response).find((option: ActionChoiceOption) =>
  option.sourceCard === CARD_ID && option.value !== '__skip__')

const acceptNailBasket = (session: GameSession, response: SessionResponse) => {
  let current = response
  for (let guard = 0; guard < 3; guard += 1) {
    const option = nailOption(current)
    if (!option) return current
    current = session.resolveChoice(
      current.interaction.stateId === 'wait' ? current.interaction.playerIndex : 0,
      option.value,
    )
    if (
      current.interaction.stateId === 'wait'
      && current.interaction.request.kind === 'farm-select'
    ) return current
  }
  return current
}

const buildFourFences = (session: GameSession, response: SessionResponse) => {
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') throw new Error('expected fence selection')
  expect(response.interaction.sourceCard).toBe(CARD_ID)
  expect(response.interaction.request.farm?.farmType).toBe('fence')
  return session.commitSelectionChoice(0, { edges: FENCE_EDGES, extraWood: 0 })
}

describe('E015 Nail Basket parity', () => {
  it('E015 S1: paying one reed plays Nail Basket and scores one point', () => {
    const response = play(setup())

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.reed).toBe(0)
    expect(response.scores[0]!.categories.find((category) => category.key === 'cards')?.entries)
      .toContainEqual(expect.objectContaining({ cardId: CARD_ID, score: 1 }))
  })

  it('E015 S2: without one reed Nail Basket remains unavailable', () => {
    const response = enterMinor(setup({ reed: 0 }))

    expect(options(response).some((option) => option.value === CARD_ID)).toBe(false)
    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
  })

  it('E015 S3: after Forest the owner can return one stone there and build four fences for four wood', () => {
    const session = setup({ played: true, reed: 0, stone: 1, wood: 1 })

    const response = buildFourFences(session, acceptNailBasket(session, session.takeAction(0, 'forest')))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ stone: 0, wood: 0 })
    expect(response.state.actionSpaces.find((space) => space.id === 'forest')!.resources.stone).toBe(1)
    expect(response.state.players[0]!.fenceSegments).toHaveLength(4)
  })

  it('E015 S4: declining after Forest keeps the stone and builds no fences', () => {
    const session = setup({ played: true, reed: 0, stone: 1, wood: 1 })
    let response = session.takeAction(0, 'forest')
    expect(nailOption(response)).toBeDefined()

    response = session.resolveChoice(0, '__skip__')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.stone).toBe(1)
    expect(response.state.actionSpaces.find((space) => space.id === 'forest')!.resources.stone).toBe(0)
    expect(response.state.players[0]!.fenceSegments).toHaveLength(0)
  })

  it('E015 S5: without a stone OA skips the Nail Basket prompt', () => {
    const session = setup({ played: true, reed: 0, stone: 0 })

    const response = session.takeAction(0, 'forest')

    expect(response.ok, response.error).toBe(true)
    expect(nailOption(response)).toBeUndefined()
    expect(response.state.actionSpaces.find((space) => space.id === 'forest')!.resources.stone).toBe(0)
  })

  it('E015 S6: collecting clay does not trigger Nail Basket', () => {
    const session = setup({ played: true, reed: 0, stone: 1 })

    const response = session.takeAction(0, 'clay-pit')

    expect(response.ok, response.error).toBe(true)
    expect(nailOption(response)).toBeUndefined()
    expect(response.state.players[0]!.resources.stone).toBe(1)
  })

  it('E015 S7: another player collecting Forest does not trigger the owners Nail Basket', () => {
    const session = setup({ played: true, reed: 0, stone: 1, actor: 1 })

    const response = session.takeAction(1, 'forest')

    expect(response.ok, response.error).toBe(true)
    expect(nailOption(response)).toBeUndefined()
    expect(response.state.players[0]!.resources.stone).toBe(1)
    expect(response.state.actionSpaces.find((space) => space.id === 'forest')!.resources.stone).toBe(0)
  })

  it('E015 S8: Nail Basket cannot authorize an empty Forest', () => {
    const session = setup({ played: true, reed: 0, stone: 1, wood: 4, forestWood: 0 })
    const response = session.takeAction(0, 'forest')
    expect(response.ok).toBe(false)
    expect(response.interaction.stateId).toBe('idle')
    expect(response.state.actionSpaces.find(space => space.id === 'forest')!.resources.stone).toBe(0)
    expect(response.state.players[0]!.resources).toMatchObject({ stone: 1, wood: 4 })
    expect(response.state.players[0]!.fenceSegments).toHaveLength(0)
  })

  it('E015 S9: a four-player Copse also triggers Nail Basket', () => {
    const session = setup({
      played: true, reed: 0, stone: 1, wood: 2, playerCount: 4,
    })

    const response = buildFourFences(session, acceptNailBasket(session, session.takeAction(0, 'copse')))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.actionSpaces.find((space) => space.id === 'copse')!.resources.stone).toBe(1)
    expect(response.state.players[0]!.resources.wood).toBe(0)
    expect(response.state.players[0]!.fenceSegments).toHaveLength(4)
  })
})

describe('ae-negative-31-plows', () => {
  const { sessions, ok, options, actor, save, setup, finish, take, hand, buy, noSource, accept, minorSetup, boundary, fence } = audit31Plows
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()))
  it('E015 N1 real purchase pays printed cost and enforces missing resource or occupation', () => {
    const card = 'E015_NailBasket', s = minorSetup(card, 0, 0, 20)
    s.state.players[0]!.resources.reed = 1
    s.loadState(s.state)
    const r = buy(s, card)
    assert.equal(r.state.players[0]!.resources.wood, 0)
    assert.equal(r.state.players[0]!.resources.reed, 0)
    assert.equal(r.state.players[0]!.resources.food, 20)
    assert.equal(r.scores![0]!.categories.find(c => c.key === 'cards')?.entries?.find(e => 'cardId' in e && e.cardId === card)?.score, 1)
    save('E015-N1-legal', r)
    {
      const t = minorSetup(card, 0, 0, 20, 14)
      t.state.players[0]!.resources.reed = 0
      t.loadState(t.state)
      let q = take(t, 'meeting-place')
      const branch = options(q).find(o => o.value.startsWith('action-improvement-'))
      if (branch)
        q = ok(t.resolveChoice(actor(q), branch.value))
      assert.ok(!options(q).some(o => o.value === card && !o.disabled), JSON.stringify(q.interaction))
      if (q.interaction.stateId === 'wait' && q.interaction.request.kind === 'choice')
        assertRejectedUnchanged(t, () => t.resolveChoice(actor(q), card))
      assert.ok(q.state.players[0]!.minorHand.includes(card))
      save('E015-N1-resource', q)
    }
  })
  it('E015 N2 wood collection returns stone onto its physical source and builds ordinary paid fences', () => { const card = 'E015_NailBasket', s = setup(card, 14, st => Object.assign(st.players[0]!.resources, { wood: 1, stone: 1 })); let r = take(s, 'forest'); r = fence(s, accept(s, r, card), boundary([{ row: 0, col: 3 }])); assert.equal(r.state.players[0]!.resources.wood, 0); assert.equal(r.state.players[0]!.resources.stone, 0); assert.equal(r.state.players[0]!.fenceSegments.length, 4); assert.equal(r.state.players[0]!.pastures.length, 1); assert.equal(r.state.actionSpaces.find(a => a.id === 'forest')!.resources.stone, 1); save('E015-N2', r); })
  it('E015 N3 decline insufficient stone unrelated opponent and hand-only cannot build card fences', () => {
    for (const mode of ['decline', 'stone', 'unrelated', 'opponent', 'hand']) {
      const card = 'E015_NailBasket', s = setup(card, 14, st => {
        Object.assign(st.players[0]!.resources, { wood: 4, stone: mode === 'stone' ? 0 : 1 })
        if (mode === 'opponent')
          st.currentPlayerIndex = 1
        if (mode === 'hand')
          hand(st, card)
      })
      let r = take(s, mode === 'unrelated' ? 'clay-pit' : 'forest')
      if (mode !== 'decline')
        noSource(r, card)
      if (mode === 'stone')
        assertRejectedUnchanged(s, () => s.resolveChoice(actor(r), 'flow-7'))
      r = finish(s, r, mode !== 'decline')
      assert.equal(r.state.players[0]!.fenceSegments.length, 0)
      assert.equal(r.state.players[0]!.resources.stone, mode === 'stone' ? 0 : 1)
      save(`E015-N3-${mode}`, r)
    }
  })
  it('E015 N4 empty wood entry rejects with stone and a legal nonempty entry still rejects an unaffordable four-fence plan', () => {
    const card = 'E015_NailBasket'
    for (const wood of [4, 3]) {
      const s = setup(card, 14, st => { Object.assign(st.players[0]!.resources, { wood, stone: 1 }); st.actionSpaces.find(a => a.id === 'forest')!.resources.wood = 0 })
      const r = assertEmptyAccumulationRejected(s, 0, 'forest')
      assert.equal(r.state.players[0]!.resources.wood, wood)
      assert.equal(r.state.players[0]!.resources.stone, 1)
      assert.equal(r.state.players[0]!.fenceSegments.length, 0)
      save(`E015-N4-empty-${wood}`, r)
    }
    const t = setup(card, 14, st => { Object.assign(st.players[0]!.resources, { wood: 2, stone: 1 }); st.actionSpaces.find(a => a.id === 'forest')!.resources.wood = 1 })
    const r = accept(t, take(t, 'forest'), card)
    assert.equal(r.state.players[0]!.resources.wood, 3)
    assert.equal(r.state.players[0]!.resources.stone, 0)
    assertRejectedUnchanged(t, () => t.commitSelectionChoice(actor(r), { edges: boundary([{ row: 0, col: 3 }]), extraWood: 0 }))
    assert.equal(t.state.players[0]!.fenceSegments.length, 0)
    save('E015-N4-short', t.getState())
  })
})
