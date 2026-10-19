import { installOfficialCardRegistry } from './card-environment'

installOfficialCardRegistry()

import { describe, expect, it } from 'vitest'
import { collectCardStatePresentation } from '../card-state-presentation'
import { createInitialState } from '../../session/state-bootstrap'
import { captureStateWithHistory } from '../../session/history-streams'

const CARD_ID = 'E027_PiggyBank'

describe('E027 Piggy Bank public presentation', () => {
  it.each([
    { food: 0, text: '0 / 6', counters: {} },
    { food: 5, text: '5 / 6', counters: { food: 5 } },
    { food: 6, text: '6 / 6', counters: { food: 6 } },
    { food: 7, text: '7 / 6', counters: { food: 7 } },
  ])('shows $text from its food counter without changing authoritative state', ({ food, text, counters }) => {
    const state = createInitialState(42, { playerCount: 2 })
    const player = state.players[0]!
    player.minorPlayed = [CARD_ID]
    player.cardStates[CARD_ID] = { counters: { food }, infobox: 'stale' }
    const before = captureStateWithHistory(state)

    expect(collectCardStatePresentation(player)[CARD_ID]).toEqual({ infobox: text, counters })
    expect(captureStateWithHistory(state)).toEqual(before)
  })
})
