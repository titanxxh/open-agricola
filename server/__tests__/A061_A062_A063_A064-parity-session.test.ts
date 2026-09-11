import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { markAllWorkersUsed, setActiveWorkerCount, setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { autoAdvanceRoundEnd } from '../../tests/llm-card-gen/session-helpers'
import { readCardResourceStats } from '../../shared/cards/helpers/card-state'

import '../../shared/cards/A/A061_WinnowingFan'
import '../../shared/cards/A/A062_BeerKeg'
import '../../shared/cards/A/A063_DutchWindmill'
import '../../shared/cards/A/A064_BarleyMill'

const FILLER = '__test_placeholder__'
const FIREPLACE = 'Major_Fireplace1'

const options = (response: SessionResponse) => response.interaction.stateId === 'wait'
  ? response.interaction.request.options ?? []
  : []

const baseSession = ({
  cardId, played = false, round = 5, resources = {}, fireplace = false, fields = [],
}: {
  cardId: string
  played?: boolean
  round?: number
  resources?: Record<string, number>
  fireplace?: boolean
  fields?: Array<{ crop: 'grain' | 'vegetable'; remaining: number }>
}) => {
  const session = new GameSession(7061 + round, undefined, { playerCount: 2 })
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
    player.improvements = []
    player.cardStates = {}
    player.fields = []
    player.resources = {
      ...player.resources, wood: 0, clay: 0, reed: 0, stone: 0, food: 20, grain: 0,
      vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    }
  })
  const owner = state.players[0]!
  owner.minorHand = played ? [FILLER] : [cardId]
  owner.minorPlayed = played ? [cardId] : []
  owner.improvements = fireplace ? [FIREPLACE] : []
  owner.fields = fields.map((field, index) => ({
    row: 0, col: index, stacks: [{ kind: field.crop, remaining: field.remaining }],
  }))
  Object.assign(owner.resources, resources)
  session.loadState(state)
  return session
}

const playMinor = (session: GameSession, cardId: string) => {
  let response = session.takeAction(0, 'meeting-place')
  for (let guard = 0; guard < 8 && response.state.players[0]!.minorHand.includes(cardId); guard += 1) {
    if (response.interaction.stateId !== 'wait') break
    const card = options(response).find((option) => option.value === cardId)
    const branch = options(response).find((option) => option.value.startsWith('action-improvement-'))
    const next = card ?? branch
    if (!next) break
    response = session.resolveChoice(response.interaction.playerIndex, next.value)
    if (response.interaction.stateId === 'wait' && response.interaction.promptKey === 'prompt.selectPayment') {
      const payment = options(response).find((option) => option.value !== 'cancel')
      expect(payment).toBeDefined()
      response = session.resolveChoice(response.interaction.playerIndex, payment!.value)
    }
  }
  return response
}

const prepareHarvest = (session: GameSession) => {
  const state = session.getState().state
  state.players.forEach((player) => {
    setActiveWorkerCount(player, 2)
    markAllWorkersUsed(state, player)
    player.resources.food = Math.max(player.resources.food, 20)
  })
  session.loadState(state)
}

const finishHarvest = (session: GameSession, choose: (interaction: Extract<SessionResponse['interaction'], { stateId: 'wait' }>) => string | undefined) => {
  autoAdvanceRoundEnd(session, {
    onChoice: (interaction, current) => {
      if (interaction.request.kind !== 'choice') return undefined
      const value = choose(interaction)
      return value === undefined ? undefined : current.resolveChoice(interaction.playerIndex, value)
    },
  })
  return session.getState()
}

