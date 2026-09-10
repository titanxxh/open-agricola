import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { markAllWorkersUsed, setWorkersAtHome } from '../../shared/domain/player'
import { getRoundPersonPlacementDetails } from '../../shared/cards/helpers/round-placement'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { resolveTriggerIfPresent } from './_helpers/trigger-select'
import { autoAdvanceRoundEnd } from '../../tests/llm-card-gen/session-helpers'

import '../../shared/cards/D/D038_MilkingStool'
import '../../shared/cards/D/D039_TruffleSlicer'
import '../../shared/cards/D/D053_TeaHouse'
import '../../shared/cards/D/D055_NewMarket'
import '../../shared/cards/D/D058_Gritter'
import '../../shared/cards/D/D061_BaleofStraw'
import '../../shared/cards/D/D063_Lynchet'
import '../../shared/cards/D/D064_BakingCourse'
import '../../shared/cards/D/D067_ReapHook'
import '../../shared/cards/D/D068_SmallBasket'
import '../../shared/cards/D/D073_SupplyBoat'

const FILLER = '__test_placeholder__'
const OCCUPATIONS = ['A125_Priest', 'B121_Geologist', 'C123_Freemason']
const options = (response: SessionResponse) => response.interaction.stateId === 'wait'
  ? response.interaction.request.options ?? []
  : []

const setup = ({
  cardId, played = true, playerCount = 2, round = 5, occupations = 0, resources = {},
}: {
  cardId: string
  played?: boolean
  playerCount?: number
  round?: number
  occupations?: number
  resources?: Record<string, number>
}) => {
  const session = new GameSession(8300 + round, undefined, { playerCount })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = round
  state.roundPhase = 'work'
  state.actionSpaces.forEach((space) => { space.takenBy = [] })
  state.players.forEach((player, index) => {
    setWorkersAtHome(state, player, index === 0 ? 2 : 0)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.improvements = []
    player.cardStates = {}
    player.fields = []
    player.pastures = []
    player.stableTiles = []
    player.fenceSegments = []
    player.houseAnimalType = null
    player.houseAnimalCount = 0
    player.stableAnimals = {}
    player.resources = {
      ...player.resources,
      wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0,
      sheep: 0, boar: 0, cattle: 0, begging: 0,
    }
  })
  const player = state.players[0]!
  player.minorHand = played ? [FILLER] : [cardId]
  player.minorPlayed = played ? [cardId] : []
  player.occupationPlayed = OCCUPATIONS.slice(0, occupations)
  Object.assign(player.resources, resources)
  session.loadState(state)
  return session
}

const choose = (
  session: GameSession,
  response: SessionResponse,
  predicate: (option: ReturnType<typeof options>[number]) => boolean,
) => {
  expect(response.interaction.stateId, JSON.stringify(response.interaction)).toBe('wait')
  if (response.interaction.stateId !== 'wait') return response
  const option = options(response).find(predicate)
  expect(option, JSON.stringify(response.interaction)).toBeDefined()
  return session.resolveChoice(response.interaction.playerIndex, option!.value)
}

const accept = (session: GameSession, response: SessionResponse, cardId: string) => {
  response = resolveTriggerIfPresent(session, response, cardId)
  if (response.interaction.stateId !== 'wait') return response
  return choose(session, response, (option) => option.value !== '__skip__')
}

const decline = (session: GameSession, response: SessionResponse, cardId: string) => {
  response = resolveTriggerIfPresent(session, response, cardId)
  if (response.interaction.stateId === 'wait'
    && options(response).some((option) => option.value === '__skip__')) {
    return session.resolveChoice(response.interaction.playerIndex, '__skip__')
  }
  return response
}

const playMinor = (session: GameSession, cardId: string) => {
  let response = session.takeAction(0, 'meeting-place')
  if (response.interaction.stateId === 'wait') {
    const branch = options(response).find((option) => option.value.startsWith('action-improvement-'))
    if (branch) response = session.resolveChoice(response.interaction.playerIndex, branch.value)
  }
  if (response.state.players[0]!.minorHand.includes(cardId)
    && response.interaction.stateId === 'wait') {
    const card = options(response).find((option) =>
      option.value === cardId || option.value === `minor:${cardId}`)
    if (card) response = session.resolveChoice(response.interaction.playerIndex, card.value)
  }
  return response
}

