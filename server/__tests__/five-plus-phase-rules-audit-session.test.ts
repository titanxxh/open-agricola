import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { markAllWorkersUsed } from '../../shared/domain/player'

const setup = (cardId: string, round = 2) => {
  const session = new GameSession(5610, undefined, { playerCount: 6 })
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = round
  for (const player of state.players) {
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
    player.resources.food = 20
    markAllWorkersUsed(state, player)
  }
  state.players[0]!.occupationPlayed = [cardId]
  session.loadState(state)
  expect(session.getState().state.players).toHaveLength(6)
  return session
}

const finishConfirms = (session: GameSession, response: ReturnType<GameSession['getState']>) => {
  for (let i = 0; i < 12 && response.interaction.stateId === 'wait'; i += 1) {
    const request = response.interaction.request
    if (request.kind === 'confirm-player-switch') {
      response = session.resolveChoice(request.fromPlayerIndex, 'confirm')
    } else if (request.kind === 'confirm-next-player') {
      response = session.resolveChoice(request.nextPlayerIndex, 'confirm')
    } else break
    expect(response.ok).toBe(true)
  }
  return response
}

const occupy = (session: GameSession, spaceId: string, playerIndex: number) => {
  const player = session.state.players[playerIndex]!
  session.state.actionSpaces.find((space) => space.id === spaceId)!.takenBy = [{ playerId: player.id, workerId: player.workers[0]!.id }]
}

