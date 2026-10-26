import { afterEach, describe, expect, it } from 'vitest'
import type { SessionResponse } from '../../shared/contract/types'
import { improvementAction } from '../../shared/actions/effects/improvement'
import { createWorkSession } from './_helpers/session-fixtures'
import { descriptionEffects } from './_helpers/choice-description'

const cards = ['A053_Claypipe', 'A076_Cob', 'B065_GrainDepot']
const sessions: ReturnType<typeof createWorkSession>[] = []
afterEach(() => sessions.splice(0).forEach(session => session.dispose()))

const open = (hand = cards, clay = 4) => {
  const session = createWorkSession({ seed: 1369, configure: state => {
    state.players[0]!.minorHand = hand
    Object.assign(state.players[0]!.resources, { wood: 4, clay, stone: 4, food: 4 })
  } })
  sessions.push(session)
  return session
}

const choices = (response: SessionResponse) => {
  expect(response.ok, response.error).toBe(true)
  if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'choice') {
    throw new Error('Expected an improvement choice')
  }
  return response.interaction.request.options
}

const offer = (response: SessionResponse) => {
  const option = choices(response).find(candidate => candidate.value.startsWith('action-improvement-'))
  if (!option) throw new Error('Expected the optional improvement')
  return option
}

const describedImprovement = (response: SessionResponse) => {
  const description = offer(response).descriptionPreview
  expect(description).toMatchObject({ kind: 'group', operator: 'sequence', optional: true })
  if (description?.kind !== 'group' || description.parts[0]?.kind !== 'action') {
    throw new Error('Expected an improvement inside its optional sequence')
  }
  return description.parts[0]
}

describe('improvement descriptions limit candidate-card expansion', () => {
  it.each([1, 2])('keeps the full parent preview with %i candidate cards', count => {
    const session = open(cards.slice(0, count))
    const description = describedImprovement(session.takeAction(0, 'meeting-place'))
    if (description?.kind !== 'action' || description.effectPreview?.kind !== 'rule'
      || description.effectPreview.description.kind !== 'group') throw new Error('Expected detailed candidates')
    expect(description.effectPreview.description.parts.map(part => part.kind === 'action' ? part.labelKey : undefined))
      .toEqual(cards.slice(0, count).map(id => `minorImprovements.${id}.name`))
    expect(descriptionEffects(description).filter(effect => effect.kind === 'payment').map(effect => effect.resourcesPaid))
      .toMatchObject(count === 1 ? [{ clay: 1 }] : [{ clay: 1 }, { food: 1 }])
  })

  it('summarizes three candidates while preserving all card and payment choices', () => {
    const session = open()
    let response = session.takeAction(0, 'meeting-place')
    const option = offer(response)
    expect(option.descriptionPreview).toMatchObject({
      kind: 'group', optional: true, parts: [{ kind: 'action', effectPreview: { kind: 'cardSelection', types: ['minor'] } }],
    })
    const before = JSON.stringify(session.state)
    for (let read = 0; read < 3; read++) {
      expect(offer(session.getState()).descriptionPreview).toEqual(option.descriptionPreview)
    }
    expect(JSON.stringify(session.state)).toBe(before)

    response = session.resolveChoice(0, option.value)
    expect(choices(response).map(candidate => candidate.value)).toEqual(cards)
    const depot = choices(response).find(candidate => candidate.value === 'B065_GrainDepot')!
    expect(descriptionEffects({ kind: 'action', labelKey: depot.labelKey, effectPreview: depot.effectPreview })
      .filter(effect => effect.kind === 'payment').map(effect => effect.resourcesPaid))
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ wood: 2 }), expect.objectContaining({ clay: 2 }), expect.objectContaining({ stone: 2 }),
      ]))
    response = session.resolveChoice(0, depot.value)
    expect(response.interaction.promptKey).toBe('prompt.selectPayment')
    expect(choices(response)).toHaveLength(3)
    const clayPayment = choices(response).find(candidate => descriptionEffects(candidate.descriptionPreview)
      .some(effect => effect.kind === 'payment' && effect.resourcesPaid?.clay === 2))
    if (!clayPayment) throw new Error('Expected the Grain Depot clay payment')
    response = session.resolveChoice(0, clayPayment.value)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain('B065_GrainDepot')
    expect(response.state.players[0]!.minorHand).toEqual(cards.slice(0, 2))
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 4, clay: 2, stone: 4, food: 4 })
    expect(response.state.futureMeeples).toMatchObject([
      { round: 2, resources: { grain: 1 } }, { round: 3, resources: { grain: 1 } }, { round: 4, resources: { grain: 1 } },
    ])
    expect(response.state.log).toContainEqual(expect.objectContaining({
      key: 'log.playMinorImprovement', params: expect.objectContaining({ improvements: 'B065_GrainDepot', costResources: { clay: 2 } }),
    }))
    expect(response.scores?.[0]).toBeDefined()
  })

  it('counts affordable cards rather than hand size or payment branches', () => {
    const session = open(cards, 0)
    const description = describedImprovement(session.takeAction(0, 'meeting-place'))
    expect(description?.kind).toBe('action')
    if (description?.kind !== 'action' || description.effectPreview?.kind !== 'rule'
      || description.effectPreview.description.kind !== 'group') throw new Error('Expected two affordable candidates')
    expect(description.effectPreview.description.parts.map(part => part.kind === 'action' ? part.labelKey : undefined))
      .toEqual(['minorImprovements.A076_Cob.name', 'minorImprovements.B065_GrainDepot.name'])
  })

  it('keeps all three payments and their outcomes when only Grain Depot is available', () => {
    const session = open(['B065_GrainDepot'])
    const effects = descriptionEffects(offer(session.takeAction(0, 'meeting-place')).descriptionPreview)
    expect(effects.filter(effect => effect.kind === 'payment').map(effect => effect.resourcesPaid))
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ wood: 2 }), expect.objectContaining({ clay: 2 }), expect.objectContaining({ stone: 2 }),
      ]))
    expect(effects.filter(effect => effect.kind === 'futureSchedule')).toHaveLength(3)
  })

  it.each([{ allowedPurchases: [] }, { allowedPurchases: cards.slice(0, 2) }, { allowedPurchases: cards }])('preserves explicit purchase restrictions $allowedPurchases', ({ allowedPurchases }) => {
    const session = open()
    const before = JSON.stringify(session.state)
    const preview = session.withCtx(() => improvementAction.previewEffect?.({
      state: session.state, player: session.state.players[0]!, actionHooks: session.actionHooks,
      space: session.state.actionSpaces.find(space => space.id === 'meeting-place')!,
      params: { allowedPurchases }, actionContext: { types: ['minor'] },
    }))
    if (allowedPurchases.length === 2) {
      expect(preview).toMatchObject({ kind: 'rule', description: { kind: 'group', parts: [
        { labelKey: 'minorImprovements.A053_Claypipe.name' }, { labelKey: 'minorImprovements.A076_Cob.name' },
      ] } })
    } else {
      expect(preview).toEqual({ kind: 'cardSelection', types: ['minor'], allowedCards: allowedPurchases })
    }
    expect(JSON.stringify(session.state)).toBe(before)
  })
})
