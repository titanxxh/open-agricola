import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { rehydrateState, serializeSessionSnapshot, serializeStateForPlayer } from '../../shared/session/serialization'
import { snapshotForWorker } from '../../shared/session/recovery-catalog'
import { emptyResources } from '../../shared/session/state-bootstrap'
import { markAllWorkersUsed } from '../../shared/domain/player'

const auditSetup = (options: { draftParents?: boolean; draftMode?: 'simultaneous'; enableParentCards?: boolean; playerCount?: number } = {}) => {
  const session = new GameSession(56124, undefined, {
    playerCount: 2, parentSelectionSeed: 1, enableParentCards: true, draftPoolSize: 7, ...options,
  })
  for (const player of session.state.players) {
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
    player.resources.food = 50
  }
  expect(session.loadState(session.state).ok).toBe(true)
  return session
}

const auditSnapshot = (session: GameSession) => JSON.parse(JSON.stringify(session.buildSyncPayload(session.getState(), null, 'debug')))

const auditPrivacy = (session: GameSession) => {
  const response = session.getState()
  for (const viewer of ['p1', 'p2', null]) {
    const payload = session.buildSyncPayload(response, viewer)
    for (const player of response.state.players) {
      const candidates = response.state.parentSelection?.candidates[player.id]
      if (!candidates) continue
      if (viewer === player.id) {
        expect(payload.state.parentSelection!.candidates[player.id]).toEqual(candidates)
      } else {
        for (const id of [...candidates.mother, ...candidates.father]) expect(JSON.stringify(payload)).not.toContain(id)
      }
    }
  }
}

const fixedDraft = (session: GameSession) => {
  const pools = [
    {
      occ: ['A100_Curator', 'A101_CookeryOutfitter', 'A102_Grocer', 'A103_Portmonger', 'A104_WoodHarvester', 'A105_BarrowPusher', 'A106_SlurrySpreader'],
      minor: ['A001_Shelter', 'A002_ShiftingCultivation', 'A003_PaperKnife', 'A004_Baseboards', 'A005_ClayEmbankment', 'A006_StorageBarn', 'A007_GardenersKnife'],
    },
    {
      occ: ['A107_Catcher', 'A108_MushroomCollector', 'A109_SmallTrader', 'A110_Roughcaster', 'A111_WallBuilder', 'A112_ScytheWorker', 'A113_HeresyTeacher'],
      minor: ['A008_FoodBasket', 'A009_YoungAnimalMarket', 'A010_WoodenShed', 'A011_MudPatch', 'A012_DrinkingTrough', 'A013_RenovationCompany', 'A014_CarpentersHammer'],
    },
  ]
  session.state.draft!.pools = { p1: structuredClone(pools[0]!), p2: structuredClone(pools[1]!) }
  expect(session.loadState(session.state).ok).toBe(true)
  for (let round = 0; round < 6; round++) {
    for (const player of session.state.players) {
      expect(session.state.phase).toBe('draft')
      expect(session.state.players[0]!.resources.wood).toBe(0)
      expect(session.takeAction(0, 'forest').ok).toBe(false)
      const pool = session.state.draft!.pools[player.id]!
      const response = session.submitDraftPick(player.id, { occCardId: pool.occ[0]!, minorCardId: pool.minor[0]! })
      expect(response.ok, response.error).toBe(true)
    }
  }
  for (const [index, player] of session.state.players.entries()) {
    expect(player.occupationHand).toEqual(Array.from({ length: 7 }, (_, round) => pools[(index + round) % 2]!.occ[round]))
    expect(player.minorHand).toEqual(Array.from({ length: 7 }, (_, round) => pools[(index + round) % 2]!.minor[round]))
  }
}

