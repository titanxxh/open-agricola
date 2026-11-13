import { describe, expect, it } from 'vitest'
import type { DraftGameEvent } from '../../contract/events'
import { createInitialState } from '../../session/state-bootstrap'
import {
  executeCardListener,
  getListenerById,
  getMatchingListeners,
  type CardListenerDispatchInput,
} from '../card-listeners'
import { installOfficialCardRegistry } from './card-environment'

installOfficialCardRegistry()

const CARD_ID = 'E077_Mattock'
type Moved = DraftGameEvent<'resource.moved'>

const moved = (overrides: Partial<Moved> = {}): Moved => ({
  type: 'resource.moved',
  resources: { reed: 2 },
  from: { kind: 'actionSpace', spaceId: 'reed-bank' },
  to: { kind: 'player', playerId: 'p1' },
  reason: 'collect',
  ...overrides,
})

const context = (events: Moved[], actionEvents = events, spaceId = 'reed-bank', actionId: 'collect' | 'gain' = 'collect'): CardListenerDispatchInput => {
  const state = createInitialState(1689, { playerCount: spaceId === 'resource-market-4' ? 4 : 2 })
  const player = state.players[0]!
  player.id = 'p1'
  player.minorPlayed = [CARD_ID]
  const space = state.actionSpaces.find(entry => entry.id === spaceId)!
  return {
    actionHooks: undefined, state, player, space,
    actionId, phase: 'after',
    transactionEvents: events, actionEvents, ownActionEvents: actionEvents,
    result: { type: 'ok', resourcesGained: { reed: 99 } },
  }
}

const rewards = (events: Moved[], actionEvents = events, actionId: 'collect' | 'gain' = 'collect') => {
  const ctx = context(events, actionEvents, 'reed-bank', actionId)
  return getMatchingListeners(ctx)
    .filter(entry => entry.registration.cardIds?.includes(CARD_ID))
    .flatMap(entry => executeCardListener(entry.registration, ctx)?.flow ?? [])
}

const expectOneClay = (flows: ReturnType<typeof rewards>) => {
  expect(flows).toEqual([
    expect.objectContaining({ type: 'leaf', actionId: 'gain', params: { clay: 1 }, sourceCard: CARD_ID }),
  ])
}

describe('E077_Mattock action-space resource provenance', () => {
  it.each([
    { resources: { reed: 3 }, reason: 'collect' as const },
    { resources: { stone: 2 }, reason: 'collect' as const },
    { resources: { reed: 1 }, reason: 'gain' as const },
    { resources: { stone: 1 }, reason: 'gain' as const },
    { resources: { reed: 1, stone: 1 }, reason: 'gain' as const },
  ])('rewards actual $reason receipts $resources once without a new placement', receipt => {
    expectOneClay(rewards([moved(receipt)], undefined, receipt.reason))
  })

  it('rewards one acquisition once even when its own receipt has several resource moves', () => {
    expectOneClay(rewards([
      moved(),
      moved({ resources: { stone: 1 }, reason: 'collect' }),
    ]))
  })

  it('uses explicit action-space origin even when a granting card is attributed', () => {
    expectOneClay(rewards([moved({ reason: 'gain', sourceCardId: 'Test_GrantingCard' })], undefined, 'gain'))
  })

  it.each([
    { from: { kind: 'supply' as const } },
    { from: { kind: 'card' as const, cardId: 'Test_Source' } },
    { to: { kind: 'player' as const, playerId: 'p2' } },
    { resources: { clay: 3 } },
    { resources: { reed: 0, stone: 0 } },
  ])('excludes nonqualifying current receipts: %j', overrides => {
    expect(rewards([moved(overrides)])).toEqual([])
  })

  it('ignores accumulation metadata and reported gains when no goods actually moved', () => {
    expect(rewards([])).toEqual([])
  })

  it('does not replay older transaction receipts instead of the current action receipt', () => {
    expect(rewards([moved()], [moved({ resources: { wood: 3 } })])).toEqual([])
    expect(rewards([moved()], [])).toEqual([])
  })

  it('does not reuse a descendant receipt when this host emitted no acquisition', () => {
    const ctx = context([moved()])
    ctx.ownActionEvents = []
    expect(executeCardListener(getListenerById('E77-mattock-after-collect')!, ctx)).toBeUndefined()
  })

  it('keeps a retained non-market placement activation dormant', () => {
    const ctx = context([moved()])
    ctx.actionId = 'place-farmer'
    ctx.actionSpaceUse = undefined
    expect(executeCardListener(getListenerById('E77-mattock-place-farmer')!, ctx)).toBeUndefined()
  })

  it.each([
    { id: 'E77-mattock-after-collect', actionId: 'collect', reason: 'collect' as const },
    { id: 'E77-mattock-place-farmer', actionId: 'place-farmer', reason: 'gain' as const },
  ])('can still execute retained activation $id', ({ id, actionId, reason }) => {
    const spaceId = actionId === 'place-farmer' ? 'resource-market-4' : 'reed-bank'
    const events = [moved({ reason, from: { kind: 'actionSpace', spaceId } })]
    const ctx = context(events, events, spaceId)
    ctx.ownActionEvents = undefined
    ctx.actionId = actionId
    ctx.actionSpaceUse = undefined
    const listener = getListenerById(id)
    expect(listener).toBeDefined()
    expectOneClay([executeCardListener(listener!, ctx)!.flow!])
  })
})
