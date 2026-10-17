import { createWorkSession } from './_helpers/session-fixtures'
import { type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import '../../shared/cards/C/C024_BedintheGrainField'

import { describe, expect, it, afterEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { readCardExtraData } from '../../shared/cards/helpers/card-state'
import { familySize, markAllWorkersUsed } from '../../shared/domain/player'
import type { ActionChoiceOption } from '../../shared/contract/types'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit32Family from './_helpers/audit/ae-negative-32-family'

const CARD_ID = 'C024_BedintheGrainField'

const setupHarvest = (options: { rooms: number; ready?: boolean } = { rooms: 3, ready: true }) => {
  return createWorkSession({ seed: 6024, configure: state => {
    state.round = 4
    state.players.forEach(player => { markAllWorkersUsed(state, player); player.resources.food = 20 })
    const player = state.players[0]!
    player.rooms = options.rooms
    if (options.rooms === 3) player.roomTiles.push({ row: 2, col: 0 })
    player.minorPlayed = [CARD_ID]
    player.cardStates[CARD_ID] = { extraData: { nextHarvestReady: options.ready ?? true } }
  } })
}

const expectC24Prompt = (resp: ReturnType<GameSession['performRoundEnd']>) => {
  expect(resp.interaction.stateId).toBe('wait')
  if (resp.interaction.stateId !== 'wait') throw new Error('expected C24 optional prompt')
  const options = resp.interaction.request.options ?? []
  const skip = options.find((option: ActionChoiceOption) => option.value === '__skip__')
  const accept = options.find((option: ActionChoiceOption) => option.value !== '__skip__')
  expect(skip).toBeDefined()
  expect(accept).toBeDefined()
  return { skip: skip!, accept: accept! }
}

describe('C024_BedintheGrainField session', () => {
  it('can skip the next-harvest family growth and clears the marker', () => {
    const session = setupHarvest({ rooms: 3 })

    let resp = session.performRoundEnd()
    const { skip } = expectC24Prompt(resp)
    resp = session.resolveChoice(0, skip.value)

    const player = resp.state.players[0]!
    expect(familySize(player)).toBe(2)
    expect(readCardExtraData<boolean>(player, CARD_ID, 'nextHarvestReady')).toBe(false)
  })

  it('accepting the next-harvest family growth adds one family member and clears the marker', () => {
    const session = setupHarvest({ rooms: 3 })

    let resp = session.performRoundEnd()
    const { accept } = expectC24Prompt(resp)
    resp = session.resolveChoice(0, accept.value)

    const player = resp.state.players[0]!
    expect(familySize(player)).toBe(3)
    expect(readCardExtraData<boolean>(player, CARD_ID, 'nextHarvestReady')).toBe(false)
  })

  it('does not offer a flow when there is no room and still clears the marker', () => {
    const session = setupHarvest({ rooms: 2 })

    const resp = session.performRoundEnd()

    const player = resp.state.players[0]!
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.request.options?.some((option) => option.value === '__skip__') : false).toBe(false)
    expect(familySize(player)).toBe(2)
    expect(readCardExtraData<boolean>(player, CARD_ID, 'nextHarvestReady')).toBe(false)
  })

  it('does not trigger again after the marker has been cleared', () => {
    const session = setupHarvest({ rooms: 3, ready: false })

    const resp = session.performRoundEnd()

    const player = resp.state.players[0]!
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.request.options?.some((option) => option.value === '__skip__') : false).toBe(false)
    expect(familySize(player)).toBe(2)
    expect(readCardExtraData<boolean>(player, CARD_ID, 'nextHarvestReady')).toBe(false)
  })
})

