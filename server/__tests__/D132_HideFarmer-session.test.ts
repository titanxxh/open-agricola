import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { markAllWorkersUsed, setActiveWorkerCount } from '../../shared/domain/player'
import { Scoring } from '../../shared/domain'
import type { InteractionRequest, InteractionState, PlayerState } from '../../shared/contract/types'
import { confirmPlayerSwitch } from './_helpers/pending-confirms'

import '../../shared/cards/C/C135_Constable'
import '../../shared/cards/D/D132_HideFarmer'

const CARD_ID = 'D132_HideFarmer'
const CONSTABLE_ID = 'C135_Constable'
const D132_OPTIONAL_PROMPT = 'ui.cards.D132_HideFarmer.optional'
type WaitInteraction = Extract<InteractionState, { stateId: 'wait' }>
type ChoiceInteraction = WaitInteraction & { request: Extract<InteractionRequest, { kind: 'choice' }> }
type ResourceQuantityInteraction = WaitInteraction & {
  request: Extract<InteractionRequest, { kind: 'resource-quantity-select' }>
}

const setPlaceholderHands = (player: PlayerState) => {
  player.minorHand = ['__test_placeholder__']
  player.occupationHand = ['__test_placeholder__']
}

const setSimpleFarmWithEmptySpaces = (player: PlayerState, emptySpaces: number) => {
  const used = 15 - emptySpaces
  const roomCount = Math.min(2, used)
  player.roomTiles = []
  player.fields = []
  player.stableTiles = []
  player.pastures = []
  player.fenceSegments = []
  let placed = 0
  for (let row = 0; row < 3; row += 1) {
    for (let col = 0; col < 5; col += 1) {
      if (placed >= used) return
      if (placed < roomCount) {
        player.roomTiles.push({ row, col })
      } else {
        player.fields.push({ row, col, stacks: [] })
      }
      placed += 1
    }
  }
}

const makeC135D132Fixture = (player: PlayerState) => {
  player.roomTiles = [{ row: 0, col: 0 }, { row: 0, col: 1 }]
  player.fields = [
    { row: 0, col: 2, stacks: [] },
    { row: 0, col: 3, stacks: [] },
  ]
  player.stableTiles = []
  player.fenceSegments = []
  player.pastures = [
    {
      id: 'p1',
      size: 9,
      tiles: [
        { row: 0, col: 4 },
        { row: 1, col: 0 },
        { row: 1, col: 1 },
        { row: 1, col: 2 },
        { row: 1, col: 3 },
        { row: 1, col: 4 },
        { row: 2, col: 0 },
        { row: 2, col: 1 },
        { row: 2, col: 2 },
      ],
      stables: 0,
      animalType: 'sheep',
      animalCount: 4,
    },
  ]
  player.resources = {
    ...player.resources,
    grain: 4,
    vegetable: 2,
    sheep: 4,
    boar: 3,
    cattle: 2,
    begging: 0,
  }
}

const setupEndGameSession = (opts: {
  p0Cards?: string[]
  p1Cards?: string[]
  p0Food?: number
  p1Food?: number
  p0Empty?: number
  p1Empty?: number
  p0FireplaceSheep?: number
  p1FireplaceSheep?: number
} = {}) => {
  const session = new GameSession()
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  state.round = 14
  state.roundPhase = 'work'
  state.gameOver = false
  state.players.forEach((player) => {
    markAllWorkersUsed(state, player)
    setActiveWorkerCount(player, 0)
    setPlaceholderHands(player)
    player.resources = {
      ...player.resources,
      food: 0,
      sheep: 0,
      boar: 0,
      cattle: 0,
      grain: 0,
      vegetable: 0,
    }
    player.occupationPlayed = []
    player.minorPlayed = []
    player.improvements = []
    player.cardStates = {}
  })
  const p0 = state.players[0]!
  const p1 = state.players[1]!
  p0.occupationPlayed = [...(opts.p0Cards ?? [CARD_ID])]
  p1.occupationPlayed = [...(opts.p1Cards ?? [])]
  p0.resources.food = opts.p0Food ?? 0
  p1.resources.food = opts.p1Food ?? 0
  setSimpleFarmWithEmptySpaces(p0, opts.p0Empty ?? 3)
  setSimpleFarmWithEmptySpaces(p1, opts.p1Empty ?? 3)
  if ((opts.p0FireplaceSheep ?? 0) > 0) {
    p0.improvements.push('Major_Fireplace1')
    p0.resources.sheep = opts.p0FireplaceSheep!
    state.availableMajorImprovements = state.availableMajorImprovements.filter((id) => id !== 'Major_Fireplace1')
  }
  if ((opts.p1FireplaceSheep ?? 0) > 0) {
    p1.improvements.push('Major_Fireplace2')
    p1.resources.sheep = opts.p1FireplaceSheep!
    state.availableMajorImprovements = state.availableMajorImprovements.filter((id) => id !== 'Major_Fireplace2')
  }
  session.loadState(state)
  return session
}