describe('Parents batch 1 setup audit', () => {
  it.each([[0, 1], [1, 0]])('selection order %i then %i keeps candidates private and resolves rewards once', (first, second) => {
    const session = auditSetup()
    const candidates = structuredClone(session.state.parentSelection!.candidates)
    for (const candidate of Object.values(candidates)) {
      expect(candidate.mother).toHaveLength(2)
      expect(candidate.father).toHaveLength(2)
    }
    expect(session.state.players[0]!.resources.wood).toBe(0)
    auditPrivacy(session)
    const selections = session.state.players.map((player) => ({ mother: candidates[player.id]!.mother[0]!, father: candidates[player.id]!.father[0]! }))
    expect(selections[0]!.mother).toBe('PR10')
    const submitted = session.submitParentSelection(first, selections[first]!)
    expect(submitted.ok, submitted.error).toBe(true)
    expect(submitted.state.phase).toBe('parent-selection')
    expect(submitted.interaction.allowedCommands).toEqual([])
    expect(submitted.state.players.map((player) => player.parentCards)).toEqual([{ mother: null, father: null }, { mother: null, father: null }])
    expect(submitted.state.futureMeeples).toEqual([])
    expect(submitted.state.events.filter((event) => event.type === 'parent.motherScheduled')).toEqual([])
    auditPrivacy(session)
    const completed = session.submitParentSelection(second, selections[second]!)
    expect(completed.ok, completed.error).toBe(true)
    expect(completed.state.phase).toBe('playing')
    expect(completed.state.parentSelection).toBeNull()
    expect(completed.interaction.stateId).toBe('idle')
    expect(completed.state.players[0]!.resources.wood).toBe(1)
    expect(completed.state.players.map((player) => player.parentCards)).toEqual(selections)
    for (const viewer of ['p1', 'p2', null]) {
      const payload = session.buildSyncPayload(completed, viewer)
      expect(payload.state.players.map((player) => player.parentCards)).toEqual(selections)
      for (const candidate of Object.values(candidates)) {
        expect(JSON.stringify(payload)).not.toContain(candidate.mother[1])
        expect(JSON.stringify(payload)).not.toContain(candidate.father[1])
      }
    }
    expect(completed.state.log.filter((entry) => entry.key === 'log.parentMotherScheduled')).toHaveLength(2)
    expect(session.takeAction(0, 'day-laborer').ok).toBe(true)
    expect(session.state.players[0]!.resources.wood).toBe(1)
    expect(session.state.futureMeeples.some((entry) => entry.cardId === 'PR10')).toBe(false)
  })

  it('invalid foreign and wrong-kind submissions preserve state and allow legal retries', () => {
    const session = auditSetup()
    const p1 = session.state.parentSelection!.candidates.p1!
    const p2 = session.state.parentSelection!.candidates.p2!
    for (const selection of [
      { mother: p2.mother[0], father: p1.father[0] },
      { mother: p1.mother[0], father: p2.father[0] },
      { mother: p1.father[0], father: p1.mother[0] },
    ]) {
      const before = auditSnapshot(session)
      const response = session.submitParentSelection(0, selection as Parameters<GameSession['submitParentSelection']>[1])
      expect(response.ok).toBe(false)
      expect(auditSnapshot(session)).toEqual(before)
      auditPrivacy(session)
    }
    expect(session.submitParentSelection(0, { mother: p1.mother[0], father: p1.father[0] }).ok).toBe(true)
    const before = auditSnapshot(session)
    expect(session.submitParentSelection(0, { mother: p1.mother[1], father: p1.father[1] }).ok).toBe(false)
    expect(auditSnapshot(session)).toEqual(before)
    expect(session.submitParentSelection(1, { mother: p2.mother[0], father: p2.father[0] }).ok).toBe(true)
    expect(session.state.phase).toBe('playing')
    expect(session.state.players[0]!.resources.wood).toBe(1)
  })

  it.each([true, false])('fixed ordinary draft precedes parent resolution (draftParents=%s)', (draftParents) => {
    const session = auditSetup({ draftMode: 'simultaneous', draftParents })
    expect(session.state.phase).toBe('draft')
    expect(session.state.players[0]!.resources.wood).toBe(0)
    expect(session.takeAction(0, 'forest').ok).toBe(false)
    expect(session.submitParentSelection(0, { mother: 'PR10', father: 'PS01' }).ok).toBe(false)
    fixedDraft(session)
    expect(session.state.phase).toBe(draftParents ? 'parent-selection' : 'playing')
    expect(session.state.players[0]!.resources.wood).toBe(draftParents ? 0 : 1)
    if (draftParents) {
      auditPrivacy(session)
      for (const [index, player] of session.state.players.entries()) {
        const candidates = session.state.parentSelection!.candidates[player.id]!
        expect(session.submitParentSelection(index, { mother: candidates.mother[0], father: candidates.father[0] }).ok).toBe(true)
      }
    }
    expect(session.state.phase).toBe('playing')
    expect(session.state.parentSelection).toBeNull()
    expect(session.state.players[0]!.resources.wood).toBe(1)
    expect(session.state.log.filter((entry) => entry.key === 'log.parentMotherScheduled')).toHaveLength(2)
    expect(session.getState().state.players[0]!.resources.wood).toBe(1)
  })

  it('direct deal skips selection and awards PR10 only once before work', () => {
    const session = auditSetup({ draftParents: false })
    expect(session.state.phase).toBe('playing')
    expect(session.state.parentSelection).toBeNull()
    for (const kind of ['mother', 'father'] as const) {
      expect(new Set(session.state.players.map((player) => player.parentCards[kind])).size).toBe(2)
      expect(session.state.players.every((player) => player.parentCards[kind] !== null)).toBe(true)
    }
    expect(session.state.players[0]!.parentCards.mother).toBe('PR10')
    expect(session.state.players[0]!.resources.wood).toBe(1)
    expect(session.takeAction(0, 'day-laborer').ok).toBe(true)
    expect(session.state.players[0]!.resources.wood).toBe(1)
    expect(session.state.log.filter((entry) => entry.key === 'log.parentMotherScheduled')).toHaveLength(2)
  })

  it('disabled Parents rejects selection and has no rewards or fractional end score', () => {
    const session = auditSetup({ enableParentCards: false })
    const before = auditSnapshot(session)
    expect(session.submitParentSelection(0, { mother: 'PR10', father: 'PS01' }).ok).toBe(false)
    expect(auditSnapshot(session)).toEqual(before)
    expect(session.state.parentSelection).toBeNull()
    expect(session.state.futureMeeples).toEqual([])
    for (const player of session.state.players) {
      expect(player.parentCards).toEqual({ mother: null, father: null })
      expect(player.resources).toEqual({ ...emptyResources, food: 50 })
      markAllWorkersUsed(session.state, player)
    }
    session.state.round = 14
    expect(session.loadState(session.state).ok).toBe(true)
    let response = session.performRoundEnd()
    for (let step = 0; step < 20 && !response.state.gameOver; step++) {
      expect(response.ok, response.error).toBe(true)
      if (response.interaction.request.kind === 'feed') response = session.resolveChoice(response.interaction.playerIndex, 'confirm', { selections: [] })
      else if (response.interaction.request.kind === 'choice') response = session.resolveChoice(response.interaction.playerIndex, '__skip__')
      else throw new Error(`unexpected end interaction: ${JSON.stringify(response.interaction)}`)
    }
    expect(response.state.gameOver).toBe(true)
    expect(response.scores!.every((score) => Number.isInteger(score.total) && !score.categories.some((category) => category.key === 'parentCards'))).toBe(true)
    expect(response.state.events.some((event) => event.type === 'parent.motherScheduled')).toBe(false)
  })

  it('six players receive all 12 mothers and fathers exactly once and finish selection', () => {
    const session = auditSetup({ playerCount: 6 })
    const candidates = structuredClone(session.state.parentSelection!.candidates)
    for (const kind of ['mother', 'father'] as const) {
      const dealt = Object.values(candidates).flatMap((candidate) => candidate[kind])
      expect(dealt).toHaveLength(12)
      expect(new Set(dealt).size).toBe(12)
    }
    for (const [index, player] of session.state.players.entries()) {
      expect(candidates[player.id]!.mother).toHaveLength(2)
      expect(candidates[player.id]!.father).toHaveLength(2)
      const response = session.submitParentSelection(index, { mother: candidates[player.id]!.mother[0], father: candidates[player.id]!.father[0] })
      expect(response.ok, response.error).toBe(true)
      expect(response.state.phase).toBe(index === 5 ? 'playing' : 'parent-selection')
    }
    expect(session.state.parentSelection).toBeNull()
    expect(session.getState().interaction.stateId).toBe('idle')
    expect(session.state.players.every((player) => player.parentCards.mother && player.parentCards.father)).toBe(true)
    expect(session.state.log.filter((entry) => entry.key === 'log.parentMotherScheduled')).toHaveLength(6)
  })
})