describe('A061 Winnowing Fan parity', () => {
  const CARD_ID = 'A061_WinnowingFan'

  it('A061 S1: a baking improvement and one reed allow Winnowing Fan to be played', () => {
    const response = playMinor(baseSession({
      cardId: CARD_ID, resources: { reed: 1 }, fireplace: true,
    }), CARD_ID)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.reed).toBe(0)
  })

  it('A061 S2: Winnowing Fan is unavailable without a baking improvement', () => {
    const response = playMinor(baseSession({ cardId: CARD_ID, resources: { reed: 1 } }), CARD_ID)
    expect(response.state.players[0]!.minorPlayed).not.toContain(CARD_ID)
    expect(response.state.players[0]!.resources.reed).toBe(1)
  })

  it('A061 S3: after the harvest field phase Winnowing Fan turns exactly one grain into fireplace food', () => {
    const session = baseSession({
      cardId: CARD_ID, played: true, round: 4, resources: { grain: 2 },
      fireplace: true, fields: [{ crop: 'grain', remaining: 1 }],
    })
    prepareHarvest(session)
    const response = finishHarvest(session, (interaction) => {
      if (interaction.sourceCard !== CARD_ID) return undefined
      return interaction.request.options?.find((option) => option.value !== '__skip__')?.value
    })
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 2, food: 18 })
  })

  it('A061 S4: the Winnowing Fan bake may be declined and does not count as Bake Bread', () => {
    const session = baseSession({
      cardId: CARD_ID, played: true, round: 4, resources: { grain: 1 },
      fireplace: true, fields: [{ crop: 'grain', remaining: 1 }],
    })
    const state = session.getState().state
    state.players[0]!.minorPlayed.push('A063_DutchWindmill')
    session.loadState(state)
    prepareHarvest(session)
    const response = finishHarvest(session, (interaction) => {
      if (interaction.sourceCard !== CARD_ID) return undefined
      return '__skip__'
    })
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 2, food: 16 })
  })
})

describe('A062 Beer Keg parity', () => {
  const CARD_ID = 'A062_BeerKeg'

  it('A062 S1: two grain and one wood allow Beer Keg to be played', () => {
    const response = playMinor(baseSession({
      cardId: CARD_ID, resources: { grain: 2, wood: 1 },
    }), CARD_ID)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.wood).toBe(0)
  })

  it('A062 S2: Beer Keg is unavailable with fewer than two grain', () => {
    const response = playMinor(baseSession({
      cardId: CARD_ID, resources: { grain: 1, wood: 1 },
    }), CARD_ID)
    expect(response.state.players[0]!.minorPlayed).not.toContain(CARD_ID)
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 1, wood: 1 })
  })

  for (const { scenario, grain, points } of [
    { scenario: 'S3', grain: 1, points: 0 },
    { scenario: 'S4', grain: 2, points: 1 },
    { scenario: 'S5', grain: 3, points: 2 },
  ]) {
    it(`A062 ${scenario}: during feeding ${grain} grain become exactly three food and ${points} points`, () => {
      const session = baseSession({ cardId: CARD_ID, played: true, round: 4, resources: { grain } })
      prepareHarvest(session)
      const response = finishHarvest(session, (interaction) => {
        if (interaction.sourceCard !== CARD_ID) return undefined
        return interaction.request.options?.find((option) =>
          option.effectPreview?.resourcesPaid?.grain === grain)?.value
      })
      expect(response.state.players[0]!.resources).toMatchObject({ grain: 0, food: 19 })
      expect(response.state.players[0]!.cardStates[CARD_ID]?.counters?.bonusVp ?? 0).toBe(points)
    })
  }

  it('A062 S6: the Beer Keg exchange may be declined', () => {
    const session = baseSession({ cardId: CARD_ID, played: true, round: 4, resources: { grain: 3 } })
    prepareHarvest(session)
    const response = finishHarvest(session, (interaction) => interaction.sourceCard === CARD_ID ? '__skip__' : undefined)
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 3, food: 16 })
  })
})

const bakeSession = ({ round, grain = 1, winnowingFan = false }: { round: number; grain?: number; winnowingFan?: boolean }) => {
  const session = baseSession({
    cardId: 'A063_DutchWindmill', played: true, round, resources: { grain, food: 0 }, fireplace: true,
  })
  const state = session.getState().state
  state.roundActionOrder = state.roundActionOrder.map(() => null)
  state.roundActionOrder[0] = 'grain-utilization'
  state.actionSpaces.find((space) => space.id === 'grain-utilization')!.roundAvailable = 1
  if (winnowingFan) state.players[0]!.minorPlayed.push('A061_WinnowingFan')
  session.loadState(state)
  return session
}

