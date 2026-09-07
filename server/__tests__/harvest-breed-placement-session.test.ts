import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { markAllWorkersUsed } from '../../shared/domain/player'
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
  player.pastures = [
    { id: 'sheep', animalType: 'sheep', animalCount: sheep, size: 2, stables: 1, tiles: [{ row: 1, col: 1 }, { row: 1, col: 2 }] },
    { id: 'boar', animalType: 'boar', animalCount: 2, size: 2, stables: 0, tiles: [{ row: 2, col: 1 }, { row: 2, col: 2 }] },
  ]
  session.loadState(state)
  return session
}

const arrange = (session: GameSession, sheep: number, boar: number) => session.resolveChoice(0, 'confirm', [
  { id: 'sheep', zoneType: 'pasture', animalType: 'sheep', animalCount: sheep },
  { id: 'boar', zoneType: 'pasture', animalType: 'boar', animalCount: boar },
])

describe('harvest rewards count placed newborn animals', () => {
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
    const option = response.interaction.request.options?.find((candidate) => candidate.value !== '__skip__')
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
    const option = response.interaction.request.options?.find((candidate) => candidate.value !== '__skip__')
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
    const session = setup('E134_Omnifarmer')
    session.performRoundEnd()
    const response = arrange(session, 3, 2)
    expect(response.interaction).toMatchObject({ stateId: 'wait', promptKey: 'ui.interactionE134Prompt' })
    if (response.interaction.stateId !== 'wait') throw new Error('expected deposit choice')
    expect(response.interaction.request.options?.map((option) => option.value)).toEqual(['skip', 'sheep'])
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