const startBeforeEndGame = (session: GameSession) => {
  const resp = session.invokeAfterRoundEnd()
  expect(resp.ok).toBe(true)
  return resp
}

const expectD132Optional = (resp: SessionResponse, playerIndex: number): ChoiceInteraction => {
  const interaction = resp.interaction
  expect(interaction.stateId).toBe('wait')
  if (interaction.stateId !== 'wait') throw new Error('expected wait')
  expect(interaction.playerIndex).toBe(playerIndex)
  expect(interaction.request.kind).toBe('choice')
  if (interaction.request.kind !== 'choice') throw new Error('expected choice request')
  expect(interaction.promptKey).toBe(D132_OPTIONAL_PROMPT)
  return interaction as ChoiceInteraction
}

const expectD132Quantity = (
  resp: SessionResponse,
  playerIndex: number,
): ResourceQuantityInteraction => {
  const interaction = resp.interaction
  expect(interaction.stateId).toBe('wait')
  if (interaction.stateId !== 'wait') throw new Error('expected wait')
  expect(interaction.playerIndex).toBe(playerIndex)
  expect(interaction.request.kind).toBe('resource-quantity-select')
  if (interaction.request.kind !== 'resource-quantity-select') {
    throw new Error('expected resource-quantity-select request')
  }
  expect(interaction.request.cardId).toBe(CARD_ID)
  return interaction as ResourceQuantityInteraction
}

const getD132MarkChoice = (interaction: ChoiceInteraction) => {
  const option = interaction.request.options.find((o) =>
    o.value !== '__skip__' && o.sourceCard === CARD_ID)
  expect(option).toBeDefined()
  return option!.value
}

const acceptD132 = (session: GameSession, resp: SessionResponse, playerIndex = 0) => {
  const choice = getD132MarkChoice(expectD132Optional(resp, playerIndex))
  const next = session.resolveChoice(playerIndex, choice)
  expect(next.ok).toBe(true)
  return next
}

const commitHiddenFood = (session: GameSession, playerIndex: number, food: number) =>
  session.commitSelectionChoice(playerIndex, { resourceCounts: { food } })

const getCategory = (resp: SessionResponse, playerIndex: number, key: string) =>
  Scoring.breakdown(resp.state, playerIndex).categories.find((c) => c.key === key)