const bakeGrain = (session: GameSession, grain: number) => {
  let response = session.takeAction(0, 'grain-utilization')
  for (let guard = 0; guard < 8 && response.state.players[0]!.resources.grain > 0; guard += 1) {
    if (response.interaction.stateId !== 'wait') break
    const fireplace = options(response).find((option) =>
      option.value === FIREPLACE || option.sourceCard === FIREPLACE)
    const count = options(response).find((option) => option.value === `count-${FIREPLACE}-${grain}`)
    const bake = options(response).find((option) => option.value === 'bake-bread' || option.labelKey === 'actions.bakeBread.name')
    const next = count ?? fireplace ?? bake
    if (!next) break
    response = session.resolveChoice(response.interaction.playerIndex, next.value)
  }
  return response
}

describe('A063 Dutch Windmill parity', () => {
  const CARD_ID = 'A063_DutchWindmill'

  it('A063 S1: paying two wood and two stone plays Dutch Windmill for two points', () => {
    const response = playMinor(baseSession({
      cardId: CARD_ID, resources: { wood: 2, stone: 2 },
    }), CARD_ID)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.scores[0]!.categories.find((category) => category.key === 'cards')?.entries)
      .toContainEqual(expect.objectContaining({ cardId: CARD_ID, score: 2 }))
  })

  it('A063 S2: Bake Bread in a post-harvest round gains three additional food once', () => {
    const response = bakeGrain(bakeSession({ round: 5, grain: 2 }), 2)
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 0, food: 7 })
  })

  it('A063 S3: Bake Bread outside a post-harvest round gains no Dutch Windmill food', () => {
    const response = bakeGrain(bakeSession({ round: 6 }), 1)
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 0, food: 2 })
  })

  it('A063 S4: Winnowing Fan is not a Bake Bread action and gains no Dutch Windmill food', () => {
    const session = bakeSession({ round: 4, winnowingFan: true })
    prepareHarvest(session)
    const response = finishHarvest(session, (interaction) => {
      if (interaction.sourceCard !== 'A061_WinnowingFan') return undefined
      return interaction.request.options?.find((option) => option.value !== '__skip__')?.value
    })
    expect(response.state.players[0]!.resources.food).toBe(18)
    expect(readCardResourceStats(response.state.players[0]!, CARD_ID)?.gained.food ?? 0).toBe(0)
  })
})

describe('A064 Barley Mill parity', () => {
  const CARD_ID = 'A064_BarleyMill'

  it('A064 S1: each Barley Mill cost includes the shared one-wood fee', () => {
    for (const resources of [{ wood: 1, clay: 4 }, { wood: 1, stone: 2 }]) {
      const response = playMinor(baseSession({ cardId: CARD_ID, resources }), CARD_ID)
      expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
      expect(response.state.players[0]!.resources.wood).toBe(0)
      expect(response.state.players[0]!.resources[resources.clay ? 'clay' : 'stone']).toBe(0)
    }
  })

  it('A064 S2: Barley Mill is unavailable without the printed one-wood fee', () => {
    const response = playMinor(baseSession({ cardId: CARD_ID, resources: { clay: 4 } }), CARD_ID)
    expect(response.state.players[0]!.minorPlayed).not.toContain(CARD_ID)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, clay: 4 })
  })

  it('A064 S3: harvest gains one Barley Mill food per harvested grain field', () => {
    const session = baseSession({
      cardId: CARD_ID, played: true, round: 4, fields: [
        { crop: 'grain', remaining: 2 }, { crop: 'grain', remaining: 1 },
      ],
    })
    prepareHarvest(session)
    const response = finishHarvest(session, () => undefined)
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 2, food: 18 })
  })

  it('A064 S4: vegetable fields or no harvested grain field grant no Barley Mill food', () => {
    const session = baseSession({
      cardId: CARD_ID, played: true, round: 4, fields: [{ crop: 'vegetable', remaining: 1 }],
    })
    prepareHarvest(session)
    const response = finishHarvest(session, () => undefined)
    expect(response.state.players[0]!.resources.food).toBe(16)
  })
})
