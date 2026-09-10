import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { createPlayerActionSpaces } from '../../shared/cards/player-action-space'
import { markAllWorkersUsed, setActiveWorkerCount, setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/A/A032_Manger'
import '../../shared/cards/A/A035_SwimmingClass'
import '../../shared/cards/A/A036_FacadesCarving'
import '../../shared/cards/A/A038_WoolBlankets'
import '../../shared/cards/A/A039_Chapel'

const FILLER = '__test_placeholder__'
const OCCUPATIONS = ['A116_WoodCutter', 'B121_Geologist']

const setupMinor = ({
  cardId, played = false, round = 14, resources = {}, occupations = 0,
}: {
  cardId: string
  played?: boolean
  round?: number
  resources?: Record<string, number>
  occupations?: number
}) => {
  const session = new GameSession(7032 + round, undefined, { playerCount: 3 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = round
  state.roundPhase = 'work'
  state.availableMajorImprovements = []
  state.actionSpaces.forEach((space) => { space.takenBy = [] })
  state.players.forEach((player) => {
    setWorkersAtHome(state, player, 2)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.cardStates = {}
    player.fields = []
    player.pastures = []
    player.stableTiles = []
    player.resources = {
      ...player.resources, wood: 0, clay: 0, reed: 0, stone: 0, food: 20, grain: 0,
      vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    }
  })
  const owner = state.players[0]!
  owner.minorHand = played ? [FILLER] : [cardId]
  owner.minorPlayed = played ? [cardId] : []
  owner.occupationPlayed = OCCUPATIONS.slice(0, occupations)
  Object.assign(owner.resources, resources)
  session.loadState(state)
  return session
}

const options = (response: SessionResponse) => response.interaction.stateId === 'wait'
  ? response.interaction.request.options ?? []
  : []

const enterMinor = (session: GameSession, cardId: string) => {
  let response = session.takeAction(0, 'meeting-place')
  if (response.interaction.stateId === 'wait'
    && !options(response).some((option) => option.value === cardId)) {
    const branch = options(response).find((option) => option.value.startsWith('action-improvement-'))
    if (branch) response = session.resolveChoice(response.interaction.playerIndex, branch.value)
  }
  return response
}

const playMinor = (session: GameSession, cardId: string) => {
  let response = enterMinor(session, cardId)
  if (response.interaction.stateId === 'wait') {
    const card = options(response).find((option) => option.value === cardId)
    if (card) response = session.resolveChoice(response.interaction.playerIndex, card.value)
  }
  return response
}

const bonusScore = (response: SessionResponse, cardId: string, playerIndex = 0) =>
  response.scores[playerIndex]!.categories
    .find((category) => category.key === 'cardBonusVp')?.entries
    .find((entry) => entry.type === 'bonus' && entry.cardId === cardId)?.score ?? 0

describe('A032 Manger parity', () => {
  const CARD_ID = 'A032_Manger'

  it('A032 S1: paying two wood plays Manger', () => {
    const response = playMinor(setupMinor({ cardId: CARD_ID, resources: { wood: 2 } }), CARD_ID)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.wood).toBe(0)
  })

  it('A032 S2: Manger scores zero, one, two, three, and four points at the printed pasture-area thresholds', () => {
    for (const [size, expected] of [[5, 0], [6, 1], [7, 2], [8, 3], [10, 4]]) {
      const session = setupMinor({ cardId: CARD_ID, played: true })
      const state = session.getState().state
      state.players[0]!.pastures = [{
        id: `manger-${size}`, size, stables: 0, animalType: null, animalCount: 0,
        tiles: Array.from({ length: size }, (_, index) => ({ row: Math.floor(index / 5), col: index % 5 })),
      }]
      session.loadState(state)
      expect(bonusScore(session.getState(), CARD_ID), `size=${size}`).toBe(expected)
    }
  })
})

describe('A035 Swimming Class parity', () => {
  const CARD_ID = 'A035_SwimmingClass'

  it('A035 S1: two occupations and one food allow Swimming Class to be played', () => {
    const response = playMinor(setupMinor({
      cardId: CARD_ID, resources: { food: 21 }, occupations: 2,
    }), CARD_ID)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.food).toBe(20)
  })

  const finish = (fishing: boolean, newborns: number) => {
    const session = setupMinor({ cardId: CARD_ID, played: true, round: 5 })
    const state = session.getState().state
    const owner = state.players[0]!
    setActiveWorkerCount(owner, 2 + newborns)
    owner.workers.slice(2, 2 + newborns).forEach((worker) => { worker.isNewborn = true })
    state.actionSpaces.find((space) => space.id === (fishing ? 'fishing' : 'forest'))!.takenBy = [
      { playerId: owner.id, workerId: '1' },
    ]
    state.actionSpaces.find((space) => space.id === 'day-laborer')!.takenBy = [
      { playerId: owner.id, workerId: '2' },
    ]
    for (let index = 0; index < newborns; index++) {
      state.actionSpaces.find((space) => space.id === 'wish-children')!.takenBy.push({
        playerId: owner.id, workerId: String(3 + index),
      })
    }
    state.players.slice(1).forEach((player) => markAllWorkersUsed(state, player))
    session.loadState(state)
    return session.performRoundEnd()
  }

  it('A035 S2: returning a Fishing person with one newborn gains two bonus points', () => {
    const response = finish(true, 1)
    expect(response.state.players[0]!.cardStates[CARD_ID]?.counters?.bonusVp).toBe(2)
  })

  it('A035 S3: without a Fishing person or newborn Swimming Class grants no points', () => {
    expect(finish(false, 1).state.players[0]!.cardStates[CARD_ID]?.counters?.bonusVp ?? 0).toBe(0)
    expect(finish(true, 0).state.players[0]!.cardStates[CARD_ID]?.counters?.bonusVp ?? 0).toBe(0)
  })
})

describe('A036 Facades Carving parity', () => {
  const CARD_ID = 'A036_FacadesCarving'

  const setup = (wood = 8) => setupMinor({
    cardId: CARD_ID, round: 8, resources: { wood, clay: 2, food: 2 },
  })

  it('A036 S1: round eight requires eight wood and two clay, then may exchange two food for two points', () => {
    const session = setup()
    let response = playMinor(session, CARD_ID)
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') return
    const exchange = options(response).find((option) =>
      option.effectPreview?.resourcesPaid?.food === 2)
    expect(exchange, JSON.stringify(response.interaction)).toBeDefined()
    response = session.resolveChoice(response.interaction.playerIndex, exchange!.value)

    expect(response.state.players[0]!.resources).toMatchObject({ wood: 8, clay: 0, food: 0 })
    expect(response.state.players[0]!.cardStates[CARD_ID]?.counters?.bonusVp).toBe(2)
  })

  it('A036 S2: the Facades Carving food exchange may be declined', () => {
    const session = setup()
    let response = playMinor(session, CARD_ID)
    response = session.resolveChoice(response.interaction.playerIndex, '__skip__')
    expect(response.state.players[0]!.resources.food).toBe(2)
    expect(response.state.players[0]!.cardStates[CARD_ID]?.counters?.bonusVp ?? 0).toBe(0)
  })

  it('A036 S3: wood below the current round keeps Facades Carving unavailable', () => {
    const response = enterMinor(setup(7), CARD_ID)
    expect(options(response).some((option) => option.value === CARD_ID)).toBe(false)
    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
  })
})

describe('A038 Wool Blankets parity', () => {
  const CARD_ID = 'A038_WoolBlankets'
  const setup = ({ played = false, sheep = 5, houseType = 'wood' as 'wood' | 'clay' | 'stone' } = {}) => {
    const session = setupMinor({ cardId: CARD_ID, played })
    const state = session.getState().state
    const owner = state.players[0]!
    owner.houseType = houseType
    owner.pastures = [{
      id: 'wool', size: 2, tiles: [{ row: 0, col: 2 }, { row: 0, col: 3 }], stables: 1,
      animalType: sheep ? 'sheep' : null, animalCount: sheep,
    }]
    session.loadState(state)
    return session
  }

  it('A038 S1: five sheep on the farm allow Wool Blankets to be played', () => {
    expect(playMinor(setup(), CARD_ID).state.players[0]!.minorPlayed).toContain(CARD_ID)
  })

  it('A038 S2: fewer than five sheep keep Wool Blankets unavailable', () => {
    const response = enterMinor(setup({ sheep: 4 }), CARD_ID)
    expect(options(response).some((option) => option.value === CARD_ID)).toBe(false)
  })

  it('A038 S3: wooden, clay, and stone houses score three, two, and zero Wool Blankets points', () => {
    for (const [houseType, expected] of [['wood', 3], ['clay', 2], ['stone', 0]] as const) {
      expect(bonusScore(setup({ played: true, houseType }).getState(), CARD_ID), houseType).toBe(expected)
    }
  })
})

describe('A039 Chapel parity', () => {
  const CARD_ID = 'A039_Chapel'
  const setup = ({ played = false, actor = 0, grain = 0 } = {}) => {
    const session = setupMinor({
      cardId: CARD_ID, played, occupations: 2, resources: played ? {} : { wood: 3, clay: 2 },
    })
    const state = session.getState().state
    state.currentPlayerIndex = actor
    state.players[actor]!.resources.grain = grain
    if (played) {
      state.actionSpaces.push(...createPlayerActionSpaces(state).filter((space) =>
        !state.actionSpaces.some((existing) => existing.id === space.id)))
    }
    session.loadState(state)
    return session
  }

  it('A039 S1: two occupations, three wood, and two clay play Chapel as a public action space', () => {
    const response = playMinor(setup(), CARD_ID)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.actionSpaces.some((space) => space.id === CARD_ID)).toBe(true)
  })

  it('A039 S2: the Chapel owner uses it for three bonus points without paying grain', () => {
    const response = setup({ played: true }).takeAction(0, CARD_ID)
    expect(response.ok, response.error).toBe(true)
    expect(bonusScore(response, CARD_ID)).toBe(3)
    expect(response.state.players[0]!.resources.grain).toBe(0)
  })

  it('A039 S3: a guest pays one grain to the owner and gains three bonus points', () => {
    const response = setup({ played: true, actor: 1, grain: 1 }).takeAction(1, CARD_ID)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[1]!.resources.grain).toBe(0)
    expect(response.state.players[0]!.resources.grain).toBe(1)
    expect(bonusScore(response, CARD_ID, 1)).toBe(3)
  })

  it('A039 S4: a guest without grain is rejected at the authoritative action entry', () => {
    const session = setup({ played: true, actor: 1 })
    const before = session.getState().state
    expect(session.getActionAvailability(1)[CARD_ID]).toBe(false)
    const response = session.takeAction(1, CARD_ID)
    expect(response.ok).toBe(false)
    expect(response.state).toEqual(before)
    expect(bonusScore(response, CARD_ID, 1)).toBe(0)
  })
})
