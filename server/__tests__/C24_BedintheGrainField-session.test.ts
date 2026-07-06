import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { readCardExtraData } from '../../shared/cards/helpers/card-state'
import { familySize, markAllWorkersUsed, setActiveWorkerCount } from '../../shared/domain/player'
import type { ActionChoiceOption } from '../../shared/contract/types'

const CARD_ID = 'C024_BedintheGrainField'

const setupHarvest = (options: { rooms: number; ready?: boolean } = { rooms: 3, ready: true }) => {
  const session = new GameSession()
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.round = 4
  state.currentPlayerIndex = 0
  state.players[0]!.startPlayer = true
  state.players[1]!.startPlayer = false

  state.players.forEach((player) => {
    setActiveWorkerCount(player, 2)
    markAllWorkersUsed(state, player)
    player.resources.food = 20
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
  })

  const player = state.players[0]!
  player.rooms = options.rooms
  player.minorPlayed.push(CARD_ID)
  player.cardStates[CARD_ID] = {
    extraData: { nextHarvestReady: options.ready ?? true },
  }

  session.loadState(state)
  return session
}

const expectC24Prompt = (resp: ReturnType<GameSession['performRoundEnd']>) => {
  expect(resp.interaction.stateId).toBe('wait')
  if (resp.interaction.stateId !== 'wait') throw new Error('expected C24 optional prompt')
  const options = resp.interaction.request.options ?? []
  const skip = options.find((option: ActionChoiceOption) => option.value === '__skip__')
  const accept = options.find((option: ActionChoiceOption) => option.value !== '__skip__')
  expect(skip).toBeDefined()
  expect(accept).toBeDefined()
  return { skip: skip!, accept: accept! }
}

describe('C024_BedintheGrainField session', () => {
  it('can skip the next-harvest family growth and clears the marker', () => {
    const session = setupHarvest({ rooms: 3 })

    let resp = session.performRoundEnd()
    const { skip } = expectC24Prompt(resp)
    resp = session.resolveChoice(0, skip.value)

    const player = resp.state.players[0]!
    expect(familySize(player)).toBe(2)
    expect(readCardExtraData<boolean>(player, CARD_ID, 'nextHarvestReady')).toBe(false)
  })

  it('accepting the next-harvest family growth adds one family member and clears the marker', () => {
    const session = setupHarvest({ rooms: 3 })

    let resp = session.performRoundEnd()
    const { accept } = expectC24Prompt(resp)
    resp = session.resolveChoice(0, accept.value)

    const player = resp.state.players[0]!
    expect(familySize(player)).toBe(3)
    expect(readCardExtraData<boolean>(player, CARD_ID, 'nextHarvestReady')).toBe(false)
  })

  it('does not offer a flow when there is no room and still clears the marker', () => {
    const session = setupHarvest({ rooms: 2 })

    const resp = session.performRoundEnd()

    const player = resp.state.players[0]!
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.request.options?.some((option) => option.value === '__skip__') : false).toBe(false)
    expect(familySize(player)).toBe(2)
    expect(readCardExtraData<boolean>(player, CARD_ID, 'nextHarvestReady')).toBe(false)
  })

  it('does not trigger again after the marker has been cleared', () => {
    const session = setupHarvest({ rooms: 3, ready: false })

    const resp = session.performRoundEnd()

    const player = resp.state.players[0]!
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.request.options?.some((option) => option.value === '__skip__') : false).toBe(false)
    expect(familySize(player)).toBe(2)
    expect(readCardExtraData<boolean>(player, CARD_ID, 'nextHarvestReady')).toBe(false)
  })
})
