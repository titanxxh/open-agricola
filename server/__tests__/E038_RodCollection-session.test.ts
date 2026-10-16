import { describe, expect, it, onTestFinished } from 'vitest'
import type { GameSession, SessionResponse } from '../game/authoritative-session'
import { readCardExtraData } from '../../shared/cards/helpers/card-state'
import { resolveTriggerIfPresent } from './_helpers/trigger-select'
import { resourceOptions, setupResourceAction } from './_helpers/batch07-resource-ownership'
import { createWorkSession } from './_helpers/session-fixtures'
import { bonusScore, playImprovement } from './_helpers/card-play-lifecycle'
import { confirmNextPlayer, confirmPlayerSwitch } from './_helpers/pending-confirms'

import '../../shared/cards/E/E038_RodCollection'

const CARD_ID = 'E038_RodCollection'

const rodSession = (woodCount?: number) => {
  const session = createWorkSession({
    seed: 38052,
    configure: state => {
      state.round = 5
      state.players.forEach(player => { player.resources.food = 100 })
      const player = state.players[0]!
      player.resources.wood = 16
      player.occupationPlayed = ['A110_Roughcaster', 'A125_Priest', 'C123_Freemason']
      if (woodCount === undefined) player.minorHand = [CARD_ID]
      else {
        player.minorPlayed = [CARD_ID]
        player.cardStates[CARD_ID] = { extraData: { woodCount } }
      }
    },
  })
  onTestFinished(() => session.dispose())
  return session
}

const reachOwnerTurn = (session: GameSession, round: number): SessionResponse => {
  for (let step = 0; step < 100; step++) {
    const response = session.getState()
    expect(response.ok, response.error).toBe(true)
    if (response.interaction.stateId === 'wait') {
      const { request, playerIndex } = response.interaction
      if (request.kind === 'confirm-next-player') confirmNextPlayer(session)
      else if (request.kind === 'confirm-player-switch') confirmPlayerSwitch(session)
      else if (request.kind === 'feed') session.resolveChoice(playerIndex, 'confirm', { selections: [] })
      else throw new Error(`Unexpected round interaction: ${JSON.stringify(response.interaction)}`)
      continue
    }
    if (response.state.round === round && response.state.currentPlayerIndex === 0) return response
    expect(response.state.round).toBeLessThanOrEqual(round)
    const actor = response.state.currentPlayerIndex
    const space = ['grain-seeds', 'day-laborer', 'reed-bank', 'forest']
      .find(id => session.getActionAvailability(actor)[id])
    if (!space) throw new Error('Expected an available basic action')
    const advanced = session.takeAction(actor, space)
    expect(advanced.ok, advanced.error).toBe(true)
  }
  throw new Error(`Did not reach player zero in round ${round}`)
}