describe('C024 Bed in the Grain Field parity', () => {
  const CARD_ID = 'C024_BedintheGrainField'

  const FILLER = '__test_placeholder__'

  const setupPurchase = ({ grainField = true, rooms = 3 } = {}) => {
    const session = new GameSession(6024, undefined, { playerCount: 2 })
    const state = session.getState().state
    stabilizeRandomHands(state.players)
    state.currentPlayerIndex = 0
    state.round = 4
    state.roundPhase = 'work'
    state.actionSpaces.forEach((space) => { space.takenBy = [] })
    state.players.forEach((player, index) => {
      setWorkersAtHome(state, player, index === 0 ? 2 : 0)
      player.minorHand = [FILLER]
      player.occupationHand = [FILLER]
      player.minorPlayed = []
      player.occupationPlayed = []
      player.fields = []
      player.resources = {
        ...player.resources,
        wood: 0, clay: 0, reed: 0, stone: 0, food: 20, grain: 0, vegetable: 0,
        sheep: 0, boar: 0, cattle: 0, begging: 0,
      }
    })
    const owner = state.players[0]!
    owner.minorHand = [CARD_ID]
    owner.rooms = rooms
    owner.fields = grainField
      ? [{ row: 0, col: 2, stacks: [{ kind: 'grain', remaining: 1 }] }]
      : []
    session.loadState(state)
    return session
  }

  const options = (response: SessionResponse) => response.interaction.stateId === 'wait'
    ? response.interaction.request.options ?? []
    : []

  const enterMinor = (session: GameSession) => {
    let response = session.takeAction(0, 'meeting-place')
    if (response.interaction.stateId !== 'wait') return response
    if (!options(response).some((option) => option.value === CARD_ID)) {
      const improvement = options(response).find((option) =>
        option.value.startsWith('action-improvement-'))
      if (improvement) response = session.resolveChoice(response.interaction.playerIndex, improvement.value)
    }
    return response
  }

  const playMinor = (session: GameSession) => {
    let response = enterMinor(session)
    if (!response.state.players[0]!.minorHand.includes(CARD_ID)) return response
    if (response.interaction.stateId !== 'wait') return response
    const card = options(response).find((option) =>
      option.value === CARD_ID || option.value === `minor:${CARD_ID}`)
    if (card) response = session.resolveChoice(response.interaction.playerIndex, card.value)
    return response
  }

  const setupHarvest = ({ rooms = 3 } = {}) => {
    const session = setupPurchase({ rooms })
    const played = playMinor(session)
    expect(played.ok, played.error).toBe(true)
    expect(played.state.players[0]!.minorPlayed).toContain(CARD_ID)
    const state = session.getState().state
    state.players.forEach((player) => {
      markAllWorkersUsed(state, player)
      player.resources.food = 20
      player.minorHand = [FILLER]
      player.occupationHand = [FILLER]
    })
    session.loadState(state)
    return session
  }

  const resolveHarvest = (session: GameSession, acceptGrowth: boolean) => {
    let response = session.performRoundEnd()
    for (let guard = 0; guard < 40 && response.interaction.stateId === 'wait'; guard += 1) {
      const interaction = response.interaction
      if (interaction.request.kind === 'feed') {
        response = session.resolveChoice(interaction.playerIndex, 'confirm', { selections: [] })
        continue
      }
      const interactionOptions = interaction.request.options ?? []
      if (interaction.request.kind === 'select-trigger') {
        const trigger = interactionOptions.find((option) =>
          option.value === CARD_ID || option.sourceCard === CARD_ID)
        const fallback = interactionOptions.find((option) => option.value === '__done__')
          ?? interactionOptions[0]
        if (!trigger && !fallback) break
        response = session.resolveChoice(interaction.playerIndex, (trigger ?? fallback)!.value)
        continue
      }
      if (interaction.sourceCard === CARD_ID
        || interactionOptions.some((option) => option.sourceCard === CARD_ID)) {
        const chosen = acceptGrowth
          ? interactionOptions.find((option) => option.value !== '__skip__')
          : interactionOptions.find((option) => option.value === '__skip__')
        expect(chosen, JSON.stringify(interaction)).toBeDefined()
        response = session.resolveChoice(interaction.playerIndex, chosen!.value)
        continue
      }
      const next = interactionOptions.find((option) => option.value === '__done__')
        ?? interactionOptions.find((option) => option.value === '__skip__')
        ?? interactionOptions[0]
      if (!next) break
      response = session.resolveChoice(interaction.playerIndex, next.value)
    }
    return response
  }

  it('C024 S1: one planted grain field allows Bed in the Grain Field to be played', () => {
    const response = playMinor(setupPurchase())

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
  })

  it('C024 S2: without a grain field Bed in the Grain Field remains unavailable', () => {
    const response = enterMinor(setupPurchase({ grainField: false }))

    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
    expect(options(response).some((option) =>
      option.value === CARD_ID || option.value === `minor:${CARD_ID}`)).toBe(false)
  })

  it('C024 S3: accepting the next-harvest offer grows the family and feeds the newborn', () => {
    const response = resolveHarvest(setupHarvest(), true)

    expect(response.ok, response.error).toBe(true)
    expect(familySize(response.state.players[0]!)).toBe(3)
    expect(response.state.players[0]!.resources.food).toBe(15)
  })
})

