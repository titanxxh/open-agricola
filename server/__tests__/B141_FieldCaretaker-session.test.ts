import { type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { autoAdvanceRoundEnd } from '../../tests/llm-card-gen/session-helpers'

import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { markAllWorkersUsed } from '../../shared/domain/player'
import '../../shared/cards/B/B141_FieldCaretaker'
import { B141_FieldCaretaker_impl } from '../../shared/cards/B/B141_FieldCaretaker'

const CARD_ID = 'B141_FieldCaretaker'
const VIRTUAL_COL = 2141
const harvestRounds = [4, 7, 9, 11, 13, 14]

const setup = (options?: {
  resources?: Partial<{ grain: number; vegetable: number; wood: number; stone: number; food: number; clay: number }>
  round?: number
  stacks?: { crop: 'grain' | 'vegetable' | 'wood' | 'stone'; remaining: number }[]
}) => {
  const session = new GameSession(42)
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  state.round = options?.round ?? 1
  state.roundPhase = 'work'
  state.roundActionOrder = state.roundActionOrder.map(() => null)
  state.roundActionOrder[0] = 'grain-utilization'

  const player = state.players[0]!
  player.workersAvailable = options?.round && harvestRounds.includes(options.round) ? 0 : 2
  player.resources.food = options?.resources?.food ?? 10
  player.resources.grain = options?.resources?.grain ?? 0
  player.resources.vegetable = options?.resources?.vegetable ?? 0
  player.resources.wood = options?.resources?.wood ?? 0
  player.resources.stone = options?.resources?.stone ?? 0
  player.resources.clay = options?.resources?.clay ?? 0
  player.fields = []
  for (const p of state.players) {
    p.minorHand = ['__test_placeholder__']
    p.occupationHand = ['__test_placeholder__']
  }
  player.minorPlayed.push(CARD_ID)
  if (options?.stacks) {
    player.cardStates = player.cardStates ?? {}
    player.cardStates[CARD_ID] = { extraData: { cardFieldStacks: options.stacks } }
  }
  if (options?.round && harvestRounds.includes(options.round)) {
    for (const p of state.players) {
      markAllWorkersUsed(state, p)
      p.resources.food = 10
    }
  }
  session.loadState(state)
  return session
}

describe('B141 FieldCaretaker — cardField bug fix (4 crops)', () => {
  it.each(['grain', 'vegetable', 'wood', 'stone'] as const)(
    'allows sowing %s on virtual tile (reference constraints=null)',
    (crop) => {
      const session = setup({ resources: { [crop]: 2 } })
      const resp = session.takeAction(0, 'grain-utilization')
      expect(resp.ok).toBe(true)
      expect(resp.interaction.stateId).toBe('wait')
      if (resp.interaction.stateId === 'wait' && resp.interaction.request.farm.farmType === 'sow') {
        const cardField = resp.interaction.request.farm.selectableFields.find(
          (f) => f.tile.row === -1 && f.tile.col === VIRTUAL_COL,
        )
        expect(cardField).toBeDefined()
        expect(cardField?.allowedCrops).toContain(crop)
      }
      const next = session.commitSelectionChoice(0, {
        crops: [{ row: -1, col: VIRTUAL_COL, crop }],
      })
      expect(next.ok).toBe(true)
      const player = next.state.players[0]!
      expect(player.cardStates?.[CARD_ID]?.extraData?.cardFieldStacks).toEqual([
        { crop, remaining: crop === 'grain' || crop === 'wood' ? 3 : 2 },
      ])
      expect(player.resources[crop]).toBe(1)
    },
  )

  it('harvest produces +1 of sown crop and updates summary/log', () => {
    const session = setup({
      round: 4,
      stacks: [{ crop: 'grain', remaining: 2 }],
    })
    const resp = session.performRoundEnd()
    expect(resp.ok).toBe(true)
    const player = resp.state.players[0]!
    expect(player.resources.grain).toBe(1)
    expect(player.cardStates?.[CARD_ID]?.extraData?.cardFieldStacks).toEqual([
      { crop: 'grain', remaining: 1 },
    ])
    const logs = resp.state.log
    const reapDetail = logs.find(
      (e) => e.key === 'log.reapDetail' && (e.params as { player?: string })?.player === player.name,
    )
    expect(reapDetail).toBeDefined()
    expect((reapDetail!.params as { resources: { grain?: number } }).resources.grain).toBeGreaterThanOrEqual(1)
  })

  it('onBuy XOR pending shows three options (gain only / pay 1 clay+2 grain / pay 3 clay+3 grain)', () => {
    const session = setup()
    const state = session.getState().state
    const flow = B141_FieldCaretaker_impl.effect.onBuy!(state, state.players[0]!)
    expect(flow).toMatchObject({ type: 'xor', optional: true })
    const xor = flow as Extract<typeof flow, { type: 'xor' }>
    expect(xor.children).toHaveLength(3)
    // first child: gain leaf (1 grain only)
    expect(xor.children[0]).toMatchObject({ type: 'leaf', actionId: 'gain', params: { grain: 1 } })
    // second child: pay 1 clay + gain 2 grain
    expect(xor.children[1]).toMatchObject({ type: 'seq' })
    // third child: pay 3 clay + gain 3 grain
    expect(xor.children[2]).toMatchObject({ type: 'seq' })
  })
})

describe('B141 Field Caretaker parity', () => {
  const CARD_ID = 'B141_FieldCaretaker'

  const FILLER = '__test_placeholder__'

  const VIRTUAL_COL = 2141

  type Crop = 'grain' | 'vegetable' | 'wood' | 'stone'

  const setup = ({
    played = false, round = 10, resources = {}, ordinaryFields = 0,
  }: {
    played?: boolean
    round?: number
    resources?: Partial<Record<Crop | 'food' | 'clay', number>>
    ordinaryFields?: number
  } = {}) => {
    const session = new GameSession(6141 + round, undefined, { playerCount: 3 })
    const state = session.getState().state
    stabilizeRandomHands(state.players)
    state.currentPlayerIndex = 0
    state.round = round
    state.roundPhase = 'work'
    state.roundActionOrder = [
      'grain-utilization',
      ...state.roundActionOrder.filter((id) => id !== 'grain-utilization'),
    ]
    state.actionSpaces.forEach((space) => { space.takenBy = [] })
    state.players.forEach((player, index) => {
      setWorkersAtHome(state, player, index === 0 ? 2 : 0)
      player.minorHand = [FILLER]
      player.occupationHand = [FILLER]
      player.minorPlayed = []
      player.occupationPlayed = []
      player.cardStates = {}
      player.fields = []
      Object.assign(player.resources, {
        wood: 0, clay: 0, reed: 0, stone: 0, food: 20, grain: 0, vegetable: 0,
        sheep: 0, boar: 0, cattle: 0, begging: 0,
      })
    })
    const owner = state.players[0]!
    owner.occupationHand = played ? [FILLER] : [CARD_ID]
    owner.occupationPlayed = played ? [CARD_ID] : []
    owner.fields = Array.from({ length: ordinaryFields }, (_, col) => ({
      row: 2, col: col + 1, stacks: [],
    }))
    Object.assign(owner.resources, resources)
    session.loadState(state)
    return session
  }

  const options = (response: SessionResponse) => response.interaction.stateId === 'wait'
    ? response.interaction.request.options ?? []
    : []

  const playOccupation = (session: GameSession) => {
    let response = session.takeAction(0, 'lessons')
    if (response.interaction.stateId === 'wait'
      && response.state.players[0]!.occupationHand.includes(CARD_ID)) {
      const card = options(response).find((option) => option.value === CARD_ID)
      expect(card, JSON.stringify(response.interaction)).toBeDefined()
      response = session.resolveChoice(response.interaction.playerIndex, card!.value)
    }
    return response
  }

  const chooseExchange = (session: GameSession, response: SessionResponse, index: number) => {
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') return response
    const choices = options(response).filter((option) => option.value !== '__skip__')
    expect(choices[index], JSON.stringify(response.interaction)).toBeDefined()
    return session.resolveChoice(response.interaction.playerIndex, choices[index]!.value)
  }

  const sowCardField = (session: GameSession, crop: Crop) => {
    let response = session.takeAction(0, 'grain-utilization')
    expect(response.ok, response.error).toBe(true)
    if (response.interaction.stateId === 'wait'
      && response.interaction.request.kind === 'choice') {
      const sow = options(response).find((option) =>
        option.value === 'sow' || option.labelKey === 'actions.sow.name')
      expect(sow, JSON.stringify(response.interaction)).toBeDefined()
      response = session.resolveChoice(response.interaction.playerIndex, sow!.value)
    }
    expect(response.interaction).toMatchObject({
      stateId: 'wait', request: { kind: 'farm-select', farm: { farmType: 'sow' } },
    })
    return session.commitSelectionChoice(0, {
      crops: [{ row: -1, col: VIRTUAL_COL, crop }],
    })
  }

  const cardFieldStacks = (response: SessionResponse) =>
    response.state.players[0]!.cardStates[CARD_ID]?.extraData?.cardFieldStacks

  for (const { scenario, clay, choiceIndex, grain } of [
    { scenario: 'S1', clay: 0, choiceIndex: 0, grain: 1 },
    { scenario: 'S2', clay: 1, choiceIndex: 1, grain: 2 },
    { scenario: 'S3', clay: 3, choiceIndex: 2, grain: 3 },
  ]) {
    it(`B141 ${scenario}: choosing the ${clay}-clay exchange gains ${grain} grain`, () => {
      const session = setup({ resources: { clay } })
      const response = chooseExchange(session, playOccupation(session), choiceIndex)

      expect(response.ok, response.error).toBe(true)
      expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
      expect(response.state.players[0]!.resources).toMatchObject({ clay: 0, grain })
    })
  }

  it('B141 S4: declining every immediate exchange keeps all clay and gains no grain', () => {
    const session = setup({ resources: { clay: 3 } })
    const offered = playOccupation(session)
    expect(options(offered).some((option) => option.value === '__skip__')).toBe(true)

    const response = session.resolveChoice(offered.interaction.playerIndex, '__skip__')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ clay: 3, grain: 0 })
  })

  it('B141 S5: with one clay only the free and one-clay exchange branches are available', () => {
    const session = setup({ resources: { clay: 1 } })
    const offered = playOccupation(session)

    expect(options(offered).filter((option) => option.value !== '__skip__')).toHaveLength(2)
    const response = chooseExchange(session, offered, 1)
    expect(response.state.players[0]!.resources).toMatchObject({ clay: 0, grain: 2 })
  })

  for (const { scenario, crop, expected } of [
    { scenario: 'S6a', crop: 'grain' as const, expected: 3 },
    { scenario: 'S6b', crop: 'vegetable' as const, expected: 2 },
    { scenario: 'S6c', crop: 'wood' as const, expected: 3 },
    { scenario: 'S6d', crop: 'stone' as const, expected: 2 },
  ]) {
    it(`B141 ${scenario}: the card field accepts one ${crop} seed with its normal stack`, () => {
      const response = sowCardField(setup({ played: true, resources: { [crop]: 1 } }), crop)

      expect(response.ok, response.error).toBe(true)
      expect(response.state.players[0]!.resources[crop]).toBe(0)
      expect(cardFieldStacks(response)).toEqual([{ crop, remaining: expected }])
    })
  }

  it('B141 S8: the card field is excluded from the ordinary-field scoring category', () => {
    const session = setup({ played: true, round: 14, ordinaryFields: 1 })
    const state = session.getState().state
    state.players.forEach((player) => markAllWorkersUsed(state, player))
    session.loadState(state)

    const response = autoAdvanceRoundEnd(session)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.gameOver).toBe(true)
    expect(response.scores[0]!.categories.find((category) => category.key === 'fields'))
      .toMatchObject({ quantity: 1, total: -1 })
  })
})
