import { afterEach, describe, expect, it } from 'vitest'
import type { GameSession, SessionResponse } from '../game/authoritative-session'
import { createWorkSession } from './_helpers/session-fixtures'

import '../../shared/cards/A/A094_LazySowman'
import '../../shared/cards/B/B026_AgrarianFences'

const sessions: GameSession[] = []
afterEach(() => sessions.splice(0).forEach((session) => session.dispose()))

const waiting = (response: SessionResponse) => {
  expect(response.ok, response.error).toBe(true)
  if (response.interaction.stateId !== 'wait') throw new Error('Expected pending interaction')
  return response.interaction
}

const choices = (response: SessionResponse) => {
  const request = waiting(response).request
  if (request.kind !== 'choice') throw new Error('Expected choice interaction')
  return request.options
}

const farm = (response: SessionResponse) => {
  const request = waiting(response).request
  return request.kind === 'farm-select' ? request.farm : undefined
}

const chooseLabel = (session: GameSession, response: SessionResponse, labelKey: string) => {
  const option = choices(response).find((candidate) => candidate.labelKey === labelKey
    || candidate.labelParams?.actionNameKey === labelKey)
  expect(option, JSON.stringify(response.interaction)).toBeDefined()
  return session.resolveChoice(0, option!.value)
}

const setup = (options?: {
  withCard?: boolean
  grain?: number
  vegetable?: number
  wood?: number
}) => {
  const session = createWorkSession({ configure: (state) => {
    state.round = 3
    const player = state.players[0]!
    Object.assign(player.resources, {
      grain: options?.grain ?? 3,
      vegetable: options?.vegetable ?? 0,
      wood: options?.wood ?? 10,
      food: 5,
    })
    player.fields = [
      { row: 0, col: 2, stacks: [] },
      { row: 0, col: 3, stacks: [] },
    ]
    if (options?.withCard ?? true) player.minorPlayed.push('B026_AgrarianFences')
  } })
  sessions.push(session)
  return session
}

describe('B026_AgrarianFences session', () => {
  it('without the card, grain-utilization offers normal sow/bake choices', () => {
    const session = setup({ withCard: false })
    const resp = session.takeAction(0, 'grain-utilization')
    expect(resp.ok).toBe(true)
    // Normal grain-utilization: or(sow, bake-bread) — presents sow and bake choices
    expect(resp.interaction.stateId).toBe('wait')
  })

  it('with the card, grain-utilization offers a complete fencing plan or its original flow', () => {
    const session = setup({ withCard: true })
    const resp = session.takeAction(0, 'grain-utilization')
    expect(resp.ok).toBe(true)
    // Composite replacement keeps the fencing plans separate from the original flow.
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    // Should have more options than just normal sow/bake
    expect(choices(resp).length).toBeGreaterThanOrEqual(2)
  })

  it('keeps Lazy Sowman selectable inside the Agrarian Fences sow-and-fence plan', () => {
    const session = setup({ withCard: true })
    const state = session.getState().state
    state.players[0]!.occupationPlayed.push('A094_LazySowman')
    session.loadState(state)

    let resp = session.takeAction(0, 'grain-utilization')
    expect(waiting(resp).promptKey).toBe('ui.interactionSelectReplacement')
    expect(choices(resp).some((option) => option.labelKey === 'ui.interactionDoNotReplace')).toBe(true)
    const agrarianFences = choices(resp).find((option) => option.sourceCard === 'B026_AgrarianFences')!
    resp = session.resolveChoice(0, agrarianFences.value)
    resp = chooseLabel(session, resp, 'ui.interactionAgrarianFencesSowAndFence')
    resp = chooseLabel(session, resp, 'actions.sow.name')

    expect(waiting(resp).promptKey).toBe('ui.interactionSelectReplacement')
    expect(choices(resp).map((option) => option.labelKey)).toEqual([
      'ui.interactionUseCard', 'ui.interactionDoNotReplace',
    ])
    expect(choices(resp).some((option) => option.sourceCard === 'A094_LazySowman')).toBe(true)
    resp = chooseLabel(session, resp, 'ui.interactionDoNotReplace')
    const selection = farm(resp)
    if (selection?.farmType !== 'sow') throw new Error('Expected normal Sow selection')
    resp = session.commitSelectionChoice(0, { crops: [{ ...selection.selectableFields[0]!.tile, crop: 'grain' }] })
    expect(resp.ok, resp.error).toBe(true)
    expect(resp.state.players[0]!.resources).toMatchObject({ grain: 2, wood: 10 })

    resp = chooseLabel(session, resp, 'actions.fencing.name')
    expect(farm(resp)?.farmType).toBe('fence')
    resp = session.commitSelectionChoice(0, { edges: ['H-2-4', 'H-3-4', 'V-2-4', 'V-2-5'], palisadeEdges: [], extraWood: 0 })
    expect(resp.ok, resp.error).toBe(true)
    expect(resp.state.players[0]!.resources).toMatchObject({ grain: 2, wood: 6 })
    expect(resp.state.players[0]!.fields[0]!.stacks).toEqual([{ kind: 'grain', remaining: 3 }])
    expect(resp.state.players[0]!.fenceSegments).toHaveLength(4)
    expect(waiting(resp).request.kind).toBe('confirm-next-player')
    expect(resp.scores).toHaveLength(2)
    expect(resp.state.log.length).toBeGreaterThan(0)
  })

  it('rejects entry without fencing resources, seeds, or a baking improvement', () => {
    const session = setup({ withCard: true, wood: 0, grain: 0 })
    const resp = session.takeAction(0, 'grain-utilization')
    expect(resp.ok).toBe(false)
    expect(resp.error).toBe('space unavailable')
    expect(resp.state.actionSpaces.find((space) => space.id === 'grain-utilization')!.takenBy).toHaveLength(0)
  })

  it('does not affect sow actions outside grain-utilization', () => {
    const session = setup({ withCard: true })
    const state = session.getState().state
    // Advance to round 5 to unlock cultivation (which also has sow)
    state.round = 5
    session.loadState(state)

    const resp = session.takeAction(0, 'cultivation')
    expect(resp.ok).toBe(true)
    if (resp.interaction.stateId !== 'wait') return
    // Cultivation should not have fence options — B26 only affects grain-utilization
    const optionValues = choices(resp).map((o) => o.value)
    const hasFenceOption = optionValues.some((v) => v.includes('fence'))
    expect(hasFenceOption).toBe(false)
  })
})
