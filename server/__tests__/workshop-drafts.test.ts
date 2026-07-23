import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  WorkshopDraftError,
  adoptCandidate,
  checkpointDraft,
  createCard,
  getHandoffReadiness,
  loadPublishedDraft,
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
      status TEXT NOT NULL DEFAULT 'draft',
      featured INTEGER NOT NULL DEFAULT 0,
      github_pr_url TEXT,
      github_pr_status TEXT,
      github_pr_last_synced_at INTEGER,
      draft_revision INTEGER NOT NULL DEFAULT 1,
      draft_generation_json TEXT NOT NULL DEFAULT '{}',
      published_version_id TEXT,
      sandbox_pass_version_id TEXT,
      sandbox_passed_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
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
  db.close()
})

describe('workshop draft aggregate', () => {
  it('creates and loads an author-private revisioned workspace', () => {
    const created = createCard(db, {
      authorId: 'author',
      draft: baseDraft({
        generation: {
          art: {
            prompt: 'sunlit medieval field',
            resultUrl: '/card-art/field.png',
          },
        },
      }),
    })

    expect(created.revision).toBe(1)
    expect(created.status).toBe('draft')
    expect(created.draft.effectCode).toBeNull()
    expect(created.draft.generation).toEqual({
      art: {
        prompt: 'sunlit medieval field',
        resultUrl: '/card-art/field.png',
      },
    })
    expect(loadWorkspace(db, created.id, 'author')).toEqual(created)
    expect(() => loadWorkspace(db, created.id, 'other')).toThrowError(
      expect.objectContaining<Partial<WorkshopDraftError>>({ code: 'forbidden' }),
    )
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

  it('keeps a published runtime card id reserved after the mutable draft is renamed', () => {
    const created = createCard(db, { authorId: 'author', draft: baseDraft() })
    publish(db, {
      cardId: created.id,
      authorId: 'author',
      baseRevision: 1,
    })
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

    expect(() => createCard(db, {
      authorId: 'other',
      draft: baseDraft(),
    })).toThrowError(expect.objectContaining<Partial<WorkshopDraftError>>({ code: 'conflict' }))

    const other = createCard(db, {
      authorId: 'other',
      draft: baseDraft({
        cardId: 'CUSTOM_OtherCard',
        cardJson: {
          ...baseDraft().cardJson,
          id: 'CUSTOM_OtherCard',
        },
      }),
    })
    expect(() => checkpointDraft(db, {
      cardId: other.id,
      authorId: 'other',
      baseRevision: 1,
      draft: baseDraft(),
    })).toThrowError(expect.objectContaining<Partial<WorkshopDraftError>>({ code: 'conflict' }))
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
    const created = createCard(db, { authorId: 'author', draft: baseDraft() })
    const candidate = {
      id: 'art-1',
      kind: 'art' as const,
      prompt: 'a field at sunrise',
      resultUrl: '/card-art/sunrise.png',
      provider: 'fake',
      model: 'image-test',
      createdAt: 100,
    }

    const adopted = adoptCandidate(db, {
      cardId: created.id,
      authorId: 'author',
      baseRevision: 1,
      candidate,
    })

    expect(adopted.workspace.revision).toBe(2)
    expect(adopted.workspace.draft.artUrl).toBe('/card-art/sunrise.png')
    expect(adopted.workspace.draft.generation).toEqual({
      art: { lastCompleted: candidate, adopted: candidate },
    })
    expect(db.prepare(`
      SELECT content_hash, provenance_json FROM workshop_card_versions WHERE id = ?
    `).get(adopted.versionId)).toEqual({
      content_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
      provenance_json: JSON.stringify({
        art: {
          adopted: {
            id: candidate.id,
            kind: candidate.kind,
            prompt: candidate.prompt,
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
        name: 'Generated Field Keeper',
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
    expect(adopted.workspace.draft.name).toBe('Generated Field Keeper')
    expect(adopted.workspace.draft.cardJson).toMatchObject({
      name: 'Generated Field Keeper',
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
          name: 'Generated Field Keeper',
        },
        validation: { valid: true },
        createdAt: 100,
      },
    })

    expect(adopted.workspace.draft.cardJson).toMatchObject({
      name: 'Generated Field Keeper',
      locales: draft.cardJson.locales,
      _draft: draft.cardJson._draft,
    })
  })

  it('rejects publishing when the row type differs from the card definition', () => {
    const created = createCard(db, {
      authorId: 'author',
      draft: baseDraft({ cardType: 'minor' }),
    })

    expect(() => publish(db, {
      cardId: created.id,
      authorId: 'author',
      baseRevision: 1,
    })).toThrowError(expect.objectContaining<Partial<WorkshopDraftError>>({
      code: 'not_ready',
      message: expect.stringContaining('type'),
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
        resultUrl: '/card-art/original.png',
        createdAt: 100,
      },
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

  it('loads published gameplay data from the pinned version', () => {
    const created = createCard(db, { authorId: 'author', draft: baseDraft() })
    const published = publish(db, {
      cardId: created.id,
      authorId: 'author',
      baseRevision: 1,
    })
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

    expect(loadPublishedDraft(db, created.id)).toMatchObject({
      name: 'Field Keeper',
      artUrl: null,
    })
    expect(loadWorkspace(db, created.id, 'author')).toMatchObject({
      revision: 2,
      publishedVersionId: published.versionId,
      draft: {
        name: 'Unpublished change',
        artUrl: '/card-art/unpublished.png',
      },
    })
  })

  it('pins publishing and sandbox confirmation to the exact current version', () => {
    const created = createCard(db, { authorId: 'author', draft: baseDraft() })
    const published = publish(db, {
      cardId: created.id,
      authorId: 'author',
      baseRevision: 1,
    })

    expect(published.workspace.status).toBe('published')
    expect(published.workspace.publishedVersionId).toBe(published.versionId)
    expect(getHandoffReadiness(db, created.id, 'author')).toEqual({
      ready: false,
      staticValidation: { valid: true, errors: [] },
      publishedVersionMatchesDraft: true,
      sandboxPassedForPublishedVersion: false,
      publishedVersionId: published.versionId,
    })
    expect(() => markSandboxPass(db, {
      cardId: created.id,
      authorId: 'author',
      versionId: published.versionId,
      authorConfirmed: false,
      runtimeErrors: [],
    })).toThrowError(expect.objectContaining<Partial<WorkshopDraftError>>({ code: 'not_ready' }))
    expect(() => markSandboxPass(db, {
      cardId: created.id,
      authorId: 'author',
      versionId: published.versionId,
      authorConfirmed: true,
      runtimeErrors: ['boom'],
    })).toThrowError(expect.objectContaining<Partial<WorkshopDraftError>>({ code: 'not_ready' }))

    markSandboxPass(db, {
      cardId: created.id,
      authorId: 'author',
      versionId: published.versionId,
      authorConfirmed: true,
      runtimeErrors: [],
    })
    expect(getHandoffReadiness(db, created.id, 'author').ready).toBe(true)

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
      publishedVersionMatchesDraft: false,
      sandboxPassedForPublishedVersion: false,
    })
  })

  it('keeps an exact-version sandbox pass across private generation checkpoints', () => {
    const created = createCard(db, { authorId: 'author', draft: baseDraft() })
    const published = publish(db, {
      cardId: created.id,
      authorId: 'author',
      baseRevision: 1,
    })
    markSandboxPass(db, {
      cardId: created.id,
      authorId: 'author',
      versionId: published.versionId,
      authorConfirmed: true,
      runtimeErrors: [],
    })

    const checkpointed = checkpointDraft(db, {
      cardId: created.id,
      authorId: 'author',
      baseRevision: 1,
      draft: baseDraft({
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

    expect(checkpointed.sandboxPassVersionId).toBe(published.versionId)
    expect(getHandoffReadiness(db, created.id, 'author').ready).toBe(true)
  })
})