describe('ae-negative-32-family', () => {
  const { sessions, save, ok, choose, pendingCard, trigger, finish, progress, buy, accept, bed } = audit32Family
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()));
  it('C024 N1 actual grain field purchase gives growth only at the next natural harvest feeds one newborn food and never repeats at a later harvest', () => { const s = bed(), bought = finish(s, buy(s, 'C024_BedintheGrainField')); assert.equal(familySize(bought.state.players[0]!), 2); const p = progress(s, 8, 'C024_BedintheGrainField'), grown = accept(s, p, 'C024_BedintheGrainField'), r = finish(s, grown); assert.deepEqual([familySize(r.state.players[0]!), r.state.players[0]!.resources.food], [3, 95]); const later = progress(s, 10, 'C024_BedintheGrainField'); assert.equal(pendingCard(later, 'C024_BedintheGrainField'), false); assert.equal(familySize(later.state.players[0]!), 3); save('C024-N1', { bought, p, grown, r, later }); });
  it('C024 N2 decline and no room consume the next harvest opportunity even when a room is built before the following harvest', () => { const s = bed(), bought = finish(s, buy(s, 'C024_BedintheGrainField')), p = trigger(s, progress(s, 8, 'C024_BedintheGrainField'), 'C024_BedintheGrainField'), decline = finish(s, choose(s, p, o => o.value === '__skip__')), later = progress(s, 10, 'C024_BedintheGrainField'); assert.equal(pendingCard(later, 'C024_BedintheGrainField'), false); assert.equal(familySize(later.state.players[0]!), 2); const t = bed(2), purchase = finish(t, buy(t, 'C024_BedintheGrainField')), empty = progress(t, 8); assert.equal(familySize(empty.state.players[0]!), 2); let build = ok(t.takeAction(0, 'farm-expansion')); if (build.interaction.stateId === 'wait' && build.interaction.request.kind === 'choice')
      build = choose(t, build, o => o.labelKey === 'actions.construct.name'); const roomBuilt = finish(t, ok(t.commitSelectionChoice(0, { rooms: [{ row: 1, col: 1 }] }))), after = progress(t, 10, 'C024_BedintheGrainField'); assert.equal(pendingCard(after, 'C024_BedintheGrainField'), false); assert.equal(familySize(after.state.players[0]!), 2); assert.equal(after.state.players[0]!.rooms, 3); save('C024-N2', { bought, p, decline, later, purchase, empty, build, roomBuilt, after }); });
  it('C024 N3 a vegetable field fails the grain prerequisite and a held card cannot grow the family at harvest', () => { const s = bed(4, false), poor = buy(s, 'C024_BedintheGrainField'); assert.ok(poor.state.players[0]!.minorHand.includes('C024_BedintheGrainField')); assertRejectedUnchanged(s, () => s.resolveChoice(0, 'C024_BedintheGrainField')); const t = bed(), hand = progress(t, 8, 'C024_BedintheGrainField'); assert.equal(pendingCard(hand, 'C024_BedintheGrainField'), false); assert.equal(familySize(hand.state.players[0]!), 2); save('C024-N3', { poor, hand }); });
  it('C024 N4 four available food leave one food of actual newborn feeding demand which a catalogued grain conversion satisfies', () => { const s = bed(4, true, 4), bought = finish(s, buy(s, 'C024_BedintheGrainField')), p = progress(s, 8, 'C024_BedintheGrainField'), grown = accept(s, p, 'C024_BedintheGrainField'), feed = finish(s, grown, '__feed__'); save('C024-N4-feed', feed); assert.ok(feed.interaction.stateId === 'wait' && feed.interaction.request.kind === 'feed'); assert.deepEqual([feed.interaction.request.foodUsed, feed.interaction.request.remaining], [4, 1]); const conversion = feed.interaction.request.exchangeCatalog?.find(e => e.from.grain === 1 && e.to.food === 1); assert.ok(conversion); const r = finish(s, ok(s.resolveChoice(0, 'confirm', { selections: [{ sourceId: conversion.sourceId, exchangeIndex: conversion.exchangeIndex, count: 1, sourceName: conversion.sourceId }] }))); assert.deepEqual([r.state.players[0]!.resources.food, r.state.players[0]!.resources.grain, r.state.players[0]!.resources.begging], [0, 0, 0]); save('C024-N4', { bought, p, grown, feed, r }); });
})
