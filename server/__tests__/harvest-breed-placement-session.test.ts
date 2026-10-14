import { afterEach, describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import type { PlayerState } from '../../shared/contract/types'
import { markAllWorkersUsed } from '../../shared/domain/player'
import { createWorkSession } from './_helpers/session-fixtures'
import { descriptionEffects } from './_helpers/choice-description'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

const setup = (cardId: string, sheep = 2) => {
  const session = new GameSession(829, undefined, { playerCount: cardId === 'E134_Omnifarmer' ? 3 : 2 })
  const state = session.getState().state
  stabilizeRandomHands(state.players)
  state.round = 4
  for (const player of state.players) {
    markAllWorkersUsed(state, player)
    player.resources.food = 20
  }
  const player = state.players[0]!
  if (cardId === 'C071_Slurry') player.minorPlayed = [cardId]
  else player.occupationPlayed = [cardId]
  Object.assign(player.resources, { sheep, boar: 2, grain: 2 })
  player.fields = [{ row: 0, col: 1, stacks: [] }, { row: 0, col: 2, stacks: [] }]
  preparePastures(player, sheep)
  session.loadState(state)
  omnifarmerSessions.push(session)
  return session
}

function preparePastures(player: PlayerState, sheep: number) {
  player.pastures = [
    { id: 'sheep', animalType: 'sheep', animalCount: sheep, tiles: [{ row: 1, col: 1 }, { row: 1, col: 2 }] },
    { id: 'boar', animalType: 'boar', animalCount: 2, tiles: [{ row: 2, col: 1 }, { row: 2, col: 2 }] },
  ]
  player.stableTiles = [{ row: 1, col: 1 }]
  player.fenceSegments = ['H-1-1', 'H-1-2', 'H-2-1', 'H-2-2', 'H-3-1', 'H-3-2', 'V-1-1', 'V-1-3', 'V-2-1', 'V-2-3'].map(edge => ({
    edge, type: 'fence', source: { kind: 'own', ownerPlayerId: player.id },
  }))
}

function choices(response: SessionResponse) {
  if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'choice') throw new Error('Expected a choice')
  return response.interaction.request.options
}

const omnifarmerSessions: GameSession[] = []
afterEach(() => omnifarmerSessions.splice(0).forEach(session => session.dispose()))
const setupOmnifarmer = () => {
  const session = createWorkSession({ seed: 829, options: { playerCount: 3 }, configure: state => {
    state.round = 4
    for (const player of state.players) {
      markAllWorkersUsed(state, player)
      player.resources.food = 20
    }
    const player = state.players[0]!
    player.occupationPlayed = ['E134_Omnifarmer']
    Object.assign(player.resources, { sheep: 2, boar: 2 })
    preparePastures(player, 2)
  } })
  omnifarmerSessions.push(session)
  return session
}

const arrange = (session: GameSession, sheep: number, boar: number) => session.resolveChoice(0, 'confirm', { zones: [
  { id: 'sheep', zoneType: 'pasture', animalType: 'sheep', animalCount: sheep },
  { id: 'boar', zoneType: 'pasture', animalType: 'boar', animalCount: boar },
] })

const startBreedingWithExchanges = (withPeatBoat = false) => {
  const session = setup('D115_FodderPlanter')
  const state = session.getState().state
  state.players[0]!.improvements = ['Major_Fireplace1']
  if (withPeatBoat) {
    state.enableFarmersOfTheMoor = true
    state.players[0]!.minorPlayed = ['M081_PeatBoat']
    for (const player of state.players) player.resources.fuel = 20
  }
  session.loadState(state)
  let response = session.performRoundEnd()
  for (let i = 0; i < 10 && response.interaction.stateId === 'wait' && response.interaction.request.kind !== 'animal-reorg'; i++) {
    response = response.interaction.request.kind === 'feed'
      ? session.resolveChoice(response.interaction.playerIndex, 'confirm', { selections: [] })
      : response.interaction.request.kind === 'heating'
        ? session.resolveChoice(response.interaction.playerIndex, 'confirm', { fuelUsed: response.interaction.request.required })
        : session.resolveChoice(response.interaction.playerIndex, '__skip__')
    expect(response.ok, response.error).toBe(true)
  }
  expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'animal-reorg' } })
  return session
}

