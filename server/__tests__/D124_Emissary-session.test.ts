import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { getCardStack } from '../../shared/cards/helpers/card-state'
import { markAllWorkersUsed, setActiveWorkerCount } from '../../shared/domain/player'
import type { Resource } from '../../shared/contract/types'

import '../../shared/cards/D/D124_Emissary'

const ANYTIME = 'D124-emissary-anytime'

const goodOption = (response: ReturnType<GameSession['getState']>, good: keyof Resource) => {
  expect(response.ok, response.error).toBe(true)
  if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'choice') throw new Error('expected Emissary choice')
  const option = response.interaction.request.options.find((candidate) =>
    candidate.effectPreview?.kind === 'resourceExchange'
    && candidate.effectPreview.resourcesPaid?.[good] === 1
    && candidate.effectPreview.resourcesGained?.stone === 1,
  )
  expect(option).toBeDefined()
  return option!
}

describe('D124_Emissary session', () => {
  const setup = () => {
    const session = new GameSession(124, undefined, { playerCount: 2 })
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.currentPlayerIndex = 0
    state.round = 1

    const player = state.players[0]!
    player.occupationHand.push('D124_Emissary')
    player.resources.wood = 2
    player.resources.clay = 2
    player.resources.food = 5
    player.resources.stone = 0
    player.resources.reed = 0
    player.resources.grain = 0
    player.resources.vegetable = 0
    player.resources.sheep = 0
    player.resources.boar = 0
    player.resources.cattle = 0
    session.loadState(state)
    session.devPlayCard(0, 'D124_Emissary')
    return session
  }

  const enterActiveInteraction = (session: GameSession) => {
    const resp = session.takeAction(0, 'farmland')
    expect(resp.ok).toBe(true)
    return resp
  }

  it('offers one ability and chooses a good before paying once', () => {
    const session = setup()
    const parent = enterActiveInteraction(session)
    expect(parent.interaction.anytimeActions.filter((action) => action.sourceCard === 'D124_Emissary').map((action) => action.id)).toEqual([ANYTIME])
    const before = JSON.stringify(parent.state)
    const started = session.takeAnytimeAction(0, ANYTIME)
    expect(started.ok, started.error).toBe(true)
    expect(JSON.stringify(started.state)).toBe(before)
    expect(started.interaction.anytimeActions.some((action) => action.id === ANYTIME)).toBe(false)
    const choice = structuredClone(started.interaction)
    const rejected = session.takeAnytimeAction(0, ANYTIME)
    expect(rejected.ok).toBe(false)
    expect(JSON.stringify(rejected.state)).toBe(before)
    expect(rejected.interaction).toEqual(choice)

    const resp = session.resolveChoice(0, goodOption(started, 'wood').value)
    expect(resp.ok).toBe(true)

    const updatedPlayer = resp.state.players[0]!
    expect(updatedPlayer.resources.wood).toBe(1)
    expect(updatedPlayer.resources.stone).toBe(1)
    expect(getCardStack(updatedPlayer, 'D124_Emissary')).toEqual(['wood'])
    expect(resp.state.events.filter((event) => event.type === 'resource.paid' && event.sourceCardId === 'D124_Emissary'))
      .toEqual([expect.objectContaining({ resources: { wood: 1 } })])
    expect(resp.state.events.filter((event) => event.type === 'resource.moved' && event.sourceCardId === 'D124_Emissary'))
      .toEqual([expect.objectContaining({ resources: { stone: 1 } })])
    expect(resp.interaction).toEqual(parent.interaction)
  })

  it('excludes previously placed goods from the next activation', () => {
    const session = setup()
    enterActiveInteraction(session)

    const choice = session.takeAnytimeAction(0, ANYTIME)
    expect(session.resolveChoice(0, goodOption(choice, 'wood').value).ok).toBe(true)
    const next = session.takeAnytimeAction(0, ANYTIME)
    expect(goodOption(next, 'clay')).toBeDefined()
    if (next.interaction.stateId !== 'wait' || next.interaction.request.kind !== 'choice') throw new Error('expected choices')
    expect(next.interaction.request.options.some((option) =>
      option.effectPreview?.kind === 'resourceExchange' && option.effectPreview.resourcesPaid?.wood,
    )).toBe(false)
  })

  it('place clay after wood: stack has both wood and clay', () => {
    const session = setup()
    enterActiveInteraction(session)

    const first = session.takeAnytimeAction(0, ANYTIME)
    expect(session.resolveChoice(0, goodOption(first, 'wood').value).ok).toBe(true)
    const second = session.takeAnytimeAction(0, ANYTIME)
    const resp2 = session.resolveChoice(0, goodOption(second, 'clay').value)
    expect(resp2.ok).toBe(true)

    const updatedPlayer = resp2.state.players[0]!
    expect(updatedPlayer.resources.wood).toBe(1)
    expect(updatedPlayer.resources.clay).toBe(1)
    expect(updatedPlayer.resources.stone).toBe(2)

    const stack = getCardStack(updatedPlayer, 'D124_Emissary')
    expect(stack).toContain('wood')
    expect(stack).toContain('clay')
  })

  it('not available for a good type the player does not have', () => {
    const session = setup()
    enterActiveInteraction(session)
    const resp = session.takeAnytimeAction(0, ANYTIME)
    if (resp.interaction.stateId !== 'wait' || resp.interaction.request.kind !== 'choice') throw new Error('expected choices')
    expect(resp.interaction.request.options.map((option) =>
      option.effectPreview?.kind === 'resourceExchange' ? option.effectPreview.resourcesPaid : undefined,
    )).toEqual([{ wood: 1 }, { clay: 1 }, { food: 1 }])
  })

  it('settles the only available good without an extra choice', () => {
    const session = setup()
    const state = session.getState().state
    state.players[0]!.resources = { ...state.players[0]!.resources, wood: 1, clay: 0, food: 0 }
    session.loadState(state)
    const parent = enterActiveInteraction(session)
    const response = session.takeAnytimeAction(0, ANYTIME)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, stone: 1 })
    expect(getCardStack(response.state.players[0]!, 'D124_Emissary')).toEqual(['wood'])
    expect(response.interaction).toEqual(parent.interaction)
  })

  it.each(['empty', 'already-placed'])('does not offer an activation with no eligible goods (%s)', (reason) => {
    const session = setup()
    const state = session.getState().state
    state.players[0]!.resources = { ...state.players[0]!.resources, wood: reason === 'empty' ? 0 : 1, clay: 0, food: 0 }
    state.players[0]!.cardStates.D124_Emissary = { stack: ['wood'] }
    session.loadState(state)
    const parent = enterActiveInteraction(session)
    expect(parent.interaction.anytimeActions.some((action) => action.id === ANYTIME)).toBe(false)
    const before = JSON.stringify(parent.state)
    const rejected = session.takeAnytimeAction(0, ANYTIME)
    expect(rejected.ok).toBe(false)
    expect(JSON.stringify(rejected.state)).toBe(before)
    expect(rejected.interaction).toEqual(parent.interaction)
  })

  it('undoes an unopened payment and a completed placement with the original host', () => {
    const session = setup()
    const parent = enterActiveInteraction(session)
    const resources = { ...parent.state.players[0]!.resources }
    const started = session.takeAnytimeAction(0, ANYTIME)
    expect(started.ok).toBe(true)
    const cancelled = session.undoStep()
    expect(cancelled.ok).toBe(true)
    expect(cancelled.state.players[0]!.resources).toEqual(resources)
    expect(getCardStack(cancelled.state.players[0]!, 'D124_Emissary')).toEqual([])
    expect(cancelled.interaction).toEqual(parent.interaction)
    const reopened = session.takeAnytimeAction(0, ANYTIME)
    expect(session.resolveChoice(0, goodOption(reopened, 'wood').value).ok).toBe(true)
    const undone = session.undoStep()
    expect(undone.ok).toBe(true)
    expect(undone.state.players[0]!.resources).toEqual(resources)
    expect(getCardStack(undone.state.players[0]!, 'D124_Emissary')).toEqual([])
    expect(undone.interaction.anytimeActions.some((action) => action.id === ANYTIME)).toBe(false)
    expect(session.undoStep().interaction).toEqual(parent.interaction)
  })

  it('removes a pre-scoring animal payment from its pasture', () => {
    const session = setup()
    const state = session.getState().state
    state.round = 14
    state.players.forEach((player) => {
      markAllWorkersUsed(state, player)
      setActiveWorkerCount(player, 1)
      player.resources.food = 10
    })
    const player = state.players[0]!
    player.startPlayer = true
    player.resources.sheep = 1
    player.pastures = [{
      id: 'sheep-pasture',
      size: 1,
      tiles: [{ row: 0, col: 0 }],
      stables: 0,
      animalType: 'sheep',
      animalCount: 1,
    }]
    state.players[1]!.startPlayer = false
    setActiveWorkerCount(state.players[1]!, 0)
    session.loadState(state)

    let resp = session.performRoundEnd()
    if (session.peekEnginePendingEnvelope()?.syntheticKind === 'post-reap-anytime') {
      resp = session.resolveChoice(0, '__skip__')
    }
    if (resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'feed') {
      resp = session.resolveChoice(0, 'confirm', { selections: [] })
    }
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') throw new Error('expected pre-scoring window')
    expect(resp.interaction.request.kind).toBe('choice')
    if (resp.interaction.request.kind !== 'choice') throw new Error('expected choice')
    const ability = resp.interaction.request.options.find((option) => option.sourceCard === 'D124_Emissary')
    expect(ability).toBeDefined()
    resp = session.resolveChoice(0, ability!.value)
    resp = session.resolveChoice(0, goodOption(resp, 'sheep').value)

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources).toMatchObject({ sheep: 0, stone: 1 })
    expect(resp.state.players[0]!.pastures[0]).toMatchObject({ animalType: null, animalCount: 0 })
    expect(getCardStack(resp.state.players[0]!, 'D124_Emissary')).toContain('sheep')

    resp = session.resolveChoice(0, '__skip__')
    expect(resp.state.gameOver).toBe(true)
    expect(resp.scores[0]?.categories.find((category) => category.key === 'sheeps')).toMatchObject({ quantity: 0, total: -1 })
  })
})