describe('Parent Card selection setup', () => {
  it('deals one parent pair per player without parent selection when draftParents is false', () => {
    const session = new GameSession(308, undefined, {
      playerCount: 2,
      enableParentCards: true,
      draftParents: false,
      parentSelectionSeed: 9001,
    } as never)

    expect(session.state.phase).toBe('playing')
    expect(session.state.parentSelection).toBeNull()
    for (const player of session.state.players) {
      expect(player.parentCards.mother).not.toBeNull()
      expect(player.parentCards.father).not.toBeNull()
    }
    expect(new Set(session.state.players.map((player) => player.parentCards.mother)).size).toBe(2)
    expect(new Set(session.state.players.map((player) => player.parentCards.father)).size).toBe(2)
  })

  it('resolves round-one mother rewards after dealing parent cards directly', () => {
    const session = new GameSession(308, undefined, {
      playerCount: 2,
      enableParentCards: true,
      draftParents: false,
      parentSelectionSeed: 1,
    } as never)

    expect(session.state.players[0].parentCards.mother).toBe('PR10')
    expect(session.state.players[0].resources.wood).toBe(1)
    expect(session.state.futureMeeples).not.toContainEqual(expect.objectContaining({ cardId: 'PR10' }))
  })

  it('refreshes direct-deal logs by player identity when display names collide', () => {
    let session = new GameSession(308, undefined, {
      playerCount: 2,
      enableParentCards: true,
      draftParents: false,
      parentSelectionSeed: 1,
    } as never)

    const p1Mother = session.state.players[0]!.parentCards.mother
    const p2Mother = session.state.players[1]!.parentCards.mother
    const logsFor = (cardId: string | null) => session.buildSyncPayload(session.getState(), 'p1').state.log.filter((entry) =>
      entry.params?.cardId === cardId ||
      (cardId === p1Mother && entry.key === 'log.actionDetail'),
    )

    session.updatePlayerName(0, 'PlayerB')
    session.updatePlayerName(1, 'Bob')
    expect(logsFor(p1Mother).every((entry) => entry.params?.player === 'PlayerB')).toBe(true)
    expect(logsFor(p2Mother).every((entry) => entry.params?.player === 'Bob')).toBe(true)

    session.updatePlayerName(0, 'Shared')
    session.updatePlayerName(1, 'Shared')
    session.updatePlayerName(0, 'Carol')
    expect(logsFor(p1Mother).every((entry) => entry.params?.player === 'Carol')).toBe(true)
    expect(logsFor(p2Mother).every((entry) => entry.params?.player === 'Shared')).toBe(true)

    const saved = snapshotForWorker(serializeSessionSnapshot(session.state, session))
    session = new GameSession(rehydrateState(JSON.parse(JSON.stringify(saved))))
    session.updatePlayerName(1, 'Dana')
    expect(logsFor(p1Mother).every((entry) => entry.params?.player === 'Carol')).toBe(true)
    expect(logsFor(p2Mother).every((entry) => entry.params?.player === 'Dana')).toBe(true)
  })

  it('resolves round-one direct-deal rewards after simultaneous draft finalizes', () => {
    const session = new GameSession(308, undefined, {
      playerCount: 2,
      draftMode: 'simultaneous',
      draftPoolSize: 7,
      enableParentCards: true,
      draftParents: false,
      parentSelectionSeed: 1,
    } as never)

    expect(session.state.phase).toBe('draft')
    expect(session.state.players[0].parentCards.mother).toBe('PR10')
    expect(session.state.players[0].resources.wood).toBe(0)

    while (session.state.phase === 'draft') {
      for (const player of session.state.players) {
        const pool = session.state.draft!.pools[player.id]
        expect(session.submitDraftPick(player.id, {
          occCardId: pool.occ[0],
          minorCardId: pool.minor[0],
        }).ok).toBe(true)
      }
    }

    expect(session.state.phase).toBe('playing')
    expect(session.state.players[0].resources.wood).toBe(1)
    expect(session.state.futureMeeples).not.toContainEqual(expect.objectContaining({ cardId: 'PR10' }))
  })

  it('starts a simultaneous parent-selection phase with private 2+2 candidates when enabled', () => {
    const session = new GameSession(308, undefined, {
      playerCount: 2,
      enableParentCards: true,
      parentSelectionSeed: 9001,
    } as never)
    const repeat = new GameSession(308, undefined, {
      playerCount: 2,
      enableParentCards: true,
      parentSelectionSeed: 9001,
    } as never)
    const privateSeedChanged = new GameSession(308, undefined, {
      playerCount: 2,
      enableParentCards: true,
      parentSelectionSeed: 9002,
    } as never)

    expect(session.state.phase).toBe('parent-selection')
    expect(session.state.parentSelection?.candidates.p1.mother).toHaveLength(2)
    expect(session.state.parentSelection?.candidates.p1.father).toHaveLength(2)
    expect(session.state.parentSelection?.candidates.p2.mother).toHaveLength(2)
    expect(session.state.parentSelection?.candidates.p2.father).toHaveLength(2)
    expect(session.state.parentSelection).toEqual(repeat.state.parentSelection)
    expect(session.state.gameSeed).toBe(privateSeedChanged.state.gameSeed)
    expect(session.state.parentSelection).not.toEqual(privateSeedChanged.state.parentSelection)
  })

  it('keeps disabled games on the existing playing setup path', () => {
    const session = new GameSession(308)

    expect(session.state.phase).toBe('playing')
    expect(session.state.enableParentCards).toBe(false)
    expect(session.state.parentSelection).toBeNull()
    expect(session.submitParentSelection(0, {
      mother: 'PR01',
      father: 'PS01',
    }).ok).toBe(false)
    expect(session.state.players.map((player) => player.parentCards)).toEqual([
      { mother: null, father: null },
      { mother: null, father: null },
    ])
  })

  it('waits for simultaneous draft finalization before parent selection', () => {
    const directParentDeal = new GameSession(308, undefined, {
      playerCount: 2,
      enableParentCards: true,
      parentSelectionSeed: 9001,
    } as never).state.parentSelection
    const session = new GameSession(308, undefined, {
      playerCount: 2,
      draftMode: 'simultaneous',
      draftPoolSize: 7,
      enableParentCards: true,
      parentSelectionSeed: 9001,
    } as never)

    expect(session.state.phase).toBe('draft')
    while (session.state.phase === 'draft') {
      for (const player of session.state.players) {
        const pool = session.state.draft!.pools[player.id]
        const resp = session.submitDraftPick(player.id, {
          occCardId: pool.occ[0],
          minorCardId: pool.minor[0],
        })
        expect(resp.ok).toBe(true)
      }
    }

    expect(session.state.phase).toBe('parent-selection')
    expect(session.state.parentSelection).toEqual(directParentDeal)
    expect(session.state.players[0].occupationHand).toHaveLength(7)
    expect(session.state.players[0].minorHand).toHaveLength(7)
  })

  it('requires each player to submit exactly one own mother and one own father candidate', () => {
    const session = new GameSession(308, undefined, {
      playerCount: 2,
      enableParentCards: true,
    } as never)
    const p1Candidates = session.state.parentSelection!.candidates.p1
    const p2Candidates = session.state.parentSelection!.candidates.p2

    expect(session.submitParentSelection(99, {
      mother: p1Candidates.mother[0],
      father: p1Candidates.father[0],
    })).toMatchObject({ ok: false, error: expect.stringContaining('invalid player') })

    expect(session.submitParentSelection(0, {
      mother: p2Candidates.mother[0],
      father: p1Candidates.father[0],
    })).toMatchObject({ ok: false, error: expect.stringContaining('mother') })

    const first = session.submitParentSelection(0, {
      mother: p1Candidates.mother[0],
      father: p1Candidates.father[0],
      secret: 'must-not-persist',
    } as never)
    expect(first.ok).toBe(true)
    expect(session.state.parentSelection!.submissions.p1).toEqual({
      mother: p1Candidates.mother[0],
      father: p1Candidates.father[0],
    })
    expect(session.submitParentSelection(0, {
      mother: p1Candidates.mother[1],
      father: p1Candidates.father[1],
    })).toMatchObject({ ok: false, error: expect.stringContaining('already') })

    expect(session.state.phase).toBe('parent-selection')
    expect(session.submitParentSelection(1, {
      mother: p2Candidates.mother[0],
      father: p2Candidates.father[0],
    }).ok).toBe(true)

    expect(session.state.phase).toBe('playing')
    expect(session.state.parentSelection).toBeNull()
    expect(session.state.players[0].parentCards).toEqual({
      mother: p1Candidates.mother[0],
      father: p1Candidates.father[0],
    })
    expect(session.state.players[1].parentCards).toEqual({
      mother: p2Candidates.mother[0],
      father: p2Candidates.father[0],
    })
  })

  it('logs selected mother card round rewards when parent selection completes', () => {
    const session = new GameSession(308, undefined, {
      playerCount: 2,
      enableParentCards: true,
    } as never)
    session.state.parentSelection!.candidates.p1 = {
      mother: ['PR02', 'PR04'],
      father: ['PS01', 'PS03'],
    }
    session.state.parentSelection!.candidates.p2 = {
      mother: ['PR05', 'PR06'],
      father: ['PS02', 'PS04'],
    }

    expect(session.submitParentSelection(0, {
      mother: 'PR02',
      father: 'PS01',
    }).ok).toBe(true)
    const resp = session.submitParentSelection(1, {
      mother: 'PR05',
      father: 'PS02',
    })

    expect(resp.state.log).toEqual(expect.arrayContaining([
      {
        key: 'log.parentMotherScheduled',
        playerId: 'p1',
        params: { player: 'Player 1', cardId: 'PR02', round: 12, reward: 'field' },
      },
      {
        key: 'log.parentMotherScheduled',
        playerId: 'p2',
        params: { player: 'Player 2', cardId: 'PR05', round: 4, reward: 'sheep' },
      },
    ]))
    expect(resp.state.events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'parent.motherScheduled',
        playerId: 'p1',
        cardId: 'PR02',
        targetRound: 12,
        reward: 'field',
      }),
      expect.objectContaining({
        type: 'parent.motherScheduled',
        playerId: 'p2',
        cardId: 'PR05',
        targetRound: 4,
        reward: 'sheep',
      }),
    ]))
  })

  it('queues selected mother rewards as real future meeples', () => {
    const session = new GameSession(308, undefined, {
      playerCount: 2,
      enableParentCards: true,
    } as never)
    session.state.parentSelection!.candidates.p1 = {
      mother: ['PR02', 'PR04'],
      father: ['PS01', 'PS03'],
    }
    session.state.parentSelection!.candidates.p2 = {
      mother: ['PR05', 'PR06'],
      father: ['PS02', 'PS04'],
    }

    expect(session.submitParentSelection(0, {
      mother: 'PR02',
      father: 'PS01',
    }).ok).toBe(true)
    const resp = session.submitParentSelection(1, {
      mother: 'PR05',
      father: 'PS02',
    })

    expect(resp.state.futureMeeples).toEqual(expect.arrayContaining([
      expect.objectContaining({
        cardId: 'PR02',
        playerId: 'p1',
        round: 12,
        resources: { field: 1 },
      }),
      expect.objectContaining({
        cardId: 'PR05',
        playerId: 'p2',
        round: 4,
        resources: { sheep: 1 },
      }),
    ]))
  })

  it('backfills missing mother schedule logs when a selected parent-card game is loaded', () => {
    const session = new GameSession(308, undefined, {
      playerCount: 2,
      enableParentCards: true,
    } as never)
    session.state.parentSelection!.candidates.p1 = {
      mother: ['PR02', 'PR04'],
      father: ['PS01', 'PS03'],
    }
    session.state.parentSelection!.candidates.p2 = {
      mother: ['PR05', 'PR06'],
      father: ['PS02', 'PS04'],
    }
    session.submitParentSelection(0, {
      mother: 'PR02',
      father: 'PS01',
    })
    const selected = session.submitParentSelection(1, {
      mother: 'PR05',
      father: 'PS02',
    }).state
    const stale = {
      ...selected,
      log: selected.log.filter((entry) => entry.key !== 'log.parentMotherScheduled'),
    }

    const restored = session.loadState(stale).state
    const logs = restored.log.filter((entry) => entry.key === 'log.parentMotherScheduled')
    session.loadState(restored)

    expect(logs).toHaveLength(2)
    expect(session.state.log.filter((entry) => entry.key === 'log.parentMotherScheduled')).toHaveLength(2)
  })

  it('auto-submits a player with only one mother and one father candidate left', () => {
    const session = new GameSession(308, undefined, {
      playerCount: 2,
      enableParentCards: true,
    } as never)
    const p1Candidates = session.state.parentSelection!.candidates.p1
    session.state.parentSelection!.candidates.p2 = {
      mother: ['PR03'],
      father: ['PS03'],
    }

    const resp = session.submitParentSelection(0, {
      mother: p1Candidates.mother[0],
      father: p1Candidates.father[0],
    })

    expect(resp.ok).toBe(true)
    expect(resp.state.phase).toBe('playing')
    expect(resp.state.parentSelection).toBeNull()
    expect(resp.state.players[0].parentCards).toEqual({
      mother: p1Candidates.mother[0],
      father: p1Candidates.father[0],
    })
    expect(resp.state.players[1].parentCards).toEqual({
      mother: 'PR03',
      father: 'PS03',
    })
  })

  it('masks unresolved parent candidates and submissions by viewer', () => {
    const session = new GameSession(308, undefined, {
      playerCount: 2,
      enableParentCards: true,
    } as never)
    const p1Candidates = session.state.parentSelection!.candidates.p1
    session.submitParentSelection(0, {
      mother: p1Candidates.mother[0],
      father: p1Candidates.father[0],
    })

    const p1View = serializeStateForPlayer(session.state, 'p1', {
      engineStack: session.getEngineStack(),
    })
    const p2View = serializeStateForPlayer(session.state, 'p2', {
      engineStack: session.getEngineStack(),
    })
    const spectatorView = serializeStateForPlayer(session.state, null, {
      engineStack: session.getEngineStack(),
    })

    expect(p1View.parentSelection!.candidates.p1).toEqual(p1Candidates)
    expect(p1View.parentSelection!.submissions.p1).toEqual({
      mother: p1Candidates.mother[0],
      father: p1Candidates.father[0],
    })
    expect(p2View.parentSelection!.candidates.p1).toEqual({
      mother: ['?', '?'],
      father: ['?', '?'],
    })
    expect(p2View.parentSelection!.submissions.p1).toEqual({
      mother: '?',
      father: '?',
    })
    expect(spectatorView.parentSelection!.candidates.p1).toEqual({
      mother: ['?', '?'],
      father: ['?', '?'],
    })
  })
})
