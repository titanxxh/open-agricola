import { describe, expect, it } from 'vitest'
import type { ActionExecutionContext } from '../../contract/types'
import type { DraftGameEvent } from '../../contract/events'
import type { EngineInternals } from '../engine-internals'
import { EventStore } from '../../events/store'
import { emitCardTriggered } from '../card-trigger-events'

const context = (
  actionId: string,
  actionContext: Record<string, unknown> = {},
  params: Record<string, unknown> = {},
): ActionExecutionContext => ({
  state: { players: [] } as unknown as ActionExecutionContext['state'],
  player: { id: 'p1' } as unknown as ActionExecutionContext['player'],
  space: { id: actionId } as unknown as ActionExecutionContext['space'],
  sourceCard: 'A1_TestCard',
  actionContext,
  params,
})

const internals = (): EngineInternals => {
  const events = new EventStore()
  events.beginTransaction()
  return { events } as unknown as EngineInternals
}

describe('emitCardTriggered', () => {
  it('does not treat deleted apply action ids as special runtime leaves', () => {
    const emitted: DraftGameEvent[] = []

    emitCardTriggered(internals(), { emit: (event) => emitted.push(event) }, context('apply-improvement'), 'apply-improvement')

    expect(emitted).toEqual([
      expect.objectContaining({
        type: 'card.triggered',
        sourceCardId: 'A1_TestCard',
        triggerActionId: 'apply-improvement',
      }),
    ])
  })

  it('still skips actual internal card activation and card-play payment leaves', () => {
    const emitted: DraftGameEvent[] = []
    const sink = { emit: (event: DraftGameEvent) => emitted.push(event) }

    emitCardTriggered(internals(), sink, context('activate-card-effect'), 'activate-card-effect')
    emitCardTriggered(internals(), sink, context('pay', { costType: 'minor-improvement' }), 'pay')

    expect(emitted).toEqual([])
  })

  it('skips special-effect leaves that emit card-triggered events themselves', () => {
    const emitted: DraftGameEvent[] = []
    const sink = { emit: (event: DraftGameEvent) => emitted.push(event) }

    emitCardTriggered(internals(), sink, context('special-effect', {}, { kind: 'emit-card-triggered' }), 'special-effect')
    emitCardTriggered(internals(), sink, context('special-effect', {}, { kind: 'consume-pending-extra-turns' }), 'special-effect')

    expect(emitted).toEqual([])
  })
})
