import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { markAllWorkersUsed, setWorkersAtHome } from '../../shared/domain/player'

const setup = (playerCount = 2) => {
  const session = new GameSession(56113, undefined, { playerCount })
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 14
  for (const player of state.players) {
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
    player.resources.food = 100
    setWorkersAtHome(state, player, 2)
  }
  session.loadState(state)
  expect(session.state.players).toHaveLength(playerCount)
  return session
}

const harvest = (session: GameSession, round: number) => {
  const state = session.getState().state
  state.round = round
  for (const player of state.players) markAllWorkersUsed(state, player)
  session.loadState(state)
  let response = session.performRoundEnd()
  for (let step = 0; step < 20 && response.state.round === round; step += 1) {
    expect(response.ok, response.error).toBe(true)
    const { interaction } = response
    if (interaction.stateId !== 'wait') throw new Error('harvest stopped')
    const request = interaction.request
    if (request.kind === 'feed') response = session.resolveChoice(interaction.playerIndex, 'confirm', { selections: [] })
    else if (request.kind === 'confirm-player-switch') response = session.resolveChoice(request.fromPlayerIndex, 'confirm')
    else if (request.kind === 'confirm-next-player') response = session.resolveChoice(request.nextPlayerIndex, 'confirm')
    else if (request.kind === 'choice' && request.options.some((option) => option.value === '__skip__')) response = session.resolveChoice(interaction.playerIndex, '__skip__')
    else throw new Error(`unexpected harvest interaction ${request.kind}`)
  }
  expect(response.ok, response.error).toBe(true)
  expect(response.state.round).toBe(round + 1)
  expect(response.state.log.some((entry) => entry.key === 'log.harvestPhaseReap')).toBe(true)
  return response
}

