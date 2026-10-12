import { expect, it } from 'vitest'
import { createWorkSession } from './_helpers/session-fixtures'
import { collectNewPublicEventFeedback, collectUnseenPublicEventFeedback, maxPublicEventSeq } from '../../shared/events/public-event-presentation'

// Generic projection/cue regression, not a card ability change. New two-player
// work fixture (seed 10 reveals Sheep Market); p2 holds Breed Registry. Legal
// forest -> sheep/discard -> fishing -> free minor play exposes its earlier
// hand-zone bookkeeping and renumbers an already consumed fishing occurrence.
it('does not replay a fishing receipt when a legal card reveal renumbers the viewer stream', () => {
  const session = createWorkSession({ seed: 10, configure: state => {
    state.players[1]!.minorHand = ['D036_BreedRegistry']
  } })
  try {
    let response = session.takeAction(0, 'forest')
    expect(response.ok).toBe(true)
    expect(response.state.players[0]!.resources.wood).toBe(3)
    response = session.resolveChoice(1, 'confirm')
    expect(response.ok).toBe(true)
    response = session.takeAction(1, 'sheep-market')
    expect(response.ok).toBe(true)
    if (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'animal-reorg') {
      response = session.resolveChoice(1, 'confirm', [])
      expect(response.ok).toBe(true)
    }
    expect(response.state.players[1]!.resources.sheep).toBe(0)
    expect(response.state.events.some(event => event.sourceCardId === 'D036_BreedRegistry')).toBe(true)
    response = session.resolveChoice(0, 'confirm')
    expect(response.ok).toBe(true)
    response = session.takeAction(0, 'fishing')
    expect(response.ok).toBe(true)
    const before = session.buildSyncPayload(response, 'p1')
    const fishing = before.state.events.find(event => event.type === 'resource.moved' && event.from.kind === 'actionSpace' && event.from.spaceId === 'fishing')!
    expect(fishing.occurrenceId).toBeTruthy()
    const baseline = collectUnseenPublicEventFeedback(before.state.events, null, 'en')
    expect(baseline.resourceAnimations).toEqual([])
    const cursor = baseline.nextCursor
    response = session.resolveChoice(1, 'confirm')
    expect(response.ok).toBe(true)
    response = session.takeAction(1, 'meeting-place')
    expect(response.ok).toBe(true)
    if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'choice') throw new Error('Expected optional improvement')
    response = session.resolveChoice(1, response.interaction.request.options.find(option => option.value !== '__skip__')!.value)
    expect(response.ok).toBe(true)
    expect(response.state.players[1]!.minorPlayed).toContain('D036_BreedRegistry')
    expect(response.state.log.find(entry => entry.params?.improvements === 'D036_BreedRegistry')?.params?.costResources).toEqual({})
    expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'confirm-next-player' } })
    expect(response.scores).toHaveLength(2)
    const after = session.buildSyncPayload(response, 'p1')
    const sameFishing = after.state.events.find(event => event.occurrenceId === fishing.occurrenceId)!
    expect(sameFishing.seq).toBeGreaterThan(fishing.seq)
    // Old numeric cursor visibly replays this already granted food; occurrence
    // cursor must not. This assertion preserves the original failure evidence.
    expect(collectNewPublicEventFeedback(after.state.events, maxPublicEventSeq(before.state.events), 'en').resourceAnimations.length).toBeGreaterThan(0)
    const feedback = collectUnseenPublicEventFeedback(after.state.events, cursor, 'en')
    expect(feedback.resourceAnimations).toEqual([])
    expect(feedback.highlights.actionIds).not.toContain('fishing')
    expect(collectUnseenPublicEventFeedback(after.state.events, feedback.nextCursor, 'en').resourceAnimations).toEqual([])
    expect(response.state.players[0]!.resources.food).toBe(before.state.players[0]!.resources.food)
  } finally { session.dispose() }
})
