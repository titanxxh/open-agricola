import { afterEach, describe, expect, it } from 'vitest'
import { markAllWorkersUsed, setActiveWorkerCount, setWorkersAtHome } from '../../shared/domain/player'
import type { GameState } from '../../shared/contract/types'
import { travelingPlayers } from '../../shared/cards/action/common-traveling-players'
import { validateAndCompileCustomCode } from '../custom-code/engine'
import type { GameSession } from '../game/authoritative-session'
import { createWorkSession } from './_helpers/session-fixtures'
import { autoAdvanceRoundEnd } from './_helpers/round-end'

const CARD_ID = 'CUSTOM_ComposedBehavior'
const sessions: GameSession[] = []
afterEach(() => { sessions.splice(0).forEach(session => session.dispose()) })

function start(implementation: string, configure: (state: GameState) => void, type: 'minor' | 'occupation' = 'minor', metadata = {}) {
  const result = validateAndCompileCustomCode(`
const CARD_ID = '${CARD_ID}'
const CARD_DEF = ${type === 'minor' ? 'MinorImprovement' : 'Occupation'}({ id: CARD_ID, name: 'Composed behavior' })
const CARD_IMPL = ${implementation}
`, CARD_ID)
  if (!result.valid) throw new Error(result.errors.join('\n'))
  const session = createWorkSession({
    customCards: [{ cardType: type, cardJson: { id: CARD_ID, name: 'Composed behavior', deck: 'CUSTOM', number: 0, desc: [], ...metadata }, compiledCode: result.compiledCode, codeManifest: result.manifest }],
    configure: state => {
      setWorkersAtHome(state, state.players[1]!, 0)
      configure(state)
    },
  })
  sessions.push(session)
  return session
}

const played = (state: GameState) => { state.players[0]!.minorPlayed = [CARD_ID] }
const resolve = (session: GameSession, value: string) => {
  const response = session.resolveChoice(0, value)
  expect(response.ok).toBe(true)
  return response
}