describe('harvest rewards count placed newborn animals', () => {
  it('forbids cooking a parent and keeps the placed newborn eligible', () => {
    const session = startBreedingWithExchanges()
    const rejected = session.takeAnytimeAction(0, 'exchange')
    expect(rejected.ok).toBe(false)
    expect(rejected.state.players[0]!.resources.sheep).toBe(3)
    const response = arrange(session, 3, 2)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.harvestBreedSummary?.[response.state.players[0]!.id]).toEqual({ resources: { sheep: 1 }, animalTypes: 1, animalCount: 1 })
    expect(response.interaction).toMatchObject({ stateId: 'wait', promptKey: 'ui.interactionFodderPlanterSow' })
  })

  it.each([
    { kept: 3, eligible: false },
    { kept: 4, eligible: true },
    { kept: 1, eligible: false },
  ])('keeps gained sheep separate from newborns: $kept kept', ({ kept, eligible }) => {
    const session = startBreedingWithExchanges(true)
    let response = session.takeAnytimeAction(0, 'exchange')
    expect(response.ok, response.error).toBe(true)
    if (response.interaction.stateId !== 'wait') throw new Error('expected exchange')
    const gain = choices(response).find((option) =>
      option.sourceCard === 'M081_PeatBoat' && option.effectPreview?.kind === 'resourceExchange'
      && (option.effectPreview.resourcesGained?.sheep ?? 0) > 0,
    )
    expect(gain).toBeDefined()
    response = session.resolveChoice(0, `bulk:${gain!.value.split(':')[1]}=1`)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.sheep).toBe(4)
    response = arrange(session, kept, 2)
    expect(response.ok, response.error).toBe(true)
    if (eligible) {
      expect(response.interaction).toMatchObject({ stateId: 'wait', promptKey: 'ui.interactionFodderPlanterSow' })
      expect(response.state.harvestBreedSummary?.[response.state.players[0]!.id].resources).toEqual({ sheep: 1 })
    } else {
      expect(response.state.round).toBe(5)
      expect(response.interaction.stateId).toBe('idle')
    }
  })

  it.each(['C071_Slurry', 'D115_FodderPlanter', 'E090_DungCollector', 'E134_Omnifarmer'])('%s does not trigger when all newborn animals are discarded', (cardId) => {
    const session = setup(cardId)
    expect(session.performRoundEnd().interaction).toMatchObject({ stateId: 'wait', request: { kind: 'animal-reorg' } })
    const response = arrange(session, 2, 2)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.round).toBe(5)
    expect(response.interaction.stateId).toBe('idle')
    expect(response.state.players[0]!.fields.every((field) => field.stacks.length === 0)).toBe(true)
  })

  it.each(['C071_Slurry', 'E090_DungCollector'])('%s does not trigger for only one placed newborn', (cardId) => {
    const session = setup(cardId)
    session.performRoundEnd()
    const response = arrange(session, 3, 2)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.round).toBe(5)
    expect(response.interaction.stateId).toBe('idle')
  })

  it('D115 allows only one field after the other newborn is discarded', () => {
    const session = setup('D115_FodderPlanter')
    session.performRoundEnd()
    let response = arrange(session, 3, 2)
    expect(response.interaction).toMatchObject({ stateId: 'wait', promptKey: 'ui.interactionFodderPlanterSow' })
    if (response.interaction.stateId !== 'wait') throw new Error('expected sow choice')
    const option = choices(response).find((candidate) => candidate.value !== '__skip__')
    expect(option).toBeDefined()
    response = session.resolveChoice(0, option!.value)
    expect(response.interaction).toMatchObject({ stateId: 'wait', request: { farm: { farmType: 'sow', maxSelections: 1 } } })
    response = session.commitSelectionChoice(0, { crops: [{ row: 0, col: 1, crop: 'grain' }] })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.grain).toBe(1)
    expect(response.state.players[0]!.fields[0]!.stacks).toEqual([{ kind: 'grain', remaining: 3 }])
  })

  it('E090 offers paid plowing after two newborns are placed', () => {
    const session = setup('E090_DungCollector')
    session.performRoundEnd()
    let response = arrange(session, 3, 3)
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') throw new Error('expected plow choice')
    const option = choices(response).find((candidate) => candidate.value !== '__skip__')
    expect(option).toBeDefined()
    const food = response.state.players[0]!.resources.food
    response = session.resolveChoice(0, option!.value)
    expect(response.interaction).toMatchObject({ stateId: 'wait', request: { farm: { farmType: 'plow' } } })
    expect(response.state.players[0]!.resources.food).toBe(food - 1)
    response = session.commitSelectionChoice(0, { tile: { row: 0, col: 3 } })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.fields).toHaveLength(3)
  })

  it('E134 offers only the species whose newborn was placed', () => {
    const session = setupOmnifarmer()
    expect(session.performRoundEnd().interaction).toMatchObject({ stateId: 'wait', request: { kind: 'animal-reorg' } })
    let response = arrange(session, 3, 2)
    expect(response.interaction).toMatchObject({ stateId: 'wait', promptKey: 'ui.interactionE134Prompt' })
    if (response.interaction.stateId !== 'wait') throw new Error('expected deposit choice')
    const options = choices(response)
    expect(options).toHaveLength(2)
    expect(options.map(option => option.value)).toContain('__skip__')
    const paymentOptions = options.filter(option => descriptionEffects(option.descriptionPreview).some(effect => effect.kind === 'payment'))
    expect(paymentOptions).toHaveLength(1)
    expect(descriptionEffects(paymentOptions[0]!.descriptionPreview)).toContainEqual({ kind: 'payment', resourcesPaid: { sheep: 1 } })
    response = session.resolveChoice(0, paymentOptions[0]!.value)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ sheep: 2, boar: 2 })
    expect(response.state.players[0]!.cardStates.E134_Omnifarmer?.extraData?.storedGoods).toEqual(['sheep'])
    expect(response.scores).toHaveLength(3)
  })

  it.each(['sheep', 'boar'] as const)('E134 binds multiple eligible newborns uniquely and stores only the chosen %s', species => {
    const session = setupOmnifarmer()
    expect(session.performRoundEnd().interaction).toMatchObject({ stateId: 'wait', request: { kind: 'animal-reorg' } })
    let response = arrange(session, 3, 3)
    expect(response.interaction).toMatchObject({ stateId: 'wait', promptKey: 'ui.interactionE134Prompt' })
    const options = choices(response)
    expect(options).toHaveLength(3)
    expect(new Set(options.map(option => option.value)).size).toBe(3)
    expect(options.map(option => option.value)).toContain('__skip__')
    for (const resource of ['sheep', 'boar'] as const) {
      expect(options.filter(option => descriptionEffects(option.descriptionPreview).some(effect => effect.kind === 'payment' && effect.resourcesPaid?.[resource] === 1))).toHaveLength(1)
    }
    const option = options.find(option => descriptionEffects(option.descriptionPreview).some(effect => effect.kind === 'payment' && effect.resourcesPaid?.[species] === 1))!
    response = session.resolveChoice(0, option.value)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ sheep: species === 'sheep' ? 2 : 3, boar: species === 'boar' ? 2 : 3 })
    expect(response.state.players[0]!.cardStates.E134_Omnifarmer?.extraData?.storedGoods).toEqual([species])
    expect(response.scores).toHaveLength(3)
    expect(response.scores![0]!.categories.find(category => category.key === 'cardBonusVp')?.total ?? 0).toBe(0)
    expect(response.state.round).toBe(5)
    expect(response.interaction.stateId).toBe('idle')
  })

  it('counts a placed newborn even when discarding an older animal leaves no net resource gain', () => {
    const session = setup('D115_FodderPlanter', 4)
    session.performRoundEnd()
    const response = arrange(session, 4, 2)
    expect(response.interaction).toMatchObject({ stateId: 'wait', promptKey: 'ui.interactionFodderPlanterSow' })
    expect(response.state.harvestBreedSummary?.[response.state.players[0]!.id]).toEqual({ resources: { sheep: 1 }, animalTypes: 1, animalCount: 1 })
  })

  it('uses the modified parent threshold and restores the unsettled result on undo', () => {
    const session = setup('D115_FodderPlanter', 1)
    const state = session.getState().state
    state.players[0]!.minorPlayed = ['E084_DollysMother']
    session.loadState(state)
    const pending = session.performRoundEnd()
    const summary = structuredClone(pending.state.harvestBreedSummary)
    let response = arrange(session, 2, 2)
    expect(response.state.harvestBreedSummary?.[response.state.players[0]!.id]).toEqual({ resources: { sheep: 1 }, animalTypes: 1, animalCount: 1 })
    response = session.undoStep()
    expect(response.ok, response.error).toBe(true)
    expect(response.state.harvestBreedSummary).toEqual(summary)
    expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'animal-reorg' } })
    response = arrange(session, 1, 2)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.harvestBreedSummary?.[response.state.players[0]!.id]).toEqual({ resources: {}, animalTypes: 0, animalCount: 0 })
  })
})
