import { describe, expect, it } from 'vitest'
import { playMinor, setupMinorSession } from './_helpers/batch07-card-play'

import '../../shared/cards/A/A061_WinnowingFan'

describe('A061 Winnowing Fan through Session', () => {
  it('requires a baking improvement', () => {
    const blocked = playMinor(setupMinorSession({
      cardId: 'A061_WinnowingFan', resources: { reed: 1 },
    }), 'A061_WinnowingFan')
    expect(blocked.state.players[0]!.minorPlayed).not.toContain('A061_WinnowingFan')
    expect(blocked.state.players[0]!.resources.reed).toBe(1)

    const played = playMinor(setupMinorSession({
      cardId: 'A061_WinnowingFan', resources: { reed: 1 }, improvements: ['Major_Fireplace1'],
    }), 'A061_WinnowingFan')
    expect(played.state.players[0]!.minorPlayed).toContain('A061_WinnowingFan')
    expect(played.state.players[0]!.resources.reed).toBe(0)
  })
})
