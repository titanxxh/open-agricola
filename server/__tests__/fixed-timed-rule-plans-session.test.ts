import { afterEach, describe, expect, it } from 'vitest'
import { createWorkSession } from './_helpers/session-fixtures'
import { collectScheduledEffectPreviews } from '../../shared/actions/scheduled-effect-preview'
import { markAllWorkersUsed } from '../../shared/domain/player'

const sessions: ReturnType<typeof createWorkSession>[] = []
afterEach(() => sessions.splice(0).forEach(session => session.dispose()))
const setup = (cardId: string, round = 1, configure?: NonNullable<Parameters<typeof createWorkSession>[0]>['configure']) => {
  const session = createWorkSession({ seed: 2424, options: { enableFarmersOfTheMoor: cardId.startsWith('M'), allowIncompleteFarmersOfTheMoorMinorDeal: true }, configure: state => {
    state.round = round
    state.players.forEach(player => { player.resources.food = 60; player.resources.fuel = 60 })
    state.players[0]!.minorPlayed = [cardId]
    configure?.(state)
  } })
  sessions.push(session)
  return session
}
const schedules = [
  ['A058_AsparagusKnife', [8, 10, 12]], ['A127_Lodger', [9]], ['A165_PigBreeder', [12]],
  ['D032_WoodRake', [14]], ['D098_Transactor', [14]], ['D099_EarthenwarePotter', [14]],
  ['E010_StrawHat', [3, 6]], ['E026_Sundial', [7, 9]], ['E087_MasterRenovator', [7, 9]],
  ['E149_MidnightFencer', [14]], ['M074_Administration', [14]], ['M128_Workbench', [13, 14]],
] as const

describe('fixed scheduled rules share execution and descriptions', () => {
  it.each(schedules)('%s exposes its exact dates and recursive rule without changing the game', (cardId, rounds) => {
    const session = setup(cardId)
    const before = JSON.stringify(session.state)
    for (let attempt = 0; attempt < 3; attempt++) {
      const entries = collectScheduledEffectPreviews(session.state, session.state.players[0]!).filter(entry => entry.sourceCard === cardId)
      expect(entries.map(entry => entry.round)).toEqual(rounds)
      expect(entries.every(entry => entry.count === 1 && entry.timing !== undefined)).toBe(true)
    }
    expect(JSON.stringify(session.state)).toBe(before)
  })
  it('a current target round retains later phases, and past dates are absent', () => {
    const session = setup('A058_AsparagusKnife', 10)
    expect(collectScheduledEffectPreviews(session.state, session.state.players[0]!).map(entry => entry.round)).toEqual([10, 12])
  })
  it.each([13, 14])('Workbench actually receives materials during the round %i field phase', round => {
    const session = setup('M128_Workbench', round, state => state.players.forEach(player => markAllWorkersUsed(state, player)))
    const response = session.performRoundEnd()
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 3, clay: 2, reed: 1 })
    expect(response.state.players[1]!.resources).toMatchObject({ wood: 0, clay: 0, reed: 0 })
    expect(response.state.events.some(event => event.type === 'resource.moved' && event.sourceCardId === 'M128_Workbench')).toBe(true)
    expect(response.scores).toBeDefined()
    expect(response.interaction.stateId === 'wait' ? response.interaction.sourceCard : undefined).not.toBe('M128_Workbench')
  })
  it('Administration offers zero, one or two actual final scoring exchanges, bounded by majors', () => {
    const session = setup('M074_Administration', 14, state => {
      state.players.forEach(player => markAllWorkersUsed(state, player))
      state.players[0]!.improvements = ['Major_Well', 'Major_Joinery']
    })
    const beforeFood = session.state.players[0]!.resources.food
    let response = session.performRoundEnd()
    expect(response.ok, response.error).toBe(true)
    if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'choice') throw new Error('Missing Administration exchange')
    expect(response.interaction.sourceCard).toBe('M074_Administration')
    const candidates = response.interaction.request.options.filter(option => option.value !== '__skip__')
    expect(candidates).toHaveLength(2)
    const chosen = candidates.find(option => option.descriptionPreview?.kind === 'action' && option.descriptionPreview.effectPreview?.kind === 'resourceExchange' && option.descriptionPreview.effectPreview.bonusVp === 2)
    expect(chosen).toBeDefined()
    response = session.resolveChoice(0, chosen!.value)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.cardStates.M074_Administration?.counters?.bonusVp).toBe(2)
    expect(response.state.players[1]!.cardStates.M074_Administration).toBeUndefined()
    expect(response.state.events.filter(event => event.type === 'resource.paid' && event.sourceCardId === 'M074_Administration')).toHaveLength(1)
    expect(response.state.players[0]!.resources.food).toBeLessThan(beforeFood)
    expect(response.scores).toBeDefined()
  })
  it('Workbench has no early harvest payment or gain', () => {
    const session = setup('M128_Workbench', 11, state => state.players.forEach(player => markAllWorkersUsed(state, player)))
    const response = session.performRoundEnd()
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, clay: 0, reed: 0 })
    expect(response.state.events.some(event => event.sourceCardId === 'M128_Workbench')).toBe(false)
  })
})

