import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { markAllWorkersUsed, setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { readCardExtraData } from '../../shared/cards/helpers/card-state'

import '../../shared/cards/B/B055_MaintenancePremium'
import '../../shared/cards/B/B056_Brook'
import '../../shared/cards/B/B057_Scullery'
import '../../shared/cards/B/B058_CrackWeeder'
import '../../shared/cards/B/B060_BrewingWater'
import '../../shared/cards/B/B061_ThreeFieldRotation'
import '../../shared/cards/B/B062_Pitchfork'
import '../../shared/cards/B/B063_Tasting'
import '../../shared/cards/B/B064_MillWheel'

const FILLER = '__test_placeholder__'
type ResourceName = 'wood' | 'clay' | 'reed' | 'stone' | 'food' | 'grain' | 'vegetable' | 'sheep' | 'boar' | 'cattle'

const setup = ({ cardId, played = true, round = 5, playerCount = 2, occupations = 0, resources = {} }: {
  cardId: string; played?: boolean; round?: number; playerCount?: number; occupations?: number
  resources?: Partial<Record<ResourceName, number>>
}) => {
  const session = new GameSession(7300 + round, undefined, { playerCount })
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
    player.cardStates = {}
    player.fields = []
    player.pastures = []
    player.stableTiles = []
    player.stableAnimals = {}
    player.houseAnimalType = null
    player.houseAnimalCount = 0
    player.resources = { ...player.resources, wood: 0, clay: 0, reed: 0, stone: 0, food: 0,
      grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0 }
  })
  const owner = state.players[0]!
  owner.minorHand = played ? [FILLER] : [cardId]
  owner.minorPlayed = played ? [cardId] : []
  owner.occupationPlayed = ['A116_WoodCutter', 'B121_Geologist', 'C123_Freemason', 'D116_TreeInspector']
    .slice(0, occupations)
  Object.assign(owner.resources, resources)
  session.loadState(state)
  return session
}

const options = (response: SessionResponse) => response.interaction.stateId === 'wait'
  ? response.interaction.request.options ?? [] : []

const playMinor = (session: GameSession, cardId: string) => {
  let response = session.takeAction(0, 'meeting-place')
  if (response.interaction.stateId === 'wait' && !options(response).some((option) => option.value === cardId)) {
    const branch = options(response).find((option) => option.value.startsWith('action-improvement-'))
    if (branch) response = session.resolveChoice(response.interaction.playerIndex, branch.value)
  }
  if (!response.state.players[0]!.minorHand.includes(cardId)) return response
  if (response.interaction.stateId !== 'wait') return response
  const card = options(response).find((option) => option.value === cardId)
  return card ? session.resolveChoice(response.interaction.playerIndex, card.value) : response
}

const endRound = (session: GameSession) => {
  const state = session.getState().state
  state.players.forEach((player) => markAllWorkersUsed(state, player))
  session.loadState(state)
  return session.performRoundEnd()
}

const setSpace = (session: GameSession, spaceId: string, resources: Partial<Record<ResourceName, number>> = {}) => {
  const state = session.getState().state
  const space = state.actionSpaces.find((candidate) => candidate.id === spaceId)
  if (!space) throw new Error(spaceId + ' missing')
  space.takenBy = []
  Object.assign(space.resources, resources)
  session.loadState(state)
}

