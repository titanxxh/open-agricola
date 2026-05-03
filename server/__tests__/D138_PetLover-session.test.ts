import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'

import { setWorkersAtHome } from '../../shared/game/player'
import '../../shared/cards/D/D138_PetLover'

const CARD_ID = 'D138_PetLover'

const setup = (options?: {
  withCard?: boolean
  sheepOnSpace?: number
}) => {
  const session = new GameSession()
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  state.round = 1

  const player = state.players[0]!
  setWorkersAtHome(state, player, 2)

  // Zero out starting resources so we can assert exact gains.
  player.resources = { ...player.resources, food: 0, grain: 0 }

  if (options?.withCard ?? true) {
    player.occupationPlayed.push(CARD_ID)
  }

  const sheepMarket = state.actionSpaces.find((s) => s.id === 'sheep-market')
  if (!sheepMarket) throw new Error('sheep-market missing')
  sheepMarket.resources.sheep = options?.sheepOnSpace ?? 1

  session.loadState(state)
  return session
}

describe('D138_PetLover session', () => {
  it('with 1 sheep + card, choosing the normal collect takes the sheep and clears the space', () => {
    const session = setup({ withCard: true, sheepOnSpace: 1 })
    let resp = session.takeAction(0, 'sheep-market')
    expect(resp.ok).toBe(true)
    // PetLover wraps the collect flow in an XOR, so the player must choose first.
    expect(resp.pending.type).toBe('choice')
    if (resp.pending.type !== 'choice') return
    expect(resp.pending.options.length).toBe(2)

    // Pick the option that does NOT come from PetLover (sourceCard !== CARD_ID).
    const normalOption =
      resp.pending.options.find((opt) => opt.sourceCard !== CARD_ID)
      ?? resp.pending.options[resp.pending.options.length - 1]!
    resp = session.resolveChoice(0, normalOption.value)
    expect(resp.ok).toBe(true)

    // Normal collect path needs animal reorg for the freshly taken sheep.
    expect(resp.pending.type).toBe('choice')
    resp = session.resolveChoice(0, 'confirm', [
      { id: 'house', zoneType: 'house', animalType: 'sheep', animalCount: 1 },
    ])
    expect(resp.ok).toBe(true)

    const player = resp.state.players[0]!
    const space = resp.state.actionSpaces.find((s) => s.id === 'sheep-market')!
    expect(player.resources.sheep).toBe(1)
    expect(space.resources.sheep).toBe(0)
    // PetLover bonus must NOT have fired on the normal branch.
    expect(player.resources.food).toBe(0)
    expect(player.resources.grain).toBe(0)
  })

  it('with 1 sheep + card, choosing PetLover gives the bonus and leaves the space animal alone', () => {
    const session = setup({ withCard: true, sheepOnSpace: 1 })
    let resp = session.takeAction(0, 'sheep-market')
    expect(resp.ok).toBe(true)
    expect(resp.pending.type).toBe('choice')
    if (resp.pending.type !== 'choice') return

    // Pick the PetLover branch (sourceCard === CARD_ID).
    const petLoverOption =
      resp.pending.options.find((opt) => opt.sourceCard === CARD_ID)
      ?? resp.pending.options[0]!
    resp = session.resolveChoice(0, petLoverOption.value)
    expect(resp.ok).toBe(true)

    // The bonus animal needs to be placed too.
    if (resp.pending.type === 'choice' && (resp.pending as any).promptKey === 'ui.interactionAnimalReorg') {
      resp = session.resolveChoice(0, 'confirm', [
        { id: 'house', zoneType: 'house', animalType: 'sheep', animalCount: 1 },
      ])
    }
    expect(resp.ok).toBe(true)

    const player = resp.state.players[0]!
    const space = resp.state.actionSpaces.find((s) => s.id === 'sheep-market')!
    // Bug fix: the original sheep stays on the action space.
    expect(space.resources.sheep).toBe(1)
    // Player got 1 sheep + 3 food + 1 grain from supply.
    expect(player.resources.sheep).toBe(1)
    expect(player.resources.food).toBe(3)
    expect(player.resources.grain).toBe(1)
  })

  it('with 2 sheep + card, no PetLover offer — normal collect for 2 sheep', () => {
    const session = setup({ withCard: true, sheepOnSpace: 2 })
    let resp = session.takeAction(0, 'sheep-market')
    expect(resp.ok).toBe(true)
    // No XOR because totalAnimals !== 1, so we go straight into animal reorg.
    expect(resp.pending.type).toBe('choice')
    resp = session.resolveChoice(0, 'confirm', [
      { id: 'house', zoneType: 'house', animalType: 'sheep', animalCount: 2 },
    ])
    expect(resp.ok).toBe(true)

    const player = resp.state.players[0]!
    const space = resp.state.actionSpaces.find((s) => s.id === 'sheep-market')!
    expect(player.resources.sheep).toBe(2)
    expect(space.resources.sheep).toBe(0)
    expect(player.resources.food).toBe(0)
    expect(player.resources.grain).toBe(0)
  })

  it('without card, sheep-market with 1 sheep does normal collect (regression)', () => {
    const session = setup({ withCard: false, sheepOnSpace: 1 })
    let resp = session.takeAction(0, 'sheep-market')
    expect(resp.ok).toBe(true)
    // No PetLover -> no XOR -> straight to animal reorg.
    expect(resp.pending.type).toBe('choice')
    resp = session.resolveChoice(0, 'confirm', [
      { id: 'house', zoneType: 'house', animalType: 'sheep', animalCount: 1 },
    ])
    expect(resp.ok).toBe(true)

    const player = resp.state.players[0]!
    const space = resp.state.actionSpaces.find((s) => s.id === 'sheep-market')!
    expect(player.resources.sheep).toBe(1)
    expect(space.resources.sheep).toBe(0)
    expect(player.resources.food).toBe(0)
    expect(player.resources.grain).toBe(0)
  })
})
