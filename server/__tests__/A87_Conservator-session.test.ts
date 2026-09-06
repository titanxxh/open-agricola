import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { setWorkersAtHome } from '../../shared/domain/player'
import { executeCardListener, getRegisteredCardListeners, type CardListenerContext } from '../../shared/cards/card-listeners'

import '../../shared/cards/A/A087_Conservator'

const CARD_ID = 'A087_Conservator'

const findListener = (id: string) =>
  getRegisteredCardListeners().find((l) => l.id === id)

const setup = (
  overrides: {
    houseType?: 'wood' | 'clay' | 'stone'
    rooms?: number
    resources?: Partial<Record<string, number>>
    playA87?: boolean
  } = {},
) => {
  const session = new GameSession()
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0

  const owner = state.players[0]!
  if (overrides.playA87 !== false) {
    owner.occupationPlayed.push(CARD_ID)
  }
  owner.houseType = overrides.houseType ?? 'wood'
  owner.rooms = overrides.rooms ?? 2
  if (overrides.resources) {
    Object.assign(owner.resources, overrides.resources)
  }

  session.loadState(state)
  return session
}

describe('A087_Conservator computeChoiceCandidates listener', () => {
  it('injects a stone target when wooden house owner takes renovate-house', () => {
    const session = setup({ houseType: 'wood', rooms: 2 })
    const state = session.getState().state
    const player = state.players[0]!
    const listener = findListener('A87-conservator-add-stone-renovation-target')
    expect(listener).toBeDefined()

    const result = executeCardListener(listener!, {
      state,
      player,
      actionId: 'renovate-house',
      phase: 'computeChoiceCandidates',
    } as unknown as CardListenerContext)

    expect(result?.extraOptions).toEqual([
      { value: 'stone', labelKey: 'ui.interactionConservatorDirectStone', sourceCard: CARD_ID },
    ])
  })

  it('is silent on a clay house (already past the wood tier)', () => {
    const session = setup({ houseType: 'clay' })
    const state = session.getState().state
    const player = state.players[0]!
    const listener = findListener('A87-conservator-add-stone-renovation-target')!

    const result = executeCardListener(listener, {
      state,
      player,
      actionId: 'renovate-house',
      phase: 'computeChoiceCandidates',
    } as unknown as CardListenerContext)

    expect(result).toBeUndefined()
  })

  it('is silent when the player has not played A87', () => {
    const session = setup({ playA87: false })
    const state = session.getState().state
    const player = state.players[0]!
    const listener = findListener('A87-conservator-add-stone-renovation-target')!

    const result = executeCardListener(listener, {
      state,
      player,
      actionId: 'renovate-house',
      phase: 'computeChoiceCandidates',
    } as unknown as CardListenerContext)

    expect(result).toBeUndefined()
  })

  it('does not filter by affordability — engine decides what is selectable', () => {
    const session = setup({
      houseType: 'wood',
      rooms: 2,
      resources: { stone: 0, reed: 0 },
    })
    const state = session.getState().state
    const player = state.players[0]!
    const listener = findListener('A87-conservator-add-stone-renovation-target')!

    const result = executeCardListener(listener, {
      state,
      player,
      actionId: 'renovate-house',
      phase: 'computeChoiceCandidates',
    } as unknown as CardListenerContext)

    expect(result?.extraOptions).toEqual([
      { value: 'stone', labelKey: 'ui.interactionConservatorDirectStone', sourceCard: CARD_ID },
    ])
  })

  it('legacy computeReplace listener is gone (no XOR top-level branch)', () => {
    expect(findListener('A87-conservator-replace-renovate-house')).toBeUndefined()
  })
})

