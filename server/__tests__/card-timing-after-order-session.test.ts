import { afterEach, describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { createWorkSession } from './_helpers/session-fixtures'
import { requireActiveCardRegistry } from '../../shared/cards/active-registry'
import type { CardListenerRegistration } from '../../shared/cards/card-listeners'
import type { GameState } from '../../shared/contract/types'
import { rehydrateState, serializeSessionSnapshot } from '../../shared/session/serialization'
import { readCardResourceStats } from '../../shared/cards/helpers/card-state'
import { getReapedCropAmount } from '../../shared/actions/helpers/reap-listener'
import { setWorkersAtHome } from '../../shared/domain/player'

const AFTER = 'TEST_1330_After'
const sessions: GameSession[] = []
afterEach(() => sessions.splice(0).forEach(session => session.dispose()))
const options = (response: SessionResponse) => response.interaction.stateId === 'wait'
  ? response.interaction.request.options ?? [] : []

function choose(session: GameSession, response: SessionResponse, value: string) {
  expect(response.ok, response.error).toBe(true)
  if (response.interaction.stateId !== 'wait') throw new Error('Expected a choice')
  if (response.interaction.request.kind !== 'confirm-player-switch') {
    expect(options(response).some(option => option.value === value && !option.disabled), JSON.stringify(response.interaction)).toBe(true)
  }
  const next = session.resolveChoice(response.interaction.playerIndex, value)
  expect(next.ok, next.error).toBe(true)
  return next
}
function accept(session: GameSession, response: SessionResponse) {
  const option = options(response).find(candidate => candidate.value !== '__skip__' && !candidate.disabled)
  expect(option, JSON.stringify(response.interaction)).toBeDefined()
  return choose(session, response, option!.value)
}
function select(session: GameSession, response: SessionResponse, card: string) {
  expect(response.interaction.stateId === 'wait' && response.interaction.request.kind, JSON.stringify(response.interaction)).toBe('select-trigger')
  const option = options(response).find(candidate => candidate.sourceCard === card)
  expect(option, JSON.stringify(response.interaction)).toBeDefined()
  return choose(session, response, option!.value)
}
function finishCompanion(session: GameSession, initial: SessionResponse) {
  let response = initial
  for (let step = 0; step < 3; step++) {
    if (response.interaction.stateId !== 'wait') break
    if (response.interaction.request.kind === 'select-trigger') response = select(session, response, AFTER)
    else if (response.interaction.sourceCard === AFTER) response = accept(session, response)
    else break
  }
  return response
}
function afterGroup(response: SessionResponse, card: string) {
  expect(response.interaction.stateId === 'wait' && response.interaction.request.kind, JSON.stringify(response.interaction)).toBe('select-trigger')
  expect(options(response).map(option => option.sourceCard)).toEqual(expect.arrayContaining([card, AFTER]))
  expect(response.state.log.length).toBeGreaterThan(0)
  expect(response.scores).toHaveLength(response.state.players.length)
}
function setup({ card, occupation = false, playerCount = 2, actor = 0, configure }: {
  card: string; occupation?: boolean; playerCount?: number; actor?: number; configure?: (state: GameState) => void
}) {
  const session = createWorkSession({ seed: 1330, options: { playerCount }, configure: state => {
    state.round = 8
    state.currentPlayerIndex = actor
    for (const player of state.players) {
      player.minorPlayed = []
      player.occupationPlayed = []
      player.cardStates = {}
      for (const resource of Object.keys(player.resources)) Reflect.set(player.resources, resource, 0)
      setWorkersAtHome(state, player, 2)
    }
    for (const space of state.actionSpaces) space.takenBy = []
    const owner = state.players[0]!
    if (occupation) owner.occupationPlayed = [card]
    else owner.minorPlayed = [card]
    owner.minorPlayed.push(AFTER)
    configure?.(state)
  } })
  sessions.push(session)
  return session
}
function companion(session: GameSession, selector: Pick<CardListenerRegistration, 'actions' | 'actionSpaces'>, scope: CardListenerRegistration['scope'] = 'player') {
  session.withCtx(() => requireActiveCardRegistry('card-timing-after-order-test').registerListener({
    id: 'test-1330-after', cardIds: [AFTER], ...selector, scope, phases: ['after'],
    handler: () => ({ sourceCard: AFTER, flow: {
      type: 'leaf', actionId: 'gain', sourceCard: AFTER, params: { food: 1 }, optional: true,
    } }),
  }))
}

describe('reference after reaction ordering', () => {
  it('Clay Deposit shares the ordinary after window and preserves the chosen order across undo', () => {
    const card = 'C036_ClayDeposit'
    const session = setup({ card, configure: state => {
      state.actionSpaces.find(space => space.id === 'clay-pit')!.resources.clay = 3
    } })
    companion(session, { actionSpaces: 'all' })
    let response = session.takeAction(0, 'clay-pit')
    afterGroup(response, card)
    response = accept(session, select(session, response, card))
    expect(response.state.players[0]!.resources.clay).toBe(2)
    expect(response.state.actionSpaces.find(space => space.id === 'clay-pit')!.resources.clay).toBe(1)
    expect(response.state.players[0]!.cardStates[card]?.counters?.bonusVp).toBe(1)
    expect(session.undoAction().ok).toBe(true)
    response = session.takeAction(0, 'clay-pit')
    afterGroup(response, card)
    response = accept(session, select(session, response, AFTER))
    expect(response.state.players[0]!.resources).toMatchObject({ food: 1, clay: 3 })
    expect(response.state.players[0]!.cardStates[card]?.counters?.bonusVp ?? 0).toBe(0)
  }, 30_000)
})

describe('Stone Axe timing', () => {
  it('lets the player order Stone Axe with other ordinary after reactions', () => {
    const card = 'E075_StoneAxe'
    const session = setup({ card, configure: state => {
      state.players[0]!.resources.stone = 1
      state.actionSpaces.find(space => space.id === 'forest')!.resources.wood = 3
    } })
    companion(session, { actionSpaces: 'all' })
    const offered = session.takeAction(0, 'forest')
    afterGroup(offered, card)
    let response = accept(session, select(session, offered, card))
    response = finishCompanion(session, response)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 6, stone: 0, food: 1 })
    expect(response.state.events).toContainEqual(expect.objectContaining({ type: 'resource.paid', sourceCardId: card }))
  }, 30_000)
})

