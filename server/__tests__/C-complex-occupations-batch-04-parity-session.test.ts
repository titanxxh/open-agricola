import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { resolveTriggerIfPresent } from './_helpers/trigger-select'
import { confirmPlayerSwitch } from './_helpers/pending-confirms'
import { familySize, markAllWorkersUsed, setActiveWorkerCount, setWorkersAtHome } from '../../shared/domain/player'
import { isCardFlagged } from '../../shared/cards/helpers/card-state'
import type { GameState, Resource } from '../../shared/contract/types'

import '../../shared/cards/C/C085_DenBuilder'
import '../../shared/cards/C/C092_AutumnMother'
import '../../shared/cards/C/C098_CubeCutter'
import '../../shared/cards/C/C102_TreeGuard'
import '../../shared/cards/C/C106_PotatoHarvester'
import '../../shared/cards/C/C112_Thresher'
import '../../shared/cards/C/C116_FurnitureMaker'
import '../../shared/cards/C/C164_GermanHeathKeeper'

type CardId =
  | 'C085_DenBuilder' | 'C092_AutumnMother' | 'C098_CubeCutter'
  | 'C102_TreeGuard' | 'C106_PotatoHarvester' | 'C112_Thresher'
  | 'C116_FurnitureMaker' | 'C164_GermanHeathKeeper'

const FILLER = '__test_placeholder__'

const setupOccupation = (cardId: CardId, {
  playerCount = 2,
  played = false,
  round = 14,
  resources = {},
}: {
  playerCount?: number
  played?: boolean
  round?: number
  resources?: Partial<Resource>
} = {}) => {
  const session = new GameSession(4051, undefined, { playerCount })
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
  player.occupationHand = played ? [FILLER] : [cardId]
  player.occupationPlayed = played ? [cardId] : []
  player.resources = {
    ...player.resources,
    wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0,
    sheep: 0, boar: 0, cattle: 0, ...resources,
  }
  session.loadState(state)
  return session
}

const playOccupation = (session: GameSession, cardId: string, actionId = 'lessons') => {
  let response = session.takeAction(0, actionId)
  if (response.interaction.stateId !== 'wait') return response
  const option = response.interaction.request.options?.find((candidate) => candidate.value === cardId)
  if (option) response = session.resolveChoice(0, option.value)
  return response
}

const chooseNonSkip = (session: GameSession, response: SessionResponse, sourceCard?: string) => {
  const current = sourceCard ? resolveTriggerIfPresent(session, response, sourceCard) : response
  expect(current.interaction.stateId).toBe('wait')
  if (current.interaction.stateId !== 'wait') throw new Error('expected choice')
  const option = current.interaction.request.options?.find((candidate) => candidate.value !== '__skip__')
  expect(option).toBeDefined()
  return session.resolveChoice(current.interaction.playerIndex, option!.value)
}

const chooseSkip = (session: GameSession, response: SessionResponse, sourceCard?: string) => {
  const current = sourceCard ? resolveTriggerIfPresent(session, response, sourceCard) : response
  expect(current.interaction.stateId).toBe('wait')
  if (current.interaction.stateId !== 'wait') throw new Error('expected choice')
  expect(current.interaction.request.options?.some((option) => option.value === '__skip__')).toBe(true)
  return session.resolveChoice(current.interaction.playerIndex, '__skip__')
}

const setSpaceResource = (state: GameState, spaceId: string, resource: keyof Resource, count: number) => {
  const space = state.actionSpaces.find((candidate) => candidate.id === spaceId)
  if (!space) throw new Error(`${spaceId} missing`)
  space.resources[resource] = count
  space.takenBy = []
}

const prepareHarvest = (session: GameSession) => {
  const state = session.getState().state
  state.players.forEach((player) => {
    markAllWorkersUsed(state, player)
    setActiveWorkerCount(player, 2)
  })
  state.players.slice(1).forEach((player) => { player.resources.food = 20 })
  session.loadState(state)
}

const cardBonusScore = (response: SessionResponse, cardId: CardId) =>
  response.scores?.[0]!.categories.find((category) => category.key === 'cardBonusVp')?.entries
    .find((entry) => 'cardId' in entry && entry.cardId === cardId)?.score ?? 0

