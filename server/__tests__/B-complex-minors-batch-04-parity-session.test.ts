import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { resolveTriggerIfPresent } from './_helpers/trigger-select'
import { familySize, markAllWorkersUsed, setActiveWorkerCount, setWorkersAtHome } from '../../shared/domain/player'
import { getCardStack, readCardExtraData, writeCardExtraData } from '../../shared/cards/helpers/card-state'
import type { GameState, Resource } from '../../shared/contract/types'

import '../../shared/cards/B/B001_UpscaleLifestyle'
import '../../shared/cards/B/B009_BeatingRod'
import '../../shared/cards/B/B021_HayloftBarn'
import '../../shared/cards/B/B029_CookeryLesson'
import '../../shared/cards/B/B043_Chophouse'
import '../../shared/cards/B/B067_HandTruck'
import '../../shared/cards/B/B075_WoodWorkshop'
import '../../shared/cards/B/B083_MuddyPuddles'

type CardId =
  | 'B001_UpscaleLifestyle'
  | 'B009_BeatingRod'
  | 'B021_HayloftBarn'
  | 'B029_CookeryLesson'
  | 'B043_Chophouse'
  | 'B067_HandTruck'
  | 'B075_WoodWorkshop'
  | 'B083_MuddyPuddles'
  | 'C013_WoodSlideHammer'

const FILLER = '__test_placeholder__'
const OCCUPATIONS = ['A116_WoodCutter', 'B121_Geologist', 'C123_Freemason']

const setupMinor = ({
  cardId, resources = {}, round = 5, occupations = 0, played = false,
}: {
  cardId: CardId
  resources?: Partial<Resource>
  round?: number
  occupations?: number
  played?: boolean
}) => {
  const session = new GameSession(4045, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = round
  state.roundPhase = 'work'
  state.players.forEach((player) => {
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    setWorkersAtHome(state, player, 2)
  })
  const player = state.players[0]!
  player.minorHand = played ? [FILLER] : [cardId]
  player.minorPlayed = played ? [cardId] : []
  player.occupationPlayed = OCCUPATIONS.slice(0, occupations)
  player.resources = {
    ...player.resources,
    wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0,
    sheep: 0, boar: 0, cattle: 0,
    ...resources,
  }
  const improvement = state.actionSpaces.find((space) => space.id === 'major-improvement')
  if (!improvement) throw new Error('major-improvement missing')
  improvement.takenBy = []
  state.availableMajorImprovements = []
  session.loadState(state)
  return session
}

const enterImprovementChoice = (session: GameSession) => {
  let response = session.takeAction(0, 'major-improvement')
  if (response.interaction.stateId !== 'wait') return response
  const option = response.interaction.request.options?.find((candidate) => {
    return candidate.value.startsWith('action-improvement-')
  })
  if (option) response = session.resolveChoice(0, option.value)
  return response
}

const playMinor = (session: GameSession, cardId: CardId) => {
  let response = enterImprovementChoice(session)
  if (!response.state.players[0]!.minorHand.includes(cardId)) return response
  if (response.interaction.stateId !== 'wait') return response
  const option = response.interaction.request.options?.find((candidate) => candidate.value === cardId)
  if (option) response = session.resolveChoice(0, option.value)
  return response
}

const cardIsOffered = (session: GameSession, cardId: CardId) => {
  const response = enterImprovementChoice(session)
  if (!response.state.players[0]!.minorHand.includes(cardId)) return true
  if (response.interaction.stateId !== 'wait') return false
  return response.interaction.request.options?.some((candidate) => candidate.value === cardId) ?? false
}

const resolveNonSkip = (session: GameSession, response: SessionResponse, sourceCard?: string) => {
  const current = sourceCard ? resolveTriggerIfPresent(session, response, sourceCard) : response
  expect(current.interaction.stateId).toBe('wait')
  if (current.interaction.stateId !== 'wait') throw new Error('expected choice')
  const option = current.interaction.request.options?.find((candidate) => candidate.value !== '__skip__')
  expect(option).toBeDefined()
  return session.resolveChoice(current.interaction.playerIndex, option!.value)
}

const resolveSkip = (session: GameSession, response: SessionResponse, sourceCard?: string) => {
  const current = sourceCard ? resolveTriggerIfPresent(session, response, sourceCard) : response
  expect(current.interaction.stateId).toBe('wait')
  if (current.interaction.stateId !== 'wait') throw new Error('expected choice')
  const option = current.interaction.request.options?.find((candidate) => candidate.value === '__skip__')
  expect(option).toBeDefined()
  return session.resolveChoice(current.interaction.playerIndex, option!.value)
}

const futureRounds = (state: GameState, cardId: CardId, resource: keyof Resource) =>
  state.futureMeeples
    .filter((entry) => entry.cardId === cardId && (entry.resources[resource] ?? 0) > 0)
    .flatMap((entry) => Array.from({ length: entry.resources[resource] ?? 0 }, () => entry.round))
    .sort((left, right) => left - right)

describe('B001 Upscale Lifestyle parity', () => {
  it('B001 S1: pays three wood, gains five clay, passes, and may decline renovation', () => {
    const session = setupMinor({
      cardId: 'B001_UpscaleLifestyle', resources: { wood: 3, reed: 1 },
    })
    let response = playMinor(session, 'B001_UpscaleLifestyle')
    response = resolveSkip(session, response)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, clay: 5, reed: 1 })
    expect(response.state.players[1]!.minorHand).toContain('B001_UpscaleLifestyle')
  })

  it('B001 S2: accepting renovation pays the normal two-room cost', () => {
    const session = setupMinor({
      cardId: 'B001_UpscaleLifestyle', resources: { wood: 3, reed: 1 },
    })
    let response = resolveNonSkip(session, playMinor(session, 'B001_UpscaleLifestyle'))
    if (response.interaction.stateId === 'wait' && response.interaction.promptKey === 'ui.interactionChooseRenovationTarget') {
      response = session.resolveChoice(0, 'clay')
    }
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]).toMatchObject({
      houseType: 'clay', resources: { wood: 0, clay: 3, reed: 0 },
    })
  })
})