describe('OA-only base card printed-rule audit', () => {
  it.each([[2, 'lessons'], [3, 'lessons-3'], [4, 'lessons-4'], [5, 'lessons-56-variable'], [6, 'lessons-56-2f']] as const)(
    'A113 inserts vegetables through a real occupation action in a %i-player game on %s', (players, space) => {
      const session = setup(players)
      session.state.players[0]!.occupationHand = ['A113_HeresyTeacher']
      session.state.players[0]!.fields = [
        { row: 0, col: 0, stacks: [{ kind: 'grain', remaining: 3 }] },
        { row: 0, col: 1, stacks: [{ kind: 'grain', remaining: 2 }] },
        { row: 0, col: 2, stacks: [{ kind: 'vegetable', remaining: 1 }, { kind: 'grain', remaining: 4 }] },
      ]
      const response = session.takeAction(0, space)
      expect(response.ok, response.error).toBe(true)
      expect(response.state.players[0]!.occupationPlayed).toContain('A113_HeresyTeacher')
      expect(response.state.players[0]!.fields.map((field) => field.stacks)).toEqual([
        [{ kind: 'vegetable', remaining: 1 }, { kind: 'grain', remaining: 3 }],
        [{ kind: 'grain', remaining: 2 }],
        [{ kind: 'vegetable', remaining: 1 }, { kind: 'grain', remaining: 4 }],
      ])
      expect(response.state.players[0]!.resources.vegetable).toBe(0)
      expect(response.state.actionSpaces.find((entry) => entry.id === space)!.takenBy).toHaveLength(1)
    },
  )

  it.each([[0, 'forest'], [1, 'lessons']] as const)('A113 ignores player %i using %s', (actor, space) => {
    const session = setup()
    session.state.currentPlayerIndex = actor
    session.state.players[0]!.occupationPlayed = ['A113_HeresyTeacher']
    session.state.players[actor]!.occupationHand = ['A100_Curator']
    session.state.players[0]!.fields = [{ row: 0, col: 0, stacks: [{ kind: 'grain', remaining: 3 }] }]
    const response = session.takeAction(actor, space)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.fields[0]!.stacks).toEqual([{ kind: 'grain', remaining: 3 }])
  })

  it('A113 harvests the grain before the buried vegetable through four real harvests', () => {
    const session = setup()
    session.state.players[0]!.occupationHand = ['A113_HeresyTeacher']
    session.state.players[0]!.fields = [{ row: 0, col: 0, stacks: [{ kind: 'grain', remaining: 3 }] }]
    expect(session.takeAction(0, 'lessons').ok).toBe(true)
    for (const [index, round] of [4, 7, 9, 11].entries()) {
      const response = harvest(session, round)
      expect(response.state.players[0]!.resources).toMatchObject({ grain: Math.min(index + 1, 3), vegetable: index === 3 ? 1 : 0 })
    }
    expect(session.state.players[0]!.fields[0]!.stacks).toEqual([])
  })

  it('A113 currently excludes a card field holding three grain from its Lessons reward', () => {
    const session = setup()
    const player = session.state.players[0]!
    player.occupationPlayed = ['A113_HeresyTeacher']
    player.occupationHand = ['A100_Curator']
    player.minorPlayed = ['D025_WitchesDanceFloor']
    player.cardStates.D025_WitchesDanceFloor = { extraData: { cardFieldStacks: [{ crop: 'grain', remaining: 3 }] } }
    session.loadState(session.state)
    const response = session.takeAction(0, 'lessons')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain('A100_Curator')
    expect(response.state.players[0]!.cardStates.D025_WitchesDanceFloor?.extraData?.cardFieldStacks).toEqual([{ crop: 'grain', remaining: 3 }])
  })

  it('D159 currently plays as an occupation without providing its printed anytime reed sale', () => {
    const session = setup(4)
    session.state.players[0]!.occupationHand = ['D159_ReedSeller']
    session.state.players[0]!.resources.reed = 1
    const played = session.takeAction(0, 'lessons')
    expect(played.ok, played.error).toBe(true)
    expect(played.state.players[0]!.occupationPlayed).toContain('D159_ReedSeller')
    const response = session.takeAnytimeAction(0, 'exchange')
    expect(response.ok).toBe(false)
    expect(response.error).toBe('anytime action unavailable')
    expect(response.interaction.anytimeActions.some((action) => action.sourceCard === 'D159_ReedSeller')).toBe(false)
    expect(response.state.players[0]!.resources).toMatchObject({ reed: 1, food: 100 })
  })

  it.each(['grain', 'vegetable'] as const)('D025 is played as a minor then sows and harvests %s through public commands', (crop) => {
    const session = setup()
    session.state.players[0]!.minorHand = ['D025_WitchesDanceFloor']
    session.state.players[0]!.resources[crop] = 1
    let response = session.takeAction(0, 'meeting-place')
    expect(response.ok, response.error).toBe(true)
    if (!response.state.players[0]!.minorPlayed.includes('D025_WitchesDanceFloor')) {
      const play = response.interaction.request.options.find((option) => option.value !== '__skip__')!
      expect(play).toBeDefined()
      response = session.resolveChoice(0, play.value)
    }
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain('D025_WitchesDanceFloor')
    const state = response.state
    state.currentPlayerIndex = 0
    setWorkersAtHome(state, state.players[0]!, 2)
    session.loadState(state)
    response = session.takeAction(0, 'grain-utilization')
    expect(response.ok, response.error).toBe(true)
    if (response.interaction.request.kind === 'choice') {
      const sow = response.interaction.request.options.find((option) => option.value.includes('sow'))!
      expect(sow).toBeDefined()
      response = session.resolveChoice(0, sow.value)
    }
    expect(response.interaction.request.farm?.farmType).toBe('sow')
    response = session.commitSelectionChoice(0, { crops: [{ row: -1, col: 4025, crop }] })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources[crop]).toBe(0)
    expect(response.state.players[0]!.cardStates.D025_WitchesDanceFloor?.extraData?.cardFieldStacks).toEqual([{ crop, remaining: crop === 'grain' ? 3 : 2 }])
    response = harvest(session, 4)
    expect(response.state.players[0]!.resources[crop]).toBe(1)
    expect(response.state.players[0]!.fields).toHaveLength(0)
    expect(response.scores[0]!.categories.find((category) => category.key === 'fields')?.quantity).toBe(0)
  })
})
