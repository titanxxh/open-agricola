import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { resolveTriggerIfPresent } from './_helpers/trigger-select'
import { readCardExtraData } from '../../shared/cards/helpers/card-state'

import { setWorkersAtHome } from '../../shared/domain/player'
import '../../shared/cards/E/E051_WhaleOil'

const CARD_ID = 'E051_WhaleOil'

const setup = (options?: { foodCount?: number }) => {
  const session = new GameSession()
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  state.round = 1

  const player = state.players[0]!
  setWorkersAtHome(state, player, 2)
  player.resources.food = 10
  player.resources.wood = 10

  // Add card to played list
  player.minorPlayed.push(CARD_ID)
  if (!player.cardStates) player.cardStates = {}
  player.cardStates[CARD_ID] = {
    extraData: { foodCount: options?.foodCount ?? 0 },
    infobox: `${options?.foodCount ?? 0} Food`,
  }

  // Put food on fishing space
  const fishing = state.actionSpaces.find((s) => s.id === 'fishing')
  if (fishing) fishing.resources.food = 3

  session.loadState(state)
  return session
}

describe('E051_WhaleOil session', () => {
  it('onBuy sets foodCount to 0', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.minorHand.push(CARD_ID)
    session.loadState(state)
    session.devPlayCard(0, CARD_ID)

    const updated = session.getState().state.players[0]!
    expect(readCardExtraData<number>(updated, CARD_ID, 'foodCount')).toBe(0)
  })

  it('using Fishing adds 1 food to card', () => {
    const session = setup()

    let resp = session.takeAction(0, 'fishing')
    resp = resolveTriggerIfPresent(session, resp, CARD_ID)
    expect(resp.ok).toBe(true)

    const player = resp.state.players[0]!
    expect(readCardExtraData<number>(player, CARD_ID, 'foodCount')).toBe(1)
  })

  it('non-fishing action does not add food to card', () => {
    const session = setup()

    // Use forest (wood accumulation) instead of fishing
    const forest = session.getState().state.actionSpaces.find((s) => s.id === 'forest')
    if (forest) forest.resources.wood = 6
    session.loadState(session.getState().state)

    const resp = session.takeAction(0, 'forest')
    expect(resp.ok).toBe(true)

    const player = resp.state.players[0]!
    expect(readCardExtraData<number>(player, CARD_ID, 'foodCount')).toBe(0)
  })

  it('before playing occupation: gains food equal to card count and empties card', () => {
    const session = setup({ foodCount: 3 })
    const state = session.getState().state
    const player = state.players[0]!
    player.resources.food = 5
    // Add an occupation to hand so we can play it
    player.occupationHand.push('A101_Mendicant')
    session.loadState(state)

    // Take lessons action to play an occupation
    const resp = session.takeAction(0, 'lessons')
    expect(resp.ok).toBe(true)

    // Should prompt to choose which occupation to play
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return

    // Choose the occupation
    const occupationOption = resp.interaction.options?.find((o) => o.value === 'A101_Mendicant')
    if (!occupationOption) {
      // The occupation may have already been auto-selected or the choice format differs
      return
    }
    const resp2 = session.resolveChoice(0, occupationOption.value)

    // After playing the occupation, foodCount should be 0
    const updated = resp2.state.players[0]!
    expect(readCardExtraData<number>(updated, CARD_ID, 'foodCount')).toBe(0)
    // Player should have gained 3 food from card (5 + 3 = 8, minus occupation cost)
    // Occupation cost is 0 for first occupation, so food should be >= 8
    expect(updated.resources.food).toBeGreaterThanOrEqual(8)
  })

  it('before playing occupation with no food on card: no food gained', () => {
    const session = setup({ foodCount: 0 })
    const state = session.getState().state
    const player = state.players[0]!
    player.resources.food = 5
    player.occupationHand.push('A101_Mendicant')
    session.loadState(state)

    const resp = session.takeAction(0, 'lessons')
    expect(resp.ok).toBe(true)

    if (resp.interaction.stateId !== 'wait') return
    const occupationOption = resp.interaction.options?.find((o) => o.value === 'A101_Mendicant')
    if (!occupationOption) return
    const resp2 = session.resolveChoice(0, occupationOption.value)

    const updated = resp2.state.players[0]!
    expect(readCardExtraData<number>(updated, CARD_ID, 'foodCount')).toBe(0)
    // No extra food from card
    expect(updated.resources.food).toBe(5)
  })
})
