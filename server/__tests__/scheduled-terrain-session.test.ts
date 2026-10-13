import { afterEach, describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { createWorkSession } from './_helpers/session-fixtures'
import { markAllWorkersUsed } from '../../shared/domain/player'
import { getFarmyardTilePositions, positionKey } from '../../shared/domain/farm'
import { getUsedFarmyardTileKeys } from '../../shared/domain/farmyard-usage'

const SCHOLAR = 'B097_Scholar'
const NURSERY = 'M045_TreeNursery'
const EXPEDITION = 'M021_PeatCuttingExpedition'
const sessions: GameSession[] = []
afterEach(() => sessions.splice(0).forEach(session => session.dispose()))

const choose = (session: GameSession, response: SessionResponse, value: string): SessionResponse => {
  if (response.interaction.stateId !== 'wait') throw new Error('Expected a preparation choice')
  const next = session.resolveChoice(response.interaction.playerIndex, value)
  expect(next.ok, next.error).toBe(true)
  return next
}

// A fresh two-player Moor work fixture has no empty farmyard spaces at the
// start of round 12. Scholar buys Peat Cutting Expedition through real choices,
// then the same preparation window must offer the scheduled Nursery forest.
describe('scheduled terrain in the BGA StartOfTurn window', () => {
  it('retains an initially unavailable forest source until another reaction frees a tile', () => {
    const session = createWorkSession({
      seed: 4242,
      options: { enableFarmersOfTheMoor: true, allowIncompleteMoorMinorPool: true },
      configure(state) {
        state.round = 11
        for (const player of state.players) {
          player.resources.food = 100
          player.resources.fuel = 100
          markAllWorkersUsed(state, player)
        }
        const owner = state.players[0]!
        owner.houseType = 'stone'
        owner.occupationPlayed = [SCHOLAR]
        owner.minorPlayed = [NURSERY]
        owner.minorHand = [EXPEDITION]
        owner.farmTerrain = []
        const used = getUsedFarmyardTileKeys(owner)
        const available = getFarmyardTilePositions(owner).filter(tile => !used.has(positionKey(tile)))
        owner.farmTerrain = [{ ...available[0]!, kind: 'moor' }]
        owner.fields = available.slice(1).map(tile => ({ ...tile, stacks: [] }))
        state.futureMeeples.push({
          id: 'nursery-round-12', cardId: NURSERY, playerId: owner.id,
          round: 12, resources: { forest: 1 }, actionId: null,
        })
      },
    })
    sessions.push(session)
    expect(session.state.players[0]!.fields).toHaveLength(12)
    expect(session.state.players[0]!.farmTerrain).toEqual([{ row: 0, col: 0, kind: 'moor' }])

    let response = session.performRoundEnd()
    expect(response.ok, response.error).toBe(true)
    for (let step = 0; step < 3 && response.state.round === 11; step++) {
      if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'heating') {
        throw new Error('Expected the round-11 heating choice')
      }
      expect(response.interaction.request.required).toBe(2)
      response = session.resolveChoice(response.interaction.playerIndex, 'confirm', { fuel: 2, convertWood: 0 })
      expect(response.ok, response.error).toBe(true)
    }
    expect(response.state.round).toBe(12)
    expect(response.state.roundPhase).toBe('preparation')

    for (let step = 0; step < 4 && !response.state.players[0]!.minorPlayed.includes(EXPEDITION); step++) {
      if (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'selection') break
      if (response.interaction.stateId !== 'wait' || !('options' in response.interaction.request)) {
        throw new Error('Expected Scholar to offer Peat Cutting Expedition')
      }
      const options = response.interaction.request.options ?? []
      const option = options.find(candidate => candidate.value === EXPEDITION)
        ?? options.find(candidate => candidate.value === SCHOLAR && !candidate.disabled)
        ?? options.find(candidate => candidate.sourceCard === SCHOLAR && !candidate.disabled && candidate.value !== '__skip__')
        ?? options.find(candidate => candidate.value.includes('improvement') && !candidate.disabled)
      expect(option, JSON.stringify(response.interaction)).toBeDefined()
      if (!option) throw new Error('Scholar did not offer a legal minor improvement')
      response = choose(session, response, option.value)
    }
    expect(response.state.players[0]!.resources.food).toBe(92)
    if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'selection'
      || response.interaction.request.selection.kind !== 'farm-position') throw new Error('Expected the Expedition terrain choice')
    expect(response.interaction.request.selection.selectablePositions).toEqual([{ row: 0, col: 0 }])
    response = session.commitSelectionChoice(response.interaction.playerIndex, { positions: ['0-0'] })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[1]!.minorHand).toContain(EXPEDITION)
    expect(response.state.players[0]!.farmTerrain).toEqual([])
    expect(response.state.roundPhase).toBe('preparation')

    if (response.interaction.stateId !== 'wait' || !('options' in response.interaction.request)) {
      throw new Error('Expected the retained Nursery source after peat removal')
    }
    const forest = response.interaction.request.options?.find(option => option.sourceCard === NURSERY && !option.disabled)
      ?? response.interaction.request.options?.find(option => option.value === NURSERY && !option.disabled)
    expect(forest, JSON.stringify(response.interaction)).toBeDefined()
    if (!forest) throw new Error('The scheduled forest source disappeared')
    response = choose(session, response, forest.value)
    if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'selection'
      || response.interaction.request.selection.kind !== 'farm-position') throw new Error('Expected the live Nursery terrain choice')
    expect(response.interaction.request.selection.selectablePositions).toEqual([{ row: 0, col: 0 }])
    response = session.commitSelectionChoice(response.interaction.playerIndex, { positions: ['0-0'] })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.farmTerrain).toEqual([{ row: 0, col: 0, kind: 'forest' }])
    expect(response.state.futureMeeples).toEqual([])
    expect(response.state.events.filter(event => event.type === 'card.played' && event.cardId === EXPEDITION)).toHaveLength(1)
    expect(response.state.events.filter(event => event.type === 'futureMeeple.resolved' && event.cardId === NURSERY)).toHaveLength(1)
    expect(response.state.roundPhase).toBe('work')
    expect(response.interaction.stateId).toBe('idle')
  })
})