describe('C092 Autumn Mother parity', () => {
  const harvest = (freeRoom: boolean) => {
    const session = setupOccupation('C092_AutumnMother', {
      played: true, round: 4, resources: { food: 10 },
    })
    const player = session.state.players[0]!
    if (freeRoom) {
      player.rooms = 3
      player.roomTiles = [{ row: 0, col: 0 }, { row: 1, col: 0 }, { row: 2, col: 0 }]
    }
    prepareHarvest(session)
    return session
  }

  it('C092 S1: before harvest a player with a free room may pay three food for family growth', () => {
    const session = harvest(true)
    const before = familySize(session.state.players[0]!)
    const response = chooseNonSkip(session, session.performRoundEnd(), 'C092_AutumnMother')
    expect(familySize(response.state.players[0]!)).toBe(before + 1)
    expect(response.state.players[0]!.resources.food).toBe(2)
  })

  it('C092 S2: Autumn Mother may be declined without paying or growing', () => {
    const session = harvest(true)
    const before = familySize(session.state.players[0]!)
    const response = chooseSkip(session, session.performRoundEnd(), 'C092_AutumnMother')
    expect(familySize(response.state.players[0]!)).toBe(before)
    expect(response.state.players[0]!.resources.food).toBe(6)
  })

  it('C092 S3: OA skips Autumn Mother without a free room', () => {
    const response = harvest(false).performRoundEnd()
    expect(response.interaction.stateId === 'wait' ? response.interaction.sourceCard : undefined).not.toBe('C092_AutumnMother')
    expect(response.state.players[0]!.resources.food).toBe(6)
    expect(familySize(response.state.players[0]!)).toBe(2)
  })
})

describe('C116 Furniture Maker parity', () => {
  it('C116 S1: playing immediately gains one wood', () => {
    const response = playOccupation(setupOccupation('C116_FurnitureMaker'), 'C116_FurnitureMaker')
    expect(response.state.players[0]!.occupationPlayed).toContain('C116_FurnitureMaker')
    expect(response.state.players[0]!.resources.wood).toBe(1)
  })

  it('C116 S2: paying one food for a later occupation grants one wood', () => {
    const session = setupOccupation('C116_FurnitureMaker', { played: true, resources: { food: 1 } })
    session.state.players[0]!.occupationHand = ['A116_WoodCutter']
    session.loadState(session.state)
    const response = resolveTriggerIfPresent(
      session,
      playOccupation(session, 'A116_WoodCutter'),
      'C116_FurnitureMaker',
    )
    expect(response.state.players[0]!.resources).toMatchObject({ food: 0, wood: 1 })
  })

  it('C116 S3: paying two food on four-player Lessons grants two wood', () => {
    const session = setupOccupation('C116_FurnitureMaker', {
      playerCount: 4, played: true, resources: { food: 2 },
    })
    session.state.players[0]!.occupationPlayed.push('B121_Geologist')
    session.state.players[0]!.occupationHand = ['A116_WoodCutter']
    session.loadState(session.state)
    const response = resolveTriggerIfPresent(
      session,
      playOccupation(session, 'A116_WoodCutter', 'lessons-4'),
      'C116_FurnitureMaker',
    )
    expect(response.state.players[0]!.resources).toMatchObject({ food: 0, wood: 2 })
  })
})

describe('C112 Thresher parity', () => {
  const thresher = (food: number) => {
    const session = setupOccupation('C112_Thresher', {
      played: true, round: 10, resources: { food },
    })
    session.state.players[0]!.fields = [{ row: 0, col: 1, stacks: [] }]
    session.loadState(session.state)
    return session
  }

  it('C112 S1: before Grain Utilization may pay one food for one grain and sow it immediately', () => {
    const session = thresher(1)
    let response = chooseNonSkip(session, session.takeAction(0, 'grain-utilization'), 'C112_Thresher')
    expect(response.state.players[0]!.resources).toMatchObject({ food: 0, grain: 1 })
    if (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'choice') {
      const sow = response.interaction.request.options?.find((option) => option.labelKey === 'actions.sow.name')
      if (sow) response = session.resolveChoice(0, sow.value)
    }
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') return
    const field = response.interaction.request.farm?.farmType === 'sow'
      ? response.interaction.request.farm.selectableFields[0]!.tile
      : undefined
    expect(field).toBeDefined()
    response = session.commitSelectionChoice(0, { crops: [{ ...field!, crop: 'grain' }] })
    expect(response.state.players[0]!.resources.grain).toBe(0)
  })

  it('C112 S2: Thresher purchase may be declined', () => {
    const session = thresher(1)
    const response = chooseSkip(session, session.takeAction(0, 'farmland'), 'C112_Thresher')
    expect(response.state.players[0]!.resources).toMatchObject({ food: 1, grain: 0 })
  })

  it('C112 S3: OA skips Thresher without food', () => {
    const response = thresher(0).takeAction(0, 'farmland')
    expect(response.interaction.stateId === 'wait' ? response.interaction.sourceCard : undefined).not.toBe('C112_Thresher')
  })
})