const endRound = (session: GameSession) => {
  session.state.players.forEach((player) => {
    player.resources.food = Math.max(player.resources.food, 20)
    markAllWorkersUsed(session.state, player)
  })
  session.loadState(session.state)
  return session.performRoundEnd()
}

const bonus = (response: SessionResponse, cardId: string) =>
  response.scores[0]!.categories.find((category) => category.key === 'cardBonusVp')?.entries
    .find((entry) => entry.type === 'bonus' && entry.cardId === cardId)?.score ?? 0

const futureRounds = (response: SessionResponse, cardId: string, resource: string) =>
  response.state.futureMeeples
    .filter((entry) => entry.cardId === cardId && (entry.resources[resource] ?? 0) > 0)
    .map((entry) => entry.round)

describe('D038 Milking Stool parity', () => {
  it('D038 S1: two occupations and one wood play Milking Stool', () => {
    const response = playMinor(setup({
      cardId: 'D038_MilkingStool', played: false, occupations: 2, resources: { wood: 1 },
    }), 'D038_MilkingStool')
    expect(response.state.players[0]!.minorPlayed).toContain('D038_MilkingStool')
  })

  it.each([{ cattle: 1, food: 17 }, { cattle: 3, food: 18 }, { cattle: 5, food: 19 }])(
    'D038 harvest with $cattle cattle leaves $food food after feeding',
    ({ cattle, food }) => {
      const session = setup({ cardId: 'D038_MilkingStool', round: 4, resources: { cattle } })
      session.state.players[0]!.pastures = [{
        id: 'cattle-pasture',
        size: 3,
        tiles: [{ row: 2, col: 0 }, { row: 2, col: 1 }, { row: 2, col: 2 }],
        stables: 0,
        animalType: 'cattle',
        animalCount: cattle,
      }]
      session.state.players.forEach((player) => {
        player.resources.food = Math.max(player.resources.food, 20)
        markAllWorkersUsed(session.state, player)
      })
      session.loadState(session.state)
      const response = autoAdvanceRoundEnd(session, {
        onChoice: (interaction, current) => {
          const option = interaction.request.options?.find((entry) =>
            entry.value === 'D038_MilkingStool' || entry.sourceCard === 'D038_MilkingStool')
          return option
            ? current.resolveChoice(interaction.playerIndex, option.value)
            : undefined
        },
      })
      expect(response.state.players[0]!.resources.food).toBe(food)
    },
  )

  it('D038 S5: five cattle score two Milking Stool points', () => {
    expect(bonus(setup({
      cardId: 'D038_MilkingStool', round: 14, resources: { cattle: 5 },
    }).getState(), 'D038_MilkingStool')).toBe(2)
  })
})

describe('D039 Truffle Slicer parity', () => {
  it('D039 S1: round eight and one wood play Truffle Slicer', () => {
    const response = playMinor(setup({
      cardId: 'D039_TruffleSlicer', played: false, round: 8, resources: { wood: 1 },
    }), 'D039_TruffleSlicer')
    expect(response.state.players[0]!.minorPlayed).toContain('D039_TruffleSlicer')
  })

  it('D039 S2: before round eight Truffle Slicer is unavailable', () => {
    const response = playMinor(setup({
      cardId: 'D039_TruffleSlicer', played: false, round: 7, resources: { wood: 1 },
    }), 'D039_TruffleSlicer')
    expect(response.state.players[0]!.minorPlayed).not.toContain('D039_TruffleSlicer')
  })

  it('D039 S3: wood collection with a boar may buy one point for one food', () => {
    const session = setup({ cardId: 'D039_TruffleSlicer', round: 8, resources: { food: 1, boar: 1 } })
    session.state.actionSpaces.find((space) => space.id === 'forest')!.resources.wood = 3
    session.loadState(session.state)
    const response = accept(session, session.takeAction(0, 'forest'), 'D039_TruffleSlicer')
    expect(response.state.players[0]!.resources.food).toBe(0)
    expect(response.state.players[0]!.cardStates.D039_TruffleSlicer?.counters?.bonusVp).toBe(1)
  })

  it('D039 S4: without a boar wood collection gives no Truffle Slicer offer', () => {
    const session = setup({ cardId: 'D039_TruffleSlicer', round: 8, resources: { food: 1 } })
    session.state.actionSpaces.find((space) => space.id === 'forest')!.resources.wood = 3
    session.loadState(session.state)
    const response = session.takeAction(0, 'forest')
    expect(JSON.stringify(response.interaction)).not.toContain('D039_TruffleSlicer')
  })
})

