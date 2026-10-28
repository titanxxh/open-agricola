import { afterEach, describe, expect, it } from 'vitest'
import type { GameState, PlayerState } from '../../shared/contract/types'
import { emptyResources } from '../../shared/contract/state-constants'
import { getCardEffect } from '../../shared/cards/card-effects'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { createWorkSession } from './_helpers/session-fixtures'
import { assertRejectedUnchanged, confirmNext, getChoiceOptions, passPreparationExchanges } from './_helpers/session-assertions'
import { buildHostedCardAnimalZoneId, getPlacedAnimalsByType } from '../../shared/domain/animal-zones'
import { positionKey } from '../../shared/domain/farmyard-geometry'
import type { AnimalKey } from '../../shared/contract/animals'
import { serializeSessionSnapshot, rehydrateState } from '../../shared/session/serialization'

const NUTRITION = 'B135_NutritionExpert'
const PIG_OWNER = 'A153_PigOwner'
const PIG_ANYTIME = 'A153-pig-owner-anytime'
const NIGHT_PASTURE = 'M033_NightPasture'

const sessions: GameSession[] = []
afterEach(() => { for (const session of sessions.splice(0)) session.dispose() })

const setup = (seed: number, round: number, configure: (state: GameState) => void, moor = true) => {
  const session = createWorkSession({ seed, options: { enableFarmersOfTheMoor: moor }, configure(state) {
    state.round = round
    for (const player of state.players) {
      player.resources = { ...emptyResources, food: 20, ...(moor ? { fuel: 20, horse: 0 } : {}) }
      player.minorHand = ['__test_placeholder__']
      player.occupationHand = ['__test_placeholder__']
      player.minorPlayed = []
      player.occupationPlayed = []
      player.improvements = []
      player.cardStates = {}
      player.farmTerrain = []
      player.fields = []
      player.pastures = []
      player.stableTiles = []
      player.houseAnimals = {}
      player.stableAnimals = {}
      player.fenceSegments = []
    }
    for (const space of state.actionSpaces) space.takenBy = []
    configure(state)
  } })
  sessions.push(session)
  return session
}

const bonus = (response: SessionResponse, cardId: string, playerIndex = 0) => response.scores[playerIndex]!.categories
  .flatMap(category => category.entries).filter(entry => entry.type === 'bonus' && entry.cardId === cardId)
  .reduce((sum, entry) => sum + entry.score, 0)

const restore = (session: GameSession) => {
  const snapshot = session.withCtx(() => serializeSessionSnapshot(session.state, session))
  const restored = new GameSession(rehydrateState(snapshot))
  sessions.push(restored)
  return restored
}

const horsePasture = (player: PlayerState, count: number) => {
  player.pastures = [{ id: 'horses', tiles: [{ row: 0, col: 2 }, { row: 0, col: 3 }, { row: 0, col: 4 }],
    animalType: 'horse', animalCount: count }]
  player.fenceSegments = ['H-0-2', 'H-0-3', 'H-0-4', 'H-1-2', 'H-1-3', 'H-1-4', 'V-0-2', 'V-0-5']
    .map(edge => ({ edge, type: 'fence' }))
  player.resources.horse = count
}

const nutrition = (configure?: (state: GameState) => void, animal: AnimalKey = 'horse') => setup(429009, 5, state => {
  const player = state.players[0]!
  player.occupationPlayed = [NUTRITION]
  player.resources[animal] = 1
  player.resources.grain = 1
  player.resources.vegetable = 1
  const petRoom = [...player.roomTiles].sort((a, b) => a.col - b.col || b.row - a.row)[0]!
  player.houseAnimals = { [positionKey(petRoom)]: animal }
  state.actionSpaces.find(space => space.id === 'forest')!.resources = { wood: 1 }
  state.actionSpaces.find(space => space.id === 'clay-pit')!.resources = { clay: 1 }
  state.actionSpaces.find(space => space.id === 'reed-bank')!.resources = { reed: 1 }
  configure?.(state)
})

const advanceToRoundSix = (session: GameSession) => {
  let response = session.getState()
  for (const [actor, action] of [[0, 'forest'], [1, 'clay-pit'], [0, 'reed-bank'], [1, 'grain-seeds']] as const) {
    response = session.takeAction(actor, action)
    expect(response.ok, response.error).toBe(true)
    if (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'confirm-next-player') {
      response = confirmNext(session, response)
    }
  }
  expect(response.state.round).toBe(6)
  return passPreparationExchanges(session, response)
}

