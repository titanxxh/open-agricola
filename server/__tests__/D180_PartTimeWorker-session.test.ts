import assert from 'node:assert/strict'
import { afterEach, describe, expect, it } from 'vitest'
import type { GameSession, SessionResponse } from '../game/authoritative-session'
import type { ActionChoiceOption, GameState, Resource } from '../../shared/contract/types'
import { createWorkSession } from './_helpers/session-fixtures'
import { confirmPlayerSwitch } from './_helpers/pending-confirms'

const CARD_ID = 'D180_PartTimeWorker'
const sessions: GameSession[] = []
afterEach(() => sessions.splice(0).forEach(session => session.dispose()))

// Five players satisfy D180's printed 5+ requirement. Fresh round-1 work game,
// placeholder hands, P0 to act, no goods or animals in P0's supply.
function setup(forest: Partial<Resource>, configure?: (state: GameState) => void) {
  const session = createWorkSession({ options: { playerCount: 5 }, configure: state => {
    state.currentPlayerIndex = 0
    const player = state.players[0]!
    player.occupationPlayed = [CARD_ID]
    Object.assign(player.resources, { wood: 0, clay: 0, stone: 0, food: 0, sheep: 0, boar: 0, cattle: 0 })
    const space = state.actionSpaces.find(candidate => candidate.id === 'forest')!
    space.resources = { ...space.resources, wood: 0, ...forest }
    configure?.(state)
  } })
  sessions.push(session)
  return session
}

const options = (response: SessionResponse): ActionChoiceOption[] =>
  response.interaction.stateId === 'wait' ? response.interaction.request.options ?? [] : []

const spaceResources = (response: SessionResponse, spaceId: string) =>
  response.state.actionSpaces.find(space => space.id === spaceId)!.resources

/** Keeps the proposed housing when the new animal opens a reorganization. */
const settleAnimals = (session: GameSession, response: SessionResponse) => {
  if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'animal-reorg') return response
  const zones = response.interaction.request.zones.map(({ id, zoneType, animalType, animalCount }) =>
    ({ id, zoneType, animalType, animalCount }))
  const next = session.resolveChoice(response.interaction.playerIndex, 'confirm', zones as unknown as Record<string, unknown>)
  assert.equal(next.ok, true, next.error)
  return next
}

const choose = (session: GameSession, response: SessionResponse, option: ActionChoiceOption | undefined) => {
  assert.ok(option, JSON.stringify(response.interaction))
  const next = session.resolveChoice(response.interaction.playerIndex, option.value)
  assert.equal(next.ok, true, next.error)
  return settleAnimals(session, next)
}

const chooseCard = (session: GameSession, response: SessionResponse) =>
  choose(session, response, options(response).find(option => option.sourceCard === CARD_ID))

const chooseOriginal = (session: GameSession, response: SessionResponse) =>
  choose(session, response, options(response).find(option => option.sourceCard !== CARD_ID && !option.value.startsWith('__')))

const isWait = (response: SessionResponse, kind: string) =>
  response.interaction.stateId === 'wait' && response.interaction.request.kind === kind

/** Take a card's offer through an optional select-trigger and its own optional prompt. */
const acceptCard = (session: GameSession, response: SessionResponse, cardId: string) => {
  for (let step = 0; step < 3; step += 1) {
    const option = options(response).find(candidate => candidate.sourceCard === cardId && !candidate.value.startsWith('__'))
      ?? options(response).find(candidate => candidate.value === cardId)
    if (!option) return response
    response = choose(session, response, option)
  }
  return response
}

const collectEvents = (response: SessionResponse, spaceId = 'forest') => response.state.events.filter(event =>
  event.type === 'resource.moved' && event.reason === 'collect'
  && event.from.kind === 'actionSpace' && event.from.spaceId === spaceId)

