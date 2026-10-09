import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import {
  executeCardListener,
  getRegisteredCardListeners,
  type CardListenerContext,
} from '../../shared/cards/card-listeners'
import { takeMajorImprovementFromSupply } from '../../shared/cards/major/supply'
import type { InitialStateOptions } from '../../shared/session/state-constants'

import '../../shared/cards/D/D131_CraftsmanshipPromoter'

const CARD_ID = 'D131_CraftsmanshipPromoter'
const LISTENER_ID = 'D131-craftsmanship-promoter-compute-choice-candidates'

const findListener = (id: string) =>
  getRegisteredCardListeners().find((l) => l.id === id)

const setup = (
  overrides: {
    playD131?: boolean
    resources?: Partial<Record<string, number>>
    minorHand?: string[]
    availableMajors?: string[]
  } = {},
) => {
  const session = new GameSession(42)
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.round = 3
  state.roundPhase = 'work'
  state.currentPlayerIndex = 0

  state.players[0]!.workersAvailable = 1
  state.players[0]!.familySize = 1
  state.players[1]!.workersAvailable = 0
  state.players[1]!.familySize = 1

  const owner = state.players[0]!
  if (overrides.playD131 !== false) {
    owner.occupationPlayed.push(CARD_ID)
  }
  if (overrides.minorHand !== undefined) owner.minorHand = overrides.minorHand
  // Default plenty of resources to make every bottom-row major affordable
  owner.resources = {
    ...owner.resources,
    food: 10,
    wood: 5,
    clay: 5,
    stone: 5,
    reed: 5,
    grain: 0,
    vegetable: 0,
    sheep: 0,
    boar: 0,
    cattle: 0,
  }
  if (overrides.resources) Object.assign(owner.resources, overrides.resources)

  if (overrides.availableMajors) {
    state.availableMajorImprovements = overrides.availableMajors.slice()
  }

  session.loadState(state)
  return session
}

const enterMinorChoice = (session: GameSession) => {
  // meeting-place is a deterministic 2-step entry: set-first-player
  // resolves silently, then wrapOptional offers
  // ['action-improvement-1', '__skip__']. We always pick the
  // action-improvement-1 entry to get into the minor-improvement
  // choice list.
  let resp = session.takeAction(0, 'meeting-place')
  expect(resp.ok).toBe(true)
  expect(resp.interaction.stateId).toBe('wait')
  resp = session.resolveChoice(0, 'action-improvement-1')
  return resp
}

const setupVariant = (options: InitialStateOptions) => {
  const session = new GameSession(42, undefined, options)
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.round = 3
  state.roundPhase = 'work'
  state.currentPlayerIndex = 0
  state.players.forEach((player, index) => {
    player.workersAvailable = index === 0 ? 1 : 0
    player.familySize = 1
  })
  const owner = state.players[0]!
  owner.occupationPlayed.push(CARD_ID)
  owner.resources = {
    ...owner.resources,
    food: 10,
    wood: 5,
    clay: 5,
    stone: 5,
    reed: 5,
  }
  takeMajorImprovementFromSupply(state, 'Major_Joinery')
  takeMajorImprovementFromSupply(state, 'Major_Well')
  session.loadState(state)
  return session
}

const buyCandidate = (session: GameSession, cardId: string) => {
  let resp = enterMinorChoice(session)
  expect(resp.interaction.stateId).toBe('wait')
  if (resp.interaction.stateId !== 'wait') throw new Error('expected improvement choice')
  const values = resp.interaction.request.options?.map((option) => option.value) ?? []
  expect(values).toContain(cardId)
  resp = session.resolveChoice(0, cardId)
  if (resp.interaction.stateId === 'wait' && resp.interaction.promptKey === 'prompt.selectPayment') {
    const payment = resp.interaction.request.options?.find((option) => option.value !== 'cancel')
    expect(payment).toBeDefined()
    resp = session.resolveChoice(0, payment!.value)
  }
  return { resp, values }
}

describe('D131_CraftsmanshipPromoter listener (unit)', () => {
  it('injects bottom-row major candidates when owner played D131', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    const listener = findListener(LISTENER_ID)
    expect(listener).toBeDefined()

    const result = executeCardListener(listener!, {
      state,
      player,
      actionId: 'improvement',
      params: { types: ['minor'] },
      phase: 'computeChoiceCandidates',
    } as unknown as CardListenerContext)

    expect(result?.extraOptions).toBeDefined()
    const values = result!.extraOptions!.map((o) => o.value).sort()
    expect(values).toContain('Major_Pottery')
    expect(values).toContain('Major_Joinery')
    expect(values).toContain('Major_Basket')
    expect(values).toContain('Major_ClayOven')
    expect(values).toContain('Major_StoneOven')
    for (const opt of result!.extraOptions!) {
      expect(opt.sourceCard).toBe(CARD_ID)
    }
  })

  it('returns nothing when owner has not played D131', () => {
    const session = setup({ playD131: false })
    const state = session.getState().state
    const player = state.players[0]!
    const listener = findListener(LISTENER_ID)!

    const result = executeCardListener(listener, {
      state,
      player,
      actionId: 'improvement',
      params: { types: ['minor'] },
      phase: 'computeChoiceCandidates',
    } as unknown as CardListenerContext)

    expect(result).toBeUndefined()
  })

  it('returns nothing when no bottom-row majors are still on supply', () => {
    const session = setup({
      availableMajors: ['Major_Fireplace1', 'Major_Well'],
    })
    const state = session.getState().state
    const player = state.players[0]!
    const listener = findListener(LISTENER_ID)!

    const result = executeCardListener(listener, {
      state,
      player,
      actionId: 'improvement',
      params: { types: ['minor'] },
      phase: 'computeChoiceCandidates',
    } as unknown as CardListenerContext)

    expect(result).toBeUndefined()
  })
})