describe('B055 Maintenance Premium parity', () => {
  it('B055 S1: two occupations play Maintenance Premium and place three food on it', () => {
    const response = playMinor(setup({ cardId: 'B055_MaintenancePremium', played: false, occupations: 2 }), 'B055_MaintenancePremium')
    expect(response.state.players[0]!.minorPlayed).toContain('B055_MaintenancePremium')
    expect(readCardExtraData<number>(response.state.players[0]!, 'B055_MaintenancePremium', 'foodCount')).toBe(3)
  })

  it('B055 S2: fewer than two occupations keep Maintenance Premium unavailable', () => {
    const response = playMinor(setup({ cardId: 'B055_MaintenancePremium', played: false, occupations: 1 }), 'B055_MaintenancePremium')
    expect(response.state.players[0]!.minorHand).toContain('B055_MaintenancePremium')
  })

  it('B055 S3: each wood accumulation use releases one stored food until empty', () => {
    for (const stored of [3, 2, 1, 0]) {
      const session = setup({ cardId: 'B055_MaintenancePremium' })
      const state = session.getState().state
      state.players[0]!.cardStates.B055_MaintenancePremium = { extraData: { foodCount: stored } }
      state.actionSpaces.find((space) => space.id === 'forest')!.resources.wood = 1
      session.loadState(state)
      const response = session.takeAction(0, 'forest')
      expect(response.state.players[0]!.resources.food).toBe(stored > 0 ? 1 : 0)
      expect(readCardExtraData<number>(response.state.players[0]!, 'B055_MaintenancePremium', 'foodCount')).toBe(Math.max(0, stored - 1))
    }
  })

  it('B055 S4: renovation restocks Maintenance Premium to three food', () => {
    const session = setup({ cardId: 'B055_MaintenancePremium', resources: { clay: 2, reed: 1 } })
    const state = session.getState().state
    state.players[0]!.cardStates.B055_MaintenancePremium = { extraData: { foodCount: 0 } }
    session.loadState(state)
    const response = session.takeAction(0, 'house-redevelopment')
    expect(response.state.players[0]!.houseType).toBe('clay')
    expect(readCardExtraData<number>(response.state.players[0]!, 'B055_MaintenancePremium', 'foodCount')).toBe(3)
  })

  it('B055 S5: a non-wood accumulation does not release stored food', () => {
    const session = setup({ cardId: 'B055_MaintenancePremium' })
    const state = session.getState().state
    state.players[0]!.cardStates.B055_MaintenancePremium = { extraData: { foodCount: 1 } }
    session.loadState(state)
    const response = session.takeAction(0, 'clay-pit')
    expect(response.state.players[0]!.resources.food).toBe(0)
    expect(readCardExtraData<number>(response.state.players[0]!, 'B055_MaintenancePremium', 'foodCount')).toBe(1)
  })
})

const occupy = (session: GameSession, playerIndex: number, spaceId: string) => {
  const state = session.getState().state
  const player = state.players[playerIndex]!
  state.actionSpaces.find((space) => space.id === spaceId)!.takenBy = [{ playerId: player.id, workerId: '1' }]
  session.loadState(state)
}

describe('B056 Brook parity', () => {
  const brook = (played = true) => {
    const session = setup({ cardId: 'B056_Brook', played, playerCount: 4 })
    occupy(session, 0, 'fishing')
    const state = session.getState().state
    state.currentPlayerIndex = 0
    setWorkersAtHome(state, state.players[0]!, 2)
    session.loadState(state)
    return session
  }

  it('B056 S1: a person on Fishing allows Brook to be played', () => {
    expect(playMinor(brook(false), 'B056_Brook').state.players[0]!.minorPlayed).toContain('B056_Brook')
  })

  it('B056 S2: without an own person on Fishing Brook remains unavailable', () => {
    const response = playMinor(setup({ cardId: 'B056_Brook', played: false, playerCount: 4 }), 'B056_Brook')
    expect(response.state.players[0]!.minorHand).toContain('B056_Brook')
  })

  it.each([
    ['S3', 'forest'], ['S4', 'clay-pit'], ['S5', 'reed-bank'],
  ] as const)('B056 %s: using %s gains one Brook food', (_scenario, spaceId) => {
    const session = brook()
    const response = session.takeAction(0, spaceId)
    expect(response.state.players[0]!.resources.food).toBe(1)
  })

  it('B056 S6: OA gives no Brook food on the round-one Sheep Market', () => {
    const session = brook()
    const response = session.takeAction(0, 'sheep-market')
    expect(response.state.players[0]!.resources.food).toBe(0)
  })

  it('B056 S8: the multiplayer Hollow is not a Brook target', () => {
    const session = brook()
    const response = session.takeAction(0, 'hollow-4')
    expect(response.state.players[0]!.resources.food).toBe(0)
  })

  it('B056 S7: another action space grants no Brook food', () => {
    expect(brook().takeAction(0, 'day-laborer').state.players[0]!.resources.food).toBe(2)
  })

})

describe('B057 Scullery parity', () => {
  it('B057 S1: paying one wood and one clay plays Scullery', () => {
    const response = playMinor(setup({ cardId: 'B057_Scullery', played: false, resources: { wood: 1, clay: 1 } }), 'B057_Scullery')
    expect(response.state.players[0]!.minorPlayed).toContain('B057_Scullery')
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, clay: 0 })
  })

  it('B057 S2: a wooden house gains one food at round start', () => {
    const session = setup({ cardId: 'B057_Scullery', resources: { food: 20 } })
    expect(endRound(session).state.players[0]!.resources.food).toBe(21)
  })

  it('B057 S3: a clay house gains no Scullery food at round start', () => {
    const session = setup({ cardId: 'B057_Scullery', resources: { food: 20 } })
    session.state.players[0]!.houseType = 'clay'
    session.loadState(session.state)
    expect(endRound(session).state.players[0]!.resources.food).toBe(20)
  })
})

