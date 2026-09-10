import { type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'

import '../../shared/cards/B/B042_ForestInn'
import { setActiveWorkerCount } from '../../shared/domain/player'
import type { ChoiceDescriptionPreview } from '../../shared/contract/types'

const CARD_ID = 'B042_ForestInn'

const resetResources = (resources: Record<string, number>) => ({
  wood: 0,
  clay: 0,
  reed: 0,
  stone: 0,
  food: 0,
  grain: 0,
  vegetable: 0,
  sheep: 0,
  boar: 0,
  cattle: 0,
  begging: 0,
  ...resources,
})

const collectDescriptionLabelKeys = (
  preview: ChoiceDescriptionPreview | undefined,
): string[] => {
  if (!preview) return []
  if (preview.kind === 'action') return [preview.labelKey]
  return preview.parts.flatMap(collectDescriptionLabelKeys)
}

const descriptionPaysWood = (
  preview: ChoiceDescriptionPreview | undefined,
  amount: number,
): boolean => {
  if (!preview) return false
  if (preview.kind === 'action') {
    return preview.effectPreview?.kind === 'payment' &&
      preview.effectPreview.resourcesPaid?.wood === amount
  }
  return preview.parts.some((part) => descriptionPaysWood(part, amount))
}

const setup = (currentPlayerIndex: 0 | 1) => {
  const session = new GameSession(42)
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.round = 1
  state.roundPhase = 'work'
  state.currentPlayerIndex = 0

  const owner = state.players[0]!
  const guest = state.players[1]!
  setActiveWorkerCount(owner, 1)
  setActiveWorkerCount(guest, 1)
  owner.resources = resetResources({})
  guest.resources = resetResources({})
  owner.minorHand = [CARD_ID]
  owner.occupationHand = ['__test_placeholder__']
  guest.minorHand = ['__test_placeholder__']
  guest.occupationHand = ['__test_placeholder__']

  session.loadState(state)
  session.devPlayCard(0, CARD_ID)

  const updated = session.getState().state
  updated.currentPlayerIndex = currentPlayerIndex
  updated.roundPhase = 'work'
  updated.actionSpaces.find((space) => space.id === CARD_ID)!.takenBy = []
  session.loadState(updated)
  return session
}

const choiceByPaidWood = (
  resp: ReturnType<GameSession['takeAction']>,
  woodPaid: number,
) => {
  expect(resp.interaction.stateId).toBe('wait')
  if (resp.interaction.stateId !== 'wait') throw new Error('expected wait interaction')
  const option = resp.interaction.request.options.find((entry) =>
    descriptionPaysWood(entry.descriptionPreview, woodPaid))
  expect(option).toBeDefined()
  if (!option) throw new Error(`missing option paying ${woodPaid} wood`)
  expect(collectDescriptionLabelKeys(option.descriptionPreview)).toEqual([
    'actions.pay.name',
    'actions.gain.name',
  ])
  return option
}

describe('B042_ForestInn session', () => {
  it('owner uses xor exchange without paying the 1 food fee', () => {
    const session = setup(0)
    const state = session.getState().state
    state.players[0]!.resources = resetResources({ wood: 7 })
    session.loadState(state)

    let resp = session.takeAction(0, CARD_ID)
    expect(resp.ok).toBe(true)
    const option = choiceByPaidWood(resp, 5)
    expect(session.getState().state.players[0]!.resources.food).toBe(0)

    resp = session.resolveChoice(0, option.value)
    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.wood).toBe(10)
    expect(resp.state.players[0]!.resources.food).toBe(2)
  })

  it('non-owner pays owner first, then resolves the selected xor branch', () => {
    const session = setup(1)
    const state = session.getState().state
    state.players[0]!.resources = resetResources({})
    state.players[1]!.resources = resetResources({ wood: 7, food: 1 })
    session.loadState(state)

    let resp = session.takeAction(1, CARD_ID)
    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.food).toBe(1)
    expect(resp.state.players[1]!.resources.food).toBe(0)
    expect(resp.state.players[1]!.resources.wood).toBe(7)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.request.options.map((option) => option.labelKey)).toEqual([
      'actions.pay.name',
      'actions.pay.name',
    ])

    const option = choiceByPaidWood(resp, 7)
    resp = session.resolveChoice(resp.interaction.playerIndex, option.value)
    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.food).toBe(1)
    expect(resp.state.players[1]!.resources.wood).toBe(8)
    expect(resp.state.players[1]!.resources.food).toBe(4)
  })
})

