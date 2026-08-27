import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { markAllWorkersUsed, setActiveWorkerCount } from '../../shared/domain/player'
import type { ActionChoiceOption, Resource } from '../../shared/contract/types'
import '../../shared/cards/B/B021_HayloftBarn'
import '../../shared/cards/E/E142_Smuggler'

const CARD_ID = 'E142_Smuggler'
const HAYLOFT_BARN = 'B021_HayloftBarn'

const setup = () => {
  const session = new GameSession(42, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.round = 4
  state.currentPlayerIndex = 0
  state.players.forEach((player) => {
    setActiveWorkerCount(player, 1)
    markAllWorkersUsed(state, player)
    player.resources.food = 10
  })

  const player = state.players[0]!
  player.occupationPlayed.push(CARD_ID)
  player.minorPlayed.push(HAYLOFT_BARN)
  player.cardStates[HAYLOFT_BARN] = {
    extraData: { foodCount: 2 },
    infobox: '2 Food',
  }
  player.resources.wood = 1
  player.resources.grain = 0
  player.resources.stone = 0

  session.loadState(state)
  return session
}

const exchangeOption = (
  resp: SessionResponse,
  resourcesPaid: Partial<Resource>,
  resourcesGained: Partial<Resource>,
): ActionChoiceOption => {
  expect(resp.interaction.stateId).toBe('wait')
  if (resp.interaction.stateId !== 'wait') throw new Error('expected Smuggler choice')
  const option = resp.interaction.request.options?.find((entry) =>
    entry.sourceCard === CARD_ID
    && entry.effectPreview?.kind === 'resourceExchange'
    && JSON.stringify(entry.effectPreview.resourcesPaid) === JSON.stringify(resourcesPaid)
    && JSON.stringify(entry.effectPreview.resourcesGained) === JSON.stringify(resourcesGained)
  )
  expect(option).toBeDefined()
  return option!
}

describe('E142_Smuggler session', () => {
  it('chains wood to grain and the gained grain to stone as two exchanges', () => {
    const session = setup()
    let resp = session.performRoundEnd()

    resp = session.resolveChoice(0, exchangeOption(resp, { wood: 1 }, { grain: 1 }).value)
    expect(resp.state.players[0]!.cardStates[HAYLOFT_BARN]?.extraData?.foodCount).toBe(1)
    resp = session.resolveChoice(0, exchangeOption(resp, { grain: 1 }, { stone: 1 }).value)

    const player = resp.state.players[0]!
    expect(player.resources).toMatchObject({ wood: 0, grain: 0, stone: 1 })
    expect(resp.state.events.filter((event) =>
      event.type === 'resource.exchanged' && event.exchangeSource === CARD_ID
    )).toEqual([
      expect.objectContaining({ paid: { wood: 1 }, gained: { grain: 1 } }),
      expect.objectContaining({ paid: { grain: 1 }, gained: { stone: 1 } }),
    ])
  })

  it('allows passing both exchange stages', () => {
    const session = setup()
    let resp = session.performRoundEnd()

    expect(exchangeOption(resp, { wood: 1 }, { grain: 1 })).toBeDefined()
    resp = session.resolveChoice(0, '__skip__')
    expect(exchangeOption(resp, { wood: 1 }, { grain: 1 })).toBeDefined()
    resp = session.resolveChoice(0, '__skip__')

    expect(resp.state.players[0]!.resources).toMatchObject({ wood: 1, grain: 0, stone: 0 })
    expect(resp.state.events.some((event) =>
      event.type === 'resource.exchanged' && event.exchangeSource === CARD_ID
    )).toBe(false)
  })
})