describe('D131_CraftsmanshipPromoter session integration', () => {
  it('minor-improvement choice list contains all bottom-row major candidates', () => {
    const session = setup({ minorHand: ['__test_placeholder__'] })
    const resp = enterMinorChoice(session)
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    const values = (resp.interaction.request.options ?? []).map((o) => o.value)
    expect(values).toContain('Major_Pottery')
    expect(values).toContain('Major_Joinery')
    expect(values).toContain('Major_Basket')
    expect(values).toContain('Major_ClayOven')
    expect(values).toContain('Major_StoneOven')
  })

  it('selecting Major_Pottery on minor-improvement plays it as a major', () => {
    const session = setup({ minorHand: ['__test_placeholder__'] })
    let resp = enterMinorChoice(session)
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    const potteryOption = resp.interaction.request.options?.find((option) => option.value === 'Major_Pottery')
    expect(potteryOption).toBeDefined()
    resp = session.resolveChoice(0, potteryOption!.value)

    // Drill through any payment / sub-choices until Pottery moves into
    // player.improvements (or we fall off a guard).
    let steps = 0
    while (resp.interaction.stateId === 'wait' && steps < 20) {
      steps++
      const opts = resp.interaction.request.options ?? []
      // Pick the first non-skip / non-cancel option to keep advancing.
      const next =
        opts.find((o) => o.value !== '__skip__' && o.value !== 'cancel') ?? opts[0]
      if (!next) break
      resp = session.resolveChoice(0, next.value)
    }
    expect(resp.state.players[0]!.improvements).toContain('Major_Pottery')
    expect(resp.state.availableMajorImprovements).not.toContain('Major_Pottery')
  })

  it.each([
    [
      'six-player duplicate',
      { playerCount: 6 },
      'Major_Joinery2',
      'Major_Well2',
    ],
    [
      'Farmers of the Moor successor',
      {
        playerCount: 2,
        enableFarmersOfTheMoor: true,
        allowIncompleteFarmersOfTheMoorMinorDeal: true,
      },
      'Major_Moor_FurnitureStall',
      'Major_Moor_VillageChurch',
    ],
  ] as const)('builds a visible bottom-row %s through a Minor Improvement action', (
    _name,
    options,
    cardId,
    excludedId,
  ) => {
    const session = setupVariant(options)
    const { resp, values } = buyCandidate(session, cardId)

    expect(resp.ok).toBe(true)
    expect(values).not.toContain(excludedId)
    expect(resp.state.players[0]!.improvements).toContain(cardId)
    expect(resp.state.availableMajorImprovements).not.toContain(cardId)
    expect(resp.state.log.find((entry) => entry.key === 'log.playImprovement')?.params)
      .toMatchObject({ improvements: cardId })
    expect(resp.state.players[0]!.improvements).not.toContain(excludedId)
  })

  it('non-D131 owner: minor-improvement has no major candidates', () => {
    const session = setup({ playD131: false })
    const resp = enterMinorChoice(session)
    if (!resp.ok || resp.interaction.stateId !== 'wait') return
    const values = (resp.interaction.request.options ?? []).map((o) => o.value)
    for (const v of values) {
      expect(v.startsWith('Major_')).toBe(false)
    }
  })

  it('cost-unaffordable: bottom-row majors filtered out', () => {
    const session = setup({
      minorHand: ['__test_placeholder__'],
      resources: { food: 0, wood: 0, clay: 0, stone: 0, reed: 0 },
    })
    const resp = enterMinorChoice(session)
    if (!resp.ok || resp.interaction.stateId !== 'wait') return
    const values = (resp.interaction.request.options ?? []).map((o) => o.value)
    // All bottom-row majors require either clay or stone — none should
    // remain when the player has zero of either resource.
    for (const v of values) {
      expect(v).not.toBe('Major_Pottery')
      expect(v).not.toBe('Major_Joinery')
      expect(v).not.toBe('Major_Basket')
      expect(v).not.toBe('Major_ClayOven')
      expect(v).not.toBe('Major_StoneOven')
    }
  })
})
