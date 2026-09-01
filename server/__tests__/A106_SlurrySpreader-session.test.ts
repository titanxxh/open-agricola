import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { runCardEffectHook } from '../../shared/cards/card-effects'
import type { PlayerState } from '../../shared/contract/types'

import { markAllWorkersUsed, setActiveWorkerCount, setWorkersAtHome } from '../../shared/domain/player'
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
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.players = state.players.slice(0, 2)

  const player = state.players[0]!
  player.minorPlayed.push(CARD_ID)

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
    player.minorPlayed.push(CARD_ID)
    player.playedCards = player.playedCards ?? []
    player.playedCards.push(`minor:${CARD_ID}`)
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

const playMinor = (session: GameSession) => {
  let resp = session.takeAction(0, 'meeting-place')
  expect(resp.ok).toBe(true)
  if (resp.interaction.stateId !== 'wait') return resp
  const improvementOption = resp.interaction.request.options?.find((option) => option.value.startsWith('action-improvement-'))
  if (improvementOption) resp = session.resolveChoice(0, improvementOption.value)
  if (resp.state.players[0]!.minorPlayed.includes(CARD_ID)) return resp
  expect(resp.interaction.stateId).toBe('wait')
  if (resp.interaction.stateId !== 'wait') return resp
  const cardOption = resp.interaction.request.options?.find((option) => option.value === CARD_ID)
  expect(cardOption).toBeDefined()
  return session.resolveChoice(0, cardOption!.value)
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
  player.minorPlayed = [CARD_ID]
  player.playedCards = [`minor:${CARD_ID}`]
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
  it('A106 S1: OA resolves Lessons without playing minor-typed Slurry Spreader', () => {
    const session = makeTypeSession('occupation')
    const resp = session.takeAction(0, 'lessons')

    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId === 'wait') {
      expect(resp.interaction.request.kind).toBe('confirm-next-player')
    }
    expect(resp.state.players[0]!.occupationHand).toEqual([CARD_ID])
    expect(resp.state.players[0]!.occupationPlayed).not.toContain(CARD_ID)
  })

  it('A106 S2: OA treats Slurry Spreader as a minor improvement', () => {
    const resp = playMinor(makeTypeSession('minor'))

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.minorHand).not.toContain(CARD_ID)
    expect(resp.state.players[0]!.minorPlayed).toContain(CARD_ID)
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
