import { describe, expect, it } from 'vitest'
import { GameSession } from '../game-session'
import { runCardEffectHook } from '../../shared/cards/card-effects'

import { markAllWorkersUsed, setActiveWorkerCount } from '../../shared/game/player'
import '../../shared/cards/A/A106_SlurrySpreader'

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
  const session = new GameSession()
  const state = session.getState().state
  state.players = state.players.slice(0, 2)

  const player = state.players[0]!
  player.minorPlayed.push(CARD_ID)
  player.playedCards = player.playedCards ?? []
  player.playedCards.push(`minor:${CARD_ID}`)

  return { state, player }
}

describe('A106_SlurrySpreader session', () => {
  it('grain field depleted after reap gives 2 food', () => {
    const { state, player } = setup()

    player.fields = [{ row: 0, col: 0, stacks: [] }]
    state.harvestReapSummary = {
      [player.id]: { resources: { grain: 1 }, grainFields: 1, vegetableFields: 0 },
    }

    const flow = runCardEffectHook(state, player, CARD_ID, 'onAfterReap')

    expectGainFoodLeaf(flow, 2)
  })

  it('vegetable field depleted after reap gives 1 food', () => {
    const { state, player } = setup()

    player.fields = [{ row: 0, col: 0, stacks: [] }]
    state.harvestReapSummary = {
      [player.id]: { resources: { vegetable: 1 }, grainFields: 0, vegetableFields: 1 },
    }

    const flow = runCardEffectHook(state, player, CARD_ID, 'onAfterReap')

    expectGainFoodLeaf(flow, 1)
  })

  it('grain field with remaining crop after reap does not trigger', () => {
    const { state, player } = setup()

    player.fields = [{ row: 0, col: 0, stacks: [{ kind: 'grain', remaining: 2 }] }]
    state.harvestReapSummary = {
      [player.id]: { resources: { grain: 1 }, grainFields: 1, vegetableFields: 0 },
    }

    const flow = runCardEffectHook(state, player, CARD_ID, 'onAfterReap')

    expect(flow).toBeNull()
  })

  it('vegetable field with remaining crop after reap does not trigger', () => {
    const { state, player } = setup()

    player.fields = [{ row: 0, col: 0, stacks: [{ kind: 'vegetable', remaining: 1 }] }]
    state.harvestReapSummary = {
      [player.id]: { resources: { vegetable: 1 }, grainFields: 0, vegetableFields: 1 },
    }

    const flow = runCardEffectHook(state, player, CARD_ID, 'onAfterReap')

    expect(flow).toBeNull()
  })

  it('integration: harvest chain grants food for an emptied grain field', () => {
    const session = new GameSession()
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
    player.minorPlayed.push(CARD_ID)
    player.playedCards = player.playedCards ?? []
    player.playedCards.push(`minor:${CARD_ID}`)
    player.fields = [{ row: 0, col: 0, stacks: [{ kind: 'grain', remaining: 1 }] }]

    session.loadState(state)

    let resp = session.performRoundEnd()
    let safety = 20

    while (safety-- > 0 && resp.pending.type !== 'none') {
      if (resp.pending.type === 'harvestFeed') {
        resp = session.confirmHarvestFeed(resp.pending.playerIndex, [])
        continue
      }

      if (resp.pending.type === 'animalReorg') {
        resp = session.confirmAnimalReorg(resp.pending.playerIndex, resp.interaction.zones)
        continue
      }

      if (resp.pending.type === 'choice') {
        const skipOption = resp.pending.options.find((option) => option.value === '__skip__')
        const choiceValue = skipOption?.value ?? resp.pending.options[0]!.value
        resp = session.resolveChoice(resp.pending.playerIndex, choiceValue)
        continue
      }

      throw new Error(`unexpected pending state: ${resp.pending.type}`)
    }

    expect(resp.pending.type).toBe('none')
    const playerAfter = resp.state.players[0]!
    expect(playerAfter.resources.food).toBe(0)
    expect(playerAfter.resources.grain).toBe(1)
    expect(playerAfter.resources.begging).toBe(0)
    expect(resp.state.harvestReapSummary).toBeUndefined()
  })
})
