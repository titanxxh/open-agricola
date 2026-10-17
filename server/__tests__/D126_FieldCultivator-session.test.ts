import { type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'

import { describe, expect, it, afterEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { getCardStack } from '../../shared/cards/helpers/card-state'
import { runCardEffectHook } from '../../shared/cards/card-effects'

import { markAllWorkersUsed, setActiveWorkerCount } from '../../shared/domain/player'
import '../../shared/cards/D/D126_FieldCultivator'
import { autoAdvanceRoundEnd } from '../../tests/llm-card-gen/session-helpers'
import '../../shared/cards/B/B068_Beanfield'
import assert from 'node:assert/strict'
import * as audit51Family from './_helpers/audit/ae-negative-51-family'

const CARD_ID = 'D126_FieldCultivator'

describe('D126_FieldCultivator session', () => {
  const setup = (options?: {
    fields?: { row: number; col: number; stacks: { kind: 'grain' | 'vegetable'; remaining: number }[] }[]
  }) => {
    const session = new GameSession(42)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 4 // harvest round

    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    // Simulate onBuy: push stack
    session.withCtx(() => runCardEffectHook(state, player, CARD_ID, 'onBuy'))

    if (options?.fields) {
      player.fields = options.fields
    }

    // Set workers to 0 for round end
    state.players.forEach((p) => {
      markAllWorkersUsed(state, p)
      setActiveWorkerCount(p, 1)
      p.resources.food = 10 // enough to feed
    })

    session.loadState(state)
    return session
  }

  it('onBuy places 7 goods on stack', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    const stack = getCardStack(player, CARD_ID)
    expect(stack).toEqual(['wood', 'clay', 'reed', 'stone', 'reed', 'clay', 'wood'])
    expect(stack.length).toBe(7)
  })

  it('harvesting 2 fields pops 2 goods from stack', () => {
    const session = setup({
      fields: [
        { row: 0, col: 0, stacks: [{ kind: 'grain', remaining: 2 }] },
        { row: 0, col: 1, stacks: [{ kind: 'vegetable', remaining: 1 }] },
      ],
    })

    const stateBefore = session.getState().state
    const woodBefore = stateBefore.players[0]!.resources.wood
    const clayBefore = stateBefore.players[0]!.resources.clay

    autoAdvanceRoundEnd(session)

    const player = session.getState().state.players[0]!
    const stack = getCardStack(player, CARD_ID)
    // 7 - 2 = 5 remaining
    expect(stack.length).toBe(5)
    // Top 2 popped were 'wood' and 'clay' (popped from top)
    // wood was on top, then clay
    expect(player.resources.wood).toBeGreaterThanOrEqual(woodBefore + 1)
    expect(player.resources.clay).toBeGreaterThanOrEqual(clayBefore + 1)
  })

  it('no pop when no fields are harvested', () => {
    const session = setup({
      fields: [],
    })

    autoAdvanceRoundEnd(session)

    const player = session.getState().state.players[0]!
    const stack = getCardStack(player, CARD_ID)
    expect(stack.length).toBe(7) // unchanged
  })

  it('does not pop a good when only a Card Field is harvested', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    player.minorPlayed.push('B068_Beanfield')
    player.cardStates.B068_Beanfield = {
      extraData: { cardFieldStacks: [{ crop: 'vegetable', remaining: 1 }] },
    }
    session.loadState(state)

    autoAdvanceRoundEnd(session)

    expect(session.getState().state.players[0]!.resources.vegetable).toBe(1)
    expect(getCardStack(session.getState().state.players[0]!, CARD_ID)).toHaveLength(7)
  })

  it('no pop when stack is empty', () => {
    const session = setup({
      fields: [
        { row: 0, col: 0, stacks: [{ kind: 'grain', remaining: 2 }] },
      ],
    })

    // Empty the stack
    const state = session.getState().state
    state.players[0]!.cardStates![CARD_ID]!.stack = []
    session.loadState(state)

    autoAdvanceRoundEnd(session)

    const player = session.getState().state.players[0]!
    const stack = getCardStack(player, CARD_ID)
    expect(stack.length).toBe(0)
  })

  it('pops only up to stack size when more fields are harvested', () => {
    const session = setup({
      fields: [
        { row: 0, col: 0, stacks: [{ kind: 'grain', remaining: 2 }] },
        { row: 0, col: 1, stacks: [{ kind: 'vegetable', remaining: 1 }] },
        { row: 0, col: 2, stacks: [{ kind: 'grain', remaining: 3 }] },
      ],
    })

    // Set stack to only 2 items
    const state = session.getState().state
    state.players[0]!.cardStates![CARD_ID]!.stack = ['stone', 'reed']
    session.loadState(state)

    autoAdvanceRoundEnd(session)

    const player = session.getState().state.players[0]!
    const stack = getCardStack(player, CARD_ID)
    // 3 fields harvested but only 2 items on stack, so both popped
    expect(stack.length).toBe(0)
  })
})

