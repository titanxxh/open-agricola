import { type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import '../../shared/cards/E/E005_NightLoot'

import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { getCardEffect } from '../../shared/cards/card-effects'
import type { ActionSpace, Resource } from '../../shared/contract/types'

import type { ActionFlow } from '../../shared/contract/types'

const CARD_ID = 'E005_NightLoot'

describe('E005_NightLoot session', () => {
  const setupSession = () => {
    const session = new GameSession(42)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    return { session, state }
  }

  it('onBuy offers XOR of 2-resource pairs from available accumulation spaces', () => {
    const { session, state } = setupSession()
    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)

    // Ensure at least 2 different building resource types on accumulation spaces
    const woodSpace = state.actionSpaces.find(
      (s: ActionSpace) => (s.gainPerRound.wood ?? 0) > 0,
    )
    const claySpace = state.actionSpaces.find(
      (s: ActionSpace) => (s.gainPerRound.clay ?? 0) > 0,
    )
    if (woodSpace) woodSpace.resources.wood = 3
    if (claySpace) claySpace.resources.clay = 2

    session.loadState(state)

    const effect = getCardEffect(CARD_ID)
    expect(effect).toBeDefined()
    const flow = effect!.onBuy!(state, player)

    if (woodSpace && claySpace) {
      expect(flow).toBeDefined()
      // Should be xor with pair options
      expect(flow!.type).toBe('xor')
    }
  })

  it('onBuy returns single gain when only 1 resource type available', () => {
    const { session, state } = setupSession()
    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)

    // Clear all accumulation spaces, then add just wood
    state.actionSpaces.forEach((s: ActionSpace) => {
      s.resources.wood = 0
      s.resources.clay = 0
      s.resources.reed = 0
      s.resources.stone = 0
    })
    const woodSpace = state.actionSpaces.find(
      (s: ActionSpace) => (s.gainPerRound.wood ?? 0) > 0,
    )
    if (woodSpace) woodSpace.resources.wood = 3

    session.loadState(state)

    const effect = getCardEffect(CARD_ID)
    const flow = effect!.onBuy!(state, player)

    if (woodSpace) {
      expect(flow).toBeDefined()
      // Multiple wood-bearing spaces may exist; impl emits leaf when only one
      // (space,resource) option is available, else XOR of single leaves.
      if (flow!.type === 'leaf') {
        const leaf = flow as Extract<ActionFlow, { type: 'leaf' }>
        expect(leaf.actionId).toBe('collect')
        expect(leaf.actionContext?.resource).toBe('wood')
        expect(leaf.actionContext?.amount).toBe(1)
      } else {
        expect(flow!.type).toBe('xor')
        const children = (flow as Extract<ActionFlow, { type: 'xor' }>).children
        for (const child of children) {
          expect(child.type).toBe('leaf')
          const leaf = child as Extract<ActionFlow, { type: 'leaf' }>
          expect(leaf.actionId).toBe('collect')
          expect(leaf.actionContext?.resource).toBe('wood')
          expect(leaf.actionContext?.amount).toBe(1)
        }
      }
    }
  })

  it('onBuy returns undefined when no accumulation spaces have resources', () => {
    const { session, state } = setupSession()
    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)

    // Clear all accumulation space resources
    state.actionSpaces.forEach((s: ActionSpace) => {
      s.resources.wood = 0
      s.resources.clay = 0
      s.resources.reed = 0
      s.resources.stone = 0
    })

    session.loadState(state)

    const effect = getCardEffect(CARD_ID)
    const flow = effect!.onBuy!(state, player)
    expect(flow).toBeUndefined()
  })

  it('onBuy choices contain correct resource pairs', () => {
    const { session, state } = setupSession()
    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)

    // Set up exactly wood and stone available
    state.actionSpaces.forEach((s: ActionSpace) => {
      s.resources.wood = 0
      s.resources.clay = 0
      s.resources.reed = 0
      s.resources.stone = 0
    })
    const woodSpace = state.actionSpaces.find(
      (s: ActionSpace) => (s.gainPerRound.wood ?? 0) > 0,
    )
    const stoneSpace = state.actionSpaces.find(
      (s: ActionSpace) => (s.gainPerRound.stone ?? 0) > 0,
    )
    if (woodSpace) woodSpace.resources.wood = 2
    if (stoneSpace) stoneSpace.resources.stone = 1

    session.loadState(state)

    const effect = getCardEffect(CARD_ID)
    const flow = effect!.onBuy!(state, player)

    if (woodSpace && stoneSpace) {
      expect(flow).toBeDefined()
      expect(flow!.type).toBe('xor')
      const children = (flow as Extract<ActionFlow, { type: 'seq' }>).children
      // Should have exactly 1 pair: wood+stone
      expect(children.length).toBe(1)
    }
  })

  it('onBuy uses collect leaves with actionContext that decrement accumulation spaces', () => {
    // The reference `E005_NightLoot::actSelectResources` decrements the chosen
    // accumulation space's resources. Our previous impl used gain leaves
    // pulling from the general supply, so the accumulation space was left
    // untouched (the player effectively double-banked the resource). After
    // T5e the leaf uses `collect` + actionContext partial-take semantics so
    // the source accumulation space is decremented (and downstream listeners
    // such as E33 can react via the `collect` action hook).
    const { session, state } = setupSession()
    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)

    const woodSpace = state.actionSpaces.find((s: ActionSpace) => (s.gainPerRound.wood ?? 0) > 0)
    const stoneSpace = state.actionSpaces.find((s: ActionSpace) => (s.gainPerRound.stone ?? 0) > 0)
    state.actionSpaces.forEach((s: ActionSpace) => {
      s.resources.wood = 0
      s.resources.clay = 0
      s.resources.reed = 0
      s.resources.stone = 0
    })
    if (woodSpace) woodSpace.resources.wood = 2
    if (stoneSpace) stoneSpace.resources.stone = 1

    session.loadState(state)
    const effect = getCardEffect(CARD_ID)
    const flow = effect!.onBuy!(state, player) as ActionFlow

    if (!woodSpace || !stoneSpace) return
    expect(flow.type).toBe('xor')
    const children = (flow as Extract<ActionFlow, { type: 'seq' }>).children
    // Exactly 1 (wood+stone) pair candidate; must be a SEQ of 2 collect
    // leaves carrying actionContext, not a single gain leaf.
    expect(children.length).toBe(1)
    const child = children[0]
    expect(child.type).toBe('seq')
    const inner = (child as Extract<ActionFlow, { type: 'seq' }>).children
    expect(inner.length).toBe(2)
    inner.forEach((leaf) => {
      expect(leaf.type).toBe('leaf')
      const l = leaf as Extract<ActionFlow, { type: 'leaf' }>
      expect(l.actionId).toBe('collect')
      expect(l.actionContext?.amount).toBe(1)
      expect(['wood', 'stone']).toContain(l.actionContext?.resource as string)
    })
  })

})