describe('C085 Den Builder parity', () => {
  const denBuilder = (houseType: 'wood' | 'clay' | 'stone', grain = 1, food = 2) => {
    const session = setupOccupation('C085_DenBuilder', { played: true, resources: { grain, food } })
    session.state.players[0]!.houseType = houseType
    session.loadState(session.state)
    return session
  }

  it('C085 S1: in a clay house may pay one grain and two food for one family space', () => {
    const session = denBuilder('clay')
    session.takeAction(0, 'farmland')
    const response = session.takeAnytimeAction(0, 'C85-den-builder-anytime')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 0, food: 0 })
    expect(response.state.players[0]!.rooms).toBe(3)
    expect(isCardFlagged(response.state.players[0]!, 'C085_DenBuilder')).toBe(true)
  })

  it('C085 S2: unavailable in a wooden house', () => {
    const session = denBuilder('wood')
    const response = session.takeAction(0, 'farmland')
    expect(response.interaction.anytimeActions.map((action) => action.id)).not.toContain('C85-den-builder-anytime')
  })

  it('C085 S3: unavailable after its one-time use', () => {
    const session = denBuilder('clay', 2, 4)
    session.takeAction(0, 'farmland')
    const response = session.takeAnytimeAction(0, 'C85-den-builder-anytime')
    expect(response.interaction.anytimeActions.map((action) => action.id)).not.toContain('C85-den-builder-anytime')
  })
})

describe('C106 Potato Harvester parity', () => {
  it('C106 S1: playing immediately gains three food', () => {
    const response = playOccupation(setupOccupation('C106_PotatoHarvester'), 'C106_PotatoHarvester')
    expect(response.state.players[0]!.resources.food).toBe(3)
  })

  const harvest = (vegetables: number, grains: number) => {
    const session = setupOccupation('C106_PotatoHarvester', {
      played: true, round: 4, resources: { food: 10 },
    })
    const fields = []
    for (let index = 0; index < vegetables; index++) {
      fields.push({ row: 0, col: index + 1, stacks: [{ kind: 'vegetable' as const, remaining: 1 }] })
    }
    for (let index = 0; index < grains; index++) {
      fields.push({ row: 1, col: index + 1, stacks: [{ kind: 'grain' as const, remaining: 1 }] })
    }
    session.state.players[0]!.fields = fields
    prepareHarvest(session)
    return session.performRoundEnd()
  }

  it('C106 S2: harvesting two vegetable fields grants two additional food', () => {
    expect(harvest(2, 0).state.players[0]!.resources).toMatchObject({ vegetable: 2, food: 8 })
  })

  it('C106 S3: harvesting only grain grants no Potato Harvester food', () => {
    expect(harvest(0, 1).state.players[0]!.resources.food).toBe(6)
  })
})

describe('C102 Tree Guard parity', () => {
  const collect = () => {
    const session = setupOccupation('C102_TreeGuard', { played: true })
    setSpaceResource(session.state, 'forest', 'wood', 4)
    session.loadState(session.state)
    return session
  }

  it('C102 S1: after collecting wood may return four wood for two stone and three other goods', () => {
    const session = collect()
    const response = chooseNonSkip(session, session.takeAction(0, 'forest'), 'C102_TreeGuard')
    expect(response.state.actionSpaces.find((space) => space.id === 'forest')?.resources.wood).toBe(4)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, stone: 2, clay: 1, reed: 1, grain: 1 })
  })

  it('C102 S2: declining Tree Guard keeps the collected wood', () => {
    const session = collect()
    const response = chooseSkip(session, session.takeAction(0, 'forest'), 'C102_TreeGuard')
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 4, stone: 0 })
  })

  it('C102 S3: collecting clay does not trigger Tree Guard', () => {
    const response = setupOccupation('C102_TreeGuard', { played: true }).takeAction(0, 'clay-pit')
    expect(response.state.events).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'card.triggered', sourceCardId: 'C102_TreeGuard' }),
    ]))
  })
})