describe('A087_Conservator isDoable listener', () => {
  it('rescues entry visibility when wooden owner cannot afford clay tier but can afford stone tier', () => {
    const session = setup({
      houseType: 'wood',
      rooms: 2,
      resources: { stone: 2, reed: 1, clay: 0 },
    })
    const state = session.getState().state
    const player = state.players[0]!
    const listener = findListener('A87-conservator-isDoable-renovate-house')
    expect(listener).toBeDefined()

    const result = executeCardListener(listener!, {
      state,
      player,
      actionId: 'renovate-house',
      phase: 'isDoable',
      doable: false,
    } as unknown as CardListenerContext)

    expect(result?.doable).toBe(true)
  })

  it('is silent when the action is already reported doable', () => {
    const session = setup({
      houseType: 'wood',
      rooms: 2,
      resources: { stone: 2, reed: 1 },
    })
    const state = session.getState().state
    const player = state.players[0]!
    const listener = findListener('A87-conservator-isDoable-renovate-house')!

    const result = executeCardListener(listener, {
      state,
      player,
      actionId: 'renovate-house',
      phase: 'isDoable',
      doable: true,
    } as unknown as CardListenerContext)

    expect(result).toBeUndefined()
  })

  it('is silent when the player cannot afford the stone path either', () => {
    const session = setup({
      houseType: 'wood',
      rooms: 2,
      resources: { stone: 1, reed: 1 },
    })
    const state = session.getState().state
    const player = state.players[0]!
    const listener = findListener('A87-conservator-isDoable-renovate-house')!

    const result = executeCardListener(listener, {
      state,
      player,
      actionId: 'renovate-house',
      phase: 'isDoable',
      doable: false,
    } as unknown as CardListenerContext)

    expect(result).toBeUndefined()
  })

  it('is silent on non-wooden houses (no wood→stone shortcut applies)', () => {
    const session = setup({
      houseType: 'clay',
      rooms: 2,
      resources: { stone: 2, reed: 1 },
    })
    const state = session.getState().state
    const player = state.players[0]!
    const listener = findListener('A87-conservator-isDoable-renovate-house')!

    const result = executeCardListener(listener, {
      state,
      player,
      actionId: 'renovate-house',
      phase: 'isDoable',
      doable: true,
    } as unknown as CardListenerContext)

    expect(result).toBeUndefined()
  })

  it('is silent when the player has not played A87', () => {
    const session = setup({
      playA87: false,
      houseType: 'wood',
      rooms: 2,
      resources: { stone: 2, reed: 1 },
    })
    const state = session.getState().state
    const player = state.players[0]!
    const listener = findListener('A87-conservator-isDoable-renovate-house')!

    const result = executeCardListener(listener, {
      state,
      player,
      actionId: 'renovate-house',
      phase: 'isDoable',
      doable: false,
    } as unknown as CardListenerContext)

    expect(result).toBeUndefined()
  })
})

describe('A087_Conservator session sourceCard', () => {
  it('does not stamp the whole renovation target prompt with sourceCard when only one option comes from the card', () => {
    const session = setup({
      houseType: 'wood',
      rooms: 2,
      resources: { clay: 2, stone: 2, reed: 1 },
    })
    const state = session.getState().state
    state.round = 6
    setWorkersAtHome(state, state.players[0]!, 2)
    session.loadState(state)

    const resp = session.takeAction(0, 'house-redevelopment')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return

    expect(resp.interaction.promptKey).toBe('ui.interactionChooseRenovationTarget')
    expect(resp.interaction.sourceCard).toBeUndefined()
    expect((resp.interaction as { sourceCard?: string }).sourceCard).toBeUndefined()
    expect(resp.interaction.request.options?.find((option) => option.value === 'clay')?.sourceCard).toBeUndefined()
    expect(resp.interaction.request.options?.find((option) => option.value === 'stone')?.sourceCard).toBe(CARD_ID)
  })
})

const playOccupation = (session: GameSession) => {
  const response = session.takeAction(0, 'lessons')
  if (!response.state.players[0]!.occupationHand.includes(CARD_ID)) return response
  if (response.interaction.stateId !== 'wait') return response
  const card = response.interaction.request.options?.find((option) => option.value === CARD_ID)
  expect(card).toBeDefined()
  return session.resolveChoice(response.interaction.playerIndex, card!.value)
}

