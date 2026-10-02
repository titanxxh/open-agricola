import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { setReviewDecisionProvider } from '../workshop-review-provider.ts'
import {
  WorkshopDraftError,
  adoptCandidate,
  approveCurrentDraft,
  approveReviewedVersion,
  checkpointDraft,
  adminTakedownCard,
  createCard,
  markBuiltInMergedCards,
  markCardMerged,
  enterReview,
  unpublish,
  getHandoffReadiness,
  loadLiveDraft,
  loadSandboxVersion,
  loadWorkspace,
  markSandboxPass,
  publish,
  restoreVersion,
  type WorkshopDraft,
} from '../workshop-drafts.ts'

let db: Database.Database

const baseDraft = (overrides: Partial<WorkshopDraft> = {}): WorkshopDraft => ({
  cardId: 'CUSTOM_FieldKeeper',
  cardType: 'occupation',
  name: 'Field Keeper',
  description: 'A test card',
  cardJson: {
    id: 'CUSTOM_FieldKeeper',
    name: 'Field Keeper',
    card_type: 'occupation',
    deck: 'CUSTOM',
    number: 0,
    desc: ['Keep a field.'],
  },
  effectCode: null,
  compiledCode: null,
  codeManifest: null,
  artUrl: null,
  generation: {},
  ...overrides,
})

const handoffDraft = (overrides: Partial<WorkshopDraft> = {}): WorkshopDraft => {
  const base = baseDraft()
  return {
    ...base,
    cardJson: {
      ...base.cardJson,
      cost: {},
      vp: 0,
      modifiers: [],
      implemented: true,
    },
    effectCode: 'const CARD_DEF = {}; const CARD_IMPL = {}',
    compiledCode: '"use strict"; const CARD_DEF = {}; const CARD_IMPL = {};',
    codeManifest: {
      effectHooks: [],
      listeners: [],
      cardDefinition: {
        cardType: 'occupation',
        meta: {
          id: base.cardId,
          name: base.name,
          deck: 'CUSTOM',
          number: 0,
          desc: base.cardJson.desc,
        },
      },
    },
    ...overrides,
  }
}

beforeEach(() => {
  db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  db.exec(`
    CREATE TABLE users (id TEXT PRIMARY KEY);
    INSERT INTO users VALUES ('author'), ('other');
    CREATE TABLE workshop_cards (
      id TEXT PRIMARY KEY,
      author_id TEXT NOT NULL REFERENCES users(id),
      card_id TEXT NOT NULL,
      card_type TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      card_json TEXT NOT NULL,
      code_manifest TEXT,
      art_url TEXT,
      art_prompt TEXT,
      review_status TEXT NOT NULL DEFAULT 'unsubmitted',
      live INTEGER NOT NULL DEFAULT 0,
      featured INTEGER NOT NULL DEFAULT 0,
      github_pr_url TEXT,
      github_pr_status TEXT,
      github_pr_last_synced_at INTEGER,
      review_commit_sha TEXT,
      review_version_id TEXT,
      draft_revision INTEGER NOT NULL DEFAULT 1,
      draft_generation_json TEXT NOT NULL DEFAULT '{}',
      approved_commit_sha TEXT,
      approved_review_id TEXT,
      approved_at INTEGER,
      approved_version_id TEXT,
      built_in INTEGER NOT NULL DEFAULT 0,
      sandbox_pass_version_id TEXT,
      sandbox_passed_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE rooms (
      id TEXT PRIMARY KEY,
      custom_card_ids TEXT NOT NULL DEFAULT '[]'
    );
    CREATE TABLE workshop_card_versions (
      id TEXT PRIMARY KEY,
      card_id TEXT NOT NULL REFERENCES workshop_cards(id) ON DELETE CASCADE,
      card_json TEXT NOT NULL,
      code_manifest TEXT,
      art_url TEXT,
      version_number INTEGER NOT NULL,
      created_by TEXT NOT NULL REFERENCES users(id),
      created_at INTEGER NOT NULL,
      content_hash TEXT,
      provenance_json TEXT NOT NULL DEFAULT '{}'
    );
  `)
})

afterEach(() => {
  setReviewDecisionProvider(null)
  db.close()
})