describe('B009 Beating Rod parity', () => {
  const chooseBranch = (branch: number) => {
    const session = setupMinor({ cardId: 'B009_BeatingRod', resources: { reed: 1 } })
    let response = playMinor(session, 'B009_BeatingRod')
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') throw new Error('expected Beating Rod choice')
    const options = response.interaction.request.options?.filter((option) => option.value !== '__skip__') ?? []
    expect(options).toHaveLength(2)
    response = session.resolveChoice(0, options[branch]!.value)
    return response
  }

  it('B009 S1: may gain one reed and passes', () => {
    const response = chooseBranch(0)
    expect(response.state.players[0]!.resources).toMatchObject({ reed: 2, cattle: 0 })
    expect(response.state.players[1]!.minorHand).toContain('B009_BeatingRod')
  })

  it('B009 S2: may exchange one reed for one cattle and passes', () => {
    const response = chooseBranch(1)
    expect(response.state.players[0]!.resources).toMatchObject({ reed: 0, cattle: 1 })
    expect(response.state.players[1]!.minorHand).toContain('B009_BeatingRod')
  })
})

describe('B021 Hayloft Barn parity', () => {
  it('B021 S1: one occupation allows play and stores four food', () => {
    const response = playMinor(setupMinor({
      cardId: 'B021_HayloftBarn', resources: { wood: 3 }, occupations: 1,
    }), 'B021_HayloftBarn')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain('B021_HayloftBarn')
    expect(response.state.players[0]!.resources.wood).toBe(0)
    expect(readCardExtraData<number>(response.state.players[0]!, 'B021_HayloftBarn', 'foodCount')).toBe(4)
  })

  it('B021 S2: no occupation keeps Hayloft Barn unavailable', () => {
    expect(cardIsOffered(setupMinor({
      cardId: 'B021_HayloftBarn', resources: { wood: 3 },
    }), 'B021_HayloftBarn')).toBe(false)
  })

  const playedHayloft = (foodCount: number) => {
    const session = setupMinor({ cardId: 'B021_HayloftBarn', played: true })
    const player = session.state.players[0]!
    writeCardExtraData(player, 'B021_HayloftBarn', 'foodCount', foodCount)
    session.loadState(session.state)
    return session
  }

  it('B021 S3: obtaining grain releases exactly one stored food', () => {
    const session = playedHayloft(4)
    const response = resolveTriggerIfPresent(session, session.takeAction(0, 'grain-seeds'), 'B021_HayloftBarn')
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 1, food: 1 })
    expect(readCardExtraData<number>(response.state.players[0]!, 'B021_HayloftBarn', 'foodCount')).toBe(3)
  })

  it('B021 S4: taking the last stored food grants family growth without a room', () => {
    const session = playedHayloft(1)
    const before = familySize(session.state.players[0]!)
    const response = resolveTriggerIfPresent(session, session.takeAction(0, 'grain-seeds'), 'B021_HayloftBarn')
    expect(readCardExtraData<number>(response.state.players[0]!, 'B021_HayloftBarn', 'foodCount')).toBe(0)
    expect(response.state.players[0]!.resources.food).toBe(1)
    expect(familySize(response.state.players[0]!)).toBe(before + 1)
  })
})

