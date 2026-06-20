import { describe, expect, it } from 'vitest'

import { GameSession } from '../game/authoritative-session'
import { runCardEffectHook } from '../../shared/cards/card-effects'
import { D172_PutcherMaker } from '../../shared/cards/D/D172_PutcherMaker'
import { markAllWorkersUsed, setWorkersAtHome } from '../../shared/domain/player'

const setupLessonsSession = (cardId: string, food = 10) => {
  const session = new GameSession(undefined, undefined, { playerCount: 4 })
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  state.round = 1
  for (const player of state.players) {
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
  }
  const player = state.players[0]!
  setWorkersAtHome(state, player, 2)
  player.occupationHand = [cardId]
  player.resources.food = food
  state.players[1]!.workersAvailable = 2
  session.loadState(state)
  return session
}

const chooseFirstNonSkipOption = (session: GameSession, playerIndex: number) => {
  const resp = session.getState()
  expect(resp.interaction.stateId).toBe('wait')
  if (resp.interaction.stateId !== 'wait') return resp
  expect(resp.interaction.options).toBeDefined()
  const option = resp.interaction.options.find((entry) => entry.value !== '__skip__')
  expect(option).toBeDefined()
  return session.resolveChoice(playerIndex, option!.value)
}

const setupHarvestStartSession = (cardId: string) => {
  const session = new GameSession()
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  state.round = 4
  for (const player of state.players) {
    markAllWorkersUsed(state, player)
    player.resources.food = 20
  }
  state.players[0]!.occupationPlayed.push(cardId)
  session.loadState(state)
  return session
}

describe('Agricola 5-6 simple occupation cards', () => {
  it('D172 Putcher Maker can exchange multiple reed for food through the anytime exchange action', () => {
    const session = setupLessonsSession('A176_Wheelmaker')
    const state = session.getState().state
    const player = state.players[0]!
    player.occupationPlayed = ['D172_PutcherMaker']
    player.resources.reed = 3
    player.resources.food = 0
    session.loadState(state)

    expect(session.takeAction(0, 'farmland').ok).toBe(true)
    let resp = session.takeAnytimeAction(0, 'exchange')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.request.kind).toBe('choice')

    resp = session.resolveChoice(0, 'bulk:0=2')
    expect(resp.ok).toBe(true)

    expect(resp.state.players[0]!.resources.reed).toBe(1)
    expect(resp.state.players[0]!.resources.food).toBe(4)
  })

  it('C178 On-Site Reverend lets the player choose one building resource at harvest start', () => {
    const session = setupHarvestStartSession('C178_OnSiteReverend')

    let resp = session.performRoundEnd()
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    const options = resp.interaction.options?.filter((option) => option.sourceCard === 'C178_OnSiteReverend')
    expect(options).toHaveLength(4)

    resp = session.resolveChoice(0, options![3]!.value)
    expect(resp.ok).toBe(true)

    expect(resp.state.players[0]!.resources.stone).toBe(1)
  })

  it('A176 Wheelmaker tops up wood to 15 when another occupation is in play and the player has more wood than all others combined', () => {
    const session = setupLessonsSession('A176_Wheelmaker')
    const state = session.getState().state
    const player = state.players[0]!
    player.occupationPlayed = ['A114_SeasonalWorker']
    player.resources.wood = 12
    state.players[1]!.resources.wood = 11
    session.loadState(state)

    const resp = session.takeAction(0, 'lessons')
    expect(resp.ok).toBe(true)

    const updatedPlayer = resp.state.players[0]!
    expect(updatedPlayer.occupationPlayed).toContain('A176_Wheelmaker')
    expect(updatedPlayer.resources.wood).toBe(15)
  })

  it('A176 Wheelmaker does not trigger without another occupation already in play', () => {
    const session = setupLessonsSession('A176_Wheelmaker')
    const state = session.getState().state
    const player = state.players[0]!
    player.resources.wood = 12

    const flow = runCardEffectHook(state, player, 'A176_Wheelmaker', 'onBuy')

    expect(flow).toBeNull()
  })

  it('A176 Wheelmaker does not trigger on a wood tie with all other players combined', () => {
    const session = setupLessonsSession('A176_Wheelmaker')
    const state = session.getState().state
    const player = state.players[0]!
    player.occupationPlayed = ['A114_SeasonalWorker']
    player.resources.wood = 12
    state.players[1]!.resources.wood = 12

    const flow = runCardEffectHook(state, player, 'A176_Wheelmaker', 'onBuy')

    expect(flow).toBeNull()
  })

  it('D177 Graduate lets the player pay 1 food for 2 stone and 2 reed when played', () => {
    const session = setupLessonsSession('D177_Graduate', 3)

    let resp = session.takeAction(0, 'lessons')
    expect(resp.ok).toBe(true)
    resp = chooseFirstNonSkipOption(session, 0)
    expect(resp.ok).toBe(true)

    const player = resp.state.players[0]!
    expect(player.occupationPlayed).toContain('D177_Graduate')
    expect(player.resources.food).toBe(2)
    expect(player.resources.stone).toBe(2)
    expect(player.resources.reed).toBe(2)
  })

  it('D177 Graduate has no on-play reward when the player cannot pay food', () => {
    const session = setupLessonsSession('D177_Graduate', 0)
    const state = session.getState().state
    const player = state.players[0]!

    const flow = runCardEffectHook(state, player, 'D177_Graduate', 'onBuy')

    expect(flow).toBeNull()
  })

  it('D172 Putcher Maker exposes an unlimited anytime reed to food exchange', () => {
    expect(D172_PutcherMaker.exchanges).toEqual([
      { from: { reed: 1 }, to: { food: 2 }, triggers: ['anytime'] },
    ])
  })
})