describe('fixed timed actions include Card Fields', () => {
  it('Asparagus Knife chooses a Card Field and removes exactly one vegetable', () => {
    const session = setup('A058_AsparagusKnife', 8, state => {
      state.players.forEach(player => markAllWorkersUsed(state, player))
      const owner = state.players[0]!
      owner.minorPlayed.push('B068_Beanfield')
      owner.cardStates.B068_Beanfield = { extraData: { cardFieldStacks: [{ crop: 'vegetable', remaining: 2 }] } }
    })
    let response = session.performRoundEnd()
    for (let step = 0; step < 3 && response.interaction.stateId === 'wait' && response.interaction.request.kind === 'choice'; step++) {
      const accept = response.interaction.request.options.find(option => option.value !== '__skip__')
      if (!accept) throw new Error('Missing field exchange acceptance')
      response = session.resolveChoice(0, accept.value)
    }
    if (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'selection') response = session.commitSelectionChoice(0, { positions: [{ row: -1, col: 2068 }] })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.cardStates.B068_Beanfield?.extraData?.cardFieldStacks).toEqual([{ crop: 'vegetable', remaining: 1 }])
    expect(response.state.players[0]!.resources).toMatchObject({ food: 60, vegetable: 1 })
    expect(response.state.players[0]!.cardStates.A058_AsparagusKnife?.counters?.bonusVp ?? 0).toBe(0)
    if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'choice') throw new Error('Missing Asparagus exchange')
    expect(response.interaction.sourceCard).toBe('A058_AsparagusKnife')
    expect(response.interaction.playerIndex).toBe(0)
    const exchange = response.interaction.request.options.find(option => option.value !== '__skip__' && !option.disabled)
    if (!exchange) throw new Error('Missing Asparagus exchange acceptance')
    response = session.resolveChoice(0, exchange.value)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.food).toBe(63)
    expect(response.state.players[0]!.resources.vegetable).toBe(0)
    expect(response.state.players[0]!.cardStates.A058_AsparagusKnife?.counters?.bonusVp).toBe(1)
  })
  it('Wood Rake counts seven Card Field crops before the last harvest', () => {
    const session = setup('D032_WoodRake', 14, state => {
      state.players.forEach(player => markAllWorkersUsed(state, player))
      const owner = state.players[0]!
      owner.minorPlayed.push('B068_Beanfield')
      owner.occupationPlayed.push('B113_PatchCaregiver')
      owner.cardStates.B068_Beanfield = { extraData: { cardFieldStacks: [{ crop: 'vegetable', remaining: 2 }] } }
      owner.cardStates.B113_PatchCaregiver = { extraData: { cardFieldStacks: [{ crop: 'grain', remaining: 5 }] } }
    })
    const response = session.performRoundEnd()
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.cardStates.D032_WoodRake?.counters?.bonusVp).toBe(2)
    expect(response.state.events.filter(event => event.type === 'card.stateChanged' && event.sourceCardId === 'D032_WoodRake')).toHaveLength(2)
    expect(response.scores).toBeDefined()
  })
  it('Sundial can sow into an empty Card Field at its scheduled work end', () => {
    const session = setup('E026_Sundial', 7, state => {
      state.players.forEach(player => markAllWorkersUsed(state, player))
      const owner = state.players[0]!
      owner.resources.grain = 1
      owner.occupationPlayed.push('B113_PatchCaregiver')
      owner.cardStates.B113_PatchCaregiver = { extraData: { cardFieldStacks: [null] } }
    })
    let response = session.performRoundEnd()
    for (let step = 0; step < 3 && response.interaction.stateId === 'wait' && response.interaction.request.kind === 'choice'; step++) {
      const accept = response.interaction.request.options.find(option => option.value !== '__skip__')
      if (!accept) throw new Error('Missing sow acceptance')
      response = session.resolveChoice(0, accept.value)
    }
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') throw new Error('Missing sow selection')
    expect(response.interaction.playerIndex).toBe(0)
    response = session.commitSelectionChoice(0, { crops: [{ row: -1, col: 2113, crop: 'grain' }] })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.cardStates.B113_PatchCaregiver?.extraData?.cardFieldStacks).toEqual([{ crop: 'grain', remaining: 2 }])
    expect(response.state.players[0]!.resources.grain).toBe(1)
    expect(response.state.events.some(event => event.type === 'farm.sown' && event.sourceCardId === 'E026_Sundial')).toBe(true)
  })
})