describe('B029 Cookery Lesson parity', () => {
  it('B029 S1: costs two food and remains in play', () => {
    const response = playMinor(setupMinor({
      cardId: 'B029_CookeryLesson', resources: { food: 2 },
    }), 'B029_CookeryLesson')
    expect(response.state.players[0]!.minorPlayed).toContain('B029_CookeryLesson')
    expect(response.state.players[0]!.resources.food).toBe(0)
  })

  it('B029 S2: cooking with a Fireplace during a Lessons action grants one bonus point', () => {
    const session = setupMinor({
      cardId: 'B029_CookeryLesson', resources: { sheep: 1, food: 10 }, played: true,
    })
    const player = session.state.players[0]!
    player.improvements = ['Major_Fireplace1']
    player.occupationHand = [OCCUPATIONS[0]!]
    session.loadState(session.state)

    session.takeAction(0, 'lessons')
    session.takeAnytimeAction(0, 'exchange')
    const cooked = session.resolveChoice(0, 'bulk:0=1')
    resolveTriggerIfPresent(session, cooked, 'B029_CookeryLesson')
    const response = session.resolveChoice(0, OCCUPATIONS[0]!)
    expect(response.state.players[0]!.resources.sheep).toBe(0)
    expect(response.state.players[0]!.cardStates.B029_CookeryLesson?.counters?.bonusVp).toBe(1)
  })
})

describe('B043 Chophouse parity', () => {
  for (const [scenario, payment] of [['S1', 'wood'], ['S2', 'clay']] as const) {
    it(`B043 ${scenario}: can pay two ${payment} and remains in play`, () => {
      const response = playMinor(setupMinor({
        cardId: 'B043_Chophouse', resources: { [payment]: 2 },
      }), 'B043_Chophouse')
      expect(response.state.players[0]!.minorPlayed).toContain('B043_Chophouse')
      expect(response.state.players[0]!.resources[payment]).toBe(0)
    })
  }

  it('B043 S3: Grain Seeds schedules one food for each of the next three rounds', () => {
    const session = setupMinor({ cardId: 'B043_Chophouse', played: true, round: 5 })
    const response = resolveTriggerIfPresent(session, session.takeAction(0, 'grain-seeds'), 'B043_Chophouse')
    expect(futureRounds(response.state, 'B043_Chophouse', 'food')).toEqual([6, 7, 8])
  })

  it('B043 S4: Vegetable Seeds schedules one food for each of the next two rounds', () => {
    const session = setupMinor({ cardId: 'B043_Chophouse', played: true, round: 9 })
    const response = resolveTriggerIfPresent(session, session.takeAction(0, 'vegetable-seeds'), 'B043_Chophouse')
    expect(futureRounds(response.state, 'B043_Chophouse', 'food')).toEqual([10, 11])
  })

  it('B043 S5: late Grain Seeds keeps only the schedule entry through round fourteen', () => {
    const session = setupMinor({ cardId: 'B043_Chophouse', played: true, round: 13 })
    const response = resolveTriggerIfPresent(session, session.takeAction(0, 'grain-seeds'), 'B043_Chophouse')
    expect(futureRounds(response.state, 'B043_Chophouse', 'food')).toEqual([14])
  })

  it('B043 S6: scheduled food arrives at the start of its round', () => {
    const session = setupMinor({ cardId: 'B043_Chophouse', played: true, round: 5 })
    resolveTriggerIfPresent(session, session.takeAction(0, 'grain-seeds'), 'B043_Chophouse')
    const state = session.getState().state
    state.players.forEach((player) => {
      markAllWorkersUsed(state, player)
      player.resources.food = 20
    })
    session.loadState(state)

    const response = session.performRoundEnd()

    expect(response.state.round).toBe(6)
    expect(response.state.players[0]!.resources.food).toBe(21)
    expect(futureRounds(response.state, 'B043_Chophouse', 'food')).toEqual([7, 8])
  })
})