describe('E038 Rod Collection through Session', () => {
  it.each([0, 1, 2])('commits the selected %i wood from supply onto the card', (wood) => {
    const session = setupResourceAction('E038_RodCollection', 'fishing')
    session.state.players[0]!.resources.wood = 2
    session.state.actionSpaces.find((space) => space.id === 'fishing')!.resources.food = 1
    session.loadState(session.state)
    let response = resolveTriggerIfPresent(session, session.takeAction(0, 'fishing'), 'E038_RodCollection')
    const choice = wood === 0
      ? resourceOptions(response).find((option) => option.value === '__skip__')
      : resourceOptions(response).find((option) => option.effectPreview?.resourcesPaid?.wood === wood)
    expect(choice, JSON.stringify(response.interaction)).toBeDefined()
    response = session.resolveChoice(0, choice!.value)
    expect(response.state.players[0]!.resources.wood).toBe(2 - wood)
    expect(readCardExtraData<number>(response.state.players[0]!, 'E038_RodCollection', 'woodCount') ?? 0).toBe(wood)
  })

  it('hides unaffordable choices and atomically rejects a forged choice before a legal retry', () => {
    const session = setupResourceAction('E038_RodCollection', 'fishing')
    session.state.players[0]!.resources.wood = 1
    session.state.actionSpaces.find(space => space.id === 'fishing')!.resources.food = 1
    session.loadState(session.state)
    const offered = resolveTriggerIfPresent(session, session.takeAction(0, 'fishing'), 'E038_RodCollection')
    expect(resourceOptions(offered).some((option) => option.effectPreview?.resourcesPaid?.wood === 2)).toBe(false)
    const before = JSON.stringify({ player: offered.state.players[0], interaction: offered.interaction })
    const rejected = session.resolveChoice(0, 'forged-two-wood')
    expect(rejected.ok).toBe(false)
    expect(JSON.stringify({ player: rejected.state.players[0], interaction: rejected.interaction })).toBe(before)
    const one = resourceOptions(rejected).find((option) => option.effectPreview?.resourcesPaid?.wood === 1)!
    const resolved = session.resolveChoice(0, one.value)
    expect(resolved.ok, resolved.error).toBe(true)
    expect(resolved.state.players[0]!.resources.wood).toBe(0)
    expect(readCardExtraData<number>(resolved.state.players[0]!, 'E038_RodCollection', 'woodCount')).toBe(1)
  })

  it.each([
    [0, 0], [1, 1], [3, 2], [4, 3], [6, 4], [7, 5],
    [9, 6], [10, 7], [12, 9], [13, 10], [15, 12],
  ])('storing one wood after %i stored wood yields %i bonus points', (stored, expected) => {
    const session = rodSession(stored)
    const offered = resolveTriggerIfPresent(session, session.takeAction(0, 'fishing'), CARD_ID)
    const oneWood = resourceOptions(offered).find(option => option.effectPreview?.resourcesPaid?.wood === 1)
    if (!oneWood) throw new Error('Expected one-wood storage choice')
    const response = session.resolveChoice(0, oneWood.value)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.wood).toBe(15)
    expect(readCardExtraData<number>(response.state.players[0]!, CARD_ID, 'woodCount')).toBe(stored + 1)
    expect(bonusScore(response, CARD_ID)).toBe(expected)
    expect(response.scores[0]!.categories.find(category => category.key === 'cards')?.entries)
      .toContainEqual({ type: 'card', cardId: CARD_ID, cardType: 'minor', score: 1 })
  })

  it('buys the card and reaches thirteen stored wood through seven natural Fishing uses', () => {
    const session = rodSession()
    const bought = playImprovement(session, CARD_ID, 'meeting-place')
    expect(bought.state.players[0]!.minorPlayed).toContain(CARD_ID)
    const steps = [
      { round: 5, wood: 2, stored: 2, bonus: 1 },
      { round: 6, wood: 2, stored: 4, bonus: 2 },
      { round: 7, wood: 2, stored: 6, bonus: 4 },
      { round: 8, wood: 2, stored: 8, bonus: 5 },
      { round: 9, wood: 2, stored: 10, bonus: 6 },
      { round: 10, wood: 2, stored: 12, bonus: 8 },
      { round: 11, wood: 1, stored: 13, bonus: 9 },
    ]
    for (const step of steps) {
      const before = reachOwnerTurn(session, step.round)
      const woodBefore = before.state.players[0]!.resources.wood
      const offered = resolveTriggerIfPresent(session, session.takeAction(0, 'fishing'), CARD_ID)
      const option = resourceOptions(offered).find(choice => choice.effectPreview?.resourcesPaid?.wood === step.wood)
      if (!option) throw new Error(`Expected ${step.wood}-wood storage choice`)
      const response = session.resolveChoice(0, option.value)
      expect(response.ok, response.error).toBe(true)
      expect(response.state.players[0]!.resources.wood).toBe(woodBefore - step.wood)
      expect(readCardExtraData<number>(response.state.players[0]!, CARD_ID, 'woodCount')).toBe(step.stored)
      expect(bonusScore(response, CARD_ID)).toBe(step.bonus)
      expect(response.state.events).toContainEqual(expect.objectContaining({
        type: 'resource.paid', sourceCardId: CARD_ID, resources: { wood: step.wood },
      }))
    }
  })
})