describe('D053 Tea House parity', () => {
  it('D053 S1: round six printed resources play Tea House', () => {
    const response = playMinor(setup({
      cardId: 'D053_TeaHouse', played: false, round: 6, resources: { wood: 1, stone: 1 },
    }), 'D053_TeaHouse')
    expect(response.state.players[0]!.minorPlayed).toContain('D053_TeaHouse')
  })

  it('D053 S2: before round six Tea House is unavailable', () => {
    const response = playMinor(setup({
      cardId: 'D053_TeaHouse', played: false, round: 5, resources: { wood: 1, stone: 1 },
    }), 'D053_TeaHouse')
    expect(response.state.players[0]!.minorPlayed).not.toContain('D053_TeaHouse')
  })

  it('D053 S3: after the first placement Tea House may skip the second turn for one food', () => {
    const session = setup({ cardId: 'D053_TeaHouse', round: 6 })
    let response = session.takeAction(0, 'day-laborer')
    expect(getRoundPersonPlacementDetails(response.state.players[0]!)).toHaveLength(1)
    expect(response.interaction.anytimeActions.map((action) => action.id)).toContain('D53-tea-house-anytime')
    response = session.takeAnytimeAction(0, 'D53-tea-house-anytime')
    expect(response.state.players[0]!.resources.food).toBe(3)
    expect(response.state.players[0]!.cardStates.D053_TeaHouse?.flagged).toBe(true)
    expect(getRoundPersonPlacementDetails(response.state.players[0]!)).toHaveLength(1)
  })
})

describe('D055 New Market parity', () => {
  it('D055 S1: printed resources play New Market', () => {
    const response = playMinor(setup({
      cardId: 'D055_NewMarket', played: false, resources: { wood: 1, clay: 1 },
    }), 'D055_NewMarket')
    expect(response.state.players[0]!.minorPlayed).toContain('D055_NewMarket')
  })

  it('D055 S2: a round-nine action space gains one additional food', () => {
    const session = setup({ cardId: 'D055_NewMarket', round: 9 })
    session.state.roundActionOrder[8] = 'cultivation'
    session.state.actionSpaces.find((space) => space.id === 'cultivation')!.roundAvailable = 9
    session.loadState(session.state)
    let response = session.takeAction(0, 'cultivation')
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId === 'wait'
      && response.interaction.request.kind === 'farm-select') {
      response = session.commitSelectionChoice(0, {
        tile: response.interaction.request.farm.selectableTiles[0]!,
      })
    }
    expect(response.state.players[0]!.resources.food).toBe(1)
  })

  it('D055 S3: a basic action space gains no New Market food', () => {
    const response = setup({ cardId: 'D055_NewMarket' }).takeAction(0, 'day-laborer')
    expect(response.state.players[0]!.resources.food).toBe(2)
  })
})

