import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { markAllWorkersUsed, setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import type { Resource } from '../../shared/contract/types'

import '../../shared/cards/B/B113_PatchCaregiver'

const CARD_ID = 'B113_PatchCaregiver'
const FILLER = '__test_placeholder__'
const VIRTUAL_COL = 2113
type Crop = 'grain' | 'vegetable' | 'wood' | 'stone'

const setup = ({
  food = 3, played = false, crop, round = 5,
}: { food?: number; played?: boolean; crop?: Crop; round?: number } = {}) => {
  const session = new GameSession(5513 + round, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = round
  state.roundPhase = 'work'
  state.roundActionOrder = state.roundActionOrder.map(() => null)
  state.roundActionOrder[0] = 'grain-utilization'
  state.players.forEach((player) => {
    setWorkersAtHome(state, player, 2)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.resources.food = 20
  })
  const owner = state.players[0]!
  owner.occupationHand = played ? [FILLER] : [CARD_ID]
  owner.occupationPlayed = played ? [CARD_ID] : []
  owner.resources = {
    ...owner.resources,
    wood: 0, clay: 0, reed: 0, stone: 0, food, grain: 0, vegetable: 0,
  }
  if (crop) owner.resources[crop] = 1
  owner.fields = []
  session.loadState(state)
  return session
}

const play = (session: GameSession) => {
  const response = session.takeAction(0, 'lessons')
  expect(response.ok, response.error).toBe(true)
  if (!response.state.players[0]!.occupationHand.includes(CARD_ID)) return response
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') return response
  const option = response.interaction.request.options?.find((candidate) => candidate.value === CARD_ID)
  expect(option).toBeDefined()
  return session.resolveChoice(response.interaction.playerIndex, option!.value)
}

const choosePurchase = (session: GameSession, response: SessionResponse, resource: 'grain' | 'vegetable') => {
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') return response
  const nonSkip = response.interaction.request.options?.filter((option) => option.value !== '__skip__') ?? []
  const option = nonSkip.find((candidate) => candidate.effectPreview?.resourcesGained?.[resource] === 1)
    ?? nonSkip[resource === 'grain' ? 0 : 1]
  expect(option).toBeDefined()
  return session.resolveChoice(response.interaction.playerIndex, option!.value)
}

const sow = (session: GameSession, crop: Crop) => {
  const pending = session.takeAction(0, 'grain-utilization')
  expect(pending.ok, pending.error).toBe(true)
  expect(pending.interaction).toMatchObject({
    stateId: 'wait', request: { kind: 'farm-select', farm: { farmType: 'sow' } },
  })
  if (pending.interaction.stateId === 'wait' && pending.interaction.request.farm.farmType === 'sow') {
    const field = pending.interaction.request.farm.selectableFields.find(
      (candidate) => candidate.tile.row === -1 && candidate.tile.col === VIRTUAL_COL,
    )
    expect(field?.allowedCrops).toContain(crop)
  }
  return session.commitSelectionChoice(0, {
    crops: [{ row: -1, col: VIRTUAL_COL, crop }],
  })
}

const cardStacks = (response: SessionResponse) =>
  response.state.players[0]!.cardStates[CARD_ID]?.extraData?.cardFieldStacks

describe('B113 Patch Caregiver parity', () => {
  for (const [scenario, food, resource] of [
    ['S1', 1, 'grain'],
    ['S2', 3, 'vegetable'],
  ] as const) {
    it(`B113 ${scenario}: on play pays ${food} food for one ${resource}`, () => {
      const session = setup({ food })

      const response = choosePurchase(session, play(session), resource)

      expect(response.ok, response.error).toBe(true)
      expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
      expect(response.state.players[0]!.resources.food).toBe(0)
      expect(response.state.players[0]!.resources[resource]).toBe(1)
    })
  }

  it('B113 S3: declining the on-play purchase keeps all food and gains no crop', () => {
    const session = setup({ food: 3 })
    const played = play(session)
    expect(played.interaction.stateId).toBe('wait')
    if (played.interaction.stateId !== 'wait') return

    const response = session.resolveChoice(played.interaction.playerIndex, '__skip__')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 3, grain: 0, vegetable: 0 })
  })

  it('B113 S4: without food OA skips the Patch Caregiver card prompt', () => {
    const session = setup({ food: 0 })
    const response = play(session)

    expect(response.ok, response.error).toBe(true)
    expect(response.interaction).toMatchObject({
      stateId: 'wait',
      request: { kind: 'confirm-next-player' },
    })
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 0, grain: 0, vegetable: 0 })
  })

  for (const [scenario, crop, expected] of [
    ['S5', 'grain', 3],
    ['S6', 'vegetable', 2],
    ['S7', 'wood', 3],
    ['S8', 'stone', 2],
  ] as const) {
    it(`B113 ${scenario}: its card field accepts ${crop} and receives ${expected} counters`, () => {
      const session = setup({ played: true, crop, food: 20, round: 14 })

      const response = sow(session, crop)

      expect(response.ok, response.error).toBe(true)
      expect(response.state.players[0]!.resources[crop]).toBe(0)
      expect(cardStacks(response)).toEqual([{ crop, remaining: expected }])

      if (crop === 'grain') {
        const state = session.getState().state
        state.players.forEach((player) => {
          markAllWorkersUsed(state, player)
          player.resources.food = 20
        })
        session.loadState(state)
        const harvested = session.performRoundEnd()
        const after = harvested.state.players[0]!
        expect(after.resources.grain).toBe(1)
        expect(after.cardStates[CARD_ID]?.extraData?.cardFieldStacks)
          .toEqual([{ crop: 'grain', remaining: 2 }])
      }
    })
  }
})