describe('Five-plus phase printed-rule audit', () => {
  it.each(['grain', 'food'] as const)('A172 Boat Painter grants the chosen %s before occupied workers return', (reward) => {
    const session = setup('A172_BoatPainter')
    occupy(session, 'fishing', 1)
    occupy(session, 'traveling-players-56', 2)
    let response = finishConfirms(session, session.performRoundEnd())
    expect(response.ok).toBe(true)
    expect(response.interaction.stateId).toBe('wait')
    expect(response.interaction.sourceCard).toBe('A172_BoatPainter')
    const option = response.interaction.request.options.find((entry) =>
      JSON.stringify(entry.effectPreview ?? {}).includes(`"${reward}":`))
    expect(option).toBeDefined()
    response = session.resolveChoice(0, option!.value)
    expect(response.ok).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ grain: reward === 'grain' ? 1 : 0, food: reward === 'food' ? 22 : 20 })
    expect(response.state.log.some((entry) => JSON.stringify(entry.params ?? {}).includes('A172_BoatPainter'))).toBe(true)
  })

  it('A172 Boat Painter does not count linked-blocked Traveling Players as occupied', () => {
    const session = setup('A172_BoatPainter')
    occupy(session, 'fishing', 1)
    occupy(session, 'house-building-56', 2)
    const response = finishConfirms(session, session.performRoundEnd())
    expect(response.ok).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 0, food: 20 })
    expect(response.state.round).toBe(3)
  })

  it.each([true, false])('A173 Clay Thief can accept=%s after accumulation without placing a worker', (accept) => {
    const session = setup('A173_ClayThief')
    session.state.actionSpaces.find((space) => space.id === 'hollow-56')!.resources.clay = 6
    let response = finishConfirms(session, session.performRoundEnd())
    expect(response.ok).toBe(true)
    expect(response.state.round).toBe(3)
    expect(response.interaction.sourceCard).toBe('A173_ClayThief')
    const value = accept ? response.interaction.request.options.find((option) => option.value !== '__skip__')!.value : '__skip__'
    response = session.resolveChoice(0, value)
    expect(response.ok).toBe(true)
    expect(response.state.players[0]!.resources.clay).toBe(accept ? 9 : 0)
    expect(response.state.actionSpaces.find((space) => space.id === 'hollow-56')!.resources.clay).toBe(accept ? 0 : 9)
    expect(response.state.actionSpaces.every((space) => space.takenBy.length === 0)).toBe(true)
    expect(response.state.players[0]!.cardStates.A173_ClayThief?.extraData?.used ?? false).toBe(accept)
  })

  it('A173 Clay Thief stays inactive after its once-per-game use', () => {
    const session = setup('A173_ClayThief')
    session.state.players[0]!.cardStates.A173_ClayThief = { extraData: { used: true } }
    const response = finishConfirms(session, session.performRoundEnd())
    expect(response.ok).toBe(true)
    expect(response.state.round).toBe(3)
    expect(response.state.players[0]!.resources.clay).toBe(0)
    expect(response.interaction.stateId).toBe('idle')
  })

  it.each([0, 1, 2])('C174 Stone Custodian counts %i remaining stone accumulation spaces', (count) => {
    const session = setup('C174_StoneCustodian', 13)
    for (const space of session.state.actionSpaces) if ((space.gainPerRound.stone ?? 0) > 0) space.resources.stone = 0
    if (count > 0) session.state.actionSpaces.find((space) => space.id === 'western-quarry')!.resources.stone = 2
    if (count > 1) session.state.actionSpaces.find((space) => space.id === 'eastern-quarry')!.resources.stone = 1
    const response = finishConfirms(session, session.performRoundEnd())
    expect(response.ok).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ grain: count === 1 ? 1 : 0, vegetable: count === 2 ? 1 : 0 })
    expect(response.state.round).toBe(14)
  })

  it.each([2, 3, 4, 5, 6])('B172 Cattle Caregiver rewards %i actual cattle-owning players after round start', (count) => {
    const session = setup('B172_CattleCaregiver')
    for (const player of session.state.players.slice(0, count)) {
      player.houseAnimalType = 'cattle'
      player.houseAnimalCount = 1
      player.resources.cattle = 1
    }
    const response = finishConfirms(session, session.performRoundEnd())
    expect(response.ok).toBe(true)
    expect(response.state.round).toBe(3)
    expect(response.state.players[0]!.resources.food).toBe(20 + Math.min(3, Math.max(0, count - 2)))
    expect(response.state.players[1]!.resources.food).toBe(20)
  })

  it.each([2, 3, 4, 5, 6])('B175 Field Overseer rewards %i opponent grain fields through the real field phase', (count) => {
    const session = setup('B175_FieldOverseer', 4)
    session.state.players[0]!.fields = [{ row: 1, col: 1, stacks: [{ kind: 'grain', remaining: 1 }] }]
    for (let index = 0; index < count; index += 1) {
      session.state.players[1 + index % 3]!.fields.push({ row: 1, col: Math.floor(index / 3), stacks: [{ kind: 'grain', remaining: 1 }] })
    }
    let response = finishConfirms(session, session.performRoundEnd())
    for (let i = 0; i < 20 && response.state.round === 4; i += 1) {
      expect(response.ok).toBe(true)
      expect(response.interaction.stateId).toBe('wait')
      const request = response.interaction.request
      if (request.kind === 'feed') response = session.resolveChoice(response.interaction.playerIndex, 'confirm', { selections: [] })
      else response = finishConfirms(session, response)
    }
    expect(response.ok).toBe(true)
    expect(response.state.round).toBe(5)
    expect(response.state.players[0]!.resources).toMatchObject({
      food: count === 3 ? 17 : 16,
      grain: count >= 4 && count < 6 ? 2 : 1,
      vegetable: count >= 6 ? 1 : 0,
    })
    expect(response.state.log.some((entry) => entry.key === 'log.harvestPhaseReap')).toBe(true)
  })

  it.each(['pig-market', 'cattle-market'])('B170 Corral Builder fences one space when %s is revealed', (spaceId) => {
    const session = setup('B170_CorralBuilder', spaceId === 'pig-market' ? 7 : 9)
    session.state.roundActionOrder[session.state.round] = spaceId
    let response = finishConfirms(session, session.performRoundEnd())
    expect(response.ok).toBe(true)
    expect(response.interaction.sourceCard).toBe('B170_CorralBuilder')
    response = session.resolveChoice(0, response.interaction.request.options.find((option) => option.value !== '__skip__')!.value)
    expect(response.ok).toBe(true)
    expect(response.interaction.request.farm.farmType).toBe('fence')
    const invalid = session.commitSelectionChoice(0, { edges: ['H-1-1', 'H-1-2', 'H-2-1', 'H-2-2', 'V-1-1', 'V-1-3'], extraWood: 0 })
    expect(invalid.ok).toBe(false)
    expect(invalid.state.players[0]!.pastures).toHaveLength(0)
    response = session.commitSelectionChoice(0, { edges: ['H-1-1', 'H-2-1', 'V-1-1', 'V-1-2'], extraWood: 0 })
    expect(response.ok).toBe(true)
    expect(response.state.players[0]!.pastures).toHaveLength(1)
    expect(response.state.players[0]!.resources.wood).toBe(0)
    expect(response.state.players[0]!.fenceSegments).toHaveLength(4)
  })

  it('B170 Corral Builder ignores an unrelated round reveal', () => {
    const session = setup('B170_CorralBuilder')
    session.state.roundActionOrder[2] = 'fencing'
    const response = finishConfirms(session, session.performRoundEnd())
    expect(response.ok).toBe(true)
    expect(response.interaction.stateId).toBe('idle')
    expect(response.state.players[0]!.pastures).toHaveLength(0)
  })

  it.each(['wood', 'clay', 'reed', 'stone'] as const)('C178 On-Site Reverend chooses one %s at a real harvest', (resource) => {
    const session = setup('C178_OnSiteReverend', 4)
    const offered = finishConfirms(session, session.performRoundEnd())
    expect(offered.ok).toBe(true)
    expect(offered.interaction.sourceCard).toBe('C178_OnSiteReverend')
    const option = offered.interaction.request.options.find((entry) => JSON.stringify(entry.effectPreview ?? {}).includes(`"${resource}":1`))!
    expect(option).toBeDefined()
    const response = session.resolveChoice(0, option.value)
    expect(response.ok).toBe(true)
    for (const key of ['wood', 'clay', 'reed', 'stone'] as const) expect(response.state.players[0]!.resources[key]).toBe(key === resource ? 1 : 0)
  })

  it('C178 On-Site Reverend does not trigger in a non-harvest round', () => {
    const session = setup('C178_OnSiteReverend')
    const response = finishConfirms(session, session.performRoundEnd())
    expect(response.ok).toBe(true)
    expect(response.state.round).toBe(3)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, clay: 0, reed: 0, stone: 0 })
  })

  it.each([true, false])('B179 Wild Boar Hunter offers a returning-home trade with accept=%s', (accept) => {
    const session = setup('B179_WildBoarHunter')
    session.state.players[0]!.resources.wood = 1
    occupy(session, 'forest', 1)
    occupy(session, 'grove-56', 2)
    occupy(session, 'copse-56', 3)
    let response = finishConfirms(session, session.performRoundEnd())
    expect(response.interaction.sourceCard).toBe('B179_WildBoarHunter')
    const value = accept ? response.interaction.request.options.find((option) => option.value !== '__skip__')!.value : '__skip__'
    response = session.resolveChoice(0, value)
    expect(response.ok).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: accept ? 0 : 1, boar: accept ? 1 : 0 })
  })

  it('B179 Wild Boar Hunter does not count a blocked Copse as occupied', () => {
    const session = setup('B179_WildBoarHunter')
    session.state.players[0]!.resources.wood = 1
    occupy(session, 'forest', 1)
    occupy(session, 'grove-56', 2)
    occupy(session, 'lessons-56-2f', 3)
    const response = finishConfirms(session, session.performRoundEnd())
    expect(response.ok).toBe(true)
    expect(response.state.round).toBe(3)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 1, boar: 0 })
  })
})