describe('B067 Hand Truck parity', () => {
  it('B067 S1: costs one wood and remains in play', () => {
    const response = playMinor(setupMinor({
      cardId: 'B067_HandTruck', resources: { wood: 1 },
    }), 'B067_HandTruck')
    expect(response.state.players[0]!.minorPlayed).toContain('B067_HandTruck')
    expect(response.state.players[0]!.resources.wood).toBe(0)
  })

  const bakeSession = (accumulationWorkers: number, grain: number) => {
    const session = setupMinor({ cardId: 'B067_HandTruck', resources: { grain }, played: true, round: 14 })
    const state = session.getState().state
    const player = state.players[0]!
    player.improvements = ['Major_Fireplace1']
    if (accumulationWorkers > 1) {
      setActiveWorkerCount(player, accumulationWorkers + 1)
      setWorkersAtHome(state, player, accumulationWorkers + 1)
    }
    const spaces = ['forest', 'clay-pit']
    spaces.slice(0, accumulationWorkers).forEach((id, index) => {
      const space = state.actionSpaces.find((candidate) => candidate.id === id)
      if (!space) throw new Error(`${id} missing`)
      space.takenBy = [{ playerId: player.id, workerId: String(index + 1) }]
    })
    session.loadState(state)
    return session
  }

  it('B067 S2: two people on accumulation spaces offer two grain but OA still allows skipping it', () => {
    const session = bakeSession(2, 0)
    const response = session.takeAction(0, 'grain-utilization')
    expect(response.ok, response.error).toBe(true)
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') return
    expect(response.interaction.sourceCard).toBe('B067_HandTruck')
    expect(response.interaction.request.options?.some((option) => option.value === '__skip__')).toBe(true)
    const accept = response.interaction.request.options?.find((option) => option.value !== '__skip__')
    expect(accept).toBeDefined()
    const baked = session.resolveChoice(0, accept!.value)
    expect(baked.state.players[0]!.resources.grain).toBe(2)
    expect(baked.interaction.stateId).toBe('wait')
    expect(baked.interaction.stateId === 'wait' ? baked.interaction.promptKey : '').toMatch(/^ui\.interactionBakeBread/)
  })

  it('B067 S3: no person on an accumulation space grants no Hand Truck grain', () => {
    const response = bakeSession(0, 1).takeAction(0, 'grain-utilization')
    expect(response.ok, response.error).toBe(true)
    expect(response.interaction.stateId === 'wait' ? response.interaction.sourceCard : undefined).not.toBe('B067_HandTruck')
    expect(response.state.events).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'card.triggered', sourceCardId: 'B067_HandTruck' }),
    ]))
  })
})

describe('B075 Wood Workshop parity', () => {
  it('B075 S1: one occupation allows play for one clay', () => {
    const response = playMinor(setupMinor({
      cardId: 'B075_WoodWorkshop', resources: { clay: 1 }, occupations: 1,
    }), 'B075_WoodWorkshop')
    expect(response.state.players[0]!.minorPlayed).toContain('B075_WoodWorkshop')
    expect(response.state.players[0]!.resources.clay).toBe(0)
  })

  it('B075 S2: no occupation keeps Wood Workshop unavailable', () => {
    expect(cardIsOffered(setupMinor({
      cardId: 'B075_WoodWorkshop', resources: { clay: 1 },
    }), 'B075_WoodWorkshop')).toBe(false)
  })

  it('B075 S3: its wood can immediately pay for the triggering improvement', () => {
    const session = setupMinor({ cardId: 'B075_WoodWorkshop', played: true, round: 14 })
    session.state.players[0]!.minorHand = ['C013_WoodSlideHammer']
    session.loadState(session.state)
    const response = session.takeAction(0, 'major-improvement')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain('C013_WoodSlideHammer')
    expect(response.state.players[0]!.resources.wood).toBe(0)
  })
})

describe('B083 Muddy Puddles parity', () => {
  it('B083 S1: pays two clay and stacks boar, food, cattle, food, sheep bottom to top', () => {
    const response = playMinor(setupMinor({
      cardId: 'B083_MuddyPuddles', resources: { clay: 2 },
    }), 'B083_MuddyPuddles')
    expect(response.state.players[0]!.resources.clay).toBe(0)
    expect(getCardStack(response.state.players[0]!, 'B083_MuddyPuddles')).toEqual([
      'boar', 'food', 'cattle', 'food', 'sheep',
    ])
  })

  const playedPuddles = (clay: number, stack = ['boar', 'food', 'cattle', 'food', 'sheep']) => {
    const session = setupMinor({ cardId: 'B083_MuddyPuddles', resources: { clay }, played: true })
    session.state.players[0]!.cardStates.B083_MuddyPuddles = { stack }
    session.loadState(session.state)
    return session
  }

  it('B083 S2: paying one clay at any time takes the top sheep', () => {
    const session = playedPuddles(1)
    const active = session.takeAction(0, 'farmland')
    expect(active.interaction.stateId).toBe('wait')
    const response = session.takeAnytimeAction(0, 'B83-muddy-puddles-anytime')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ clay: 0, sheep: 1 })
    expect(getCardStack(response.state.players[0]!, 'B083_MuddyPuddles')).toEqual([
      'boar', 'food', 'cattle', 'food',
    ])
  })

  it('B083 S3: Muddy Puddles is unavailable without clay', () => {
    const response = playedPuddles(0).takeAction(0, 'farmland')
    const anytime = response.interaction.stateId === 'wait' ? response.interaction.anytimeActions : []
    expect(anytime.map((action) => action.id)).not.toContain('B83-muddy-puddles-anytime')
  })

  it('B083 S4: Muddy Puddles is unavailable after its stack is empty', () => {
    const response = playedPuddles(1, []).takeAction(0, 'farmland')
    const anytime = response.interaction.stateId === 'wait' ? response.interaction.anytimeActions : []
    expect(anytime.map((action) => action.id)).not.toContain('B83-muddy-puddles-anytime')
  })
})