describe('Beaver Colony timing', () => {
  it('offers its reed point with ordinary collect-after reactions', () => {
    const card = 'E033_BeaverColony'
    const session = setup({ card, configure: state => {
      state.actionSpaces.find(space => space.id === 'reed-bank')!.resources.reed = 2
    } })
    companion(session, { actions: ['collect'] })
    let response = session.takeAction(0, 'reed-bank')
    afterGroup(response, card)
    expect(response.state.players[0]!.resources.reed).toBe(2)
    expect(response.state.players[0]!.cardStates[card]?.counters?.bonusVp ?? 0).toBe(0)
    response = select(session, response, card)
    expect(response.state.players[0]!.cardStates[card]?.counters?.bonusVp).toBe(1)
    response = finishCompanion(session, response)
    expect(response.scores[0]!.categories.flatMap(category => category.entries ?? [])).toEqual(expect.arrayContaining([
      expect.objectContaining({ cardId: card, score: 1 }),
    ]))
  }, 30_000)
})

describe('Estate Master timing', () => {
  it('sets its saturation flag in the shared ordinary plow-after window', () => {
    const card = 'B132_EstateMaster'
    const session = setup({ card, occupation: true, playerCount: 3, configure: state => {
      const player = state.players[0]!
      player.roomTiles = [{ row: 0, col: 0 }, { row: 1, col: 0 }]
      player.fields = []
      for (let row = 0; row < 3; row++) for (let col = 0; col < 5; col++) {
        if (col === 0 && row < 2 || row === 2 && col === 4) continue
        player.fields.push({ row, col, stacks: [] })
      }
    } })
    companion(session, { actions: ['plow'] })
    let response = session.takeAction(0, 'farmland')
    expect(response.interaction.stateId === 'wait' && response.interaction.request.kind).toBe('farm-select')
    response = session.commitSelectionChoice(0, { tile: { row: 2, col: 4 } })
    expect(response.ok, response.error).toBe(true)
    afterGroup(response, card)
    expect(response.state.players[0]!.cardStates[card]?.extraData?.saturated).toBeUndefined()
    response = select(session, response, card)
    expect(response.state.players[0]!.cardStates[card]?.extraData?.saturated).toBe(true)
    expect(response.state.players[0]!.fields).toHaveLength(13)
  }, 30_000)
})

