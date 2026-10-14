import { afterEach, describe, expect, it } from 'vitest'
import type { GameSession, SessionResponse } from '../game/authoritative-session'
import { validateAndCompileCustomCode } from '../custom-code/engine'
import { getCurrentSessionContext, type CustomCardData } from '../../shared/cards/session-card-context'
import { createWorkSession } from './_helpers/session-fixtures'
import { playMinor, sessionOptions } from './_helpers/card-regression-session'

const DRILL_HARROW = 'D017_DrillHarrow'
const sessions: GameSession[] = []
afterEach(() => sessions.splice(0).forEach(session => session.dispose()))
type Crop = 'grain' | 'vegetable'

// A custom purchase supplies only the generic Sow context. The public Session
// proves restricted admission and before-hooks without inventing an official card.
function sowCard(allowedCrops: readonly Crop[]): CustomCardData {
  const id = `CUSTOM_DrillHarrowSow_${allowedCrops.join('_')}`
  const compiled = validateAndCompileCustomCode(`
const CARD_ID = '${id}'
const CARD_DEF = MinorImprovement({ id: CARD_ID, name: 'Sow Crop Permission' })
const CARD_IMPL = { effect: { id: CARD_ID,
  onBuy: () => ({ type: 'leaf', actionId: 'sow', optional: true, sourceCard: CARD_ID })
} }
`, id)
  if (!compiled.valid) throw new Error(compiled.errors.join('\n'))
  return {
    cardType: 'minor', cardJson: { id, name: 'Sow Crop Permission', deck: 'CUSTOM', number: 0, desc: [] },
    compiledCode: compiled.compiledCode, codeManifest: compiled.manifest,
  }
}

function setup(allowedCrops: readonly Crop[]) {
  const card = sowCard(allowedCrops)
  const session = createWorkSession({ seed: 1160, customCards: [card], configure(state) {
    const owner = state.players[0]!
    owner.minorHand = [card.cardJson.id]
    owner.minorPlayed = [DRILL_HARROW]
    owner.fields = []
    Object.assign(owner.resources, { grain: 1, vegetable: 0, food: 3, wood: 0 })
  } })
  sessions.push(session)
  // Native ActionFlow fixture, not a sandbox capability. allowedCrops stays
  // outside the Workshop whitelist; the compiled card supplies only its identity.
  session.withCtx(() => {
    const context = getCurrentSessionContext()
    if (!context) throw new Error('Missing custom card Session context')
    context.registerEffect({
      id: card.cardJson.id,
      onBuy: () => ({ type: 'leaf', actionId: 'sow', optional: true, sourceCard: card.cardJson.id,
        actionContext: { allowedCrops: [...allowedCrops] } }),
    })
  })
  expect(session.getState().state.players).toHaveLength(2)
  expect(session.getState().state.players[0]!.workers).toHaveLength(5)
  return { session, cardId: card.cardJson.id }
}

function advance(session: GameSession, response: SessionResponse, stop: 'complete' | 'plow' | 'sow', restricted = false): SessionResponse {
  for (let step = 0; step < 12; step++) {
    expect(response.ok, response.error).toBe(true)
    const interaction = response.interaction
    if (restricted && interaction.stateId === 'wait') {
      expect(interaction.sourceCard, 'Restricted Sow must not offer Drill Harrow').not.toBe(DRILL_HARROW)
      expect(sessionOptions(response).some(option => option.sourceCard === DRILL_HARROW),
        'Restricted Sow must not offer a Drill Harrow trigger').toBe(false)
    }
    if (interaction.stateId !== 'wait' || interaction.request.kind === 'confirm-next-player') {
      if (stop !== 'complete') throw new Error(`Missing ${stop} request`)
      return response
    }
    const request = interaction.request
    if (request.kind === 'farm-select') {
      expect(restricted, 'Restricted Sow must not bootstrap a field').toBe(false)
      if (request.farm.farmType === stop) return response
      throw new Error(`Unexpected farm selection ${request.farm.farmType}`)
    }
    if (request.kind !== 'choice' && request.kind !== 'select-trigger') throw new Error(JSON.stringify(interaction))
    const available = request.options.filter(option => !('disabled' in option && option.disabled))
    const option = available.find(option => !['__skip__', '__pass__', '__done__'].includes(option.value))
      ?? available.find(option => ['__skip__', '__pass__', '__done__'].includes(option.value))
    if (!option) throw new Error(`No legal continuation: ${JSON.stringify(interaction)}`)
    response = session.resolveChoice(interaction.playerIndex, option.value)
  }
  throw new Error('Sow purchase did not finish')
}

describe('Drill Harrow requires ordinary crop permissions even before the first field exists', () => {
  it.each(['grain', 'vegetable'] as const)('%s-only Sow completes its purchase without a Drill Harrow offer or payment', crop => {
    const { session, cardId } = setup([crop])
    const completed = advance(session, playMinor(session, cardId), 'complete', true)
    const owner = completed.state.players[0]!
    expect(owner.minorPlayed).toContain(cardId)
    expect(owner.minorHand).not.toContain(cardId)
    expect(owner.resources).toMatchObject({ food: 3, grain: 1 })
    expect(owner.fields).toEqual([])
    expect(completed.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'confirm-next-player' } })
    expect(completed.state.events.filter(event => event.type === 'resource.paid' && event.sourceCardId === DRILL_HARROW)).toEqual([])
    expect(completed.state.events.filter(event => event.type === 'farm.fieldPlowed')).toEqual([])
    expect(completed.state.log.filter(row => row.key === 'log.cardEffectPay' && row.params?.cardId === DRILL_HARROW)).toEqual([])
  })

  it('ordinary grain and vegetable permissions allow payment, the first legal plow, and grain sowing', () => {
    const { session, cardId } = setup(['grain', 'vegetable'])
    const plow = advance(session, playMinor(session, cardId), 'plow')
    expect(plow.state.players[0]!.resources).toMatchObject({ food: 0, grain: 1 })
    expect(plow.state.players[0]!.fields).toEqual([])
    if (plow.interaction.stateId !== 'wait' || plow.interaction.request.kind !== 'farm-select'
      || plow.interaction.request.farm.farmType !== 'plow') throw new Error('Expected Drill Harrow plow')
    const tile = plow.interaction.request.farm.selectableTiles[0]!
    expect(tile).toBeDefined()
    const sow = advance(session, session.commitSelectionChoice(0, { tile }), 'sow')
    expect(sow.state.players[0]!.fields).toEqual([{ ...tile, stacks: [] }])
    const completed = advance(session, session.commitSelectionChoice(0, { crops: [{ ...tile, crop: 'grain' }] }), 'complete')
    expect(completed.state.players[0]!.resources).toMatchObject({ food: 0, grain: 0 })
    expect(completed.state.players[0]!.fields).toEqual([{ ...tile, stacks: [{ kind: 'grain', remaining: 3 }] }])
    expect(completed.state.players[0]!.minorPlayed).toContain(cardId)
    expect(completed.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'confirm-next-player' } })
    expect(completed.state.events.filter(event => event.type === 'resource.paid' && event.sourceCardId === DRILL_HARROW)).toHaveLength(1)
    expect(completed.state.events.filter(event => event.type === 'farm.fieldPlowed')).toHaveLength(1)
    expect(completed.state.log).toContainEqual(expect.objectContaining({
      key: 'log.cardEffectPay', playerId: completed.state.players[0]!.id,
      params: expect.objectContaining({ cardId: DRILL_HARROW, cost: { food: 3 } }),
    }))
  })
})