describe('workshop draft aggregate', () => {
  it('creates and loads an author-private revisioned workspace', () => {
    const created = createCard(db, {
      authorId: 'author',
      draft: baseDraft({
        generation: {
          art: {
            subject: 'sunlit medieval field',
            prompt: 'sunlit medieval field',
            resultUrl: '/card-art/field.png',
          },
        },
      }),
    })

    expect(created.revision).toBe(1)
    expect(created.reviewStatus).toBe('unsubmitted')
    expect(created.live).toBe(false)
    expect(created.draft.effectCode).toBeNull()
    expect(created.draft.generation).toEqual({
      art: {
        subject: 'sunlit medieval field',
        resultUrl: '/card-art/field.png',
      },
    })
    expect(loadWorkspace(db, created.id, 'author')).toEqual(created)
    expect(() => loadWorkspace(db, created.id, 'other')).toThrowError(
      expect.objectContaining<Partial<WorkshopDraftError>>({ code: 'forbidden' }),
    )
  })

  it('scrubs unmarked nested art prompts without losing uploads', () => {
    const upload = {
      id: 'uploaded-art',
      kind: 'art' as const,
      prompt: 'legacy generated template',
      resultUrl: '/card-art/upload.png',
      provider: 'upload',
      model: 'image/png',
      createdAt: 100,
    }
    const created = createCard(db, {
      authorId: 'author',
      draft: baseDraft({
        generation: {
          art: {
            subject: 'A field keeper',
            lastCompleted: upload,
            adopted: { ...upload, id: 'generated-art', provider: 'gemini' },
          },
        },
      }),
    })

    expect(created.draft.generation).toEqual({
      art: {
        subject: 'A field keeper',
        lastCompleted: { ...upload, prompt: 'A field keeper', promptFormat: 'subject' },
      },
    })
  })

  it('normalizes row and card definition names together', () => {
    const created = createCard(db, {
      authorId: 'author',
      draft: baseDraft({
        name: '  Field Keeper  ',
        cardJson: {
          ...baseDraft().cardJson,
          name: '  Field Keeper  ',
        },
      }),
    })
    expect(created.draft.name).toBe('Field Keeper')
    expect(created.draft.cardJson.name).toBe('Field Keeper')

    const checkpointed = checkpointDraft(db, {
      cardId: created.id,
      authorId: 'author',
      baseRevision: created.revision,
      draft: {
        ...created.draft,
        name: '  Renamed Keeper  ',
        cardJson: {
          ...created.draft.cardJson,
          name: '  Renamed Keeper  ',
        },
      },
    })
    expect(checkpointed.draft.name).toBe('Renamed Keeper')
    expect(checkpointed.draft.cardJson.name).toBe('Renamed Keeper')
  })

  it('requires a legal globally unique custom card id', () => {
    createCard(db, { authorId: 'author', draft: baseDraft() })

    expect(() => createCard(db, {
      authorId: 'other',
      draft: baseDraft(),
    })).toThrowError(expect.objectContaining<Partial<WorkshopDraftError>>({ code: 'conflict' }))
    expect(() => createCard(db, {
      authorId: 'other',
      draft: baseDraft({ cardId: 'CUSTOM_bad-name' }),
    })).toThrowError(expect.objectContaining<Partial<WorkshopDraftError>>({ code: 'invalid' }))
  })

  it('keeps an approved runtime card id reserved until an edit voids the approval', () => {
    const created = createCard(db, { authorId: 'author', draft: baseDraft() })
    approveCurrentDraft(db, { cardId: created.id, authorId: 'author' })

    // while approved, the runtime card id is reserved for everyone else
    expect(() => createCard(db, {
      authorId: 'other',
      draft: baseDraft(),
    })).toThrowError(expect.objectContaining<Partial<WorkshopDraftError>>({ code: 'conflict' }))

    // renaming the draft voids the approval (stale) and releases the old id
    checkpointDraft(db, {
      cardId: created.id,
      authorId: 'author',
      baseRevision: 1,
      draft: baseDraft({
        cardId: 'CUSTOM_RenamedFieldKeeper',
        cardJson: {
          ...baseDraft().cardJson,
          id: 'CUSTOM_RenamedFieldKeeper',
        },
      }),
    })
    expect(loadWorkspace(db, created.id, 'author').reviewStatus).toBe('stale')
    // mutable rows still reserve their card_id against other mutable rows,
    // so the old id stays blocked only via the renamed row disappearing
    const other = createCard(db, {
      authorId: 'other',
      draft: baseDraft(),
    })
    expect(other.reviewStatus).toBe('unsubmitted')
  })

  it('checkpoints a whole draft with optimistic revision conflict protection', () => {
    const created = createCard(db, { authorId: 'author', draft: baseDraft() })
    db.prepare(`
      UPDATE workshop_cards
      SET sandbox_pass_version_id = 'old-version', sandbox_passed_at = 100
      WHERE id = ?
    `).run(created.id)

    const saved = checkpointDraft(db, {
      cardId: created.id,
      authorId: 'author',
      baseRevision: 1,
      draft: baseDraft({
        name: 'Field Keeper II',
        cardJson: {
          ...baseDraft().cardJson,
          name: 'Field Keeper II',
        },
        generation: { ability: { prompt: 'gain grain' } },
      }),
    })

    expect(saved.revision).toBe(2)
    expect(saved.draft.name).toBe('Field Keeper II')
    expect(saved.draft.generation).toEqual({ ability: { prompt: 'gain grain' } })
    expect(saved.sandboxPassVersionId).toBeNull()
    expect(db.prepare('SELECT COUNT(*) AS count FROM workshop_card_versions').get()).toEqual({ count: 0 })

    expect(() => checkpointDraft(db, {
      cardId: created.id,
      authorId: 'author',
      baseRevision: 1,
      draft: baseDraft({ name: 'Stale write' }),
    })).toThrowError(expect.objectContaining<Partial<WorkshopDraftError>>({
      code: 'conflict',
      current: expect.objectContaining({ revision: 2 }),
    }))
    expect(loadWorkspace(db, created.id, 'author').draft.name).toBe('Field Keeper II')
  })

  it('adopts typed candidates and deduplicates immutable versions by content', () => {
    const created = createCard(db, {
      authorId: 'author',
      draft: baseDraft({
        generation: {
          art: {
            subject: 'A field keeper',
            prompt: 'a field at sunrise',
          },
        },
      }),
    })
    const candidate = {
      id: 'art-1',
      kind: 'art' as const,
      prompt: 'An edited field keeper',
      resultUrl: '/card-art/sunrise.png',
      provider: 'fake',
      model: 'image-test',
      promptFormat: 'subject' as const,
      createdAt: 100,
    }

    const adopted = adoptCandidate(db, {
      cardId: created.id,
      authorId: 'author',
      baseRevision: 1,
      candidate,
      artInputs: {
        subject: 'Current field keeper',
      },
    })

    expect(adopted.workspace.revision).toBe(2)
    expect(adopted.workspace.draft.artUrl).toBe('/card-art/sunrise.png')
    expect(adopted.workspace.draft.generation).toEqual({
      art: {
        subject: 'Current field keeper',
        lastCompleted: candidate,
        adopted: candidate,
      },
    })
    expect(db.prepare(`
      SELECT content_hash, provenance_json FROM workshop_card_versions WHERE id = ?
    `).get(adopted.versionId)).toEqual({
      content_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
      provenance_json: JSON.stringify({
        art: {
          subject: 'Current field keeper',
          adopted: {
            id: candidate.id,
            kind: candidate.kind,
            prompt: candidate.prompt,
            promptFormat: candidate.promptFormat,
            provider: candidate.provider,
            model: candidate.model,
            createdAt: candidate.createdAt,
          },
        },
      }),
    })

    const repeated = adoptCandidate(db, {
      cardId: created.id,
      authorId: 'author',
      baseRevision: 2,
      candidate,
    })
    expect(repeated.versionId).toBe(adopted.versionId)
    expect(db.prepare('SELECT COUNT(*) AS count FROM workshop_card_versions').get()).toEqual({ count: 1 })
  })

  it('keeps only the five newest player versions', () => {
    let workspace = createCard(db, { authorId: 'author', draft: baseDraft() })

    for (let index = 1; index <= 6; index += 1) {
      workspace = adoptCandidate(db, {
        cardId: workspace.id,
        authorId: 'author',
        baseRevision: workspace.revision,
        candidate: {
          id: `art-${index}`,
          kind: 'art',
          prompt: `field ${index}`,
          promptFormat: 'subject',
          resultUrl: `/card-art/${index}.png`,
          createdAt: index,
        },
      }).workspace
    }

    expect(db.prepare(`
      SELECT version_number FROM workshop_card_versions
      WHERE card_id = ? ORDER BY version_number
    `).all(workspace.id)).toEqual([
      { version_number: 2 },
      { version_number: 3 },
      { version_number: 4 },
      { version_number: 5 },
      { version_number: 6 },
    ])
  })

  it('keeps transient form state and unadopted generations out of versions', () => {
    const draft = baseDraft({
      cardJson: {
        ...baseDraft().cardJson,
        _draft: { costInput: '1 wood' },
      },
      generation: {
        ability: {
          lastCompleted: {
            id: 'ability-pending',
            kind: 'ability',
            prompt: 'private pending prompt',
            sourceCode: 'pending source',
            createdAt: 50,
          },
        },
      },
    })
    const created = createCard(db, { authorId: 'author', draft })
    const adopted = adoptCandidate(db, {
      cardId: created.id,
      authorId: 'author',
      baseRevision: 1,
      candidate: {
        id: 'art-final',
        kind: 'art',
        prompt: 'final art prompt',
        promptFormat: 'subject',
        resultUrl: '/card-art/final.png',
        createdAt: 100,
      },
    })
    const version = db.prepare(`
      SELECT card_json, provenance_json
      FROM workshop_card_versions WHERE id = ?
    `).get(adopted.versionId) as { card_json: string; provenance_json: string }

    expect(JSON.parse(version.card_json)).not.toHaveProperty('_draft')
    expect(version.provenance_json).not.toContain('private pending prompt')
    expect(version.provenance_json).not.toContain('/card-art/final.png')
    expect(JSON.parse(version.provenance_json)).toEqual({
      art: {
        adopted: {
          id: 'art-final',
          kind: 'art',
          prompt: 'final art prompt',
          promptFormat: 'subject',
          createdAt: 100,
        },
      },
    })
  })

  it('only adopts statically validated ability candidates', () => {
    const created = createCard(db, { authorId: 'author', draft: baseDraft() })
    const invalidCandidate = {
      id: 'ability-1',
      kind: 'ability' as const,
      prompt: 'gain grain',
      sourceCode: 'bad source',
      compiledCode: '',
      codeManifest: null,
      validation: { valid: false, errors: ['bad source'] },
      createdAt: 100,
    }
    expect(() => adoptCandidate(db, {
      cardId: created.id,
      authorId: 'author',
      baseRevision: 1,
      candidate: invalidCandidate,
    })).toThrowError(expect.objectContaining<Partial<WorkshopDraftError>>({ code: 'not_ready' }))

    const validCandidate = {
      ...invalidCandidate,
      sourceCode: 'const CARD_IMPL = {}',
      compiledCode: '"use strict"; const CARD_IMPL = {};',
      codeManifest: { listeners: [] },
      cardJson: {
        ...baseDraft().cardJson,
        desc: ['Generated effect text.'],
        cost: { wood: 2 },
        vp: 2,
        locales: {
          zh: {
            name: '生成的田野管理员',
            desc: ['生成的效果文本。'],
          },
        },
      },
      validation: { valid: true as const },
    }
    const adopted = adoptCandidate(db, {
      cardId: created.id,
      authorId: 'author',
      baseRevision: 1,
      candidate: validCandidate,
    })
    expect(adopted.workspace.draft.effectCode).toBe(validCandidate.sourceCode)
    expect(adopted.workspace.draft.compiledCode).toBe(validCandidate.compiledCode)
    expect(adopted.workspace.draft.codeManifest).toEqual(validCandidate.codeManifest)
    expect(adopted.workspace.draft.name).toBe('Field Keeper')
    expect(adopted.workspace.draft.cardJson).toMatchObject({
      name: 'Field Keeper',
      desc: ['Generated effect text.'],
      cost: { wood: 2 },
      vp: 2,
      locales: {
        zh: {
          name: '生成的田野管理员',
          desc: ['生成的效果文本。'],
        },
      },
    })
  })

  it('preserves existing localization when ability metadata omits it', () => {
    const draft = baseDraft({
      cardJson: {
        ...baseDraft().cardJson,
        locales: {
          zh: {
            name: '田野管理员',
            desc: ['保留一块田。'],
          },
        },
        _draft: { costInput: '2 wood' },
      },
    })
    const created = createCard(db, { authorId: 'author', draft })
    const adopted = adoptCandidate(db, {
      cardId: created.id,
      authorId: 'author',
      baseRevision: 1,
      candidate: {
        id: 'ability-localization',
        kind: 'ability',
        prompt: 'gain grain',
        sourceCode: 'const CARD_IMPL = {}',
        compiledCode: '"use strict"; const CARD_IMPL = {};',
        codeManifest: { listeners: [] },
        cardJson: {
          ...baseDraft().cardJson,
        },
        validation: { valid: true },
        createdAt: 100,
      },
    })

    expect(adopted.workspace.draft.cardJson).toMatchObject({
      name: 'Field Keeper',
      locales: draft.cardJson.locales,
      _draft: draft.cardJson._draft,
    })
  })

  it('rejects approval when the row type differs from the card definition', () => {
    const created = createCard(db, {
      authorId: 'author',
      draft: baseDraft({ cardType: 'minor' }),
    })

    expect(() => approveCurrentDraft(db, {
      cardId: created.id,
      authorId: 'author',
    })).toThrowError(expect.objectContaining<Partial<WorkshopDraftError>>({
      code: 'not_ready',
      message: expect.stringContaining('type'),
    }))
  })

  it('rejects approval when compiled source metadata differs from the draft', () => {
    const created = createCard(db, {
      authorId: 'author',
      draft: baseDraft({
        name: 'Renamed Field Keeper',
        cardJson: {
          ...baseDraft().cardJson,
          name: 'Renamed Field Keeper',
        },
        effectCode: 'const CARD_DEF = {}; const CARD_IMPL = {}',
        compiledCode: '"use strict"; const CARD_DEF = {}; const CARD_IMPL = {};',
        codeManifest: {
          effectHooks: [],
          listeners: [],
          cardDefinition: {
            cardType: 'occupation',
            meta: baseDraft().cardJson,
          },
        },
      }),
    })

    expect(() => approveCurrentDraft(db, {
      cardId: created.id,
      authorId: 'author',
    })).toThrowError(expect.objectContaining<Partial<WorkshopDraftError>>({
      code: 'not_ready',
      message: expect.stringContaining('source'),
    }))
  })

  it('rejects approval when the draft adds metadata omitted by the source', () => {
    const draft = handoffDraft()
    const created = createCard(db, {
      authorId: 'author',
      draft: {
        ...draft,
        cardJson: {
          ...draft.cardJson,
          cost: { wood: 1 },
        },
      },
    })

    expect(() => approveCurrentDraft(db, {
      cardId: created.id,
      authorId: 'author',
    })).toThrowError(expect.objectContaining<Partial<WorkshopDraftError>>({
      code: 'not_ready',
      message: expect.stringContaining('source'),
    }))
  })

  it('restores by copy-forward without creating a new version', () => {
    const created = createCard(db, { authorId: 'author', draft: baseDraft() })
    const adopted = adoptCandidate(db, {
      cardId: created.id,
      authorId: 'author',
      baseRevision: 1,
      candidate: {
        id: 'art-restore',
        kind: 'art',
        prompt: 'original field',
        promptFormat: 'subject',
        resultUrl: '/card-art/original.png',
        createdAt: 100,
      },
      artInputs: { subject: 'original field' },
    })
    const changed = checkpointDraft(db, {
      cardId: created.id,
      authorId: 'author',
      baseRevision: 2,
      draft: {
        ...adopted.workspace.draft,
        name: 'Changed name',
        cardJson: { ...adopted.workspace.draft.cardJson, name: 'Changed name' },
        artUrl: '/card-art/changed.png',
      },
    })

    const restored = restoreVersion(db, {
      cardId: created.id,
      authorId: 'author',
      baseRevision: changed.revision,
      versionId: adopted.versionId,
    })

    expect(restored.revision).toBe(4)
    expect(restored.draft.name).toBe('Field Keeper')
    expect(restored.draft.artUrl).toBe('/card-art/original.png')
    expect(restored.draft.generation).toMatchObject({ art: { subject: 'original field' } })
    expect(db.prepare('SELECT COUNT(*) AS count FROM workshop_card_versions').get()).toEqual({ count: 1 })
  })

  it('loads an exact immutable version for the author sandbox', () => {
    const created = createCard(db, { authorId: 'author', draft: baseDraft() })
    const adopted = adoptCandidate(db, {
      cardId: created.id,
      authorId: 'author',
      baseRevision: 1,
      candidate: {
        id: 'art-original',
        kind: 'art',
        prompt: 'original field',
        promptFormat: 'subject',
        resultUrl: '/card-art/original.png',
        createdAt: 100,
      },
    })
    checkpointDraft(db, {
      cardId: created.id,
      authorId: 'author',
      baseRevision: 2,
      draft: {
        ...adopted.workspace.draft,
        name: 'Changed name',
        cardJson: { ...adopted.workspace.draft.cardJson, name: 'Changed name' },
        artUrl: '/card-art/changed.png',
      },
    })

    expect(loadSandboxVersion(db, {
      cardId: created.id,
      authorId: 'author',
      versionId: adopted.versionId,
    })).toMatchObject({
      name: 'Field Keeper',
      artUrl: '/card-art/original.png',
    })
    expect(() => loadSandboxVersion(db, {
      cardId: created.id,
      authorId: 'other',
      versionId: adopted.versionId,
    })).toThrowError(expect.objectContaining<Partial<WorkshopDraftError>>({ code: 'forbidden' }))
  })

  it('loads live gameplay data from the pinned approved version', () => {
    const created = createCard(db, { authorId: 'author', draft: baseDraft() })
    const approved = approveCurrentDraft(db, { cardId: created.id, authorId: 'author' })
    publish(db, {
      cardId: created.id,
      authorId: 'author',
      baseRevision: 1,
    })

    expect(loadLiveDraft(db, created.id)).toMatchObject({
      name: 'Field Keeper',
      artUrl: null,
    })
    expect(loadWorkspace(db, created.id, 'author')).toMatchObject({
      revision: 1,
      approvedVersionId: approved.versionId,
    })

    // offline edits fork the draft, void the approval and stop live loading
    unpublish(db, { cardId: created.id, authorId: 'author', baseRevision: 1 })
    checkpointDraft(db, {
      cardId: created.id,
      authorId: 'author',
      baseRevision: 1,
      draft: baseDraft({
        name: 'Unpublished change',
        cardJson: {
          ...baseDraft().cardJson,
          name: 'Unpublished change',
        },
        artUrl: '/card-art/unpublished.png',
      }),
    })
    expect(() => loadLiveDraft(db, created.id))
      .toThrowError(expect.objectContaining<Partial<WorkshopDraftError>>({ code: 'not_found' }))
  })

  it('gates publishing on review approval and pins sandbox confirmation to the exact version', () => {
    const created = createCard(db, { authorId: 'author', draft: handoffDraft() })
    expect(() => publish(db, {
      cardId: created.id,
      authorId: 'author',
      baseRevision: 1,
    })).toThrowError(expect.objectContaining<Partial<WorkshopDraftError>>({ code: 'not_ready' }))

    const approved = approveCurrentDraft(db, { cardId: created.id, authorId: 'author' })
    expect(approved.workspace.reviewStatus).toBe('approved')
    expect(approved.workspace.live).toBe(false)
    expect(approved.workspace.approvedVersionId).toBe(approved.versionId)

    const published = publish(db, {
      cardId: created.id,
      authorId: 'author',
      baseRevision: 1,
    })
    expect(published.workspace.live).toBe(true)
    expect(published.versionId).toBe(approved.versionId)

    expect(getHandoffReadiness(db, created.id, 'author')).toEqual({
      ready: false,
      staticValidation: { valid: true, errors: [] },
      sandboxPassedForDraft: false,
    })
    expect(() => markSandboxPass(db, {
      cardId: created.id,
      authorId: 'author',
      versionId: approved.versionId,
      authorConfirmed: false,
      runtimeErrors: [],
    })).toThrowError(expect.objectContaining<Partial<WorkshopDraftError>>({ code: 'not_ready' }))
    expect(() => markSandboxPass(db, {
      cardId: created.id,
      authorId: 'author',
      versionId: approved.versionId,
      authorConfirmed: true,
      runtimeErrors: ['boom'],
    })).toThrowError(expect.objectContaining<Partial<WorkshopDraftError>>({ code: 'not_ready' }))

    markSandboxPass(db, {
      cardId: created.id,
      authorId: 'author',
      versionId: approved.versionId,
      authorConfirmed: true,
      runtimeErrors: [],
    })
    expect(getHandoffReadiness(db, created.id, 'author').ready).toBe(true)

    unpublish(db, { cardId: created.id, authorId: 'author', baseRevision: 1 })
    checkpointDraft(db, {
      cardId: created.id,
      authorId: 'author',
      baseRevision: 1,
      draft: baseDraft({
        artUrl: '/card-art/new.png',
      }),
    })
    expect(getHandoffReadiness(db, created.id, 'author')).toMatchObject({
      ready: false,
      sandboxPassedForDraft: false,
    })
    expect(loadWorkspace(db, created.id, 'author').reviewStatus).toBe('stale')
  })

  it('enters review from unsubmitted and blocks re-entry after approval', () => {
    const created = createCard(db, { authorId: 'author', draft: baseDraft() })
    const inReview = enterReview(db, {
      cardId: created.id,
      authorId: 'author',
      prUrl: 'https://github.com/x/y/pull/9',
      expectedRevision: 1,
    })
    expect(inReview.reviewStatus).toBe('in_review')
    expect(inReview.live).toBe(false)

    // re-submission while in_review is the update-PR path
    expect(enterReview(db, {
      cardId: created.id,
      authorId: 'author',
      prUrl: 'https://github.com/x/y/pull/9',
      expectedRevision: 1,
    }).reviewStatus).toBe('in_review')

    // a checkpoint racing the GitHub round-trip invalidates the transition
    expect(() => enterReview(db, {
      cardId: created.id,
      authorId: 'author',
      prUrl: 'https://github.com/x/y/pull/9',
      expectedRevision: 0,
    })).toThrowError(expect.objectContaining<Partial<WorkshopDraftError>>({ code: 'conflict' }))

    approveCurrentDraft(db, { cardId: created.id, authorId: 'author' })
    expect(() => enterReview(db, {
      cardId: created.id,
      authorId: 'author',
      prUrl: 'https://github.com/x/y/pull/9',
      expectedRevision: 1,
    })).toThrowError(expect.objectContaining<Partial<WorkshopDraftError>>({ code: 'conflict' }))
  })

  it('moves a reused PR binding to the latest review submission', () => {
    const first = createCard(db, { authorId: 'author', draft: baseDraft() })
    const second = createCard(db, {
      authorId: 'author',
      draft: baseDraft({
        cardId: 'CUSTOM_SecondFieldKeeper',
        cardJson: {
          ...baseDraft().cardJson,
          id: 'CUSTOM_SecondFieldKeeper',
        },
      }),
    })
    const prUrl = 'https://github.com/x/y/pull/10'

    enterReview(db, {
      cardId: first.id,
      authorId: 'author',
      prUrl,
      expectedRevision: 1,
    })
    enterReview(db, {
      cardId: second.id,
      authorId: 'author',
      prUrl,
      expectedRevision: 1,
    })

    expect(db.prepare(`
      SELECT review_status, live, github_pr_url
      FROM workshop_cards WHERE id = ?
    `).get(first.id)).toEqual({
      review_status: 'stale',
      live: 0,
      github_pr_url: null,
    })
    expect(db.prepare(`
      SELECT review_status, github_pr_url
      FROM workshop_cards WHERE id = ?
    `).get(second.id)).toEqual({
      review_status: 'in_review',
      github_pr_url: prUrl,
    })

    approveCurrentDraft(db, { cardId: second.id, authorId: 'author' })
    expect(() => enterReview(db, {
      cardId: first.id,
      authorId: 'author',
      prUrl,
      expectedRevision: 1,
    })).toThrowError(expect.objectContaining<Partial<WorkshopDraftError>>({ code: 'conflict' }))
  })

  it('does not let an older approval invalidate a newer submission', () => {
    const created = createCard(db, { authorId: 'author', draft: baseDraft() })
    const prUrl = 'https://github.com/x/y/pull/11'
    enterReview(db, {
      cardId: created.id,
      authorId: 'author',
      prUrl,
      expectedRevision: 1,
      commitSha: 'head-a',
    })
    const binding = db.prepare(`
      SELECT review_commit_sha, review_version_id, updated_at
      FROM workshop_cards WHERE id = ?
    `).get(created.id) as {
      review_commit_sha: string
      review_version_id: string
      updated_at: number
    }

    enterReview(db, {
      cardId: created.id,
      authorId: 'author',
      prUrl,
      expectedRevision: 1,
      commitSha: 'head-b',
    })
    const approved = approveReviewedVersion(db, {
      prUrl,
      commitSha: 'head-a',
      reviewId: 'review-a',
      expectedBinding: {
        id: created.id,
        reviewCommitSha: binding.review_commit_sha,
        reviewVersionId: binding.review_version_id,
        updatedAt: binding.updated_at,
      },
    })

    expect(approved).toBe(0)
    expect(db.prepare(`
      SELECT review_status, review_commit_sha
      FROM workshop_cards WHERE id = ?
    `).get(created.id)).toEqual({
      review_status: 'in_review',
      review_commit_sha: 'head-b',
    })
  })

  it('blocks editing a live card, keeps approval across unpublish, voids it on edit', () => {
    const created = createCard(db, { authorId: 'author', draft: baseDraft() })
    approveCurrentDraft(db, { cardId: created.id, authorId: 'author' })
    publish(db, { cardId: created.id, authorId: 'author', baseRevision: 1 })

    // live card edits are blocked until an explicit unpublish
    expect(() => checkpointDraft(db, {
      cardId: created.id,
      authorId: 'author',
      baseRevision: 1,
      draft: baseDraft({
        cardJson: { ...baseDraft().cardJson, desc: ['edited'] },
      }),
    })).toThrowError(expect.objectContaining<Partial<WorkshopDraftError>>({
      code: 'live_edit_blocked',
      message: expect.stringContaining('unpublish'),
    }))

    // unpublish keeps the approval — an unchanged card re-publishes freely
    const offline = unpublish(db, { cardId: created.id, authorId: 'author', baseRevision: 1 })
    expect(offline.live).toBe(false)
    expect(offline.reviewStatus).toBe('approved')
    expect(publish(db, {
      cardId: created.id,
      authorId: 'author',
      baseRevision: 1,
    }).workspace.live).toBe(true)

    // editing content after unpublish voids the approval
    unpublish(db, { cardId: created.id, authorId: 'author', baseRevision: 1 })
    const edited = checkpointDraft(db, {
      cardId: created.id,
      authorId: 'author',
      baseRevision: 1,
      draft: baseDraft({
        cardJson: { ...baseDraft().cardJson, desc: ['edited for real'] },
      }),
    })
    expect(edited.reviewStatus).toBe('stale')
    expect(edited.approvedVersionId).toBeNull()
    expect(() => publish(db, {
      cardId: created.id,
      authorId: 'author',
      baseRevision: 2,
    })).toThrowError(expect.objectContaining<Partial<WorkshopDraftError>>({ code: 'not_ready' }))
  })

  it('re-verifies the atomic review snapshot at publish time', () => {
    const created = createCard(db, { authorId: 'author', draft: baseDraft() })
    approveCurrentDraft(db, {
      cardId: created.id,
      authorId: 'author',
      commitSha: 'sha-reviewed',
    })

    setReviewDecisionProvider({
      getSnapshot: () => ({
        decision: 'approved',
        approvedCommitSha: 'sha-reviewed',
        headCommitSha: 'sha-reviewed',
      }),
    })
    expect(publish(db, {
      cardId: created.id,
      authorId: 'author',
      baseRevision: 1,
    }).workspace.live).toBe(true)

    // author pushed a new commit after approval: head diverges -> reject + stale
    unpublish(db, { cardId: created.id, authorId: 'author', baseRevision: 1 })
    setReviewDecisionProvider({
      getSnapshot: () => ({
        decision: 'approved',
        approvedCommitSha: 'sha-reviewed',
        headCommitSha: 'sha-new-push',
      }),
    })
    expect(() => publish(db, {
      cardId: created.id,
      authorId: 'author',
      baseRevision: 1,
    })).toThrowError(expect.objectContaining<Partial<WorkshopDraftError>>({ code: 'not_ready' }))
    const after = loadWorkspace(db, created.id, 'author')
    expect(after.reviewStatus).toBe('stale')
    expect(after.live).toBe(false)
    expect(after.approvedVersionId).toBeNull()
  })

  it('keeps the approval when the review snapshot is temporarily unavailable', () => {
    const created = createCard(db, { authorId: 'author', draft: baseDraft() })
    approveCurrentDraft(db, {
      cardId: created.id,
      authorId: 'author',
      commitSha: 'sha-reviewed',
    })
    setReviewDecisionProvider({
      getSnapshot: () => ({
        decision: 'unknown',
        approvedCommitSha: null,
        headCommitSha: null,
      }),
    })
    expect(() => publish(db, {
      cardId: created.id,
      authorId: 'author',
      baseRevision: 1,
    })).toThrowError(expect.objectContaining<Partial<WorkshopDraftError>>({
      code: 'not_ready',
      message: expect.stringContaining('try again'),
    }))
    const after = loadWorkspace(db, created.id, 'author')
    expect(after.reviewStatus).toBe('approved')
    expect(after.approvedVersionId).not.toBeNull()
  })

  it('admin takedown forces a live approved card to stale offline', () => {
    const created = createCard(db, { authorId: 'author', draft: baseDraft() })
    approveCurrentDraft(db, { cardId: created.id, authorId: 'author' })
    publish(db, { cardId: created.id, authorId: 'author', baseRevision: 1 })

    expect(adminTakedownCard(db, created.id)).toEqual({ reviewStatus: 'stale', live: false, removedRoomIds: [] })
    const after = loadWorkspace(db, created.id, 'author')
    expect(after.approvedVersionId).toBeNull()
    // republishing requires another review round
    expect(() => publish(db, {
      cardId: created.id,
      authorId: 'author',
      baseRevision: 1,
    })).toThrowError(expect.objectContaining<Partial<WorkshopDraftError>>({ code: 'not_ready' }))
  })

  it('admin takedown atomically deletes persisted rooms embedding the card, exact-match only', () => {
    const created = createCard(db, { authorId: 'author', draft: baseDraft() })
    db.prepare(`INSERT INTO rooms (id, custom_card_ids) VALUES ('embeds', ?)`)
      .run(JSON.stringify([created.id]))
    const lookalike = created.id.replace(/./, created.id.startsWith('X') ? 'Y' : 'X')
    db.prepare(`INSERT INTO rooms (id, custom_card_ids) VALUES ('lookalike', ?)`)
      .run(JSON.stringify([lookalike]))
    const result = adminTakedownCard(db, created.id)
    expect(result.removedRoomIds).toEqual(['embeds'])
    expect(db.prepare(`SELECT COUNT(*) AS n FROM rooms WHERE id = 'embeds'`).get()).toEqual({ n: 0 })
    expect(db.prepare(`SELECT COUNT(*) AS n FROM rooms WHERE id = 'lookalike'`).get()).toEqual({ n: 1 })
  })

  it('admin takedown is a safe no-op for cards without approval', () => {
    const created = createCard(db, { authorId: 'author', draft: baseDraft() })
    expect(adminTakedownCard(db, created.id)).toEqual({ reviewStatus: 'unsubmitted', live: false, removedRoomIds: [] })
    expect(() => adminTakedownCard(db, 'missing-card'))
      .toThrowError(expect.objectContaining<Partial<WorkshopDraftError>>({ code: 'not_found' }))
  })

  it('graduates a merged PR: live snapshot serves the release window, then built_in retires it', () => {
    const created = createCard(db, { authorId: 'author', draft: baseDraft() })
    enterReview(db, {
      cardId: created.id,
      authorId: 'author',
      prUrl: 'https://github.com/x/y/pull/42',
      expectedRevision: 1,
    })
    approveCurrentDraft(db, { cardId: created.id, authorId: 'author' })
    publish(db, { cardId: created.id, authorId: 'author', baseRevision: 1 })

    expect(markCardMerged(db, { prUrl: 'https://github.com/x/y/pull/42' })).toBe(1)
    const merged = loadWorkspace(db, created.id, 'author')
    expect(merged.reviewStatus).toBe('merged')
    expect(merged.live).toBe(true)
    // release window: the approved snapshot keeps serving rooms
    expect(loadLiveDraft(db, created.id)).toMatchObject({ name: 'Field Keeper' })
    // merged cards cannot be unpublished or edited in the workshop
    expect(() => unpublish(db, { cardId: created.id, authorId: 'author', baseRevision: 1 }))
      .toThrowError(expect.objectContaining<Partial<WorkshopDraftError>>({ code: 'conflict' }))

    // a release containing the card ships: built-in registry takes over
    expect(markBuiltInMergedCards(db, ['CUSTOM_FieldKeeper'])).toEqual({ flagged: 1, unflagged: 0 })
    expect(() => loadLiveDraft(db, created.id))
      .toThrowError(expect.objectContaining<Partial<WorkshopDraftError>>({ code: 'not_found' }))
    // idempotent: second startup flags nothing new
    expect(markBuiltInMergedCards(db, ['CUSTOM_FieldKeeper'])).toEqual({ flagged: 0, unflagged: 0 })
    // rollback deployment without the card: fall back to the workshop snapshot
    expect(markBuiltInMergedCards(db, [])).toEqual({ flagged: 0, unflagged: 1 })
    expect(loadLiveDraft(db, created.id)).toMatchObject({ name: 'Field Keeper' })
  })

  it('treats merged cards as read-only in the workshop', () => {
    const created = createCard(db, { authorId: 'author', draft: baseDraft() })
    approveCurrentDraft(db, { cardId: created.id, authorId: 'author' })
    db.prepare(`UPDATE workshop_cards SET review_status = 'merged' WHERE id = ?`).run(created.id)
    expect(() => checkpointDraft(db, {
      cardId: created.id,
      authorId: 'author',
      baseRevision: 1,
      draft: baseDraft({
        cardJson: { ...baseDraft().cardJson, desc: ['edited'] },
      }),
    })).toThrowError(expect.objectContaining<Partial<WorkshopDraftError>>({
      code: 'conflict',
      message: expect.stringContaining('read-only'),
    }))
  })

  it('does not mark an approved metadata-only card ready for PR handoff', () => {
    const created = createCard(db, { authorId: 'author', draft: baseDraft() })
    const approved = approveCurrentDraft(db, { cardId: created.id, authorId: 'author' })
    markSandboxPass(db, {
      cardId: created.id,
      authorId: 'author',
      versionId: approved.versionId,
      authorConfirmed: true,
      runtimeErrors: [],
    })

    expect(getHandoffReadiness(db, created.id, 'author')).toMatchObject({
      ready: false,
      staticValidation: {
        valid: false,
        errors: expect.arrayContaining([
          'Ability source is required for PR handoff',
        ]),
      },
    })
  })

  it('keeps an exact-version sandbox pass across private generation checkpoints', () => {
    const created = createCard(db, { authorId: 'author', draft: handoffDraft() })
    const approved = approveCurrentDraft(db, { cardId: created.id, authorId: 'author' })
    markSandboxPass(db, {
      cardId: created.id,
      authorId: 'author',
      versionId: approved.versionId,
      authorConfirmed: true,
      runtimeErrors: [],
    })

    const checkpointed = checkpointDraft(db, {
      cardId: created.id,
      authorId: 'author',
      baseRevision: 1,
      draft: handoffDraft({
        generation: {
          ability: {
            lastCompleted: {
              id: 'unadopted',
              kind: 'ability',
              prompt: 'private generation',
              sourceCode: 'not adopted',
              createdAt: 100,
            },
          },
        },
      }),
    })

    expect(checkpointed.sandboxPassVersionId).toBe(approved.versionId)
    expect(getHandoffReadiness(db, created.id, 'author').ready).toBe(true)
  })
})
