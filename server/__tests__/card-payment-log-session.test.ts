import { expect, it } from 'vitest'
import { createWorkSession } from './_helpers/session-fixtures'
import { eventsToLogEntries } from '../../shared/events/log-mapper'

// Generic log/payment regression, not a change to either card's ability.
// Two-player work fixture; paid Hammer followed by free Rammed Clay through
// real takeAction/resolveChoice. Mapping the complete authoritative event list
// reproduces nearest-payment reuse even when choices commit separate packets.
it('keeps a paid card and subsequent free card costs distinct in a legal two-player Session', () => {
  const session = createWorkSession({ seed: 563, configure: state => {
    state.players[0]!.minorHand = ['A014_CarpentersHammer', 'A016_RammedClay']
    state.players[0]!.resources.wood = 4
  } })
  try {
    let response = session.takeAction(0, 'meeting-place')
    expect(response.ok).toBe(true)
    expect(response.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0, request: { kind: 'choice' } })
    if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'choice') throw new Error('Expected optional improvement')
    response = session.resolveChoice(0, response.interaction.request.options.find(option => option.value !== '__skip__')!.value)
    expect(response.ok).toBe(true)
    response = session.resolveChoice(0, 'A014_CarpentersHammer')
    expect(response.ok).toBe(true)
    expect(response.state.players[0]!.resources.wood).toBe(3)
    expect(response.state.players[0]!.minorPlayed).toContain('A014_CarpentersHammer')
    expect(response.state.log.find(entry => entry.key === 'log.playMinorImprovement')?.params?.costResources).toEqual({ wood: 1 })
    expect(response.scores).toHaveLength(2)
    response = session.resolveChoice(1, 'confirm')
    expect(response.ok).toBe(true)
    response = session.takeAction(1, 'forest')
    expect(response.ok).toBe(true)
    expect(response.state.players[1]!.resources.wood).toBe(3)
    response = session.resolveChoice(0, 'confirm')
    expect(response.ok).toBe(true)
    response = session.takeAction(0, 'fishing')
    expect(response.ok).toBe(true)
    response = session.resolveChoice(1, 'confirm')
    expect(response.ok).toBe(true)
    response = session.takeAction(1, 'reed-bank')
    expect(response.ok).toBe(true)
    while (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'confirm-next-player') {
      response = session.resolveChoice(response.interaction.playerIndex, 'confirm')
      expect(response.ok).toBe(true)
    }
    response = session.takeAction(0, 'meeting-place')
    expect(response.ok).toBe(true)
    if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'choice') throw new Error('Expected optional improvement')
    response = session.resolveChoice(0, response.interaction.request.options.find(option => option.value !== '__skip__')!.value)
    expect(response.ok).toBe(true)
    if (!response.state.players[0]!.minorPlayed.includes('A016_RammedClay')) response = session.resolveChoice(0, 'A016_RammedClay')
    expect(response.ok).toBe(true)
    expect(response.state.players[0]!.resources.wood).toBe(3)
    expect(response.state.players[0]!.minorPlayed).toEqual(expect.arrayContaining(['A014_CarpentersHammer', 'A016_RammedClay']))
    const logs = eventsToLogEntries(response.state.events, { playerNames: { p1: 'Player 1', p2: 'Player 2' } })
    expect(logs.find(entry => entry.params?.improvements === 'A016_RammedClay')?.params?.costResources).toEqual({})
    expect(logs.find(entry => entry.params?.improvements === 'A014_CarpentersHammer')?.params?.costResources).toEqual({ wood: 1 })
    expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'confirm-next-player' } })
    expect(response.scores).toHaveLength(2)
    const paidPlay = response.state.events.find(event => event.type === 'card.played' && event.cardId === 'A014_CarpentersHammer')
    if (paidPlay?.type !== 'card.played') throw new Error('Missing paid play')
    expect(paidPlay.payment).toMatchObject({ resources: { wood: 1 }, paymentId: expect.any(String) })
    expect(response.state.events.find(event => event.type === 'resource.paid' && event.paymentId === paidPlay.payment?.paymentId)).toMatchObject({ resources: { wood: 1 } })
    const freePlay = response.state.events.find(event => event.type === 'card.played' && event.cardId === 'A016_RammedClay')
    if (freePlay?.type !== 'card.played') throw new Error('Missing free play')
    expect(freePlay.payment).toEqual({ resources: {} })
    expect(session.undoAction().ok).toBe(true)
    response = session.takeAction(0, 'meeting-place')
    expect(response.ok).toBe(true)
    if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'choice') throw new Error('Expected optional replay')
    response = session.resolveChoice(0, response.interaction.request.options.find(option => option.value !== '__skip__')!.value)
    expect(response.ok).toBe(true)
    expect(response.state.players[0]!.resources.wood).toBe(3)
    expect(response.state.log.find(entry => entry.params?.improvements === 'A016_RammedClay')?.params?.costResources).toEqual({})
    expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'confirm-next-player' } })
    expect(response.scores).toHaveLength(2)
  } finally { session.dispose() }
})