describe('D132_HideFarmer session', () => {
  it('offers optional before end game and hides selected unused spaces', () => {
    const session = setupEndGameSession({ p0Food: 2, p0Empty: 3 })
    let resp = startBeforeEndGame(session)
    const optional = expectD132Optional(resp, 0)
    expect(optional.request.options.map((o) => o.value)).toContain('__skip__')

    resp = acceptD132(session, resp, 0)
    const quantity = expectD132Quantity(resp, 0)
    expect(quantity.request.availableByResource.food).toBe(2)
    expect(quantity.request.requireAtLeastOne).toBe(false)

    resp = commitHiddenFood(session, 0, 2)
    expect(resp.ok).toBe(true)
    expect(resp.state.gameOver).toBe(true)
    expect(resp.state.players[0]!.resources.food).toBe(0)
    expect(resp.state.players[0]!.cardStates[CARD_ID]?.extraData?.hiddenSpaces).toBe(2)
    expect(getCategory(resp, 0, 'empty')?.quantity).toBe(1)
    expect(getCategory(resp, 0, 'empty')?.total).toBe(-1)
    expect(getCategory(resp, 0, 'cardBonusVp')).toBeUndefined()
  })

  it('distinguishes optional skip from accepting and choosing zero', () => {
    const skipSession = setupEndGameSession({ p0Food: 2, p0Empty: 2 })
    let resp = startBeforeEndGame(skipSession)
    expectD132Optional(resp, 0)
    resp = skipSession.resolveChoice(0, '__skip__')
    expect(resp.ok).toBe(true)
    expect(resp.state.gameOver).toBe(true)
    expect(resp.state.players[0]!.resources.food).toBe(2)
    expect(resp.state.players[0]!.cardStates[CARD_ID]?.extraData?.hiddenSpaces).not.toEqual(expect.any(Number))
    expect(getCategory(resp, 0, 'empty')?.quantity).toBe(2)

    const zeroSession = setupEndGameSession({ p0Food: 2, p0Empty: 2 })
    resp = startBeforeEndGame(zeroSession)
    resp = acceptD132(zeroSession, resp, 0)
    resp = commitHiddenFood(zeroSession, 0, 0)
    expect(resp.ok).toBe(true)
    expect(resp.state.gameOver).toBe(true)
    expect(resp.state.players[0]!.resources.food).toBe(2)
    expect(resp.state.players[0]!.cardStates[CARD_ID]?.extraData?.hiddenSpaces).toBe(0)
    expect(getCategory(resp, 0, 'empty')?.quantity).toBe(2)
  })

  it('rejects invalid quantity without clearing the D132 quantity pending', () => {
    const session = setupEndGameSession({ p0Food: 2, p0Empty: 3 })
    let resp = acceptD132(session, startBeforeEndGame(session), 0)
    expect(resp.interaction.stateId).toBe('wait')

    resp = commitHiddenFood(session, 0, 99)
    expect(resp.ok).toBe(false)
    expect(resp.state.players[0]!.resources.food).toBe(2)
    expect(resp.state.players[0]!.cardStates[CARD_ID]?.extraData?.hiddenSpaces).not.toEqual(expect.any(Number))
    expectD132Quantity(resp, 0)

    resp = session.commitSelectionChoice(0, { resourceCounts: { food: -1 } })
    expect(resp.ok).toBe(false)
    expect(resp.interaction.stateId).toBe('wait')

    resp = session.commitSelectionChoice(0, { resourceCounts: { food: 1, wood: 1 } })
    expect(resp.ok).toBe(false)
    expect(resp.interaction.stateId).toBe('wait')

    resp = commitHiddenFood(session, 0, 1)
    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.food).toBe(1)
    expect(resp.state.players[0]!.cardStates[CARD_ID]?.extraData?.hiddenSpaces).toBe(1)
  })

  it('allows anytime exchange on D132 optional choice before computing markSpaces max', () => {
    const session = setupEndGameSession({ p0Food: 0, p0Empty: 2, p0FireplaceSheep: 1 })
    let resp = startBeforeEndGame(session)
    const optional = expectD132Optional(resp, 0)
    expect(optional.anytimeActions.map((a) => a.id)).toContain('exchange')

    resp = session.takeAnytimeAction(0, 'exchange')
    expect(resp.ok).toBe(true)
    resp = session.resolveChoice(0, 'bulk:0=1')
    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.food).toBe(2)
    expectD132Optional(resp, 0)

    resp = acceptD132(session, resp, 0)
    const quantity = expectD132Quantity(resp, 0)
    expect(quantity.request.availableByResource.food).toBe(2)
    expect(quantity.anytimeActions.map((a) => a.id)).not.toContain('exchange')
  })

  it('does not skip D132 optional just because current food is zero', () => {
    const session = setupEndGameSession({ p0Food: 0, p0Empty: 2 })
    let resp = startBeforeEndGame(session)
    expectD132Optional(resp, 0)

    resp = acceptD132(session, resp, 0)
    expect(resp.ok).toBe(true)
    expect(resp.state.gameOver).toBe(true)
    expect(resp.state.players[0]!.cardStates[CARD_ID]?.extraData?.hiddenSpaces).toBe(0)
  })

  it('does not prompt when D132 is not played', () => {
    const session = setupEndGameSession({ p0Cards: [], p0Food: 2, p0Empty: 2 })
    const resp = startBeforeEndGame(session)
    expect(resp.ok).toBe(true)
    expect(resp.state.gameOver).toBe(true)
    expect(resp.interaction.stateId).toBe('gameover')
  })

  it('skips D132 when there are no empty spaces or hiddenSpaces was already written', () => {
    const fullSession = setupEndGameSession({ p0Food: 2, p0Empty: 0 })
    let resp = startBeforeEndGame(fullSession)
    expect(resp.state.gameOver).toBe(true)
    expect(resp.interaction.stateId).toBe('gameover')

    const chosenSession = setupEndGameSession({ p0Food: 2, p0Empty: 2 })
    const state = chosenSession.getState().state
    state.players[0]!.cardStates[CARD_ID] = { extraData: { hiddenSpaces: 0 } }
    chosenSession.loadState(state)
    resp = startBeforeEndGame(chosenSession)
    expect(resp.state.gameOver).toBe(true)
    expect(resp.interaction.stateId).toBe('gameover')
  })

  it('treats NaN hiddenSpaces as zero during scoring', () => {
    const session = setupEndGameSession({ p0Food: 2, p0Empty: 2 })
    const state = session.getState().state
    state.players[0]!.cardStates[CARD_ID] = {
      extraData: { hiddenSpaces: Number.NaN },
    }
    session.loadState(state)

    const category = Scoring.breakdown(session.getState().state, 0).categories.find(
      (c) => c.key === 'empty',
    )
    expect(category?.quantity).toBe(2)
    expect(category?.total).toBe(-2)
    expect(Scoring.breakdown(session.getState().state, 0).total).not.toBeNaN()
  })

  it('continues to player 1 and allows player 1 anytime before choosing D132', () => {
    const session = setupEndGameSession({
      p0Cards: [CARD_ID],
      p1Cards: [CARD_ID],
      p0Food: 1,
      p1Food: 0,
      p0Empty: 1,
      p1Empty: 2,
      p1FireplaceSheep: 1,
    })
    let resp = startBeforeEndGame(session)
    resp = acceptD132(session, resp, 0)
    resp = commitHiddenFood(session, 0, 1)
    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.cardStates[CARD_ID]?.extraData?.hiddenSpaces).toBe(1)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') throw new Error('expected wait')
    expect(resp.interaction.request.kind).toBe('confirm-player-switch')

    resp = confirmPlayerSwitch(session)
    expect(resp.ok).toBe(true)

    const p1Optional = expectD132Optional(resp, 1)
    expect(p1Optional.anytimeActions.map((a) => a.id)).toContain('exchange')
    resp = session.takeAnytimeAction(1, 'exchange')
    expect(resp.ok).toBe(true)
    resp = session.resolveChoice(1, 'bulk:0=1')
    expect(resp.ok).toBe(true)
    expectD132Optional(resp, 1)
    resp = acceptD132(session, resp, 1)
    const quantity = expectD132Quantity(resp, 1)
    expect(quantity.request.availableByResource.food).toBe(2)
    resp = commitHiddenFood(session, 1, 1)
    expect(resp.ok).toBe(true)
    expect(resp.state.gameOver).toBe(true)
    expect(resp.state.players[1]!.cardStates[CARD_ID]?.extraData?.hiddenSpaces).toBe(1)
  })

  it('lets C135 see D132-adjusted empty score before bonus scoring', () => {
    const session = setupEndGameSession({
      p0Cards: [CONSTABLE_ID, CARD_ID],
      p0Food: 2,
      p0Empty: 2,
      p1Cards: [],
      p1Food: 0,
      p1Empty: 2,
    })
    const state = session.getState().state
    makeC135D132Fixture(state.players[0]!)
    session.loadState(state)
    let resp = startBeforeEndGame(session)
    resp = acceptD132(session, resp, 0)
    resp = commitHiddenFood(session, 0, 2)
    expect(resp.ok).toBe(true)
    expect(getCategory(resp, 0, 'empty')?.total).toBe(0)
    expect(getCategory(resp, 0, 'cardBonusVp')?.total).toBe(3)
  })
})