describe('B058 Crack Weeder parity', () => {
  it('B058 S1: paying one wood plays Crack Weeder and immediately gains one food', () => {
    const response = playMinor(setup({ cardId: 'B058_CrackWeeder', played: false, resources: { wood: 1 } }), 'B058_CrackWeeder')
    expect(response.state.players[0]!.minorPlayed).toContain('B058_CrackWeeder')
    expect(response.state.players[0]!.resources.food).toBe(1)
  })

  it('B058 S2: two harvested vegetable fields gain two food', () => {
    const session = setup({ cardId: 'B058_CrackWeeder', round: 4, resources: { food: 20 } })
    session.state.players[0]!.fields = [0, 1].map((col) => ({ row: 0, col, stacks: [{ kind: 'vegetable' as const, remaining: 1 }] }))
    session.loadState(session.state)
    expect(endRound(session).state.players[0]!.resources.food).toBe(18)
  })

  it('B058 S3: harvested grain fields grant no Crack Weeder food', () => {
    const session = setup({ cardId: 'B058_CrackWeeder', round: 4, resources: { food: 20 } })
    session.state.players[0]!.fields = [{ row: 0, col: 0, stacks: [{ kind: 'grain', remaining: 1 }] }]
    session.loadState(session.state)
    expect(endRound(session).state.players[0]!.resources.food).toBe(16)
  })
})

describe('B060 Brewing Water parity', () => {
  it('B060 S1: Brewing Water can be played for free', () => {
    expect(playMinor(setup({ cardId: 'B060_BrewingWater', played: false }), 'B060_BrewingWater')
      .state.players[0]!.minorPlayed).toContain('B060_BrewingWater')
  })

  const useFishing = (round: number, accept: boolean) => {
    const session = setup({ cardId: 'B060_BrewingWater', round, resources: { grain: 1 } })
    let response = session.takeAction(0, 'fishing')
    if (response.interaction.stateId === 'wait') {
      const choice = accept ? options(response).find((option) => option.value !== '__skip__')!.value : '__skip__'
      response = session.resolveChoice(0, choice)
    }
    return response
  }

  it('B060 S2: Fishing may pay one grain to schedule food on the next six rounds', () => {
    const response = useFishing(4, true)
    expect(response.state.players[0]!.resources.grain).toBe(0)
    expect(response.state.futureMeeples.filter((entry) => entry.cardId === 'B060_BrewingWater').map((entry) => entry.round))
      .toEqual([5, 6, 7, 8, 9, 10])
  })

  it('B060 S3: the Brewing Water schedule may be declined', () => {
    const response = useFishing(4, false)
    expect(response.state.players[0]!.resources.grain).toBe(1)
    expect(response.state.futureMeeples.filter((entry) => entry.cardId === 'B060_BrewingWater')).toEqual([])
  })

  it('B060 S4: late Brewing Water schedules only reachable rounds through fourteen', () => {
    const response = useFishing(12, true)
    expect(response.state.futureMeeples.filter((entry) => entry.cardId === 'B060_BrewingWater').map((entry) => entry.round))
      .toEqual([13, 14])
  })
})

describe('B061 Three-Field Rotation parity', () => {
  it('B061 S1: three occupations allow Three-Field Rotation to be played', () => {
    expect(playMinor(setup({ cardId: 'B061_ThreeFieldRotation', played: false, occupations: 3 }), 'B061_ThreeFieldRotation')
      .state.players[0]!.minorPlayed).toContain('B061_ThreeFieldRotation')
  })

  it('B061 S2: fewer than three occupations keep Three-Field Rotation unavailable', () => {
    expect(playMinor(setup({ cardId: 'B061_ThreeFieldRotation', played: false, occupations: 2 }), 'B061_ThreeFieldRotation')
      .state.players[0]!.minorHand).toContain('B061_ThreeFieldRotation')
  })

  const harvest = (kinds: Array<'grain' | 'vegetable' | null>) => {
    const session = setup({ cardId: 'B061_ThreeFieldRotation', round: 4, resources: { food: 20 } })
    session.state.players[0]!.fields = kinds.map((kind, col) => ({
      row: 0, col, stacks: kind ? [{ kind, remaining: 1 }] : [],
    }))
    session.loadState(session.state)
    return endRound(session)
  }

  it('B061 S3: grain vegetable and empty fields gain three food at harvest start', () => {
    expect(harvest(['grain', 'vegetable', null]).state.players[0]!.resources.food).toBe(19)
  })

  it('B061 S4: missing any one required field type grants no Three-Field Rotation food', () => {
    for (const fields of [['vegetable', null], ['grain', null], ['grain', 'vegetable']] as const) {
      expect(harvest([...fields]).state.players[0]!.resources.food).toBe(16)
    }
  })
})

