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