describe('C164 German Heath Keeper parity', () => {
  const pigMarket = (actor: number) => {
    const session = setupOccupation('C164_GermanHeathKeeper', { playerCount: 4, played: true, round: 5 })
    const state = session.getState().state
    state.currentPlayerIndex = actor
    setSpaceResource(state, 'pig-market', 'boar', 1)
    state.players[actor]!.pastures = [{
      id: 'boar-pasture', size: 1, tiles: [{ row: 0, col: 1 }], stables: 0,
      animalType: null, animalCount: 0,
    }]
    state.players[0]!.pastures = [{
      id: 'sheep-pasture', size: 1, tiles: [{ row: 1, col: 1 }], stables: 0,
      animalType: null, animalCount: 0,
    }]
    session.loadState(state)
    return session
  }

  const finishAnimalReorgs = (session: GameSession, initial: SessionResponse) => {
    let response = initial
    for (let safety = 0; safety < 8 && response.interaction.stateId === 'wait'; safety++) {
      if (response.interaction.request.kind === 'confirm-player-switch') {
        response = confirmPlayerSwitch(session)
        continue
      }
      if (response.interaction.request.kind !== 'animal-reorg') break
      const index = response.interaction.playerIndex
      const animal = index === 0 && response.state.players[index]!.resources.sheep > 0 ? 'sheep' : 'boar'
      const zone = response.interaction.request.zones.find((candidate) => candidate.zoneType === 'pasture')
      response = session.resolveChoice(index, 'confirm', {
        zones: [{ ...zone!, animalType: animal, animalCount: 1 }],
      })
      expect(response.ok, response.error).toBe(true)
    }
    return response
  }

  it('C164 S1: owner using Pig Market gains one sheep', () => {
    const session = pigMarket(0)
    const response = finishAnimalReorgs(session, session.takeAction(0, 'pig-market'))
    expect(response.state.players[0]!.resources.sheep).toBe(1)
  })

  it('C164 S2: when an opponent uses Pig Market the owner may gain one sheep', () => {
    const session = pigMarket(1)
    const response = finishAnimalReorgs(session, session.takeAction(1, 'pig-market'))
    expect(response.state.players[0]!.resources.sheep).toBe(1)
  })

  it('C164 S3: a non-Pig-Market action grants no sheep', () => {
    const session = pigMarket(1)
    const response = session.takeAction(1, 'day-laborer')
    expect(response.state.players[0]!.resources.sheep).toBe(0)
  })
})

describe('C098 Cube Cutter parity', () => {
  const harvest = (wood: number) => {
    const session = setupOccupation('C098_CubeCutter', {
      played: true, round: 4, resources: { wood, food: 5 },
    })
    prepareHarvest(session)
    session.state.players[0]!.resources.food = 5
    session.loadState(session.state)
    return session
  }

  it('C098 S1: playing Cube Cutter immediately gains one wood', () => {
    const response = playOccupation(setupOccupation('C098_CubeCutter'), 'C098_CubeCutter')
    expect(response.state.players[0]!.resources.wood).toBe(1)
  })

  it('C098 S2: in harvest field phase may pay one wood and one food for one bonus point', () => {
    const session = harvest(1)
    const response = chooseNonSkip(session, session.performRoundEnd(), 'C098_CubeCutter')
    expect(response.state.players[0]!.resources.wood).toBe(0)
    expect(cardBonusScore(response, 'C098_CubeCutter')).toBe(1)
  })

  it('C098 S3: Cube Cutter exchange may be declined', () => {
    const session = harvest(1)
    const response = chooseSkip(session, session.performRoundEnd(), 'C098_CubeCutter')
    expect(response.state.players[0]!.resources.wood).toBe(1)
    expect(cardBonusScore(response, 'C098_CubeCutter')).toBe(0)
  })

  it('C098 S4: OA skips the Cube Cutter offer without wood', () => {
    const response = harvest(0).performRoundEnd()
    expect(response.interaction.stateId === 'wait' ? response.interaction.sourceCard : undefined).not.toBe('C098_CubeCutter')
    expect(cardBonusScore(response, 'C098_CubeCutter')).toBe(0)
  })
})