const placeOpponent = (session: GameSession, spaceId: string) => {
  const state = session.getState().state
  const opponent = state.players[1]!
  state.actionSpaces.find((space) => space.id === spaceId)!.takenBy = [{ playerId: opponent.id, workerId: '1' }]
  session.loadState(state)
}

describe('B062 Pitchfork parity', () => {
  it('B062 S1: paying one wood plays Pitchfork', () => {
    expect(playMinor(setup({ cardId: 'B062_Pitchfork', played: false, round: 10, resources: { wood: 1 } }), 'B062_Pitchfork')
      .state.players[0]!.minorPlayed).toContain('B062_Pitchfork')
  })

  it('B062 S2: Grain Seeds gains three food when Farmland is occupied', () => {
    const session = setup({ cardId: 'B062_Pitchfork', round: 10 })
    placeOpponent(session, 'farmland')
    expect(session.takeAction(0, 'grain-seeds').state.players[0]!.resources.food).toBe(3)
  })

  it('B062 S3: vacant Farmland grants no Pitchfork food', () => {
    expect(setup({ cardId: 'B062_Pitchfork', round: 10 }).takeAction(0, 'grain-seeds')
      .state.players[0]!.resources.food).toBe(0)
  })
})

describe('B063 Tasting parity', () => {
  it('B063 S1: paying two wood plays Tasting', () => {
    expect(playMinor(setup({ cardId: 'B063_Tasting', played: false, resources: { wood: 2 } }), 'B063_Tasting')
      .state.players[0]!.minorPlayed).toContain('B063_Tasting')
  })

  const lessons = (grain: number, accept: boolean) => {
    const session = setup({ cardId: 'B063_Tasting', resources: { grain } })
    session.state.players[0]!.occupationHand = ['A116_WoodCutter']
    session.loadState(session.state)
    let response = session.takeAction(0, 'lessons')
    if (response.interaction.stateId === 'wait' && response.interaction.sourceCard === 'B063_Tasting') {
      response = session.resolveChoice(0, accept
        ? options(response).find((option) => option.value !== '__skip__')!.value : '__skip__')
    }
    if (response.interaction.stateId === 'wait') {
      const card = options(response).find((option) => option.value === 'A116_WoodCutter')
      if (card) response = session.resolveChoice(0, card.value)
    }
    return response
  }

  it('B063 S2: before paying the occupation cost one grain becomes four food', () => {
    const response = lessons(1, true)
    expect(response.state.players[0]!.occupationPlayed).toContain('A116_WoodCutter')
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 0, food: 4 })
  })

  it('B063 S3: declining Tasting preserves grain before playing the occupation', () => {
    const response = lessons(1, false)
    expect(response.state.players[0]!.occupationPlayed).toContain('A116_WoodCutter')
    expect(response.state.players[0]!.resources.grain).toBe(1)
  })

  it('B063 S4: no grain still permits the first free occupation without a Tasting exchange', () => {
    const response = lessons(0, false)
    expect(response.state.players[0]!.occupationPlayed).toContain('A116_WoodCutter')
    expect(response.state.players[0]!.resources.food).toBe(0)
  })
})

describe('B064 Mill Wheel parity', () => {
  it('B064 S1: paying two wood plays Mill Wheel', () => {
    expect(playMinor(setup({ cardId: 'B064_MillWheel', played: false, round: 10, resources: { wood: 2 } }), 'B064_MillWheel')
      .state.players[0]!.minorPlayed).toContain('B064_MillWheel')
  })

  it('B064 S2: Grain Utilization gains two food while Fishing is occupied', () => {
    const session = setup({ cardId: 'B064_MillWheel', round: 10, resources: { grain: 1 } })
    session.state.players[0]!.fields = [{ row: 0, col: 0, stacks: [] }]
    placeOpponent(session, 'fishing')
    let response = session.takeAction(0, 'grain-utilization')
    if (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'farm-select') {
      response = session.commitSelectionChoice(0, { crops: [{ row: 0, col: 0, crop: 'grain' }] })
    }
    expect(response.state.players[0]!.resources.food).toBe(2)
  })

  it('B064 S3: vacant Fishing grants no Mill Wheel food', () => {
    const session = setup({ cardId: 'B064_MillWheel', round: 10, resources: { grain: 1 } })
    session.state.players[0]!.fields = [{ row: 0, col: 0, stacks: [] }]
    session.loadState(session.state)
    expect(session.takeAction(0, 'grain-utilization').state.players[0]!.resources.food).toBe(0)
  })
})