describe('Clay Warden timing', () => {
  it('gives the owner clay before offering the owner ordinary opponent-after reactions', () => {
    const card = 'B143_ClayWarden'
    const session = setup({ card, occupation: true, playerCount: 3, actor: 1, configure: state => {
      state.actionSpaces.find(space => space.id === 'hollow')!.resources.clay = 3
    } })
    companion(session, { actionSpaces: 'all' }, 'opponent')
    let response = session.takeAction(1, 'hollow')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[1]!.resources.clay).toBe(3)
    expect(response.state.players[0]!.resources.clay).toBe(2)
    expect(options(response).some(option => option.sourceCard === card)).toBe(false)
    while (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'confirm-player-switch') {
      response = choose(session, response, 'confirm')
    }
    expect(response.interaction.stateId === 'wait' && response.interaction.sourceCard).toBe(AFTER)
    response = finishCompanion(session, response)
    expect(response.state.players[0]!.resources).toMatchObject({ clay: 2, food: 1 })
  }, 30_000)
})

describe('Job Contract timing', () => {
  it('finishes its optional occupation and linked occupancy before ordinary after reactions', () => {
    const card = 'C023_JobContract'
    const target = 'A100_Curator'
    const session = setup({ card, configure: state => { state.players[0]!.occupationHand = [target] } })
    companion(session, { actionSpaces: 'all' })
    let response = session.takeAction(0, 'day-laborer')
    expect(response.ok, response.error).toBe(true)
    expect(response.interaction.stateId === 'wait' && response.interaction.sourceCard, JSON.stringify(response.interaction)).toBe(card)
    expect(response.interaction.stateId === 'wait' && response.interaction.request.kind).toBe('choice')
    expect(response.state.players[0]!.resources.food).toBe(2)
    for (let step = 0; step < 3 && !response.state.players[0]!.occupationPlayed.includes(target); step++) {
      response = accept(session, response)
    }
    expect(response.state.players[0]!.occupationPlayed).toContain(target)
    expect(response.state.actionSpaces.find(space => space.id === 'lessons')!.takenBy).toEqual(expect.arrayContaining([
      expect.objectContaining({ playerId: response.state.players[0]!.id, synthetic: expect.objectContaining({ sourceCard: card }) }),
    ]))
    expect(response.interaction.stateId === 'wait' && response.interaction.sourceCard).toBe(AFTER)
    response = finishCompanion(session, response)
    expect(response.state.players[0]!.resources.food).toBe(3)
  }, 30_000)
})

describe('Ravenous Hunger timing', () => {
  it('finishes the extra placement and accumulating good before Vegetable Seeds ordinary after reactions', () => {
    const card = 'C042_RavenousHunger'
    const session = setup({ card, configure: state => {
      state.roundActionOrder[7] = 'vegetable-seeds'
      state.actionSpaces.find(space => space.id === 'forest')!.resources.wood = 3
    } })
    companion(session, { actionSpaces: ['vegetable-seeds'] })
    let response = session.takeAction(0, 'vegetable-seeds')
    expect(response.ok, response.error).toBe(true)
    expect(response.interaction.stateId === 'wait' && response.interaction.sourceCard, JSON.stringify(response.interaction)).toBe(card)
    expect(response.interaction.stateId === 'wait' && response.interaction.request.kind).toBe('choice')
    response = accept(session, response)
    response = choose(session, response, 'forest')
    expect(response.state.players[0]!.resources).toMatchObject({ vegetable: 1, wood: 4, food: 0 })
    expect(response.interaction.stateId === 'wait' && response.interaction.sourceCard, JSON.stringify(response.interaction)).toBe(AFTER)
    response = finishCompanion(session, response)
    expect(response.state.players[0]!.resources.food).toBe(1)
  }, 30_000)
})