describe('D058 Gritter parity', () => {
  it('D058 S1: round five and one wood play Gritter', () => {
    const response = playMinor(setup({
      cardId: 'D058_Gritter', played: false, round: 5, resources: { wood: 1 },
    }), 'D058_Gritter')
    expect(response.state.players[0]!.minorPlayed).toContain('D058_Gritter')
  })

  const sow = (crop: 'grain' | 'vegetable') => {
    const session = setup({ cardId: 'D058_Gritter', round: 10, resources: { [crop]: 1 } })
    session.state.roundActionOrder[0] = 'grain-utilization'
    session.state.actionSpaces.find((space) => space.id === 'grain-utilization')!.roundAvailable = 1
    session.state.players[0]!.fields = [
      { row: 0, col: 2, stacks: [] },
      { row: 1, col: 2, stacks: [{ kind: 'vegetable', remaining: 1 }] },
    ]
    session.loadState(session.state)
    let response = session.takeAction(0, 'grain-utilization')
    if (response.interaction.stateId === 'wait'
      && response.interaction.request.kind !== 'farm-select') {
      response = choose(session, response, (option) =>
        option.value === 'sow' || option.labelKey === 'actions.sow.name')
    }
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') return response
    return session.commitSelectionChoice(0, { crops: [{ row: 0, col: 2, crop }] })
  }

  it('D058 S2: sowing a vegetable gains one food per vegetable field', () => {
    expect(sow('vegetable').state.players[0]!.resources.food).toBe(2)
  })

  it('D058 S3: sowing only grain grants no Gritter food', () => {
    expect(sow('grain').state.players[0]!.resources.food).toBe(0)
  })
})

describe('D061 Bale of Straw parity', () => {
  it('D061 S1: Bale of Straw plays for free', () => {
    const response = playMinor(setup({ cardId: 'D061_BaleofStraw', played: false }), 'D061_BaleofStraw')
    expect(response.state.players[0]!.minorPlayed).toContain('D061_BaleofStraw')
  })

  it.each([{ fields: 3, food: 18 }, { fields: 2, food: 16 }])(
    'D061 with $fields grain fields leaves $food food after harvest feeding',
    ({ fields, food }) => {
      const session = setup({ cardId: 'D061_BaleofStraw', round: 4 })
      session.state.players[0]!.fields = Array.from({ length: fields }, (_, index) => ({
        row: 1, col: index, stacks: [{ kind: 'grain' as const, remaining: 1 }],
      }))
      session.loadState(session.state)
      expect(endRound(session).state.players[0]!.resources.food).toBe(food)
    },
  )
})

describe('D063 Lynchet parity', () => {
  it('D063 S1: Lynchet plays for free', () => {
    const response = playMinor(setup({ cardId: 'D063_Lynchet', played: false }), 'D063_Lynchet')
    expect(response.state.players[0]!.minorPlayed).toContain('D063_Lynchet')
  })

  it('D063 S2: each harvested field adjacent to the house gives one food', () => {
    const session = setup({ cardId: 'D063_Lynchet', round: 4 })
    session.state.players[0]!.roomTiles = [{ row: 0, col: 0 }, { row: 0, col: 1 }]
    session.state.players[0]!.fields = [
      { row: 1, col: 0, stacks: [{ kind: 'grain', remaining: 1 }] },
      { row: 2, col: 2, stacks: [{ kind: 'grain', remaining: 1 }] },
    ]
    session.loadState(session.state)
    expect(endRound(session).state.players[0]!.resources.food).toBe(17)
  })
})

describe('D064 Baking Course parity', () => {
  it('D064 S1: one occupation allows Baking Course to be played', () => {
    const response = playMinor(setup({
      cardId: 'D064_BakingCourse', played: false, occupations: 1, resources: {},
    }), 'D064_BakingCourse')
    expect(response.state.players[0]!.minorPlayed).toContain('D064_BakingCourse')
  })

  it('D064 S2: non-harvest round end may bake one grain for two food', () => {
    const session = setup({
      cardId: 'D064_BakingCourse', occupations: 1, round: 5, resources: { grain: 1 },
    })
    let response = endRound(session)
    for (let guard = 0; guard < 8 && response.interaction.stateId === 'wait'; guard += 1) {
      const option = options(response).find((entry) =>
        entry.value !== '__skip__' && (entry.sourceCard === 'D064_BakingCourse'
          || entry.value === 'D064_BakingCourse' || entry.value === 'bake-bread'))
      if (!option) break
      response = session.resolveChoice(response.interaction.playerIndex, option.value)
    }
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 0, food: 22 })
  })

  it('D064 S3: harvest round end gives no Baking Course bake', () => {
    const session = setup({
      cardId: 'D064_BakingCourse', occupations: 1, round: 4, resources: { grain: 1 },
    })
    const response = endRound(session)
    expect(JSON.stringify(response.interaction)).not.toContain('D064_BakingCourse')
    expect(response.state.players[0]!.resources.grain).toBe(1)
  })
})

