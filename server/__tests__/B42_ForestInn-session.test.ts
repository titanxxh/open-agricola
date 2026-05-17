import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'

import '../../shared/cards/B/B42_ForestInn'
import { setActiveWorkerCount } from '../../shared/domain/player'
import type { ChoiceDescriptionPreview } from '../../shared/contract/types'

const CARD_ID = 'B42_ForestInn'

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
  const option = resp.interaction.options.find((entry) =>
    descriptionPaysWood(entry.descriptionPreview, woodPaid))
  expect(option).toBeDefined()
  if (!option) throw new Error(`missing option paying ${woodPaid} wood`)
  expect(collectDescriptionLabelKeys(option.descriptionPreview)).toEqual([
    'actions.pay.name',
    'actions.gain.name',
  ])
  return option
}

describe('B42_ForestInn session', () => {
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
    expect(resp.interaction.options.map((option) => option.labelKey)).toEqual([
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