describe('Market Master timing', () => {
  it('plays the last-person occupation before ordinary Traveling Players after reactions', () => {
    const card = 'E131_MarketMaster'
    const target = 'A100_Curator'
    const session = setup({ card, occupation: true, playerCount: 4, configure: state => {
      const player = state.players[0]!
      setWorkersAtHome(state, player, 1)
      player.occupationHand = [target]
      state.actionSpaces.find(space => space.id === 'traveling-players')!.resources.food = 3
    } })
    companion(session, { actionSpaces: ['traveling-players'] })
    let response = session.takeAction(0, 'traveling-players')
    expect(response.ok, response.error).toBe(true)
    expect(response.interaction.stateId === 'wait' && response.interaction.sourceCard, JSON.stringify(response.interaction)).toBe(card)
    for (let step = 0; step < 3 && !response.state.players[0]!.occupationPlayed.includes(target); step++) {
      response = accept(session, response)
    }
    expect(response.state.players[0]!.occupationPlayed).toContain(target)
    expect(response.state.players[0]!.resources.food).toBe(2)
    expect(response.interaction.stateId === 'wait' && response.interaction.sourceCard).toBe(AFTER)
    response = finishCompanion(session, response)
    expect(response.state.players[0]!.resources.food).toBe(3)
  }, 30_000)
})

describe('Steam Machine timing', () => {
  it('bakes after the last accumulation use before ordinary after reactions', () => {
    const card = 'C025_SteamMachine'
    const session = setup({ card, configure: state => {
      const player = state.players[0]!
      setWorkersAtHome(state, player, 1)
      player.resources.grain = 1
      player.improvements = ['Major_Fireplace1']
      state.actionSpaces.find(space => space.id === 'forest')!.resources.wood = 3
    } })
    companion(session, { actionSpaces: ['forest'] })
    let response = session.takeAction(0, 'forest')
    expect(response.ok, response.error).toBe(true)
    expect(response.interaction.stateId === 'wait' && response.interaction.sourceCard, JSON.stringify(response.interaction)).toBe(card)
    response = accept(session, response)
    if (response.interaction.stateId === 'wait' && response.interaction.promptKey === 'ui.interactionBakeBreadChoice') {
      response = choose(session, response, 'Major_Fireplace1')
    }
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 0, food: 2, wood: 3 })
    expect(response.interaction.stateId === 'wait' && response.interaction.sourceCard).toBe(AFTER)
    response = finishCompanion(session, response)
    expect(response.state.players[0]!.resources.food).toBe(3)
  }, 30_000)
})

describe('opponent Traveling Players ordinary after reactions', () => {
  it.each([
    { card: 'A158_CulinaryArtist', grain: 1, food: 0, expected: { grain: 0, food: 4, wood: 0, vegetable: 0 } },
    { card: 'A160_Lutenist', grain: 0, food: 1, expected: { grain: 0, food: 0, wood: 1, vegetable: 1 } },
  ])('$card keeps its complete effect in ordinary after and ignores the legacy immediate handler', scenario => {
    const session = setup({ card: scenario.card, occupation: true, playerCount: 4, actor: 1, configure: state => {
      Object.assign(state.players[0]!.resources, { grain: scenario.grain, food: scenario.food })
      state.actionSpaces.find(space => space.id === 'traveling-players')!.resources.food = 3
    } })
    companion(session, { actionSpaces: ['traveling-players'] }, 'opponent')
    let response = session.takeAction(1, 'traveling-players')
    while (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'confirm-player-switch') {
      response = choose(session, response, 'confirm')
    }
    afterGroup(response, scenario.card)
    expect(response.state.players[0]!.resources).toMatchObject({ grain: scenario.grain, food: scenario.food, wood: 0, vegetable: 0 })
    response = select(session, response, scenario.card)
    for (let step = 0; step < 5 && response.interaction.stateId === 'wait' && response.interaction.sourceCard === scenario.card; step++) {
      response = accept(session, response)
    }
    expect(response.state.players[0]!.resources).toMatchObject(scenario.expected)
    expect(response.state.players[1]!.resources.food).toBe(3)
    response = finishCompanion(session, response)
    expect(response.state.players[0]!.resources.food).toBe(scenario.expected.food + 1)
  }, 30_000)
})