const nutritionOffer = (session: GameSession, initial: SessionResponse) => {
  let response = initial
  if (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'select-trigger') {
    const trigger = getChoiceOptions(response).find(option => option.sourceCard === NUTRITION || option.value === NUTRITION)
    expect(trigger, JSON.stringify(response.interaction)).toBeDefined()
    response = session.resolveChoice(response.interaction.playerIndex, trigger!.value)
    expect(response.ok, response.error).toBe(true)
  }
  const offer = getChoiceOptions(response).find(option => option.effectPreview?.kind === 'resourceExchange'
    && option.effectPreview.resourcesPaid?.horse === 1)
    ?? getChoiceOptions(response).find(option => option.labelKey === 'actions.activate-card-effect.name' && option.sourceCard === NUTRITION)
  expect(offer, JSON.stringify(response.interaction)).toBeDefined()
  return { response, offer: offer! }
}

const acceptNutrition = (session: GameSession, initial: SessionResponse) => {
  let current = initial
  if (current.interaction.stateId === 'wait' && current.interaction.request.kind === 'select-trigger') {
    const trigger = getChoiceOptions(current).find(option => option.sourceCard === NUTRITION || option.value === NUTRITION)
    expect(trigger, JSON.stringify(current.interaction)).toBeDefined()
    current = session.resolveChoice(current.interaction.playerIndex, trigger!.value)
    expect(current.ok, current.error).toBe(true)
    if (bonus(current, NUTRITION) === 2) return passPreparationExchanges(session, current)
  }
  for (let step = 0; step < 3; step++) {
    const { response, offer } = nutritionOffer(session, current)
    if (response.interaction.stateId !== 'wait') throw new Error('Expected Nutrition Expert choice')
    current = session.resolveChoice(response.interaction.playerIndex, offer.value)
    expect(current.ok, current.error).toBe(true)
    if (bonus(current, NUTRITION) === 2 || current.interaction.stateId !== 'wait' || current.interaction.sourceCard !== NUTRITION) break
  }
  return passPreparationExchanges(session, current)
}

const acceptSmallscaleFarmer = (session: GameSession, initial: SessionResponse) => {
  let response = initial
  if (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'select-trigger') {
    const source = getChoiceOptions(response).find(option => option.sourceCard === 'B118_SmallscaleFarmer' || option.value === 'B118_SmallscaleFarmer')
    expect(source, JSON.stringify(response.interaction)).toBeDefined()
    response = session.resolveChoice(response.interaction.playerIndex, source!.value)
  }
  if (response.interaction.stateId === 'wait' && response.interaction.sourceCard === 'B118_SmallscaleFarmer') {
    const activate = getChoiceOptions(response).find(option => option.labelKey === 'actions.activate-card-effect.name')
    expect(activate, JSON.stringify(response.interaction)).toBeDefined()
    response = session.resolveChoice(response.interaction.playerIndex, activate!.value)
  }
  expect(response.ok, response.error).toBe(true)
  return passPreparationExchanges(session, response)
}

const boarPasture = (player: PlayerState, count: number) => {
  const tiles = count > 2 ? [{ row: 0, col: 3 }, { row: 0, col: 4 }] : [{ row: 0, col: 3 }]
  player.pastures = [{ id: 'pigs', tiles, animalType: 'boar', animalCount: count }]
  const edges = new Set<string>()
  for (const { row, col } of tiles) {
    for (const edge of [`H-${row}-${col}`, `H-${row + 1}-${col}`, `V-${row}-${col}`, `V-${row}-${col + 1}`]) {
      if (edges.has(edge)) edges.delete(edge)
      else edges.add(edge)
    }
  }
  player.fenceSegments = [...edges].map(edge => ({ edge, type: 'fence' }))
  player.resources.boar = count
}

const storeHostedPigs = (storagePlayer: PlayerState, animalOwner: PlayerState, count: number) => {
  const previous = storagePlayer.cardStates[NIGHT_PASTURE]?.extraData?.animalCountsByZone
  storagePlayer.cardStates[NIGHT_PASTURE] = { extraData: { animalCountsByZone: {
    ...(previous && typeof previous === 'object' ? previous : {}),
    [buildHostedCardAnimalZoneId(NIGHT_PASTURE, storagePlayer.id, animalOwner.id)]: {
      animalCounts: { boar: count }, cardId: NIGHT_PASTURE,
      ownerPlayerId: storagePlayer.id, animalOwnerPlayerId: animalOwner.id,
    },
  } } }
}

