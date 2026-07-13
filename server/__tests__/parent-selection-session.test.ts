import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { serializeStateForPlayer } from '../../shared/session/serialization'

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
    })
    expect(first.ok).toBe(true)
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
        params: { player: 'PlayerA', cardId: 'PR02', round: 12, reward: 'field' },
      },
      {
        key: 'log.parentMotherScheduled',
        params: { player: 'PlayerB', cardId: 'PR05', round: 4, reward: 'sheep' },
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
