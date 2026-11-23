import { describe, expect, it } from 'vitest'
import { setActiveWorkerCount, setNewbornCount } from '../../../shared/domain/player'
import { rehydrateState, serializeSessionSnapshot } from '../../../shared/session/serialization'
import { captureStateWithHistory } from '../../../shared/session/history-streams'
import { activatePendingHarvestSkips, scheduleNextHarvestSkip } from '../../../shared/cards/helpers/harvest-skip'
import { createWorkSession } from '../../__tests__/_helpers/session-fixtures'

describe('harvest requirement projection', () => {
  it.each(['pending', 'active', 'expired'] as const)('accounts for a %s harvest skip without affecting other players', phase => {
    const session = createWorkSession({ seed: 5415, options: {
      enableFarmersOfTheMoor: true, allowIncompleteFarmersOfTheMoorMinorDeal: true,
    }, configure(state) {
      state.round = 4
      scheduleNextHarvestSkip(state.players[0]!, 'C108_Layabout')
    } })
    try {
      if (phase !== 'pending') {
        session.state.roundPhase = 'harvest'
        activatePendingHarvestSkips(session.state, 'before-start-of-harvest')
      }
      if (phase === 'expired') session.state.round = 7
      const players = session.buildSyncPayload(session.getState(), []).state.players
      expect(players[0]).toMatchObject({ harvestRequirements: {
        round: phase === 'expired' ? 7 : 4,
        food: phase === 'expired' ? 4 : 0,
        fuel: phase === 'expired' ? 2 : 0,
      } })
      expect(players[1]).toMatchObject({ harvestRequirements: {
        round: phase === 'expired' ? 7 : 4, food: 4, fuel: 2,
      } })
    } finally { session.dispose() }
  })

  it.each([
    { round: 3, food: 6 },
    { round: 4, food: 5 },
  ])('projects newborn feeding at round $round without changing the family', ({ round, food }) => {
    const session = createWorkSession({ seed: 5411, configure(state) {
      state.round = round
      setActiveWorkerCount(state.players[0]!, 3)
      setNewbornCount(state.players[0]!, 1)
    } })
    try {
      const before = captureStateWithHistory(session.state)
      for (const viewer of [[], [session.state.players[0]!.id], [session.state.players[1]!.id]]) {
        const payload = session.buildSyncPayload(session.getState(), viewer)
        expect(payload.state.players[0]).toMatchObject({ harvestRequirements: { round: 4, food, fuel: null } })
        expect(payload.state.players[1]).toMatchObject({ harvestRequirements: { round: 4, food: 4, fuel: null } })
      }
      expect(captureStateWithHistory(session.state)).toEqual(before)
    } finally { session.dispose() }
  })

  it('uses the owning session card rules and rebuilds display data after recovery', () => {
    const session = createWorkSession({ seed: 5412, options: {
      enableFarmersOfTheMoor: true, allowIncompleteFarmersOfTheMoorMinorDeal: true,
    }, configure(state) {
      state.round = 4
      state.players[0]!.occupationPlayed = ['E159_OldMiser']
      state.players[0]!.improvements = ['Major_Moor_HeatingOven']
    } })
    try {
      const snapshot = serializeSessionSnapshot(session.state, session)
      expect(snapshot.frame.players[0]).toMatchObject({ harvestRequirements: { round: 4, food: 2, fuel: 1 } })
      expect(snapshot.frame.players[1]).toMatchObject({ harvestRequirements: { round: 4, food: 4, fuel: 2 } })
      const restored = rehydrateState(snapshot)
      expect(restored.state.players[0]).not.toHaveProperty('harvestRequirements')
      expect(rehydrateState(snapshot.frame).state.players[0]).not.toHaveProperty('harvestRequirements')
      session.loadState(restored)
      expect(session.buildSyncPayload(session.getState(), []).state.players[0]).toMatchObject({
        harvestRequirements: { round: 4, food: 2, fuel: 1 },
      })
    } finally { session.dispose() }
  })

  it.each([
    { round: 3, season: 'spring', fuel: 0 },
    { round: 3, season: 'summer', fuel: 2 },
    { round: 4, season: 'summer', fuel: 0 },
  ] as const)('uses the harvest season from round $round in $season', ({ round, season, fuel }) => {
    const session = createWorkSession({ seed: 5413, options: {
      enableFarmersOfTheMoor: true, allowIncompleteFarmersOfTheMoorMinorDeal: true, enableThroughTheSeasons: true,
    }, configure(state) {
      state.round = round
      state.throughTheSeasons = { startSeason: season, currentSeason: season }
    } })
    try {
      expect(session.buildSyncPayload(session.getState(), []).state.players[0]).toMatchObject({
        harvestRequirements: { round: 4, food: 4, fuel },
      })
      expect(session.state.throughTheSeasons?.currentSeason).toBe(season)
    } finally { session.dispose() }
  })

  it('uses solo feeding and hides requirements once the game ends', () => {
    const session = createWorkSession({ seed: 5414, options: { playerCount: 1 } })
    try {
      expect(session.buildSyncPayload(session.getState(), []).state.players[0]).toMatchObject({
        harvestRequirements: { round: 4, food: 6, fuel: null },
      })
      session.state.gameOver = true
      expect(session.buildSyncPayload(session.getState(), []).state.players[0]).toMatchObject({ harvestRequirements: null })
    } finally { session.dispose() }
  })
})