describe('Workshop composed card behaviors', () => {
  it.each([true, false])('renovation discounts reed only when played: %s', hasCard => {
    const session = start(`{ listeners: [{ cardIds: [CARD_ID], actions: ['renovate-house'], phases: ['computeCosts'],
      handler: () => ({ costs: { reed: -1 }, costAttribution: [{ sourceCard: CARD_ID, costs: { reed: -1 } }], sourceCard: CARD_ID }) }] }`, state => {
      if (hasCard) played(state)
      Object.assign(state.players[0]!.resources, { clay: 2, reed: 1 })
    })
    const response = session.takeAction(0, 'house-redevelopment')
    expect(response.ok).toBe(true)
    expect(response.state.players[0]).toMatchObject({ houseType: 'clay', resources: { clay: 0, reed: hasCard ? 1 : 0 } })
    expect(response.state.log.some(entry => entry.key === 'log.actionDetail')).toBe(true)
    expect(response.scores).toBeDefined()
  })

  it('pays once for an anytime action and rejects it again after replenishment', () => {
    const session = start(`{ listeners: [{ cardIds: [CARD_ID], actions: ['anytime'], phases: ['anytime'], handler: ctx => {
      if (ctx.ownerPlayer.cardStates[CARD_ID]?.flagged || ctx.ownerPlayer.resources.wood < 2) return
      return { sourceCard: CARD_ID, flow: { type: 'seq', children: [payLeaf({ cardId: CARD_ID, cost: { wood: 2 } }), gainLeaf(CARD_ID, { food: 3 }), { type: 'leaf', actionId: 'special-effect', params: { kind: 'set-flag', flag: true }, sourceCard: CARD_ID }] } }
    } }] }`, state => { played(state); Object.assign(state.players[0]!.resources, { wood: 2, food: 0 }) })
    const action = session.getState().interaction.anytimeActions.find(item => item.sourceCard === CARD_ID)
    expect(action).toBeDefined()
    const result = session.takeAnytimeAction(0, action!.id)
    expect(result.ok).toBe(true)
    expect(result.state.players[0]).toMatchObject({ resources: { wood: 0, food: 3 }, cardStates: { [CARD_ID]: { flagged: true } } })
    expect(result.state.log.some(entry => entry.key === 'log.cardEffectGain')).toBe(true)
    session.state.players[0]!.resources.wood = 2
    expect(session.getState().interaction.anytimeActions.some(item => item.sourceCard === CARD_ID)).toBe(false)
    expect(session.takeAnytimeAction(0, action!.id).ok).toBe(false)
    expect(session.state.players[0]!.resources).toMatchObject({ wood: 2, food: 3 })
  })

  it('scores cattle for the card owner at game end only', () => {
    const session = start(`{ effect: { id: CARD_ID, computeBonusScore: (state, player) => Math.floor(player.resources.cattle / 2) } }`, state => {
      played(state)
      state.round = 14
      state.players.forEach((player, index) => {
        setActiveWorkerCount(player, 1)
        Object.assign(player.resources, { food: 5, cattle: 4 })
        player.pastures = [{ id: `pasture-${index}`, size: 4, tiles: [{ row: 0, col: 0 }, { row: 0, col: 1 }, { row: 1, col: 0 }, { row: 1, col: 1 }], stables: 0, animalType: 'cattle', animalCount: 4 }]
        markAllWorkersUsed(state, player)
      })
    })
    const final = autoAdvanceRoundEnd(session)
    expect(final.state.gameOver).toBe(true)
    expect(final.interaction.stateId).toBe('gameover')
    expect(final.scores![0]!.categories.flatMap(category => category.entries)).toContainEqual(expect.objectContaining({ cardId: CARD_ID, score: 2 }))
    expect(final.scores![1]!.categories.flatMap(category => category.entries).some(entry => entry.cardId === CARD_ID)).toBe(false)
  })

  it.each(['forest', 'fishing'])('opponent %s awards the card owner only for forest', space => {
    const session = start(`{ listeners: [{ cardIds: [CARD_ID], actions: ['collect'], phases: ['after'], scope: 'any', handler: ctx => {
      if (ctx.space.id !== 'forest') return
      return { sourceCard: CARD_ID, flow: gainLeaf(CARD_ID, { wood: 1 }) }
    } }] }`, state => {
      played(state)
      state.currentPlayerIndex = 1
      state.actionSpaces.forEach(item => { item.takenBy = item.takenBy.filter(worker => worker.playerId !== state.players[1]!.id) })
      setWorkersAtHome(state, state.players[1]!, 1)
      state.players.forEach(player => { player.resources.wood = 0 })
      state.actionSpaces.find(item => item.id === 'forest')!.resources.wood = 3
    })
    const response = session.takeAction(1, space)
    expect(response.ok, JSON.stringify({ error: response.error, interaction: response.interaction, current: response.state.currentPlayerIndex })).toBe(true)
    expect(response.state.players[0]!.resources.wood).toBe(space === 'forest' ? 1 : 0)
    expect(response.state.players[1]!.resources.wood).toBe(space === 'forest' ? 3 : 0)
    expect(response.state.events.filter(event => event.type === 'resource.moved' && event.sourceCardId === CARD_ID)).toHaveLength(space === 'forest' ? 1 : 0)
  })

  it('counts only matching accumulation spaces and grants a forest bonus', () => {
    const session = start(`{ listeners: [
      { cardIds: [CARD_ID], actions: ['collect'], phases: ['after'], handler: ctx => ctx.space.id === 'forest' ? { sourceCard: CARD_ID, flow: gainLeaf(CARD_ID, { wood: 1 }) } : undefined },
      { cardIds: [CARD_ID], actions: ['collect'], phases: ['after'], handler: ctx => ['forest', 'clay-pit', 'reed-bank'].includes(ctx.space.id) ? { sourceCard: CARD_ID, flow: { type: 'leaf', actionId: 'special-effect', sourceCard: CARD_ID, params: { kind: 'increment-counter', key: 'actionCount', amount: 1 } } } : undefined },
    ] }`, state => {
      played(state); state.players[0]!.resources.wood = 0
      state.actionSpaces.find(item => item.id === 'forest')!.resources.wood = 3
    })
    let response = session.takeAction(0, 'fishing')
    expect(response.ok).toBe(true)
    expect(response.state.players[0]!.resources.wood).toBe(0)
    expect(response.state.players[0]!.cardStates[CARD_ID]?.counters?.actionCount ?? 0).toBe(0)
    if (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'confirm-next-player') resolve(session, 'confirm')
    response = session.takeAction(0, 'forest')
    expect(response.ok).toBe(true)
    while (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'select-trigger') {
      response = resolve(session, response.interaction.request.options.find(option => !option.disabled)!.value)
    }
    expect(response.state.players[0]!.resources.wood).toBe(4)
    expect(response.state.players[0]!.cardStates[CARD_ID]?.counters?.actionCount).toBe(1)
    expect(response.state.actionSpaces.find(item => item.id === 'forest')!.resources.wood).toBe(0)
  })

  it('uses food on an action space to pay for an occupation', () => {
    const session = start(`{ listeners: [{ cardIds: [CARD_ID], actions: ['occupation'], phases: ['computeCosts'], handler: ctx => {
      const food = ctx.state.actionSpaces.find(s => s.id === 'traveling-players')?.resources.food || 0
      if (!food) return
      return { sourceCard: CARD_ID, paymentResourceProviders: [{ key: CARD_ID + ':food', sourceCard: CARD_ID, available: food, covers: [{ resource: 'food', costAmount: 1, paymentAmount: 1 }], consume: { type: 'actionSpace', spaceId: 'traveling-players', resource: 'food' } }] }
    } }] }`, state => {
      played(state); state.players[0]!.occupationPlayed = ['A123_FrameBuilder']; state.players[0]!.occupationHand = ['A153_PigOwner']
      state.players[0]!.resources.food = 0
      state.actionSpaces.push({ ...travelingPlayers, resources: { food: 3 }, takenBy: [] })
    })
    let response = session.takeAction(0, 'lessons')
    expect(response.ok).toBe(true)
    if (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'choice') response = resolve(session, 'A153_PigOwner')
    if (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'choice') {
      const external = response.interaction.request.options?.filter(option => option.labelParams?.resourcesPaid !== undefined && Object.values(option.labelParams.resourcesPaid).every(amount => amount === 0)) ?? []
      expect(external).toHaveLength(1)
      response = resolve(session, external[0]!.value)
    }
    expect(response.state.players[0]!.occupationPlayed).toContain('A153_PigOwner')
    expect(response.state.players[0]!.resources.food).toBe(0)
    expect(response.state.actionSpaces.find(space => space.id === 'traveling-players')!.resources.food).toBe(2)
    expect(response.state.log.some(entry => entry.key === 'log.playOccupation')).toBe(true)
    expect(response.scores).toBeDefined()
  })
  it.each([3, 2])('requires three occupations before paying for and gaining from a minor: %s', occupations => {
    const session = start(`{ effect: { id: CARD_ID, onBuy: () => gainLeaf(CARD_ID, { wood: 3, food: 1 }) } }`, state => {
      state.players[0]!.minorHand = [CARD_ID]
      state.players[0]!.occupationPlayed = Array.from({ length: occupations }, (_, i) => `test-occupation-${i}`)
      Object.assign(state.players[0]!.resources, { wood: 1, food: 0 })
    }, 'minor', { cost: { wood: 1 }, prerequisite: '3 Occupations' })
    let response = session.takeAction(0, 'meeting-place')
    expect(response.ok).toBe(true)
    if (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'choice') {
      const improvement = response.interaction.request.options?.find(option => option.labelKey === 'actions.improvement.name')
      if (improvement) response = resolve(session, improvement.value)
    }
    const offered = response.interaction.stateId === 'wait' && response.interaction.request.kind === 'choice'
      && response.interaction.request.options?.some(option => option.value === CARD_ID)
    expect(!!offered || response.state.players[0]!.minorPlayed.includes(CARD_ID), JSON.stringify(response.interaction)).toBe(occupations === 3)
    if (occupations === 3) {
      if (offered) response = resolve(session, CARD_ID)
      if (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'choice') {
        response = resolve(session, response.interaction.request.options![0]!.value)
      }
      expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
      expect(response.state.players[0]!.minorHand).not.toContain(CARD_ID)
      expect(response.state.players[0]!.resources).toMatchObject({ wood: 3, food: 1 })
      expect(response.state.log.some(entry => entry.key === 'log.playMinorImprovement')).toBe(true)
    } else {
      expect(response.state.players[0]!.minorPlayed).not.toContain(CARD_ID)
      expect(response.state.players[0]!.resources).toMatchObject({ wood: 1, food: 0 })
    }
    expect(response.state.actionSpaces.find(space => space.id === 'meeting-place')!.takenBy).toHaveLength(1)
    expect(response.scores).toBeDefined()
  })

  it('schedules an on-buy reward once for the next round', () => {
    const session = start(`{ effect: { id: CARD_ID, onBuy: (state, player) => ({ type: 'leaf', actionId: 'future-meeples', params: { __futureMeepleRequest: { cardId: CARD_ID, playerId: player.id, entries: [{ round: state.round + 1, resources: { wood: 1 } }] } }, sourceCard: CARD_ID }) } }`, state => {
      state.players[0]!.occupationHand = [CARD_ID]
      state.players[0]!.resources.wood = 0
    }, 'occupation')
    let response = session.takeAction(0, 'lessons')
    expect(response.ok).toBe(true)
    if (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'choice') response = resolve(session, CARD_ID)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.wood).toBe(0)
    expect(response.state.futureMeeples.filter(entry => entry.cardId === CARD_ID)).toEqual([expect.objectContaining({ playerId: response.state.players[0]!.id, round: 2, resources: { wood: 1 } })])
    response.state.players.forEach(player => markAllWorkersUsed(response.state, player))
    response = autoAdvanceRoundEnd(session)
    expect(response.state.round).toBe(2)
    expect(response.state.players[0]!.resources.wood).toBe(1)
    expect(response.state.futureMeeples.some(entry => entry.cardId === CARD_ID)).toBe(false)
    response.state.players.forEach(player => markAllWorkersUsed(response.state, player))
    response = autoAdvanceRoundEnd(session)
    expect(response.state.players[0]!.resources.wood).toBe(1)
    expect(response.state.events.filter(event => event.type === 'resource.moved' && event.sourceCardId === CARD_ID)).toHaveLength(1)
    expect(response.scores).toBeDefined()
  })

  it('applies the same card discount to an improvement and a room', () => {
    const session = start(`{ listeners: [
      { cardIds: [CARD_ID], actions: ['construct'], phases: ['computeCosts'], handler: () => ({ costs: { wood: -2 }, costAttribution: [{ sourceCard: CARD_ID, costs: { wood: -2 } }], sourceCard: CARD_ID }) },
      { cardIds: [CARD_ID], actions: ['improvement'], phases: ['computeCosts'], handler: () => ({ bonuses: [{ discount: { wood: 2 }, capDiscountAtCost: true, optional: false, sources: [CARD_ID] }], sourceCard: CARD_ID }) },
    ] }`, state => {
      played(state)
      const player = state.players[0]!
      Object.assign(player.resources, { wood: 3, reed: 2, clay: 2 })
      player.stableTiles = [{ row: 0, col: 4 }, { row: 1, col: 4 }, { row: 2, col: 4 }, { row: 0, col: 3 }]
      player.minorHand = ['B043_Chophouse', 'D059_EarthOven']
    })
    let response = session.takeAction(0, 'major-improvement')
    expect(response.ok).toBe(true)
    if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'choice') throw new Error('Expected improvement choice')
    expect(response.interaction.request.options?.map(option => option.value)).toContain('B043_Chophouse')
    expect(response.interaction.request.options?.map(option => option.value)).not.toContain('D059_EarthOven')
    response = resolve(session, 'B043_Chophouse')
    if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'choice') throw new Error('Expected payment choice')
    const options = response.interaction.request.options ?? []
    expect(options.every(option => option.labelParams?.resourcesPaid !== undefined)).toBe(true)
    const signatures = options.map(option => Object.fromEntries(Object.entries(option.labelParams!.resourcesPaid).filter(([, amount]) => amount > 0)))
    expect(signatures).toEqual([{}, { clay: 2 }])
    const free = options.filter(option => Object.values(option.labelParams!.resourcesPaid).every(amount => amount === 0))
    expect(free).toHaveLength(1)
    response = resolve(session, free[0]!.value)
    expect(response.state.players[0]!.minorPlayed).toContain('B043_Chophouse')
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 3, reed: 2, clay: 2 })
    expect(response.state.log.some(entry => entry.key === 'log.playMinorImprovement')).toBe(true)
    if (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'confirm-next-player') resolve(session, 'confirm')
    response = session.takeAction(0, 'farm-expansion')
    expect(response.ok, JSON.stringify(response.interaction)).toBe(true)
    if (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'choice') {
      const construct = response.interaction.request.options?.find(option => option.value.includes('construct'))
      expect(construct).toBeDefined()
      response = resolve(session, construct!.value)
    }
    if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'farm-select') throw new Error(`Expected room placement: ${JSON.stringify(response.interaction)}`)
    response = session.commitSelectionChoice(0, { rooms: [response.interaction.request.farm.selectableTiles[0]!] })
    expect(response.ok).toBe(true)
    expect(response.state.players[0]).toMatchObject({ rooms: 3, resources: { wood: 0, reed: 0, clay: 2 } })
    expect(response.state.events).toContainEqual(expect.objectContaining({ type: 'resource.paid', paymentFor: 'construct', bonusSources: [CARD_ID] }))
    expect(response.state.log).toContainEqual(expect.objectContaining({ key: 'log.actionDetail', params: expect.objectContaining({ detailParts: expect.objectContaining({ bonusSources: [CARD_ID] }) }) }))
    expect(response.scores).toBeDefined()
  })

})
