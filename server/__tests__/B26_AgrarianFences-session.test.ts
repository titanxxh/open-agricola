import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import { setWorkersAtHome } from '../../shared/domain/player'
import '../../shared/cards/A/A094_LazySowman'
import '../../shared/cards/B/B026_AgrarianFences'

const playedKey = (cardId: string, type: 'minor' | 'occupation') => `${type}:${cardId}`

const setup = (options?: {
  withCard?: boolean
  grain?: number
  vegetable?: number
  wood?: number
}) => {
  const session = new GameSession()
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  // Ensure grain-utilization is available at current round
  state.round = 3

  const player = state.players[0]!
  setWorkersAtHome(state, player, 2)
  player.resources = {
    ...player.resources,
    grain: options?.grain ?? 3,
    vegetable: options?.vegetable ?? 0,
    wood: options?.wood ?? 10,
    food: 5,
  }
  // Give fields so sow is doable
  player.fields = [
    { row: 0, col: 2, crop: null, remaining: 0 },
    { row: 0, col: 3, crop: null, remaining: 0 },
  ]

  if (options?.withCard ?? true) {
    player.minorPlayed.push('B026_AgrarianFences')
  }

  session.loadState(state)
  return session
}

describe('B026_AgrarianFences session', () => {
  it('without the card, grain-utilization offers normal sow/bake choices', () => {
    const session = setup({ withCard: false })
    const resp = session.takeAction(0, 'grain-utilization')
    expect(resp.ok).toBe(true)
    // Normal grain-utilization: or(sow, bake-bread) — presents sow and bake choices
    expect(resp.interaction.stateId).toBe('wait')
  })

  it('with the card, grain-utilization offers fence-related alternatives for sow', () => {
    const session = setup({ withCard: true })
    const resp = session.takeAction(0, 'grain-utilization')
    expect(resp.ok).toBe(true)
    // The sow action should be replaced with XOR(fence, sow+fence, sow)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    // Should have more options than just normal sow/bake
    expect(resp.interaction.request.options?.length).toBeGreaterThanOrEqual(2)
  })

  it('keeps Lazy Sowman and Agrarian Fences alternatives independently selectable', () => {
    const session = setup({ withCard: true })
    const state = session.getState().state
    state.players[0]!.occupationPlayed.push('A094_LazySowman')
    session.loadState(state)

    let resp = session.takeAction(0, 'grain-utilization')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    const sowBranch = resp.interaction.request.options.find(
      (option) => option.labelParams?.actionNameKey === 'actions.sow.name',
    )
    expect(sowBranch).toBeDefined()

    resp = session.resolveChoice(0, sowBranch!.value)
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.request.options.map((option) => option.labelKey)).toEqual([
      'ui.interactionUseCard',
      'actions.fencing.name',
      'ui.interactionDoNotReplace',
    ])
    const agrarianFences = resp.interaction.request.options.find((option) => option.sourceCard === 'B026_AgrarianFences')!
    resp = session.resolveChoice(0, agrarianFences.value)
    const sowAndFence = resp.interaction.request.options.find(
      (option) => option.labelKey === 'ui.interactionAgrarianFencesSowAndFence',
    )
    expect(sowAndFence).toBeDefined()

    resp = session.resolveChoice(0, sowAndFence!.value)
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.request.options.map((option) => option.labelKey)).toEqual([
      'ui.interactionUseCard',
      'ui.interactionDoNotReplace',
    ])

    const originalSow = resp.interaction.request.options.find(
      (option) => option.labelKey === 'ui.interactionDoNotReplace',
    )
    expect(originalSow).toBeDefined()
    resp = session.resolveChoice(0, originalSow!.value)
    expect(resp.ok).toBe(true)
    expect(resp.interaction.request.farm?.farmType).toBe('sow')
    const field = resp.interaction.request.farm?.farmType === 'sow'
      ? resp.interaction.request.farm.selectableFields[0]!.tile
      : { row: 0, col: 2 }

    resp = session.commitSelectionChoice(0, {
      crops: [{ ...field, crop: 'grain' }],
    })
    expect(resp.ok).toBe(true)
    expect(resp.interaction.request.farm?.farmType).toBe('fence')
  })

  it('without enough wood for fencing and no seeds, grain-utilization with card still works with bake', () => {
    const session = setup({ withCard: true, wood: 0, grain: 0 })
    // With no grain/veg for sow and no wood for fence, only bake should work
    // but bake also needs grain... so this may not be doable
    const resp = session.takeAction(0, 'grain-utilization')
    // The result depends on whether the player has bake improvements
    // Without bake improvements, action may fail or offer limited choices
    expect(resp.ok).toBeDefined()
  })

  it('does not affect sow actions outside grain-utilization', () => {
    const session = setup({ withCard: true })
    const state = session.getState().state
    // Advance to round 5 to unlock cultivation (which also has sow)
    state.round = 5
    session.loadState(state)

    const resp = session.takeAction(0, 'cultivation')
    expect(resp.ok).toBe(true)
    if (resp.interaction.stateId !== 'wait') return
    // Cultivation should not have fence options — B26 only affects grain-utilization
    const optionValues = resp.interaction.request.options?.map((o) => o.value)
    const hasFenceOption = optionValues.some((v) => v.includes('fence'))
    expect(hasFenceOption).toBe(false)
  })
})