describe('B042 Forest Inn parity', () => {
  const CARD_ID = 'B042_ForestInn'

  const FILLER = '__test_placeholder__'

  const resetResources = (resources: Record<string, number>) => ({
    wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0,
    sheep: 0, boar: 0, cattle: 0, begging: 0, ...resources,
  })

  const options = (response: SessionResponse) => response.interaction.stateId === 'wait'
    ? response.interaction.request.options ?? []
    : []

  const enterMinor = (session: GameSession) => {
    let response = session.takeAction(0, 'meeting-place')
    if (response.interaction.stateId !== 'wait') return response
    const improvement = options(response).find((option) =>
      option.value.startsWith('action-improvement-'))
    if (improvement) response = session.resolveChoice(response.interaction.playerIndex, improvement.value)
    return response
  }

  const playMinor = (session: GameSession) => {
    let response = enterMinor(session)
    if (!response.state.players[0]!.minorHand.includes(CARD_ID)) return response
    if (response.interaction.stateId === 'wait') {
      const card = options(response).find((option) => option.value === CARD_ID)
      if (card) response = session.resolveChoice(response.interaction.playerIndex, card.value)
    }
    return response
  }

  const setup = ({
    played = true, round = 6, actor = 0, owner = {}, guest = {},
  }: {
    played?: boolean
    round?: number
    actor?: 0 | 1
    owner?: Record<string, number>
    guest?: Record<string, number>
  } = {}) => {
    const session = new GameSession(6042, undefined, { playerCount: 2 })
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.currentPlayerIndex = 0
    state.round = round
    state.roundPhase = 'work'
    state.availableMajorImprovements = []
    state.players.forEach((player) => {
      setWorkersAtHome(state, player, 2)
      player.minorHand = [FILLER]
      player.occupationHand = [FILLER]
      player.minorPlayed = []
      player.occupationPlayed = []
      player.resources = resetResources({})
    })
    const ownerPlayer = state.players[0]!
    ownerPlayer.minorHand = [CARD_ID]
    ownerPlayer.resources = resetResources(played ? owner : { clay: 1, reed: 1, ...owner })
    state.players[1]!.resources = resetResources(guest)
    session.loadState(state)

    if (played) {
      const response = session.devPlayCard(0, CARD_ID)
      expect(response.ok, response.error).toBe(true)
    }
    const updated = session.getState().state
    updated.currentPlayerIndex = actor
    updated.roundPhase = 'work'
    const actionSpace = updated.actionSpaces.find((space) => space.id === CARD_ID)
    if (actionSpace) actionSpace.takenBy = []
    session.loadState(updated)
    return session
  }

  const descriptionPaysWood = (
    preview: ChoiceDescriptionPreview | undefined, amount: number,
  ): boolean => {
    if (!preview) return false
    if (preview.kind === 'action') {
      return preview.effectPreview?.kind === 'payment'
        && preview.effectPreview.resourcesPaid?.wood === amount
    }
    return preview.parts.some((part) => descriptionPaysWood(part, amount))
  }

  const chooseExchange = (session: GameSession, response: SessionResponse, wood: number) => {
    if (response.interaction.stateId !== 'wait') return response
    const option = options(response).find((entry) => descriptionPaysWood(entry.descriptionPreview, wood))
    if (!option) return response
    return session.resolveChoice(response.interaction.playerIndex, option!.value)
  }

  it('B042 S1: in round six paying one clay and one reed plays Forest Inn as an action space', () => {
    const response = playMinor(setup({ played: false, round: 6 }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources).toMatchObject({ clay: 0, reed: 0 })
    expect(response.state.actionSpaces.some((space) => space.id === CARD_ID)).toBe(true)
  })

  it('B042 S2: after round six Forest Inn remains unavailable without payment', () => {
    const response = enterMinor(setup({ played: false, round: 7 }))

    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
    expect(response.state.players[0]!.minorPlayed).not.toContain(CARD_ID)
    expect(response.state.players[0]!.resources).toMatchObject({ clay: 1, reed: 1 })
  })

  for (const [scenario, wood, expectedFood] of [
    ['S3', 5, 2], ['S4', 7, 4], ['S5', 9, 7],
  ] as const) {
    it(`B042 ${scenario}: the owner exchanges ${wood} wood for eight wood and ${expectedFood} food`, () => {
      const session = setup({ owner: { wood } })
      const response = chooseExchange(session, session.takeAction(0, CARD_ID), wood)

      expect(response.ok, response.error).toBe(true)
      expect(response.state.players[0]!.resources).toMatchObject({ wood: 8, food: expectedFood })
    })
  }

  it('B042 S7: OA keeps Forest Inn unavailable to a guest without the mandatory food', () => {
    const session = setup({ actor: 1, guest: { wood: 5 } })
    const before = session.getState()

    const response = session.takeAction(1, CARD_ID)

    expect(response.ok).toBe(false)
    expect(response.error).toBe('space unavailable')
    expect(response.state).toEqual(before.state)
  })

  it('B042 S8: OA keeps Forest Inn unavailable with fewer than five wood', () => {
    const session = setup({ owner: { wood: 4 } })
    const before = session.getState()

    const response = session.takeAction(0, CARD_ID)

    expect(response.ok).toBe(false)
    expect(response.error).toBe('space unavailable')
    expect(response.state).toEqual(before.state)
  })
})