const pigOwner = (configure?: (state: GameState) => void) => setup(429010, 2, state => {
  const player = state.players[0]!
  player.occupationPlayed = [PIG_OWNER]
  player.minorPlayed = [NIGHT_PASTURE]
  boarPasture(player, 2)
  storeHostedPigs(player, player, 3)
  player.resources.boar = 5
  configure?.(state)
})

describe('animal species and ownership scoring', () => {
  it('Fodder Chamber includes five legally housed horses in a Moor game', () => {
    const session = setup(429008, 2, state => {
      const player = state.players[0]!
      player.minorPlayed = ['D035_FodderChamber']
      horsePasture(player, 5)
    })
    expect(session.withCtx(() => getCardEffect('D035_FodderChamber')?.computeBonusScore?.(
      session.state, session.state.players[0]!, { categories: [] },
    ))).toBe(1)
    expect(bonus(session.getState(), 'D035_FodderChamber')).toBe(1)
    const before = JSON.stringify(session.state)
    expect(bonus(session.getState(), 'D035_FodderChamber')).toBe(1)
    expect(JSON.stringify(session.state)).toBe(before)
    expect(bonus(restore(session).getState(), 'D035_FodderChamber')).toBe(1)
  })

  it('Fodder Chamber preserves inventory previews while including horses and incomplete groups', () => {
    const session = setup(429008, 2, state => {
      state.players[0]!.minorPlayed = ['D035_FodderChamber']
      horsePasture(state.players[0]!, 4)
    })
    expect(bonus(session.getState(), 'D035_FodderChamber')).toBe(0)
    const before = JSON.stringify(session.state)
    for (const resources of [{ horse: 5 }, { sheep: 2, boar: 1, cattle: 1, horse: 1 }]) {
      const unassigned = { ...session.state.players[0]!, pastures: [], houseAnimals: {}, stableAnimals: {},
        resources: { ...emptyResources, ...resources } }
      expect(session.withCtx(() => getCardEffect('D035_FodderChamber')?.computeBonusScore?.(
        session.state, unassigned, { categories: [] },
      ))).toBe(1)
    }
    expect(JSON.stringify(session.state)).toBe(before)
  })

  it('Fodder Chamber retains the ordinary animal threshold when Moor is off', () => {
    const session = setup(429008, 2, state => {
      const player = state.players[0]!
      player.minorPlayed = ['D035_FodderChamber']
      boarPasture(player, 2)
      player.resources.sheep = 2
      player.pastures.push({ id: 'sheep', tiles: [{ row: 0, col: 4 }], animalType: 'sheep', animalCount: 2 })
      const edges = new Set([...player.fenceSegments.map(segment => segment.edge), 'H-0-4', 'H-1-4', 'V-0-4', 'V-0-5'])
      player.fenceSegments = [...edges].map(edge => ({ edge, type: 'fence' }))
    }, false)
    expect(bonus(session.getState(), 'D035_FodderChamber')).toBe(0)
  })

  it('Nutrition Expert really pays a horse, grain and vegetable at the next natural round start', () => {
    const session = nutrition()
    const entered = advanceToRoundSix(session)
    const response = acceptNutrition(session, entered)
    expect(response.interaction.stateId).toBe('idle')
    expect(response.state.roundPhase).toBe('work')
    expect(response.state.players[0]!.resources).toEqual({ ...emptyResources,
      wood: 1, reed: 1, food: 25, fuel: 20, horse: 0 })
    expect(response.state.players[1]!.resources).toEqual({ ...emptyResources,
      clay: 1, grain: 1, food: 20, fuel: 20, horse: 0 })
    expect(response.state.players[0]!.houseAnimals).toEqual({})
    expect(bonus(response, NUTRITION)).toBe(2)
    expect(response.state.events).toContainEqual(expect.objectContaining({ type: 'resource.paid', sourceCardId: NUTRITION,
      resources: { horse: 1, grain: 1, vegetable: 1 } }))
    expect(response.state.log).toContainEqual(expect.objectContaining({ key: 'log.cardTriggered',
      params: expect.objectContaining({ cardId: NUTRITION }) }))
  })

  it.each(['sheep', 'boar', 'cattle'] satisfies AnimalKey[])('Nutrition Expert preserves actual %s payments', animal => {
    const session = nutrition(undefined, animal)
    const response = acceptNutrition(session, advanceToRoundSix(session))
    expect(response.state.players[0]!.resources).toMatchObject({ [animal]: 0, grain: 0, vegetable: 0, food: 25 })
    expect(response.state.players[0]!.houseAnimals).toEqual({})
    expect(bonus(response, NUTRITION)).toBe(2)
  })

  it.each(['grain', 'vegetable', 'animal', 'card in hand'])('Nutrition Expert rejects missing %s and offers no unpaid reward', missing => {
    const session = nutrition(state => {
      const player = state.players[0]!
      if (missing === 'grain' || missing === 'vegetable') player.resources[missing] = 0
      if (missing === 'animal') { player.resources.horse = 0; player.houseAnimals = {} }
      if (missing === 'card in hand') { player.occupationPlayed = []; player.occupationHand = [NUTRITION] }
    })
    assertRejectedUnchanged(session, () => session.resolveChoice(0, 'action-activate-card-effect-0'))
    const response = advanceToRoundSix(session)
    expect(response.interaction.stateId).toBe('idle')
    expect(response.state.players[0]!.resources.food).toBe(20)
    expect(bonus(response, NUTRITION)).toBe(0)
    assertRejectedUnchanged(session, () => session.resolveChoice(0, '__forged_nutrition_exchange__'))
  })

  it('Nutrition Expert permits decline, rejects wrong actors and stale choices, and restores its payment boundary', () => {
    const declinedSession = nutrition()
    const declinedOffer = nutritionOffer(declinedSession, advanceToRoundSix(declinedSession))
    if (declinedOffer.response.interaction.stateId !== 'wait') throw new Error('Expected Nutrition Expert choice')
    const declined = passPreparationExchanges(declinedSession,
      declinedSession.resolveChoice(declinedOffer.response.interaction.playerIndex, '__skip__'))
    expect(declined.ok, declined.error).toBe(true)
    expect(declined.state.players[0]!.resources).toMatchObject({ horse: 1, grain: 1, vegetable: 1, food: 20 })
    expect(bonus(declined, NUTRITION)).toBe(0)

    const session = nutrition()
    const { response: pending, offer } = nutritionOffer(session, advanceToRoundSix(session))
    assertRejectedUnchanged(session, () => session.resolveChoice(1, offer.value))
    assertRejectedUnchanged(session, () => session.resolveChoice(0, '__forged_nutrition_exchange__'))
    const restoredPending = restore(session)
    expect(restoredPending.getState().interaction).toEqual(pending.interaction)
    for (const target of [session, restoredPending]) {
      const paid = acceptNutrition(target, target.getState())
      expect(paid.state.players[0]!.resources).toMatchObject({ horse: 0, grain: 0, vegetable: 0, food: 25 })
      expect(bonus(paid, NUTRITION)).toBe(2)
      const restoredPaid = restore(target)
      expect(restoredPaid.getState().scores).toEqual(paid.scores)
      assertRejectedUnchanged(restoredPaid, () => restoredPaid.resolveChoice(0, offer.value))
      assertRejectedUnchanged(target, () => target.undoStep())
    }
  })

  it('Nutrition Expert exposes and pays the horse branch while another animal remains available', () => {
    const session = nutrition(state => {
      const player = state.players[0]!
      player.resources.sheep = 1
      player.pastures = [{ id: 'sheep', tiles: [{ row: 0, col: 4 }], animalType: 'sheep', animalCount: 1 }]
      player.fenceSegments = ['H-0-4', 'H-1-4', 'V-0-4', 'V-0-5'].map(edge => ({ edge, type: 'fence' }))
    })
    const outer = nutritionOffer(session, advanceToRoundSix(session))
    if (outer.response.interaction.stateId !== 'wait') throw new Error('Expected activation')
    const choices = session.resolveChoice(outer.response.interaction.playerIndex, outer.offer.value)
    const horse = getChoiceOptions(choices).find(option => option.effectPreview?.kind === 'resourceExchange'
      && option.effectPreview.resourcesPaid?.horse === 1)
    expect(horse?.effectPreview).toMatchObject({ resourcesPaid: { horse: 1, grain: 1, vegetable: 1 },
      resourcesGained: { food: 5 }, bonusVp: 2 })
    if (choices.interaction.stateId !== 'wait') throw new Error('Expected animal recipe choice')
    const result = passPreparationExchanges(session, session.resolveChoice(choices.interaction.playerIndex, horse!.value))
    expect(result.ok, result.error).toBe(true)
    expect(result.state.players[0]!.resources).toMatchObject({ horse: 0, sheep: 1, grain: 0, vegetable: 0, food: 25 })
    expect(result.state.players[0]!.pastures[0]!.animalCount).toBe(1)
    expect(result.state.players[0]!.houseAnimals).toEqual({})
    expect(bonus(result, NUTRITION)).toBe(2)
  })

  it.each([true, false])('Nutrition Expert preserves payment and ordering with Small-scale Farmer, nutrition first=%s', nutritionFirst => {
    const session = nutrition(state => { state.players[0]!.occupationPlayed.push('B118_SmallscaleFarmer') })
    let response = advanceToRoundSix(session)
    expect(getChoiceOptions(response).map(option => option.sourceCard ?? option.value))
      .toEqual(expect.arrayContaining([NUTRITION, 'B118_SmallscaleFarmer']))
    if (nutritionFirst) {
      response = acceptNutrition(session, response)
      expect(bonus(response, NUTRITION)).toBe(2)
      expect(response.interaction.stateId).toBe('wait')
      const pendingPaid = restore(session)
      expect(pendingPaid.getState().interaction).toEqual(response.interaction)
      const undone = session.undoStep()
      expect(undone.ok, undone.error).toBe(true)
      expect(undone.state.players[0]!.resources).toMatchObject({ horse: 1, grain: 1, vegetable: 1, food: 20 })
      expect(bonus(undone, NUTRITION)).toBe(0)
      response = acceptNutrition(session, undone)
      response = acceptSmallscaleFarmer(session, response)
      const restoredDone = acceptSmallscaleFarmer(pendingPaid, pendingPaid.getState())
      expect(restoredDone.state.players[0]!.resources).toMatchObject({ horse: 0, grain: 0, vegetable: 0, food: 25, wood: 2 })
      expect(bonus(restoredDone, NUTRITION)).toBe(2)
    } else {
      response = acceptSmallscaleFarmer(session, response)
      response = acceptNutrition(session, response)
    }
    expect(response.interaction.stateId).toBe('idle')
    expect(response.state.players[0]!.resources).toMatchObject({ horse: 0, grain: 0, vegetable: 0, food: 25, wood: 2 })
    expect(bonus(response, NUTRITION)).toBe(2)
  })

  it('Pig Owner counts two pasture pigs and three legally held on its own Night Pasture', () => {
    const session = pigOwner()
    const entered = session.takeAction(0, 'day-laborer')
    expect(entered.ok, entered.error).toBe(true)
    expect(entered.state.players[0]!.resources.food).toBe(22)
    expect(entered.interaction.anytimeActions.map(action => action.id)).toContain(PIG_ANYTIME)
    const claimed = session.takeAnytimeAction(0, PIG_ANYTIME)
    expect(claimed.ok, claimed.error).toBe(true)
    expect(claimed.state.players[0]!.resources).toEqual(entered.state.players[0]!.resources)
    expect(claimed.state.players[0]!.cardStates[PIG_OWNER]).toMatchObject({ flagged: true, counters: { bonusVp: 3 } })
    expect(bonus(claimed, PIG_OWNER)).toBe(3)
    expect(bonus(claimed, PIG_OWNER, 1)).toBe(0)
    expect(claimed.state.log).toContainEqual(expect.objectContaining({ key: 'log.cardTriggered',
      params: expect.objectContaining({ cardId: PIG_OWNER }) }))
  })

  it.each(['four pigs', 'fifth in reserve', 'other player guest', 'Night Pasture in hand', 'Pig Owner in hand'])(
    'Pig Owner does not count invalid ownership or unplaced pigs: %s', mode => {
    const session = pigOwner(state => {
      const player = state.players[0]!
      if (mode === 'four pigs' || mode === 'fifth in reserve' || mode === 'other player guest') {
        storeHostedPigs(player, player, 2)
        player.resources.boar = mode === 'fifth in reserve' ? 5 : 4
      }
      if (mode === 'other player guest') {
        storeHostedPigs(player, state.players[1]!, 1)
        state.players[1]!.resources.boar = 1
      }
      if (mode === 'Night Pasture in hand') { player.minorPlayed = []; player.minorHand = [NIGHT_PASTURE] }
      if (mode === 'Pig Owner in hand') { player.occupationPlayed = []; player.occupationHand = [PIG_OWNER] }
    })
    const entered = session.takeAction(0, 'day-laborer')
    expect(entered.ok, entered.error).toBe(true)
    expect(entered.interaction.anytimeActions.map(action => action.id)).not.toContain(PIG_ANYTIME)
    assertRejectedUnchanged(session, () => session.takeAnytimeAction(0, PIG_ANYTIME))
    expect(bonus(entered, PIG_OWNER)).toBe(0)
    const before = JSON.stringify(session.state)
    expect(bonus(session.getState(), PIG_OWNER)).toBe(0)
    expect(JSON.stringify(session.state)).toBe(before)
    expect(bonus(restore(session).getState(), PIG_OWNER)).toBe(0)
  })

  it("Pig Owner counts its fifth pig legally hosted on the other player's Night Pasture", () => {
    const session = pigOwner(state => {
      const player = state.players[0]!
      player.minorPlayed = []
      player.cardStates = {}
      boarPasture(player, 4)
      state.players[1]!.minorPlayed = [NIGHT_PASTURE]
      storeHostedPigs(state.players[1]!, player, 1)
      player.resources.boar = 5
    })
    expect(session.withCtx(() => getPlacedAnimalsByType(session.state.players[0]!, session.state).boar)).toBe(5)
    const entered = session.takeAction(0, 'day-laborer')
    expect(entered.interaction.anytimeActions.map(action => action.id)).toContain(PIG_ANYTIME)
    const claimed = session.takeAnytimeAction(0, PIG_ANYTIME)
    expect(claimed.ok, claimed.error).toBe(true)
    expect(claimed.state.players[0]!.resources.boar).toBe(5)
    expect(bonus(claimed, PIG_OWNER)).toBe(3)
    expect(bonus(claimed, PIG_OWNER, 1)).toBe(0)
  })

  it('Pig Owner remains once-only through wrong actors, snapshot restoration, undo and a legal retry', () => {
    const session = pigOwner()
    const entered = session.takeAction(0, 'day-laborer')
    assertRejectedUnchanged(session, () => session.takeAnytimeAction(1, PIG_ANYTIME))
    const pendingRestored = restore(session)
    expect(pendingRestored.getState().interaction).toEqual(entered.interaction)
    for (const target of [session, pendingRestored]) {
      const claimed = target.takeAnytimeAction(0, PIG_ANYTIME)
      expect(claimed.ok, claimed.error).toBe(true)
      expect(bonus(claimed, PIG_OWNER)).toBe(3)
      assertRejectedUnchanged(target, () => target.takeAnytimeAction(0, PIG_ANYTIME))
      const paidRestored = restore(target)
      expect(bonus(paidRestored.getState(), PIG_OWNER)).toBe(3)
      assertRejectedUnchanged(paidRestored, () => paidRestored.takeAnytimeAction(0, PIG_ANYTIME))
      const undone = target.undoStep()
      expect(undone.ok, undone.error).toBe(true)
      expect(undone.state.players[0]!.resources).toEqual(entered.state.players[0]!.resources)
      expect(bonus(undone, PIG_OWNER)).toBe(0)
      const retried = target.takeAnytimeAction(0, PIG_ANYTIME)
      expect(retried.ok, retried.error).toBe(true)
      expect(bonus(retried, PIG_OWNER)).toBe(3)
      expect(retried.state.players[0]!.resources.boar).toBe(5)
      const undoneAction = target.undoAction()
      expect(undoneAction.ok, undoneAction.error).toBe(true)
      expect(bonus(undoneAction, PIG_OWNER)).toBe(0)
      expect(undoneAction.state.players[0]!.resources).toMatchObject({ food: 20, boar: 5 })
      expect(target.takeAction(0, 'day-laborer').ok).toBe(true)
      expect(bonus(target.takeAnytimeAction(0, PIG_ANYTIME), PIG_OWNER)).toBe(3)
    }
  })
})