describe('Estate Master harvest timing', () => {
  it('offers vegetable harvest points with other ordinary reap-after reactions', () => {
    const card = 'B132_EstateMaster'
    const session = setup({ card, occupation: true, playerCount: 3, configure: state => {
      state.round = 4
      for (const player of state.players) {
        player.resources.food = 20
        setWorkersAtHome(state, player, 0)
      }
      const player = state.players[0]!
      player.roomTiles = [{ row: 0, col: 0 }, { row: 1, col: 0 }]
      player.fields = []
      for (let row = 0; row < 3; row++) for (let col = 0; col < 5; col++) {
        if (col === 0 && row < 2) continue
        player.fields.push({ row, col, stacks: [] })
      }
      player.fields[0]!.stacks = [{ kind: 'vegetable', remaining: 1 }]
    } })
    companion(session, { actions: ['reap'] })
    let response = session.performRoundEnd()
    expect(response.ok, response.error).toBe(true)
    afterGroup(response, card)
    expect(response.state.players[0]!.resources.vegetable).toBe(1)
    expect(response.state.players[0]!.cardStates[card]?.counters?.bonusVp ?? 0).toBe(0)
    response = select(session, response, card)
    expect(response.state.players[0]!.cardStates[card]?.counters?.bonusVp).toBe(1)
  }, 30_000)
})

describe('Reap phase batches', () => {
  it.each(['harvest', 'private-field-phase'])('finishes all immediate crop reactions before ordinary after reads live resources in %s', phase => {
    const immediate = 'TEST_1330_ReapImmediate'
    const after = 'TEST_1330_ReapAfter'
    const grant = 'TEST_1330_ReapGrant'
    let session = setup({ card: immediate, configure: state => {
      state.round = 4
      const player = state.players[0]!
      player.minorPlayed = [immediate, after, grant]
      player.fields = [
        { row: 0, col: 1, stacks: [{ kind: 'grain', remaining: 1 }] },
        { row: 0, col: 2, stacks: [{ kind: 'grain', remaining: 1 }] },
        { row: 0, col: 3, stacks: [{ kind: 'vegetable', remaining: 1 }] },
      ]
      if (phase === 'harvest') for (const other of state.players) setWorkersAtHome(state, other, 0)
    } })
    const install = (owner: GameSession) => owner.withCtx(() => {
      const registry = requireActiveCardRegistry('reap-phase-batch-test')
      registry.registerListener({
        id: immediate, cardIds: [immediate], actions: ['reap'], phases: ['immediatelyAfter'],
        handler: context => {
          const amount = context.extraData?.amount
          if (typeof amount !== 'number') return
          return { sourceCard: immediate, flow: {
            type: 'leaf', actionId: 'gain', sourceCard: immediate, params: { food: amount }, optional: true,
          } }
        },
      })
      registry.registerListener({
        id: after, cardIds: [after], actions: ['reap'], phases: ['after'],
        handler: context => {
          const data = context.result && 'extraData' in context.result ? context.result.extraData : context.extraData
          const trigger = data?.trigger
          if (getReapedCropAmount(context, 'grain') !== 2
            || !trigger || typeof trigger !== 'object' || !('phase' in trigger) || trigger.phase !== phase
            || context.player.resources.food < 3) return
          return { sourceCard: after, flow: { type: 'seq', optional: true, children: [
            { type: 'leaf', actionId: 'pay', sourceCard: after, params: { food: 3 } },
            { type: 'leaf', actionId: 'gain', sourceCard: after, params: { wood: 2 } },
          ] } }
        },
      })
      registry.registerListener({
        id: grant, cardIds: [grant], actions: ['anytime'], phases: ['anytime'],
        handler: () => ({ sourceCard: grant, flow: {
          type: 'leaf', actionId: 'reap', sourceCard: grant, actionContext: { trigger: { phase } },
        } }),
      })
    })
    install(session)
    let response = phase === 'harvest' ? session.performRoundEnd() : session.takeAnytimeAction(0, grant)
    expect(response.ok, response.error).toBe(true)
    expect(response.interaction.stateId === 'wait' && response.interaction.sourceCard).toBe(immediate)
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 2, vegetable: 1, food: 0, wood: 0 })
    response = accept(session, response)
    expect(response.interaction.stateId === 'wait' && response.interaction.sourceCard).toBe(immediate)
    expect(response.state.players[0]!.resources.food).toBe(2)
    session = new GameSession(rehydrateState(JSON.parse(JSON.stringify(serializeSessionSnapshot(session.state, session)))))
    sessions.push(session)
    install(session)
    response = accept(session, session.getState())
    expect(response.interaction.stateId === 'wait' && response.interaction.sourceCard, JSON.stringify(response.interaction)).toBe(after)
    expect(response.state.players[0]!.resources.food).toBe(3)
    response = accept(session, response)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 0, wood: 2 })
    expect(readCardResourceStats(response.state.players[0]!, immediate)?.used).toBe(2)
    expect(readCardResourceStats(response.state.players[0]!, after)?.used).toBe(1)
    expect(response.state.log.length).toBeGreaterThan(0)
    expect(response.scores).toHaveLength(2)
  }, 30_000)
})

