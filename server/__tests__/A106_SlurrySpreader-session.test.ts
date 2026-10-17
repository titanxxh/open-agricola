import { describe, expect, it, afterEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { runCardEffectHook } from '../../shared/cards/card-effects'
import type { PlayerState } from '../../shared/contract/types'

import { markAllWorkersUsed, setActiveWorkerCount, setWorkersAtHome } from '../../shared/domain/player'
import '../../shared/cards/A/A106_SlurrySpreader'
import assert from 'node:assert/strict'
import * as audit13Harvest from './_helpers/audit/ae-negative-13-harvest'

const CARD_ID = 'A106_SlurrySpreader'

const expectGainFoodLeaf = (flow: ReturnType<typeof runCardEffectHook>, expectedFood: number) => {
  expect(flow).toBeDefined()
  expect(flow).toEqual(expect.objectContaining({
    type: 'leaf',
    actionId: 'gain',
    sourceCard: CARD_ID,
    params: expect.objectContaining({ food: expectedFood }),
  }))
}

const setup = () => {
  const session = new GameSession(42)
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.players = state.players.slice(0, 2)

  const player = state.players[0]!
  player.occupationPlayed.push(CARD_ID)

  return { session: session, state, player }
}

describe('A106_SlurrySpreader session', () => {
  it('grain field depleted after reap gives 2 food', () => {
    const { session: ruleSession, state, player } = setup()

    player.fields = [{ row: 0, col: 0, stacks: [] }]
    state.harvestReapSummary = {
      [player.id]: { resources: { grain: 1 }, grainFields: 1, vegetableFields: 0 },
    }

    const flow = ruleSession.withCtx(() => runCardEffectHook(state, player, CARD_ID, 'onAfterReap'))

    expectGainFoodLeaf(flow, 2)
  })

  it('vegetable field depleted after reap gives 1 food', () => {
    const { session: ruleSession, state, player } = setup()

    player.fields = [{ row: 0, col: 0, stacks: [] }]
    state.harvestReapSummary = {
      [player.id]: { resources: { vegetable: 1 }, grainFields: 0, vegetableFields: 1 },
    }

    const flow = ruleSession.withCtx(() => runCardEffectHook(state, player, CARD_ID, 'onAfterReap'))

    expectGainFoodLeaf(flow, 1)
  })

  it('grain field with remaining crop after reap does not trigger', () => {
    const { session: ruleSession, state, player } = setup()

    player.fields = [{ row: 0, col: 0, stacks: [{ kind: 'grain', remaining: 2 }] }]
    state.harvestReapSummary = {
      [player.id]: { resources: { grain: 1 }, grainFields: 1, vegetableFields: 0 },
    }

    const flow = ruleSession.withCtx(() => runCardEffectHook(state, player, CARD_ID, 'onAfterReap'))

    expect(flow).toBeNull()
  })

  it('vegetable field with remaining crop after reap does not trigger', () => {
    const { session: ruleSession, state, player } = setup()

    player.fields = [{ row: 0, col: 0, stacks: [{ kind: 'vegetable', remaining: 1 }] }]
    state.harvestReapSummary = {
      [player.id]: { resources: { vegetable: 1 }, grainFields: 0, vegetableFields: 1 },
    }

    const flow = ruleSession.withCtx(() => runCardEffectHook(state, player, CARD_ID, 'onAfterReap'))

    expect(flow).toBeNull()
  })

  it('integration: harvest chain grants food for an emptied grain field', () => {
    const session = new GameSession(42)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 4

    state.players.forEach((p, index) => {
      markAllWorkersUsed(state, p)
      setActiveWorkerCount(p, 1)
      p.resources.food = index === 0 ? 0 : 10
    })

    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    player.playedCards = player.playedCards ?? []
    player.playedCards.push(`occupation:${CARD_ID}`)
    player.fields = [{ row: 0, col: 0, stacks: [{ kind: 'grain', remaining: 1 }] }]

    session.loadState(state)

    let resp = session.performRoundEnd()
    let safety = 20

    while (safety-- > 0 && resp.interaction.stateId === 'wait') {
      if (resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'feed') {
        resp = session.resolveChoice(resp.interaction.playerIndex, 'confirm', { selections: [] })
        continue
      }

      if (resp.interaction.stateId === 'wait' && resp.interaction.promptKey === 'ui.interactionAnimalReorg') {
        resp = session.resolveChoice(
          resp.interaction.playerIndex,
          'confirm',
          { zones: resp.interaction.request.zones } as unknown as Record<string, unknown>,
        )
        continue
      }

      if (resp.interaction.stateId === 'wait') {
        const options = resp.interaction.request.options ?? []
        const skipOption = options.find((option) => option.value === '__skip__')
        const choiceValue = skipOption?.value ?? options[0]!.value
        resp = session.resolveChoice(resp.interaction.playerIndex, choiceValue)
        continue
      }

      throw new Error('unexpected interaction state')
    }

    expect(resp.interaction.stateId).toBe('idle')
    const playerAfter = resp.state.players[0]!
    expect(playerAfter.resources.food).toBe(0)
    expect(playerAfter.resources.grain).toBe(1)
    expect(playerAfter.resources.begging).toBe(0)
    expect(resp.state.harvestReapSummary).toBeUndefined()
  })
})

const FIXED_HANDS = [
  { occupation: 'A116_WoodCutter', minor: 'A004_Baseboards' },
  { occupation: 'B116_Shoreforester', minor: 'B003_Moonshine' },
]

const makeTypeSession = (type: 'occupation' | 'minor') => {
  const session = new GameSession(106, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 14
  state.roundPhase = 'work'
  state.players.forEach((player, index) => {
    setActiveWorkerCount(player, 2)
    setWorkersAtHome(state, player, 2)
    player.occupationHand = [FIXED_HANDS[index]!.occupation]
    player.minorHand = [FIXED_HANDS[index]!.minor]
  })
  const player = state.players[0]!
  if (type === 'occupation') player.occupationHand = [CARD_ID]
  else player.minorHand = [CARD_ID]
  session.loadState(state)
  return session
}

const makeHarvestSession = (fields: PlayerState['fields']) => {
  const session = new GameSession(106, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 4
  state.roundPhase = 'work'
  state.players.forEach((player, index) => {
    player.occupationHand = [FIXED_HANDS[index]!.occupation]
    player.minorHand = [FIXED_HANDS[index]!.minor]
    markAllWorkersUsed(state, player)
    setActiveWorkerCount(player, 2)
    player.resources.food = 10
  })
  const player = state.players[0]!
  player.occupationPlayed = [CARD_ID]
  player.playedCards = [`occupation:${CARD_ID}`]
  player.fields = fields
  session.loadState(state)
  return session
}

const finishHarvest = (session: GameSession) => {
  let resp = session.performRoundEnd()
  let safety = 20
  while (safety-- > 0 && resp.interaction.stateId === 'wait') {
    if (resp.interaction.request.kind === 'feed') {
      resp = session.resolveChoice(resp.interaction.playerIndex, 'confirm', { selections: [] })
      continue
    }
    if (resp.interaction.promptKey === 'ui.interactionAnimalReorg') {
      resp = session.resolveChoice(resp.interaction.playerIndex, 'confirm', {
        zones: resp.interaction.request.zones,
      } as unknown as Record<string, unknown>)
      continue
    }
    const options = resp.interaction.request.options ?? []
    const choice = options.find((option) => option.value === '__skip__') ?? options[0]
    if (!choice) throw new Error('unexpected empty harvest choice')
    resp = session.resolveChoice(resp.interaction.playerIndex, choice.value)
  }
  return resp
}

describe('A106 parity batch-02 characterization', () => {
  it('A106 S1: Lessons plays Slurry Spreader as an occupation', () => {
    const session = makeTypeSession('occupation')
    const resp = session.takeAction(0, 'lessons')

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.occupationHand).not.toContain(CARD_ID)
    expect(resp.state.players[0]!.occupationPlayed).toContain(CARD_ID)
  })

  it('A106 S2: Meeting Place does not play Slurry Spreader as a minor improvement', () => {
    const session = makeTypeSession('minor')
    const resp = session.takeAction(0, 'meeting-place')

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.minorHand).toContain(CARD_ID)
    expect(resp.state.players[0]!.minorPlayed).not.toContain(CARD_ID)
    if (resp.interaction.stateId === 'wait') {
      expect(resp.interaction.request.options?.some((option) => option.value === CARD_ID) ?? false).toBe(false)
    }
  })

  it('A106 S3: an emptied grain field grants two food during the real harvest', () => {
    const resp = finishHarvest(makeHarvestSession([
      { row: 0, col: 0, stacks: [{ kind: 'grain', remaining: 1 }] },
    ]))

    expect(resp.interaction.stateId).toBe('idle')
    expect(resp.state.players[0]!.resources.grain).toBe(1)
    expect(resp.state.players[0]!.resources.food).toBe(8)
  })

  it('A106 S4: an emptied vegetable field grants one food during the real harvest', () => {
    const resp = finishHarvest(makeHarvestSession([
      { row: 0, col: 0, stacks: [{ kind: 'vegetable', remaining: 1 }] },
    ]))

    expect(resp.interaction.stateId).toBe('idle')
    expect(resp.state.players[0]!.resources.vegetable).toBe(1)
    expect(resp.state.players[0]!.resources.food).toBe(7)
  })

  it('A106 S5: only fields emptied by the real harvest grant Slurry Spreader food', () => {
    const resp = finishHarvest(makeHarvestSession([
      { row: 0, col: 0, stacks: [{ kind: 'grain', remaining: 1 }] },
      { row: 1, col: 0, stacks: [{ kind: 'vegetable', remaining: 1 }] },
      { row: 2, col: 0, stacks: [{ kind: 'grain', remaining: 2 }] },
    ]))

    expect(resp.interaction.stateId).toBe('idle')
    expect(resp.state.players[0]!.resources.grain).toBe(2)
    expect(resp.state.players[0]!.resources.vegetable).toBe(1)
    expect(resp.state.players[0]!.resources.food).toBe(9)
  })
})

describe('ae-negative-13-harvest', () => {
  const { sessions, save, setup, finish } = audit13Harvest
  afterEach(() => sessions.splice(0).forEach(session => session.dispose()))
  it('A106 N1 real harvest awards two per emptied grain and one per emptied vegetable field', () => {
    const session = setup([{ kind: 'grain', remaining: 1 }, { kind: 'vegetable', remaining: 1 }, { kind: 'grain', remaining: 2 }, { kind: 'vegetable', remaining: 2 }])
    const response = finish(session); assert.equal(response.state.round, 5); const owner = response.state.players[0]!
    assert.equal(owner.resources.food, 41); assert.equal(owner.resources.grain, 3); assert.equal(owner.resources.vegetable, 2)
    assert.deepEqual(owner.fields.map(f => f.stacks), [[], [], [{ kind: 'grain', remaining: 1 }], [{ kind: 'vegetable', remaining: 1 }]]); save('A106-N1', response)
  })
  it('A106 N2 empty fields inventory crops and nonharvest cannot award depletion food', () => {
    const session = setup([], state => { state.players[0]!.fields = [{ row: 0, col: 1, stacks: [] }]; state.players[0]!.resources.grain = 4; state.players[0]!.resources.vegetable = 3 })
    const empty = finish(session); assert.equal(empty.state.players[0]!.resources.food, 38); assert.equal(empty.state.players[0]!.resources.grain, 5); assert.equal(empty.state.players[0]!.resources.vegetable, 3)
    const nonharvest = finish(setup([{ kind: 'grain', remaining: 1 }], undefined, true, 5)); assert.equal(nonharvest.state.round, 6); assert.equal(nonharvest.state.players[0]!.resources.food, 42); assert.equal(nonharvest.state.players[0]!.fields[0]!.stacks[0]!.remaining, 1); save('A106-N2', { empty, nonharvest })
  })
  it('A106 N3 card in hand and opponent depletion cannot reward owner', () => {
    const unplayed = finish(setup([{ kind: 'grain', remaining: 1 }], undefined, false)); assert.equal(unplayed.state.players[0]!.resources.food, 38)
    const response = finish(setup([], state => state.players[1]!.fields = [{ row: 0, col: 1, stacks: [{ kind: 'grain', remaining: 1 }] }])); assert.equal(response.state.players[0]!.resources.food, 38); assert.equal(response.state.players[1]!.resources.food, 36); assert.equal(response.state.players[1]!.resources.grain, 1); save('A106-N3', { response, unplayed })
  })
  it('A106 N4 later harvest rewards newly depleted fields once and repeated reads do not mutate', () => {
    const session = setup([{ kind: 'grain', remaining: 2 }]); const first = finish(session); assert.equal(first.state.players[0]!.resources.food, 38)
    finish(session); finish(session); const later = finish(session); assert.equal(later.state.round, 8); assert.equal(later.state.players[0]!.resources.food, 42); assert.deepEqual(later.state.players[0]!.fields[0]!.stacks, [])
    assert.deepEqual(session.getState().state, later.state); const next = finish(session); assert.equal(next.state.players[0]!.resources.food, 44); save('A106-N4', { first, later, next })
  })
})