describe('D067 Reap Hook parity', () => {
  it.each([{ round: 5, future: [7, 9, 11] }, { round: 12, future: [13, 14] }])(
    'D067 played in round $round schedules harvest rounds $future',
    ({ round, future }) => {
      const response = playMinor(setup({
        cardId: 'D067_ReapHook', played: false, round, resources: { wood: 1 },
      }), 'D067_ReapHook')
      expect(futureRounds(response, 'D067_ReapHook', 'grain')).toEqual(future)
    },
  )
})

describe('D068 Small Basket parity', () => {
  it('D068 S1: two occupations play Small Basket for free', () => {
    const response = playMinor(setup({
      cardId: 'D068_SmallBasket', played: false, occupations: 2,
    }), 'D068_SmallBasket')
    expect(response.state.players[0]!.minorPlayed).toContain('D068_SmallBasket')
  })

  it.each([{ players: 2, returned: 0 }, { players: 4, returned: 1 }])(
    'D068 Reed Bank exchange in $players players gains a vegetable',
    ({ players, returned }) => {
      const session = setup({ cardId: 'D068_SmallBasket', occupations: 2, playerCount: players })
      session.state.actionSpaces.find((space) => space.id === 'reed-bank')!.resources.reed = 2
      session.loadState(session.state)
      const response = accept(session, session.takeAction(0, 'reed-bank'), 'D068_SmallBasket')
      expect(response.state.players[0]!.resources).toMatchObject({ reed: 1, vegetable: 1 })
      expect(response.state.actionSpaces.find((space) => space.id === 'reed-bank')!.resources.reed)
        .toBe(returned)
    },
  )

  it('D068 S4: the Small Basket exchange may be declined', () => {
    const session = setup({ cardId: 'D068_SmallBasket', occupations: 2, playerCount: 4 })
    session.state.actionSpaces.find((space) => space.id === 'reed-bank')!.resources.reed = 2
    session.loadState(session.state)
    const response = decline(session, session.takeAction(0, 'reed-bank'), 'D068_SmallBasket')
    expect(response.state.players[0]!.resources).toMatchObject({ reed: 2, vegetable: 0 })
  })
})

describe('D073 Supply Boat parity', () => {
  it('D073 S1: one occupation and one wood play Supply Boat', () => {
    const response = playMinor(setup({
      cardId: 'D073_SupplyBoat', played: false, occupations: 1, resources: { wood: 1 },
    }), 'D073_SupplyBoat')
    expect(response.state.players[0]!.minorPlayed).toContain('D073_SupplyBoat')
  })

  it.each([{ food: 1, crop: 'grain' }, { food: 3, crop: 'vegetable' }] as const)(
    'D073 Fishing may buy one $crop',
    ({ food, crop }) => {
      const session = setup({ cardId: 'D073_SupplyBoat', occupations: 1 })
      session.state.actionSpaces.find((space) => space.id === 'fishing')!.resources.food = food
      session.loadState(session.state)
      let response = resolveTriggerIfPresent(session, session.takeAction(0, 'fishing'), 'D073_SupplyBoat')
      response = choose(session, response, (option) =>
        option.effectPreview?.kind === 'resourceExchange'
          && option.effectPreview.resourcesGained?.[crop] === 1)
      if (response.interaction.stateId === 'wait') {
        response = choose(session, response, (option) => option.value !== '__skip__')
      }
      expect(response.state.players[0]!.resources.food).toBe(0)
      expect(response.state.players[0]!.resources[crop]).toBe(1)
    },
  )

  it('D073 S4: the Supply Boat purchase may be declined', () => {
    const session = setup({ cardId: 'D073_SupplyBoat', occupations: 1 })
    session.state.actionSpaces.find((space) => space.id === 'fishing')!.resources.food = 3
    session.loadState(session.state)
    const response = decline(session, session.takeAction(0, 'fishing'), 'D073_SupplyBoat')
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 0, vegetable: 0 })
  })
})