describe('Market Master placement-only boundary', () => {
  it.each(['workerless', 'move'])('does not play an occupation after a %s Traveling Players use', mode => {
    const card = 'E131_MarketMaster'
    const grant = 'TEST_1330_MarketGrant'
    let workerId = ''
    const session = setup({ card, occupation: true, playerCount: 4, configure: state => {
      const player = state.players[0]!
      setWorkersAtHome(state, player, 0)
      player.occupationHand = ['A100_Curator']
      player.minorPlayed = [grant]
      state.actionSpaces.find(space => space.id === 'traveling-players')!.resources.food = 3
      workerId = player.workers[0]!.id
      if (mode === 'move') {
        for (const space of state.actionSpaces) space.takenBy = space.takenBy.filter(ref => ref.workerId !== workerId || ref.playerId !== player.id)
        state.actionSpaces.find(space => space.id === 'grain-seeds')!.takenBy.push({ playerId: player.id, workerId })
      }
    } })
    session.withCtx(() => requireActiveCardRegistry('market-master-placement-boundary').registerListener({
      id: grant, cardIds: [grant], actions: ['anytime'], phases: ['anytime'],
      handler: () => ({ sourceCard: grant, flow: mode === 'workerless' ? {
        type: 'leaf', actionId: 'traveling-players', expandFlow: true, sourceCard: grant,
        spaceUse: { newPlacement: false }, actionContext: { targetSpaceId: 'traveling-players' },
      } : {
        type: 'leaf', actionId: 'move-farmer-to-space', sourceCard: grant,
        actionContext: { moveFarmerSourceSpaceId: 'grain-seeds', moveFarmerWorkerId: workerId },
      } }),
    }))
    let response = session.takeAnytimeAction(0, grant)
    if (mode === 'move') response = choose(session, response, 'traveling-players')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.food).toBe(3)
    expect(response.state.players[0]!.occupationHand).toEqual(['A100_Curator'])
    expect(readCardResourceStats(response.state.players[0]!, card)?.used ?? 0).toBe(0)
    expect(response.interaction.stateId === 'wait' && response.interaction.sourceCard).not.toBe(card)
    expect(options(response).some(option => option.sourceCard === card)).toBe(false)
  }, 30_000)
})