describe('D180 Part-Time Worker session', () => {
  it.each([[2, 'sheep'], [4, 'boar'], [6, 'cattle']] as const)(
    'decides before taking: %i wood leave half on Forest and give 1 %s',
    (total, animal) => {
      const session = setup({ wood: total })

      let response = session.takeAction(0, 'forest')
      expect(response.ok, response.error).toBe(true)
      expect(options(response).some(option => option.sourceCard === CARD_ID)).toBe(true)
      expect(spaceResources(response, 'forest').wood).toBe(total)
      expect(response.state.players[0]!.resources.wood).toBe(0)

      response = chooseCard(session, response)

      const player = response.state.players[0]!
      expect(player.resources.wood).toBe(total / 2)
      expect(player.resources[animal]).toBe(1)
      expect(spaceResources(response, 'forest').wood).toBe(total / 2)
      expect(collectEvents(response)).toEqual([
        expect.objectContaining({ resources: { wood: total / 2 }, to: { kind: 'player', playerId: player.id } }),
      ])
      expect(response.state.events.some(event => event.type === 'resource.moved' && event.reason === 'return')).toBe(false)
    },
  )

  it('keeps the original collect when the owner declines', () => {
    const session = setup({ wood: 2 })

    const response = chooseOriginal(session, session.takeAction(0, 'forest'))

    expect(response.state.players[0]!.resources).toMatchObject({ wood: 2, sheep: 0, boar: 0, cattle: 0 })
    expect(spaceResources(response, 'forest').wood).toBe(0)
    expect(collectEvents(response)).toEqual([expect.objectContaining({ resources: { wood: 2 } })])
  })

  it('undo restores the goods and offers the same choice again', () => {
    const session = setup({ wood: 6 })
    const first = chooseCard(session, session.takeAction(0, 'forest'))
    expect(first.state.players[0]!.resources).toMatchObject({ wood: 3, cattle: 1 })

    const undone = session.undoAction()
    expect(undone.ok, undone.error).toBe(true)
    expect(undone.state.players[0]!.resources).toMatchObject({ wood: 0, cattle: 0 })
    expect(spaceResources(undone, 'forest').wood).toBe(6)

    const retried = chooseCard(session, session.takeAction(0, 'forest'))
    expect(retried.state.players[0]!.resources).toMatchObject({ wood: 3, cattle: 1 })
    expect(spaceResources(retried, 'forest').wood).toBe(3)
  })

  it('offers every way to leave mixed goods and takes only the rest', () => {
    const session = setup({ wood: 2, clay: 2 })

    let response = chooseCard(session, session.takeAction(0, 'forest'))
    const takes = options(response).map(option => (option.descriptionPreview?.kind === 'group'
      ? option.descriptionPreview.parts.flatMap(part => part.kind === 'action' && part.effectPreview?.kind === 'resourceExchange'
        ? [part.effectPreview.resourcesGained] : [])
      : []))
    expect(takes).toEqual([
      [{ wood: 2 }, { boar: 1 }],
      [{ wood: 1 }, { clay: 1 }, { boar: 1 }],
      [{ clay: 2 }, { boar: 1 }],
    ])
    expect(spaceResources(response, 'forest')).toMatchObject({ wood: 2, clay: 2 })

    response = choose(session, response, options(response)[1])

    expect(response.state.players[0]!.resources).toMatchObject({ wood: 1, clay: 1, boar: 1 })
    expect(spaceResources(response, 'forest')).toMatchObject({ wood: 1, clay: 1 })
  })

  it('left goods do not count for take-at-least-N cards; taking everything still does', () => {
    const configure = (state: GameState) => {
      const [owner, opponent] = state.players
      owner!.occupationPlayed = [CARD_ID, 'D140_Loudmouth']
      owner!.resources.food = 2
      opponent!.occupationPlayed = ['D169_Plowsmith', 'B138_ForestGuardian']
      opponent!.resources.food = 1
    }

    const leave = setup({ wood: 6 }, configure)
    const left = chooseCard(leave, leave.takeAction(0, 'forest'))
    expect(left.state.players[0]!.resources).toMatchObject({ wood: 3, cattle: 1, food: 2 })
    expect(left.state.players[1]!.resources.food).toBe(1)
    expect(spaceResources(left, 'forest').wood).toBe(3)
    expect(isWait(left, 'confirm-player-switch')).toBe(false)
    expect(left.state.events.filter(event => event.type === 'card.triggered').map(event => event.cardId))
      .not.toEqual(expect.arrayContaining([expect.stringMatching(/D140|D169|B138/)]))

    const take = setup({ wood: 6 }, configure)
    let taken = chooseOriginal(take, take.takeAction(0, 'forest'))
    for (let step = 0; step < 4 && isWait(taken, 'confirm-player-switch'); step += 1) taken = confirmPlayerSwitch(take)
    taken = acceptCard(take, taken, 'D140_Loudmouth')
    for (let step = 0; step < 4 && isWait(taken, 'confirm-player-switch'); step += 1) taken = confirmPlayerSwitch(take)
    expect(taken.state.players[0]!.resources).toMatchObject({ wood: 6, cattle: 0, food: 2 })
    expect(taken.state.players[1]!.resources.food).toBe(2)
    expect(taken.interaction.playerIndex).toBe(1)
    expect(options(taken).some(option => option.sourceCard === 'D169_Plowsmith')).toBe(true)
  }, 30_000)

  it.each([[6, 3, 1], [4, 2, 0]] as const)(
    'take-at-least-N cards count the goods actually taken (%i stone, take %i)',
    (onSpace, taken, corfStone) => {
      const session = setup({}, state => {
        state.round = 3
        state.roundActionOrder = state.roundActionOrder.map(() => null)
        state.roundActionOrder[0] = 'western-quarry'
        state.players[0]!.minorPlayed = ['B079_Corf']
        state.actionSpaces.find(space => space.id === 'western-quarry')!.resources.stone = onSpace
      })

      const response = chooseCard(session, session.takeAction(0, 'western-quarry'))

      expect(collectEvents(response, 'western-quarry')).toEqual([expect.objectContaining({ resources: { stone: taken } })])
      expect(response.state.players[0]!.resources.stone).toBe(taken + corfStone)
      expect(spaceResources(response, 'western-quarry').stone).toBe(onSpace - taken)
    },
  )

  it('does not offer the card for other totals, non-accumulation spaces or a card partial take', () => {
    const three = setup({ wood: 3 })
    const collected = three.takeAction(0, 'forest')
    expect(options(collected).some(option => option.sourceCard === CARD_ID)).toBe(false)
    expect(collected.state.players[0]!.resources.wood).toBe(3)

    const partial = setup({ wood: 4 }, state => { state.players[0]!.minorPlayed = ['A082_WorkCertificate'] })
    let response = partial.takeAction(0, 'day-laborer')
    expect(options(response).some(option => option.sourceCard === CARD_ID)).toBe(false)
    for (let step = 0; step < 3; step += 1) {
      const take = options(response).find(option => option.labelKey === 'ui.interactionTakeFromSpace'
        && option.labelParams?.spaceId === 'forest' && option.labelParams?.resource === 'wood')
      response = choose(partial, response, take ?? options(response).find(option => option.sourceCard === 'A082_WorkCertificate'))
      if (take) break
    }
    expect(options(response).some(option => option.sourceCard === CARD_ID)).toBe(false)
    expect(response.state.players[0]!.resources.wood).toBe(1)
    expect(spaceResources(response, 'forest').wood).toBe(3)
  })

  it('offers the card at the collect of a space reached through a card placement', () => {
    const session = setup({}, state => {
      state.round = 3
      state.roundActionOrder = state.roundActionOrder.map(() => null)
      state.roundActionOrder[0] = 'western-quarry'
      state.roundActionOrder[1] = 'eastern-quarry'
      const player = state.players[0]!
      player.occupationPlayed = ['A171_Sidekick', CARD_ID]
      player.resources.food = 2
      state.actionSpaces.find(space => space.id === 'western-quarry')!.resources.stone = 2
      state.actionSpaces.find(space => space.id === 'eastern-quarry')!.resources.stone = 1
    })

    let response = acceptCard(session, session.takeAction(0, 'eastern-quarry'), 'A171_Sidekick')
    expect(spaceResources(response, 'western-quarry').stone).toBe(2)
    response = chooseCard(session, response)

    expect(response.state.players[0]!.resources).toMatchObject({ stone: 2, sheep: 1, food: 1 })
    expect(spaceResources(response, 'western-quarry').stone).toBe(1)
    expect(spaceResources(response, 'eastern-quarry').stone).toBe(0)
    expect(collectEvents(response, 'western-quarry')).toEqual([expect.objectContaining({ resources: { stone: 1 } })])
  })

  it('leaves the taken goods available to immediate return-to-space cards', () => {
    const session = setup({ wood: 6 }, state => {
      const player = state.players[0]!
      player.occupationPlayed = ['A108_MushroomCollector', CARD_ID]
      player.minorPlayed = ['A056_Basket']
    })

    let response = chooseCard(session, session.takeAction(0, 'forest'))
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 3, cattle: 1 })
    response = acceptCard(session, response, 'A108_MushroomCollector')
    response = acceptCard(session, response, 'A056_Basket')

    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, food: 5, cattle: 1 })
    expect(spaceResources(response, 'forest').wood).toBe(6)
  })
})
