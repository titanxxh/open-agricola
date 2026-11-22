import { describe, expect, it } from 'vitest'
import { wmSession, wmId, wmOk, wmChoose, wmPayment } from './_helpers/classic-wm-session'
import { playMinor, sessionOptions } from './_helpers/card-regression-session'
import type { GameState } from '../../shared/contract/types'
import type { SessionResponse } from '../game/authoritative-session'

const CARD_ID = wmId(113)

const markets = (state: GameState, sheep: number, boar: number, cattle: number) => {
  const space = (id: string) => state.actionSpaces.find((entry) => entry.id === id)!
  space('sheep-market').resources.sheep = sheep
  space('pig-market').resources.boar = boar
  space('cattle-market').resources.cattle = cattle
}

const marketCounts = (response: SessionResponse) => {
  const space = (id: string) => response.state.actionSpaces.find((entry) => entry.id === id)!.resources
  return [space('sheep-market').sheep, space('pig-market').boar, space('cattle-market').cattle]
}

const accumulated = (response: SessionResponse) =>
  response.state.events
    .filter((event) => event.type === 'action.accumulated' && event.sourceCardId === CARD_ID)
    .map((event) => event.type === 'action.accumulated' ? [event.spaceId, event.resources] : [])

const collectOption = (response: SessionResponse, animal: 'sheep' | 'boar' | 'cattle') =>
  sessionOptions(response).find((option) =>
    option.sourceCard === CARD_ID &&
    option.labelKey === 'actions.collect.name' &&
    option.effectPreview?.kind === 'resourceExchange' &&
    option.effectPreview.resourcesGained?.[animal] === 1)

const playWildBreeding = (configure: (state: GameState) => void) => {
  const session = wmSession([113], (state) => {
    state.players[0]!.resources.reed = 1
    configure(state)
  }, false)
  return { session, response: wmPayment(session, playMinor(session, CARD_ID)) }
}

describe('CWM113 Wild Breeding', () => {
  it('adds one animal to each market with at least two, offers one of them, and passes the card', () => {
    const { session, response } = playWildBreeding((state) => markets(state, 3, 2, 1))
    expect(response.state.players[0]!.resources.reed).toBe(0)
    expect(marketCounts(response)).toEqual([4, 3, 1])
    expect(accumulated(response)).toEqual([
      ['sheep-market', { sheep: 1 }],
      ['pig-market', { boar: 1 }],
    ])
    expect(response.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0, sourceCard: CARD_ID })
    expect(collectOption(response, 'sheep')).toBeDefined()
    expect(collectOption(response, 'boar')).toBeDefined()
    expect(collectOption(response, 'cattle')).toBeUndefined()
    expect(sessionOptions(response).map((option) => option.value)).toContain('__skip__')
    expect(response.state.players[1]!.minorHand).toContain(CARD_ID)
    expect(response.state.players[0]!.minorPlayed).not.toContain(CARD_ID)

    const taken = wmChoose(session, response, collectOption(response, 'boar')!.value)
    expect(taken.state.players[0]!.resources).toMatchObject({ boar: 1, sheep: 0, cattle: 0 })
    expect(marketCounts(taken)).toEqual([4, 2, 1])
    expect(taken.state.events.filter((event) => event.type === 'action.accumulated' && event.sourceCardId === CARD_ID)).toHaveLength(2)
    expect(collectOption(taken, 'sheep')).toBeUndefined()
  })

  it('keeps the added animals on the markets when the player declines to take one', () => {
    const { session, response } = playWildBreeding((state) => markets(state, 2, 0, 2))
    expect(marketCounts(response)).toEqual([3, 0, 3])
    expect(accumulated(response)).toEqual([
      ['sheep-market', { sheep: 1 }],
      ['cattle-market', { cattle: 1 }],
    ])
    const skipped = wmChoose(session, response, '__skip__')
    expect(skipped.state.players[0]!.resources).toMatchObject({ sheep: 0, boar: 0, cattle: 0 })
    expect(marketCounts(skipped)).toEqual([3, 0, 3])
    expect(skipped.state.players[1]!.minorHand).toContain(CARD_ID)
  })

  it('adds nothing to markets with fewer than two animals', () => {
    const { response } = playWildBreeding((state) => markets(state, 1, 0, 1))
    expect(marketCounts(response)).toEqual([1, 0, 1])
    expect(accumulated(response)).toEqual([])
    expect(collectOption(response, 'sheep')).toBeUndefined()
    expect(collectOption(response, 'cattle')).toBeUndefined()
    expect(response.state.players[1]!.minorHand).toContain(CARD_ID)
  })

  it('still adds the animals but offers none when the player has no room for another animal', () => {
    const { response } = playWildBreeding((state) => {
      markets(state, 3, 2, 2)
      state.players[0]!.resources.sheep = 1
      state.players[0]!.houseAnimals = { '1-0': 'sheep' }
    })
    wmOk(response)
    expect(marketCounts(response)).toEqual([4, 3, 3])
    expect(accumulated(response)).toHaveLength(3)
    expect(collectOption(response, 'sheep')).toBeUndefined()
    expect(collectOption(response, 'boar')).toBeUndefined()
    expect(collectOption(response, 'cattle')).toBeUndefined()
    expect(response.state.players[0]!.resources).toMatchObject({ sheep: 1, boar: 0, cattle: 0 })
    expect(response.state.players[1]!.minorHand).toContain(CARD_ID)
  })
})