describe('E005 Night Loot parity', () => {
  const CARD_ID = 'E005_NightLoot'

  const FILLER = '__test_placeholder__'

  const BUILDING = ['wood', 'clay', 'reed', 'stone'] as const

  const setup = ({
    playerCount = 2, spaceResources = {},
  }: {
    playerCount?: number
    spaceResources?: Record<string, Partial<Resource>>
  } = {}) => {
    const session = new GameSession(6005, undefined, { playerCount })
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.currentPlayerIndex = 0
    state.round = 14
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
        wood: 0, clay: 0, reed: 0, stone: 0, food: index === 0 ? 2 : 20,
        grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
      })
    })
    state.players[0]!.minorHand = [CARD_ID]
    state.actionSpaces.forEach((space) => {
      space.takenBy = []
      for (const resource of BUILDING) space.resources[resource] = 0
      Object.assign(space.resources, spaceResources[space.id] ?? {})
    })
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

  const chooseGain = (
    session: GameSession, response: SessionResponse, gains: Partial<Resource>,
  ) => {
    if (Object.entries(gains).every(([resource, amount]) =>
      response.state.players[0]!.resources[resource as keyof Resource] >= (amount ?? 0))) {
      return response
    }
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') return response
    const choice = options(response).find((option) => {
      const description = JSON.stringify(option.descriptionPreview ?? option)
      return Object.entries(gains).every(([resource, amount]) =>
        option.effectPreview?.resourcesGained?.[resource as keyof Resource] === amount
        || (amount === 1 && description.includes(`\"resource\":\"${resource}\"`)))
    })
    expect(choice, JSON.stringify(response.interaction)).toBeDefined()
    return session.resolveChoice(response.interaction.playerIndex, choice!.value)
  }

  const space = (response: SessionResponse, id: string) =>
    response.state.actionSpaces.find((candidate) => candidate.id === id)!

  it('E005 S1: paying two food passes Night Loot and takes two different building resources', () => {
    const session = setup({ spaceResources: { forest: { wood: 3 }, 'clay-pit': { clay: 2 } } })
    const response = chooseGain(session, playMinor(session), { wood: 1, clay: 1 })

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[1]!.minorHand).toContain(CARD_ID)
    expect(response.state.players[0]!.minorPlayed).not.toContain(CARD_ID)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 0, wood: 1, clay: 1 })
    expect(space(response, 'forest').resources.wood).toBe(2)
    expect(space(response, 'clay-pit').resources.clay).toBe(1)
  })

  it('E005 S2: with one available building-resource type Night Loot takes only one good', () => {
    const session = setup({ spaceResources: { forest: { wood: 3 } } })
    const response = chooseGain(session, playMinor(session), { wood: 1 })

    expect(response.state.players[0]!.resources.wood).toBe(1)
    expect(space(response, 'forest').resources.wood).toBe(2)
  })

  it('E005 S3: with no building resources on accumulation spaces Night Loot has no effect', () => {
    const response = playMinor(setup())

    expect(response.state.players[1]!.minorHand).toContain(CARD_ID)
    expect(response.state.players[0]!.resources).toMatchObject({
      food: 0, wood: 0, clay: 0, reed: 0, stone: 0,
    })
  })

  it('E005 S4: wood on two accumulation spaces still permits taking only one wood', () => {
    const session = setup({
      playerCount: 4, spaceResources: { forest: { wood: 3 }, copse: { wood: 2 } },
    })
    const offered = playMinor(session)

    expect(options(offered).every((option) => option.effectPreview?.resourcesGained?.wood !== 2))
      .toBe(true)
    const response = chooseGain(session, offered, { wood: 1 })
    expect(response.state.players[0]!.resources.wood).toBe(1)
  })

  it('E005 S5: a forged duplicate choice is rejected atomically and a legal retry succeeds', () => {
    const session = setup({
      playerCount: 4,
      spaceResources: { forest: { wood: 3 }, copse: { wood: 2 }, 'clay-pit': { clay: 2 } },
    })
    let response = playMinor(session)
    expect(options(response).every((option) => option.effectPreview?.resourcesGained?.wood !== 2))
      .toBe(true)
    response = session.resolveChoice(0, 'forged-duplicate-wood-pair')

    expect(response.ok).toBe(false)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, clay: 0 })
    expect(space(response, 'forest').resources.wood).toBe(3)
    expect(space(response, 'copse').resources.wood).toBe(2)
    response = chooseGain(session, response, { wood: 1, clay: 1 })

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 1, clay: 1 })
  })
})