describe('D126 Field Cultivator parity', () => {
  const CARD_ID = 'D126_FieldCultivator'

  const CARD_FIELD = 'B068_Beanfield'

  const FILLER = '__test_placeholder__'

  const STACK = ['wood', 'clay', 'reed', 'stone', 'reed', 'clay', 'wood']

  type Crop = 'grain' | 'vegetable'

  type FieldSpec = { kind: Crop; remaining: number }

  const setup = ({
    played = true, fields = [], cardField = 0, stack, harvest = false,
  }: {
    played?: boolean
    fields?: FieldSpec[]
    cardField?: number
    stack?: string[]
    harvest?: boolean
  } = {}) => {
    const session = new GameSession(6126, undefined, { playerCount: 2 })
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.currentPlayerIndex = 0
    state.round = 4
    state.roundPhase = 'work'
    state.actionSpaces.forEach((space) => { space.takenBy = [] })
    state.players.forEach((player) => {
      setActiveWorkerCount(player, 2)
      setWorkersAtHome(state, player, 2)
      player.minorHand = [FILLER]
      player.occupationHand = [FILLER]
      player.minorPlayed = []
      player.occupationPlayed = []
      player.cardStates = {}
      player.fields = []
      player.resources = {
        ...player.resources, wood: 0, clay: 0, reed: 0, stone: 0, food: 20, grain: 0,
        vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
      }
    })
    const owner = state.players[0]!
    owner.occupationHand = played ? [FILLER] : [CARD_ID]
    owner.occupationPlayed = played ? [CARD_ID] : []
    owner.fields = fields.map(({ kind, remaining }, index) => ({
      row: 0, col: index, stacks: [{ kind, remaining }],
    }))
    if (played) {
      owner.cardStates[CARD_ID] = {
        stack: [...(stack ?? STACK)],
        infobox: `${(stack ?? STACK).length} goods`,
      }
    }
    if (cardField > 0) {
      owner.minorPlayed.push(CARD_FIELD)
      owner.cardStates[CARD_FIELD] = {
        extraData: { cardFieldStacks: [{ crop: 'vegetable', remaining: cardField }] },
      }
    }
    owner.startPlayer = true
    state.players[1]!.startPlayer = false
    if (harvest) state.players.forEach((player) => markAllWorkersUsed(state, player))
    session.loadState(state)
    return session
  }

  const options = (response: SessionResponse) => response.interaction.stateId === 'wait'
    ? response.interaction.request.options ?? []
    : []

  const playOccupation = (session: GameSession) => {
    let response = session.takeAction(0, 'lessons')
    expect(response.ok, response.error).toBe(true)
    if (!response.state.players[0]!.occupationHand.includes(CARD_ID)) return response
    const card = options(response).find((option) => option.value === CARD_ID)
    expect(card, JSON.stringify(response.interaction)).toBeDefined()
    if (card) response = session.resolveChoice(response.interaction.playerIndex, card.value)
    return response
  }

  it('D126 S1: playing Field Cultivator places seven goods in the printed stack order', () => {
    const response = playOccupation(setup({ played: false }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
    expect(getCardStack(response.state.players[0]!, CARD_ID)).toEqual(STACK)
  })

  it('D126 S2: harvesting two ordinary fields takes the top two goods', () => {
    const session = setup({
      fields: [{ kind: 'grain', remaining: 2 }, { kind: 'vegetable', remaining: 1 }],
      harvest: true,
    })

    const response = autoAdvanceRoundEnd(session)

    expect(response.state.players[0]!.resources).toMatchObject({
      grain: 1, vegetable: 1, wood: 1, clay: 1,
    })
    expect(getCardStack(response.state.players[0]!, CARD_ID)).toEqual(STACK.slice(0, 5))
  })

  it('D126 S3: harvesting only a Card Field takes no Field Cultivator good', () => {
    const response = autoAdvanceRoundEnd(setup({ cardField: 2, harvest: true }))

    expect(response.state.players[0]!.resources.vegetable).toBe(1)
    expect(getCardStack(response.state.players[0]!, CARD_ID)).toEqual(STACK)
  })

  it('D126 S4: a harvest without a harvested field leaves the stack unchanged', () => {
    const response = autoAdvanceRoundEnd(setup({ harvest: true }))

    expect(getCardStack(response.state.players[0]!, CARD_ID)).toEqual(STACK)
    expect(response.state.players[0]!.resources).toMatchObject({
      wood: 0, clay: 0, reed: 0, stone: 0,
    })
  })

  it('D126 S5: two harvested fields take only the one remaining stack good', () => {
    const response = autoAdvanceRoundEnd(setup({
      fields: [{ kind: 'grain', remaining: 2 }, { kind: 'vegetable', remaining: 1 }],
      stack: ['stone'],
      harvest: true,
    }))

    expect(response.state.players[0]!.resources.stone).toBe(1)
    expect(getCardStack(response.state.players[0]!, CARD_ID)).toEqual([])
  })
})

describe('ae-negative-51-family', () => {
  const { sessions, save, setup, finish, completeRound, lesson, play, grainField } = audit51Family
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()))
  it('D126 N1 real play creates ordered seven-good pile then natural reap rewards physical field tiles up to finite exhaustion', () => {
    for (const count of [1, 2, 8]) {
      const tiles = [{ row: 0, col: 0 }, { row: 0, col: 1 }, { row: 0, col: 2 }, { row: 0, col: 3 }, { row: 0, col: 4 }, { row: 1, col: 1 }, { row: 1, col: 2 }, { row: 1, col: 3 }]
      const s = setup('D126_FieldCultivator', 4, state => state.players[0]!.fields = tiles.slice(0, count).map(tile => ({ ...tile, stacks: [{ kind: 'grain', remaining: 1 }] })))
      let r = play(s, 'D126_FieldCultivator')
      assert.deepEqual(r.state.players[0]!.cardStates.D126_FieldCultivator?.stack, ['wood', 'clay', 'reed', 'stone', 'reed', 'clay', 'wood'])
      finish(s, r)
      r = finish(s, completeRound(s, ['forest', 'fishing', 'clay-pit']))
      assert.equal(r.state.players[0]!.resources.grain, count)
      assert.equal(r.state.players[0]!.resources.wood, count === 8 ? 2 : 1)
      assert.equal(r.state.players[0]!.resources.clay, count === 1 ? 0 : count === 2 ? 1 : 2)
      assert.equal(r.state.players[0]!.resources.reed, count === 8 ? 2 : 0)
      assert.equal(r.state.players[0]!.resources.stone, count === 8 ? 1 : 0)
      assert.equal(r.state.players[0]!.cardStates.D126_FieldCultivator?.stack?.length, 7 - Math.min(count, 7))
      save(`D126-N1-${count}`, r)
    }
  })
  it('D126 N2 empty physical field and grain-bearing logical card field do not consume top good', () => {
    for (const mode of ['empty', 'card']) {
      const s = setup('D126_FieldCultivator', 4, state => {
        const p = state.players[0]!
        p.occupationPlayed = mode === 'card' ? ['A143_Stonecutter'] : []
        p.occupationHand = ['D126_FieldCultivator']
        if (mode === 'empty')
          grainField(state, 0)
        else {
          p.minorPlayed = ['E070_CropRotationField']
          p.cardStates.E070_CropRotationField = { extraData: { cardFieldStacks: [{ crop: 'grain', remaining: 2 }] } }
        }
      })
      let r = lesson(s, 'D126_FieldCultivator')
      assert.equal(r.state.players[0]!.cardStates.D126_FieldCultivator?.stack?.length, 7)
      finish(s, r)
      r = finish(s, completeRound(s, ['forest', 'fishing', 'clay-pit']))
      assert.equal(r.state.players[0]!.resources.wood, 0)
      assert.equal(r.state.players[0]!.resources.clay, 0)
      assert.equal(r.state.players[0]!.cardStates.D126_FieldCultivator?.stack?.length, 7)
      assert.equal(r.state.players[0]!.resources.grain, mode === 'card' ? 1 : 0)
      save(`D126-N2-${mode}`, r)
    }
  })
})
