import { withActiveRegistry } from '../../shared/cards/active-registry'
import { createOfficialCardRegistry } from '../../shared/cards/__tests__/card-environment'
import { GameSession } from '../game/authoritative-session'
import { markAllWorkersUsed, setActiveWorkerCount, setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import { describe, expect, it, afterEach } from 'vitest'
import { D155_Ebonist as DisplayD155 } from '../../shared/cards/D/D155_Ebonist'
import { D155_Ebonist as RuntimeD155 } from '../../shared/cards/D/D155_Ebonist'
import { getExchangesInWindow } from '../../shared/actions/effects/exchange'
import type { PlayerState } from '../../shared/contract/types'
import { BASIC_CONVERSION_SOURCE_ID } from '../../shared/cards/basic-conversion'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit56Phase from './_helpers/audit/ae-negative-56-phase'

const CARD_ID = 'D155_Ebonist'

describe('D155_Ebonist exchange metadata', () => {
  it.each([DisplayD155, RuntimeD155])('exposes a harvest exchange on both definitions', (definition) => {
    expect(definition.id).toBe(CARD_ID)
    expect(definition.exchanges).toHaveLength(1)

    const xch = definition.exchanges![0]!
    expect(xch).toMatchObject({
      from: { wood: 1 },
      to: { food: 1, grain: 1 },
      max: 1,
      sourceId: CARD_ID,
      triggers: ['harvest'],
    })
  })

  it('is visible in the harvest window but not the anytime window', () => {
    const ruleRegistry = createOfficialCardRegistry()
    const player = {
      occupationPlayed: [CARD_ID],
      minorPlayed: [],
      improvements: [],
    } as unknown as PlayerState

    expect(withActiveRegistry(ruleRegistry, () => getExchangesInWindow(player, 'anytime')).some((trade) => trade.sourceId === CARD_ID)).toBe(false)
    expect(withActiveRegistry(ruleRegistry, () => getExchangesInWindow(player, 'harvest')).some((trade) => trade.sourceId === CARD_ID)).toBe(true)
  })
})

describe('D155 Ebonist parity', () => {
  const CARD_ID = 'D155_Ebonist'

  const FILLER = '__test_placeholder__'

  const setup = ({
    played = true, wood = 1, food = 4, round = 4, harvest = false,
  }: {
    played?: boolean
    wood?: number
    food?: number
    round?: number
    harvest?: boolean
  } = {}) => {
    const session = new GameSession(6155, undefined, { playerCount: 4 })
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.currentPlayerIndex = 0
    state.round = round
    state.roundPhase = 'work'
    state.actionSpaces.forEach((space) => { space.takenBy = [] })
    state.players.forEach((player, index) => {
      setWorkersAtHome(state, player, 2)
      player.minorHand = [FILLER]
      player.occupationHand = [FILLER]
      player.minorPlayed = []
      player.occupationPlayed = []
      player.cardStates = {}
      player.resources = {
        ...player.resources, wood: 0, clay: 0, reed: 0, stone: 0,
        food: index === 0 ? 0 : 20, grain: 0, vegetable: 0,
        sheep: 0, boar: 0, cattle: 0, begging: 0,
      }
    })
    const owner = state.players[0]!
    owner.occupationHand = played ? [FILLER] : [CARD_ID]
    owner.occupationPlayed = played ? [CARD_ID] : []
    owner.resources = { ...owner.resources, wood, food }
    owner.startPlayer = true
    state.players.slice(1).forEach((player) => { player.startPlayer = false })
    if (harvest) {
      state.players.forEach((player) => {
        markAllWorkersUsed(state, player)
        setActiveWorkerCount(player, 2)
      })
    }
    session.loadState(state)
    return session
  }

  const ebonistTrade = [{
    sourceId: CARD_ID, exchangeIndex: 0, count: 1, sourceName: 'Ebonist',
  }]

  it('D155 S2: during harvest one wood becomes one food and one grain before feeding', () => {
    const session = setup({ food: 3, harvest: true })
    let response = session.performRoundEnd()
    expect(response.interaction).toMatchObject({
      stateId: 'wait', playerIndex: 0, request: { kind: 'feed' },
    })

    response = session.resolveChoice(0, 'confirm', { selections: ebonistTrade })

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({
      wood: 0, grain: 1, food: 0, begging: 0,
    })
  })

  it('D155 S3: the harvest exchange may be declined', () => {
    const session = setup({ harvest: true })
    let response = session.performRoundEnd()
    expect(response.interaction).toMatchObject({
      stateId: 'wait', playerIndex: 0, request: { kind: 'feed' },
    })

    response = session.resolveChoice(0, 'confirm', { selections: [] })

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({
      wood: 1, grain: 0, food: 0, begging: 0,
    })
  })

  it('D155 S4: Ebonist is limited to one exchange in a harvest and allows a legal retry', () => {
    const session = setup({ wood: 2, food: 3, harvest: true })
    let response = session.performRoundEnd()
    const before = session.getState()

    response = session.resolveChoice(0, 'confirm', {
      selections: [{ ...ebonistTrade[0]!, count: 2 }],
    })
    expect(response.ok).toBe(false)
    expect(response.state).toEqual(before.state)
    expect(response.interaction).toEqual(before.interaction)

    response = session.resolveChoice(0, 'confirm', { selections: ebonistTrade })

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({
      wood: 1, grain: 1, food: 0, begging: 0,
    })
  })

  it('allows an earlier harvest exchange to fund a later basic conversion', () => {
    const session = setup({ food: 2, harvest: true })
    let response = session.performRoundEnd()
    expect(response.interaction).toMatchObject({
      stateId: 'wait',
      playerIndex: 0,
      request: {
        kind: 'feed',
        exchangeCatalog: expect.arrayContaining([
          expect.objectContaining({
            sourceId: BASIC_CONVERSION_SOURCE_ID,
            exchangeIndex: 0,
            from: { grain: 1 },
            to: { food: 1 },
          }),
        ]),
      },
    })

    response = session.resolveChoice(0, 'confirm', {
      selections: [
        ...ebonistTrade,
        { sourceId: BASIC_CONVERSION_SOURCE_ID, exchangeIndex: 0, count: 1 },
      ],
    })

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({
      wood: 0, grain: 0, food: 0, begging: 0,
    })
  })
})

describe('ae-negative-56-phase', () => {
  const { sessions, ok, save, make, finish, end, feed, trade } = audit56Phase
  afterEach(() => sessions.splice(0).forEach(session => session.dispose()))
  it('D155 N1 actual harvest exchanges one wood for one grain food and rejects repeat count two before legal retry',()=>{const s=make('D155_Ebonist',st=>{st.players[0]!.resources.wood=2},true,4),p=feed(s),rejected=assertRejectedUnchanged(s,()=>trade(s,2)),r=finish(s,ok(trade(s,1)));assert.equal(r.state.players[0]!.resources.wood,1);assert.equal(r.state.players[0]!.resources.grain,1);assert.equal(r.state.players[0]!.resources.food,97);save('D155-N1',{p,rejected,r})})
  it('D155 N2 decline zero wood hand-only and a nonharvest round cannot exchange wood into grain or food',()=>{for(const mode of['decline','wood','hand','round']){const s=make('D155_Ebonist',st=>{st.players[0]!.resources.wood=mode==='wood'?0:1},mode!=='hand',mode==='round'?5:4),r=finish(s,end(s));assert.equal(r.state.players[0]!.resources.wood,mode==='wood'?0:1);assert.equal(r.state.players[0]!.resources.grain,0);assert.equal(r.state.players[0]!.resources.food,mode==='round'?100:96);save(`D155-N2-${mode}`,r)}})
})
