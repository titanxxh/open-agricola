import { describe, expect, it, onTestFinished } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import type { Resource } from '../../shared/contract/types'
import { getStoredResource, setStoredResource } from '../../shared/cards/helpers/card-storage'
import { setActiveWorkerCount } from '../../shared/domain/player'
import { rehydrateState, serializeSessionSnapshot } from '../../shared/session/serialization'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { createWorkSession } from './_helpers/session-fixtures'
import { playMinor } from './_helpers/batch07-card-play'
import { resourceOptions } from './_helpers/batch07-resource-ownership'

import '../../shared/cards/E/E052_Cubbyhole'

const CARD_ID = 'E052_Cubbyhole'

const purchaseSession = (resources: Partial<Resource>, minorPlayed: string[] = [], occupations: string[] = []) => {
  const session = createWorkSession({
    seed: 52052,
    configure: state => {
      const player = state.players[0]!
      player.minorHand = [CARD_ID]
      player.minorPlayed = minorPlayed
      player.occupationPlayed = occupations
      Object.assign(player.resources, { wood: 0, clay: 0, reed: 0, food: 0 }, resources)
    },
  })
  onTestFinished(() => session.dispose())
  return session
}

describe('E052 Cubbyhole through Session', () => {
  it.each(['wood', 'clay'] as const)('pays one %s and one reed through a real minor purchase', material => {
    const session = purchaseSession({ [material]: 1, reed: 1 })
    const response = playMinor(session, CARD_ID)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, clay: 0, reed: 0 })
    expect(response.state.log).toContainEqual(expect.objectContaining({
      key: 'log.playMinorImprovement',
      params: expect.objectContaining({ improvements: CARD_ID, costResources: { [material]: 1, reed: 1 } }),
    }))
    expect(getStoredResource(response.state.players[0]!, CARD_ID, 'food')).toBe(0)
  })

  it.each(['wood', 'clay'] as const)('cannot buy with one %s and no reed', material => {
    const session = purchaseSession({ [material]: 1 })
    const response = playMinor(session, CARD_ID)
    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
    expect(response.state.players[0]!.minorPlayed).toEqual([])
    expect(response.state.players[0]!.resources[material]).toBe(1)
    expect(response.state.log.some(entry => entry.key === 'log.playMinorImprovement')).toBe(false)
    const before = structuredClone({ players: response.state.players, interaction: response.interaction, scores: response.scores })
    const rejected = session.resolveChoice(0, CARD_ID)
    expect(rejected.ok).toBe(false)
    expect({ players: rejected.state.players, interaction: rejected.interaction, scores: rejected.scores }).toEqual(before)
  })

  it('cannot buy with reed alone', () => {
    const session = purchaseSession({ reed: 1 })
    const response = playMinor(session, CARD_ID)
    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, clay: 0, reed: 1 })
  })

  it.each(['wood', 'clay'] as const)('pays the selected %s branch and preserves the other material', material => {
    const session = purchaseSession({ wood: 1, clay: 1, reed: 1 })
    const started = session.takeAction(0, 'meeting-place')
    const improvement = resourceOptions(started).find(option => option.value.startsWith('action-improvement-'))
    if (!improvement) throw new Error('Expected minor improvement branch')
    const offered = session.resolveChoice(0, improvement.value)
    expect(offered.interaction).toMatchObject({ stateId: 'wait', promptKey: 'prompt.selectPayment' })
    const payment = resourceOptions(offered).find(option => option.effectPreview?.resourcesPaid?.[material] === 1)
    if (!payment) throw new Error(`Expected ${material} payment`)
    expect(payment.effectPreview?.resourcesPaid).toMatchObject({
      [material]: 1, [material === 'wood' ? 'clay' : 'wood']: 0, reed: 1,
    })
    const response = session.resolveChoice(0, payment.value)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources).toMatchObject({
      [material]: 0, [material === 'wood' ? 'clay' : 'wood']: 1, reed: 0,
    })
  })

  it('allows Lumber Mill to discount the wood while retaining the reed cost', () => {
    const session = purchaseSession({ reed: 1 }, ['A075_LumberMill'])
    const response = playMinor(session, CARD_ID)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, clay: 0, reed: 0 })
  })

  it('allows Wood Expert to replace wood with food while retaining the reed cost', () => {
    const session = purchaseSession({ food: 1, reed: 1 }, [], ['D117_WoodExpert'])
    const response = playMinor(session, CARD_ID)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, clay: 0, food: 0, reed: 0 })
    expect(response.state.log).toContainEqual(expect.objectContaining({
      key: 'log.playMinorImprovement',
      params: expect.objectContaining({ costResources: { food: 1, reed: 1 } }),
    }))
  })

  it('pays the stored amount from supply in repeated harvests without consuming card food', () => {
    const session = new GameSession(7052, undefined, { playerCount: 2 })
    stabilizeRandomHands(session.state.players)
    const owner = session.state.players[0]!
    session.state.round = 4
    session.state.players.forEach((player) => {
      setActiveWorkerCount(player, 0)
      player.resources.food = 0
    })
    owner.minorPlayed = ['E052_Cubbyhole']
    setStoredResource(owner, 'E052_Cubbyhole', 'food', 3)
    session.loadState(session.state)

    const first = session.performRoundEnd()
    expect(first.ok, first.error).toBe(true)
    expect(first.state.players[0]!.resources.food).toBe(3)
    expect(getStoredResource(first.state.players[0]!, 'E052_Cubbyhole', 'food')).toBe(3)

    session.state.round = 7
    session.state.roundPhase = 'work'
    session.state.players.forEach((player) => {
      setActiveWorkerCount(player, 0)
      player.resources.food = 0
    })
    session.loadState(session.state)
    const snapshot = serializeSessionSnapshot(session.state, session)
    const restored = new GameSession(rehydrateState(JSON.parse(JSON.stringify(snapshot))))
    const second = restored.performRoundEnd()
    expect(second.ok, second.error).toBe(true)
    expect(second.state.players[0]!.resources.food).toBe(3)
    expect(getStoredResource(second.state.players[0]!, 'E052_Cubbyhole', 'food')).toBe(3)
  })
})