const renovate = (session: GameSession, target?: 'clay' | 'stone') => {
  let response = session.takeAction(0, 'house-redevelopment')
  if (response.interaction.stateId === 'wait'
    && response.interaction.promptKey === 'ui.interactionChooseRenovationTarget') {
    expect(target).toBeDefined()
    const option = response.interaction.request.options?.find((candidate) => candidate.value === target)
    expect(option).toBeDefined()
    response = session.resolveChoice(response.interaction.playerIndex, option!.value)
  }
  return response
}

describe('A087 Conservator parity', () => {
  it('A087 S1: Conservator is played as the first occupation without paying food', () => {
    const session = setup({ playA87: false })
    const state = session.getState().state
    state.round = 6
    state.players.forEach((player) => {
      player.minorHand = ['__test_placeholder__']
      player.occupationHand = ['__test_placeholder__']
      player.resources.food = 0
    })
    state.players[0]!.occupationHand = [CARD_ID]
    setWorkersAtHome(state, state.players[0]!, 2)
    session.loadState(state)

    const response = playOccupation(session)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.food).toBe(0)
  })

  it('A087 S2: a wooden two-room house can renovate directly to stone for two stone and one reed', () => {
    const session = setup({
      houseType: 'wood', rooms: 2, resources: { clay: 0, stone: 2, reed: 1 },
    })
    const state = session.getState().state
    state.round = 6
    setWorkersAtHome(state, state.players[0]!, 2)
    session.loadState(state)

    const response = renovate(session, 'stone')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.houseType).toBe('stone')
    expect(response.state.players[0]!.resources).toMatchObject({ stone: 0, reed: 0 })
  })

  it('A087 S3: when both renovation paths are affordable the player can choose direct stone', () => {
    const session = setup({
      houseType: 'wood', rooms: 2, resources: { clay: 2, stone: 2, reed: 1 },
    })
    const state = session.getState().state
    state.round = 6
    setWorkersAtHome(state, state.players[0]!, 2)
    session.loadState(state)

    const response = renovate(session, 'stone')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.houseType).toBe('stone')
    expect(response.state.players[0]!.resources).toMatchObject({ clay: 2, stone: 0, reed: 0 })
  })

  it('A087 S4: Conservator can be declined by choosing the normal wood-to-clay renovation', () => {
    const session = setup({
      houseType: 'wood', rooms: 2, resources: { clay: 2, stone: 2, reed: 1 },
    })
    const state = session.getState().state
    state.round = 6
    setWorkersAtHome(state, state.players[0]!, 2)
    session.loadState(state)

    const response = renovate(session, 'clay')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.houseType).toBe('clay')
    expect(response.state.players[0]!.resources).toMatchObject({ clay: 0, stone: 2, reed: 0 })
  })

  it('A087 S5: without Conservator stone resources alone do not enable a wood-house renovation', () => {
    const session = setup({
      playA87: false, houseType: 'wood', rooms: 2, resources: { clay: 0, stone: 2, reed: 1 },
    })
    const state = session.getState().state
    state.round = 6
    setWorkersAtHome(state, state.players[0]!, 2)
    session.loadState(state)

    const response = session.takeAction(0, 'house-redevelopment')

    expect(response.ok).toBe(false)
    expect(response.state.players[0]!.houseType).toBe('wood')
    expect(response.state.players[0]!.resources).toMatchObject({ stone: 2, reed: 1 })
    expect(response.state.actionSpaces.find((space) => space.id === 'house-redevelopment')?.takenBy).toEqual([])
  })

  it('A087 S6: a clay house follows the normal renovation path to stone', () => {
    const session = setup({
      houseType: 'clay', rooms: 2, resources: { stone: 2, reed: 1 },
    })
    const state = session.getState().state
    state.round = 6
    setWorkersAtHome(state, state.players[0]!, 2)
    session.loadState(state)

    const response = renovate(session)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.houseType).toBe('stone')
    expect(response.state.players[0]!.resources).toMatchObject({ stone: 0, reed: 0 })
  })
})
