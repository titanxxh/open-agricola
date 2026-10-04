import { afterEach, describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { registerActionHook, unregisterActionHook } from '../../shared/actions/hooks'
import { ListenerPurityViolationError } from '../../shared/cards/__tests__/listener-purity-guard'
import { serializeSessionSnapshot } from '../../shared/session/serialization'

const HOOK_ID = 'test:cost-preview-purity'
const setup = () => {
  const session = new GameSession(563, undefined, { playerCount: 2 })
  const state = session.getState().state
  for (const player of state.players) {
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
  }
  state.players[0]!.resources.wood = 4
  state.players[0]!.resources.reed = 2
  session.loadState(state)
  return session
}

describe('cost preview query purity in a two-player Session', () => {
  afterEach(() => unregisterActionHook(HOOK_ID))

  it('rejects a generic cost hook writing another player through a state alias', () => {
    const session = setup()
    const before = JSON.stringify(session.getState().state)
    registerActionHook({ id: HOOK_ID, actions: ['construct'], phases: ['computeCosts'], handler: context => {
      context.state.players[1]!.resources.food += 1
      return { costs: { wood: -1 } }
    } })
    expect(() => session.getActionAvailability(0)).toThrow(ListenerPurityViolationError)
    unregisterActionHook(HOOK_ID)
    expect(JSON.stringify(session.getState().state)).toBe(before)
  })

  it('repeated pure previews preserve the cursor and charge the same discounted room cost', () => {
    const session = setup()
    registerActionHook({ id: HOOK_ID, actions: ['construct'], phases: ['computeCosts'], handler: () => ({ costs: { wood: -1 } }) })
    const before = serializeSessionSnapshot(session.state, session)
    const availability = session.getActionAvailability(0)
    for (let index = 0; index < 3; index++) expect(session.getActionAvailability(0)).toEqual(availability)
    expect(serializeSessionSnapshot(session.state, session)).toEqual(before)
    let response = session.takeAction(0, 'farm-expansion')
    expect(response.ok).toBe(true)
    if (response.interaction.stateId !== 'wait') throw new Error('Expected construction choice')
    const choice = response.interaction.request.options?.find(option => option.value.includes('construct'))
    expect(choice).toBeDefined()
    response = session.resolveChoice(0, choice!.value)
    if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'farm-select') throw new Error('Expected room selection')
    response = session.commitSelectionChoice(0, { rooms: [response.interaction.request.farm.selectableTiles[0]!] })
    expect(response.ok).toBe(true)
    expect(response.state.players[0]).toMatchObject({ rooms: 3, resources: { wood: 0, reed: 0 } })
    expect(response.state.log).toContainEqual(expect.objectContaining({ key: 'log.actionDetail', params: expect.objectContaining({ detailParts: expect.objectContaining({ costs: { wood: 4, reed: 2 } }) }) }))
  })
})