describe('D132 Hide Farmer parity', () => {
  const CARD_ID = 'D132_HideFarmer'

  const FILLER = '__test_placeholder__'

  const options = (response: SessionResponse) => response.interaction.stateId === 'wait'
    ? response.interaction.request.options ?? []
    : []

  const setFarmWithUnusedSpaces = (player: SessionResponse['state']['players'][number], unused: number) => {
    const used = 15 - unused
    player.roomTiles = []
    player.fields = []
    player.stableTiles = []
    player.pastures = []
    player.fenceSegments = []
    let placed = 0
    for (let row = 0; row < 3; row += 1) {
      for (let col = 0; col < 5 && placed < used; col += 1) {
        if (placed < 2) player.roomTiles.push({ row, col })
        else player.fields.push({ row, col, stacks: [] })
        placed += 1
      }
    }
    player.rooms = player.roomTiles.length
  }

  const setupScoring = ({ food = 2, unused = 3, played = true } = {}) => {
    const session = new GameSession(6132, undefined, { playerCount: 3 })
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.currentPlayerIndex = 0
    state.round = 14
    state.roundPhase = 'work'
    state.gameOver = false
    state.players.forEach((player) => {
      markAllWorkersUsed(state, player)
      setActiveWorkerCount(player, 0)
      player.minorHand = [FILLER]
      player.occupationHand = [FILLER]
      player.minorPlayed = []
      player.occupationPlayed = []
      player.improvements = []
      player.cardStates = {}
      player.resources = {
        ...player.resources,
        food: 0, wood: 0, clay: 0, reed: 0, stone: 0, grain: 0, vegetable: 0,
        sheep: 0, boar: 0, cattle: 0, begging: 0,
      }
      setFarmWithUnusedSpaces(player, 3)
    })
    const owner = state.players[0]!
    owner.occupationPlayed = played ? [CARD_ID] : []
    owner.resources.food = food
    setFarmWithUnusedSpaces(owner, unused)
    session.loadState(state)
    return session
  }

  const startScoring = (session: GameSession) => session.invokeAfterRoundEnd()

  const acceptHideFarmer = (session: GameSession, response: SessionResponse) => {
    expect(response.interaction.stateId).toBe('wait')
    const use = options(response).find((option) => option.value !== '__skip__'
      && option.sourceCard === CARD_ID)
    expect(use, JSON.stringify(response.interaction)).toBeDefined()
    return use ? session.resolveChoice(response.interaction.playerIndex, use.value) : response
  }

  const emptyScore = (response: SessionResponse) => response.scores?.[0]?.categories
    .find((category) => category.key === 'empty')

  it('D132 S4: available food caps how many unused spaces can be hidden', () => {
    const session = setupScoring({ food: 1 })
    let response = acceptHideFarmer(session, startScoring(session))
    if (response.interaction.stateId === 'wait'
      && response.interaction.request.kind === 'resource-quantity-select') {
      expect(response.interaction.request.availableByResource.food).toBe(1)
    }
    response = session.commitSelectionChoice(0, { resourceCounts: { food: 1 } })

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.food).toBe(0)
    expect(emptyScore(response)).toMatchObject({ quantity: 2, total: -2 })
  })
})
