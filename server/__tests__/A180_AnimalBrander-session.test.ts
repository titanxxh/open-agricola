import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'

const CARD_ID = 'A180_AnimalBrander'

const setup = (food = 3) => {
  const session = new GameSession(42, undefined, { playerCount: 5 })
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.players.forEach((player) => {
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
  })
  state.players[0]!.occupationPlayed = [CARD_ID]
  state.players[0]!.resources.food = food
  state.players[0]!.pastures = [{
    id: 'p1',
    size: 1,
    tiles: [{ row: 2, col: 2 }],
    stables: 0,
    animalType: null,
    animalCount: 0,
  }]
  session.loadState(state)
  return session
}

const findOption = (
  resp: ReturnType<GameSession['takeAction']>,
  predicate: (option: { value: string; labelKey: string; sourceCard?: string; effectPreview?: unknown; descriptionPreview?: unknown }) => boolean,
) => {
  if (resp.interaction.stateId !== 'wait') return undefined
  return resp.interaction.request.options?.find(predicate)
}

const resolveAnimalReorgs = (
  session: GameSession,
  resp: ReturnType<GameSession['resolveChoice']>,
  animal: 'sheep' | 'boar' | 'cattle',
) => {
  let current = resp
  let count = current.state.players[0]!.resources[animal]
  while (current.interaction.stateId === 'wait' && current.interaction.request.kind === 'animal-reorg') {
    current = session.resolveChoice(0, 'confirm', {
      zones: [{ id: 'p1', zoneType: 'pasture', animalType: animal, animalCount: count }],
    })
    count = current.state.players[0]!.resources[animal]
  }
  return current
}

describe('A180 Animal Brander', () => {
  it('repeats only the selected boar option once for one food', () => {
    const session = setup(1)
    let response = session.takeAction(0, 'animal-market-56')
    const boar = findOption(response, (option) => option.labelKey === 'actions.animal-market-56.option-boar')!
    response = resolveAnimalReorgs(session, session.resolveChoice(0, boar.value), 'boar')
    const doubled = findOption(response, (option) => option.sourceCard === CARD_ID)!
    expect(doubled).toBeDefined()
    response = resolveAnimalReorgs(session, session.resolveChoice(0, doubled.value), 'boar')
    expect(response.ok).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 0, boar: 2, sheep: 0, cattle: 0 })
    expect(findOption(response, (option) => option.sourceCard === CARD_ID)).toBeUndefined()
  })

  it('offers a paid doubled Animal Market sheep branch while preserving the original action', () => {
    const session = setup()

    let resp = session.takeAction(0, 'animal-market-56')

    const sheep = findOption(resp, (option) => option.labelKey === 'actions.animal-market-56.option-sheep')
    expect(sheep).toBeDefined()

    resp = session.resolveChoice(0, sheep!.value)
    expect(resp.state.players[0]!.resources.sheep).toBe(1)
    expect(resp.state.players[0]!.resources.food).toBe(4)
    resp = resolveAnimalReorgs(session, resp, 'sheep')

    const doubled = findOption(resp, (option) => option.sourceCard === CARD_ID)
    expect(doubled).toBeDefined()

    resp = resolveAnimalReorgs(session, session.resolveChoice(0, doubled!.value), 'sheep')

    expect(resp.state.players[0]!.resources.sheep).toBe(2)
    expect(resp.state.players[0]!.resources.food).toBe(4)
  })

  it('duplicates the cattle branch including both original cattle payments', () => {
    const session = setup(3)

    let resp = session.takeAction(0, 'animal-market-56')
    const cattle = findOption(resp, (option) => option.labelKey === 'actions.animal-market-56.option-cattle')
    expect(cattle).toBeDefined()

    resp = session.resolveChoice(0, cattle!.value)
    expect(resp.state.players[0]!.resources.cattle).toBe(1)
    expect(resp.state.players[0]!.resources.food).toBe(2)
    resp = resolveAnimalReorgs(session, resp, 'cattle')
    const doubled = findOption(resp, (option) => option.sourceCard === CARD_ID)
    expect(doubled).toBeDefined()

    resp = resolveAnimalReorgs(session, session.resolveChoice(0, doubled!.value), 'cattle')

    expect(resp.state.players[0]!.resources.cattle).toBe(2)
    expect(resp.state.players[0]!.resources.food).toBe(0)
  })

  it('does not offer the doubled sheep branch when the player starts Animal Market with no food', () => {
    const session = setup(0)

    let resp = session.takeAction(0, 'animal-market-56')
    const sheep = findOption(resp, (option) => option.labelKey === 'actions.animal-market-56.option-sheep')
    expect(sheep).toBeDefined()

    resp = session.resolveChoice(0, sheep!.value)
    expect(resp.state.players[0]!.resources.sheep).toBe(1)
    expect(resp.state.players[0]!.resources.food).toBe(1)
    resp = resolveAnimalReorgs(session, resp, 'sheep')

    expect(findOption(resp, (option) => option.sourceCard === CARD_ID)).toBeUndefined()
  })

  it('preserves the original cattle branch when declining Animal Brander', () => {
    const session = setup(3)

    let resp = session.takeAction(0, 'animal-market-56')
    const cattle = findOption(resp, (option) => option.labelKey === 'actions.animal-market-56.option-cattle')
    expect(cattle).toBeDefined()

    resp = session.resolveChoice(0, cattle!.value)
    expect(resp.state.players[0]!.resources.cattle).toBe(1)
    expect(resp.state.players[0]!.resources.food).toBe(2)
    resp = resolveAnimalReorgs(session, resp, 'cattle')
    expect(findOption(resp, (option) => option.sourceCard === CARD_ID)).toBeDefined()

    resp = session.resolveChoice(0, '__skip__')

    expect(resp.state.players[0]!.resources.cattle).toBe(1)
    expect(resp.state.players[0]!.resources.food).toBe(2)
  })

  it('does not offer the doubled cattle branch unless the player can pay all 3 food', () => {
    const session = setup(2)

    let resp = session.takeAction(0, 'animal-market-56')
    const cattle = findOption(resp, (option) => option.labelKey === 'actions.animal-market-56.option-cattle')
    expect(cattle).toBeDefined()

    resp = session.resolveChoice(0, cattle!.value)
    expect(resp.state.players[0]!.resources.cattle).toBe(1)
    expect(resp.state.players[0]!.resources.food).toBe(1)
    resp = resolveAnimalReorgs(session, resp, 'cattle')

    expect(findOption(resp, (option) => option.sourceCard === CARD_ID)).toBeUndefined()
  })
})
