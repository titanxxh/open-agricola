import { seedResourceCatalog } from './_helpers/objects'
import type { PostgresDatabase } from '../database/postgres'
import { createTestDatabase } from './_helpers/postgres'
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
  pinCurrentDraftVersion,
  publish,
  restoreVersion,
  type WorkshopDraft,
} from '../workshop-drafts.ts'

let db: PostgresDatabase

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

beforeEach(async () => {
  db = await createTestDatabase()
  await seedResourceCatalog(db, ['field.png', 'upload.png', 'sunrise.png', 'final.png', 'original.png', 'changed.png', 'unpublished.png', 'new.png', ...Array.from({ length: 20 }, (_, i) => `${i}.png`)])
  await db.exec("INSERT INTO users (id, username, display_name, password_hash, created_at) VALUES ('author', 'author', 'Author', 'hash', 1), ('other', 'other', 'Other', 'hash', 1)")
})

afterEach(async () => {
  setReviewDecisionProvider(null)
  ;(await db.close())
})

describe('workshop draft aggregate', () => {
  it('creates and loads an author-private revisioned workspace', async () => {
    const created = (await createCard(db, {
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
    }))

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
    expect((await loadWorkspace(db, created.id, 'author'))).toEqual(created)
    ;(await expect(loadWorkspace(db, created.id, 'other')).rejects.toThrowError(
      expect.objectContaining<Partial<WorkshopDraftError>>({ code: 'forbidden' }),
    ))
  })

  it('scrubs unmarked nested art prompts without losing uploads', async () => {
    const upload = {
      id: 'uploaded-art',
      kind: 'art' as const,
      prompt: 'legacy generated template',
      resultUrl: '/card-art/upload.png',
      provider: 'upload',
      model: 'image/png',
      createdAt: 100,
    }
    const created = (await createCard(db, {
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
    }))

    expect(created.draft.generation).toEqual({
      art: {
        subject: 'A field keeper',
        lastCompleted: { ...upload, prompt: 'A field keeper', promptFormat: 'subject' },
      },
    })
  })

  it('normalizes row and card definition names together', async () => {
    const created = (await createCard(db, {
      authorId: 'author',
      draft: baseDraft({
        name: '  Field Keeper  ',
        cardJson: {
          ...baseDraft().cardJson,
          name: '  Field Keeper  ',
        },
      }),
    }))
    expect(created.draft.name).toBe('Field Keeper')
    expect(created.draft.cardJson.name).toBe('Field Keeper')

    const checkpointed = (await checkpointDraft(db, {
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
    }))
    expect(checkpointed.draft.name).toBe('Renamed Keeper')
    expect(checkpointed.draft.cardJson.name).toBe('Renamed Keeper')
  })

  it('requires a legal globally unique custom card id', async () => {
    ;(await createCard(db, { authorId: 'author', draft: baseDraft() }))

    ;(await expect(createCard(db, {
      authorId: 'other',
      draft: baseDraft(),
    })).rejects.toThrowError(expect.objectContaining<Partial<WorkshopDraftError>>({ code: 'conflict' })))
    ;(await expect(createCard(db, {
      authorId: 'other',
      draft: baseDraft({ cardId: 'CUSTOM_bad-name' }),
    })).rejects.toThrowError(expect.objectContaining<Partial<WorkshopDraftError>>({ code: 'invalid' })))
  })

  it('keeps an approved runtime card id reserved until an edit voids the approval', async () => {
    const created = (await createCard(db, { authorId: 'author', draft: baseDraft() }))
    ;(await approveCurrentDraft(db, { cardId: created.id, authorId: 'author' }))

    // while approved, the runtime card id is reserved for everyone else
    ;(await expect(createCard(db, {
      authorId: 'other',
      draft: baseDraft(),
    })).rejects.toThrowError(expect.objectContaining<Partial<WorkshopDraftError>>({ code: 'conflict' })))

    // renaming the draft voids the approval (stale) and releases the old id
    ;(await checkpointDraft(db, {
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
    }))
    expect((await loadWorkspace(db, created.id, 'author')).reviewStatus).toBe('stale')
    // mutable rows still reserve their card_id against other mutable rows,
    // so the old id stays blocked only via the renamed row disappearing
    const other = (await createCard(db, {
      authorId: 'other',
      draft: baseDraft(),
    }))
    expect(other.reviewStatus).toBe('unsubmitted')
  })

  it('checkpoints a whole draft with optimistic revision conflict protection', async () => {
    const created = (await createCard(db, { authorId: 'author', draft: baseDraft() }))
    ;(await db.prepare(`
      UPDATE workshop_cards
      SET sandbox_pass_version_id = 'old-version', sandbox_passed_at = 100
      WHERE id = ?
    `).run(created.id))

    const saved = (await checkpointDraft(db, {
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
    }))

    expect(saved.revision).toBe(2)
    expect(saved.draft.name).toBe('Field Keeper II')
    // A bare request is local editing state, not a durable Generation Result.
    expect(saved.draft.generation).toEqual({})
    expect(saved.sandboxPassVersionId).toBeNull()
    expect((await db.prepare('SELECT COUNT(*) AS count FROM workshop_card_versions').get())).toEqual({ count: 0 })

    ;(await expect(checkpointDraft(db, {
      cardId: created.id,
      authorId: 'author',
      baseRevision: 1,
      draft: baseDraft({ name: 'Stale write' }),
    })).rejects.toThrowError(expect.objectContaining<Partial<WorkshopDraftError>>({
      code: 'conflict',
      current: expect.objectContaining({ revision: 2 }),
    })))
    expect((await loadWorkspace(db, created.id, 'author')).draft.name).toBe('Field Keeper II')
  })

  it('adopts typed candidates and deduplicates immutable versions by content', async () => {
    const created = (await createCard(db, {
      authorId: 'author',
      draft: baseDraft({
        generation: {
          art: {
            subject: 'A field keeper',
            prompt: 'a field at sunrise',
          },
        },
      }),
    }))
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

    const adopted = (await adoptCandidate(db, {
      cardId: created.id,
      authorId: 'author',
      baseRevision: 1,
      candidate,
      artInputs: {
        subject: 'Current field keeper',
      },
    }))

    expect(adopted.workspace.revision).toBe(2)
    expect(adopted.workspace.draft.artUrl).toBe('/card-art/sunrise.png')
    expect(adopted.workspace.draft.generation).toEqual({
      art: {
        subject: 'Current field keeper',
        lastCompleted: candidate,
        adopted: candidate,
      },
    })
    expect((await db.prepare(`
      SELECT content_hash, provenance_json FROM workshop_card_versions WHERE id = ?
    `).get(adopted.versionId))).toEqual({
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

    const repeated = (await adoptCandidate(db, {
      cardId: created.id,
      authorId: 'author',
      baseRevision: 2,
      candidate,
    }))
    expect(repeated.versionId).toBe(adopted.versionId)
    expect((await db.prepare('SELECT COUNT(*) AS count FROM workshop_card_versions').get())).toEqual({ count: 1 })
  })

  it('keeps only the five newest player versions', async () => {
    let workspace = (await createCard(db, { authorId: 'author', draft: baseDraft() }))

    for (let index = 1; index <= 6; index += 1) {
      workspace = (await adoptCandidate(db, {
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
      })).workspace
    }

    expect((await db.prepare(`
      SELECT version_number FROM workshop_card_versions
      WHERE card_id = ? ORDER BY version_number
    `).all(workspace.id))).toEqual([
      { version_number: 2 },
      { version_number: 3 },
      { version_number: 4 },
      { version_number: 5 },
      { version_number: 6 },
    ])
  })

  it.each(['pending','blocked'])('retains the frozen version and artwork reference of a %s submission', async state => {
    let workspace = await createCard(db,{authorId:'author',draft:baseDraft({artUrl:'/card-art/original.png'})})
    const {versionId} = await pinCurrentDraftVersion(db,{cardId:workspace.id,authorId:'author',baseRevision:workspace.revision})
    await db.prepare(`INSERT INTO workshop_submissions(id,card_id,author_id,version_id,revision,state,payload,created_at,updated_at)
      VALUES ('submission',?,'author',?,?,?,'{}',1,1)`).run(workspace.id,versionId,workspace.revision,state)
    for (let index=1; index<=7; index++) {
      workspace = await checkpointDraft(db,{cardId:workspace.id,authorId:'author',baseRevision:workspace.revision,draft:{...workspace.draft,artUrl:`/card-art/${index}.png`}})
      await pinCurrentDraftVersion(db,{cardId:workspace.id,authorId:'author',baseRevision:workspace.revision})
    }
    expect((await loadSandboxVersion(db,{cardId:workspace.id,authorId:'author',versionId})).artUrl).toBe('/card-art/original.png')
    expect(await db.prepare("SELECT object_key FROM object_references WHERE owner_kind='workshop_card_versions' AND owner_id=?").get(versionId)).toEqual({object_key:'card-art/original.png'})
    await db.prepare("UPDATE workshop_submissions SET state='complete' WHERE id='submission'").run()
    workspace = await checkpointDraft(db,{cardId:workspace.id,authorId:'author',baseRevision:workspace.revision,draft:{...workspace.draft,artUrl:'/card-art/8.png'}})
    await pinCurrentDraftVersion(db,{cardId:workspace.id,authorId:'author',baseRevision:workspace.revision})
    await expect(loadSandboxVersion(db,{cardId:workspace.id,authorId:'author',versionId})).rejects.toThrow('Version not found')
    expect(await db.prepare("SELECT 1 FROM object_references WHERE owner_kind='workshop_card_versions' AND owner_id=?").get(versionId)).toBeUndefined()
  })

  it('keeps transient form state and unadopted generations out of versions', async () => {
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
    const created = (await createCard(db, { authorId: 'author', draft }))
    const adopted = (await adoptCandidate(db, {
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
    }))
    const version = (await db.prepare(`
      SELECT card_json, provenance_json
      FROM workshop_card_versions WHERE id = ?
    `).get(adopted.versionId)) as { card_json: string; provenance_json: string }

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

  it('only adopts statically validated ability candidates', async () => {
    const created = (await createCard(db, { authorId: 'author', draft: baseDraft() }))
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
    ;(await expect(adoptCandidate(db, {
      cardId: created.id,
      authorId: 'author',
      baseRevision: 1,
      candidate: invalidCandidate,
    })).rejects.toThrowError(expect.objectContaining<Partial<WorkshopDraftError>>({ code: 'not_ready' })))

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
    const adopted = (await adoptCandidate(db, {
      cardId: created.id,
      authorId: 'author',
      baseRevision: 1,
      candidate: validCandidate,
    }))
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

  it('preserves existing localization when ability metadata omits it', async () => {
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
    const created = (await createCard(db, { authorId: 'author', draft }))
    const adopted = (await adoptCandidate(db, {
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
    }))

    expect(adopted.workspace.draft.cardJson).toMatchObject({
      name: 'Field Keeper',
      locales: draft.cardJson.locales,
      _draft: draft.cardJson._draft,
    })
  })

  it('rejects approval when the row type differs from the card definition', async () => {
    const created = (await createCard(db, {
      authorId: 'author',
      draft: baseDraft({ cardType: 'minor' }),
    }))

    ;(await expect(approveCurrentDraft(db, {
      cardId: created.id,
      authorId: 'author',
    })).rejects.toThrowError(expect.objectContaining<Partial<WorkshopDraftError>>({
      code: 'not_ready',
      message: expect.stringContaining('type'),
    })))
  })

  it('rejects approval when compiled source metadata differs from the draft', async () => {
    const created = (await createCard(db, {
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
    }))

    ;(await expect(approveCurrentDraft(db, {
      cardId: created.id,
      authorId: 'author',
    })).rejects.toThrowError(expect.objectContaining<Partial<WorkshopDraftError>>({
      code: 'not_ready',
      message: expect.stringContaining('source'),
    })))
  })

  it('rejects approval when the draft adds metadata omitted by the source', async () => {
    const draft = handoffDraft()
    const created = (await createCard(db, {
      authorId: 'author',
      draft: {
        ...draft,
        cardJson: {
          ...draft.cardJson,
          cost: { wood: 1 },
        },
      },
    }))

    ;(await expect(approveCurrentDraft(db, {
      cardId: created.id,
      authorId: 'author',
    })).rejects.toThrowError(expect.objectContaining<Partial<WorkshopDraftError>>({
      code: 'not_ready',
      message: expect.stringContaining('source'),
    })))
  })

  it('restores by copy-forward without creating a new version', async () => {
    const created = (await createCard(db, { authorId: 'author', draft: baseDraft() }))
    const adopted = (await adoptCandidate(db, {
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
    }))
    const changed = (await checkpointDraft(db, {
      cardId: created.id,
      authorId: 'author',
      baseRevision: 2,
      draft: {
        ...adopted.workspace.draft,
        name: 'Changed name',
        cardJson: { ...adopted.workspace.draft.cardJson, name: 'Changed name' },
        artUrl: '/card-art/changed.png',
      },
    }))

    const restored = (await restoreVersion(db, {
      cardId: created.id,
      authorId: 'author',
      baseRevision: changed.revision,
      versionId: adopted.versionId,
    }))

    expect(restored.revision).toBe(4)
    expect(restored.draft.name).toBe('Field Keeper')
    expect(restored.draft.artUrl).toBe('/card-art/original.png')
    expect(restored.draft.generation).toMatchObject({ art: { subject: 'original field' } })
    expect((await db.prepare('SELECT COUNT(*) AS count FROM workshop_card_versions').get())).toEqual({ count: 1 })
  })

  it('loads an exact immutable version for the author sandbox', async () => {
    const created = (await createCard(db, { authorId: 'author', draft: baseDraft() }))
    const adopted = (await adoptCandidate(db, {
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
    }))
    ;(await checkpointDraft(db, {
      cardId: created.id,
      authorId: 'author',
      baseRevision: 2,
      draft: {
        ...adopted.workspace.draft,
        name: 'Changed name',
        cardJson: { ...adopted.workspace.draft.cardJson, name: 'Changed name' },
        artUrl: '/card-art/changed.png',
      },
    }))

    expect((await loadSandboxVersion(db, {
      cardId: created.id,
      authorId: 'author',
      versionId: adopted.versionId,
    }))).toMatchObject({
      name: 'Field Keeper',
      artUrl: '/card-art/original.png',
    })
    ;(await expect(loadSandboxVersion(db, {
      cardId: created.id,
      authorId: 'other',
      versionId: adopted.versionId,
    })).rejects.toThrowError(expect.objectContaining<Partial<WorkshopDraftError>>({ code: 'forbidden' })))
  })

  it('loads live gameplay data from the pinned approved version', async () => {
    const created = (await createCard(db, { authorId: 'author', draft: baseDraft() }))
    const approved = (await approveCurrentDraft(db, { cardId: created.id, authorId: 'author' }))
    ;(await publish(db, {
      cardId: created.id,
      authorId: 'author',
      baseRevision: 1,
    }))

    expect((await loadLiveDraft(db, created.id))).toMatchObject({
      name: 'Field Keeper',
      artUrl: null,
    })
    expect((await loadWorkspace(db, created.id, 'author'))).toMatchObject({
      revision: 1,
      approvedVersionId: approved.versionId,
    })

    // offline edits fork the draft, void the approval and stop live loading
    ;(await unpublish(db, { cardId: created.id, authorId: 'author', baseRevision: 1 }))
    ;(await checkpointDraft(db, {
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
    }))
    ;(await expect(loadLiveDraft(db, created.id)).rejects
      .toThrowError(expect.objectContaining<Partial<WorkshopDraftError>>({ code: 'not_found' })))
  })

  it('gates publishing on review approval and pins sandbox confirmation to the exact version', async () => {
    const created = (await createCard(db, { authorId: 'author', draft: handoffDraft() }))
    ;(await expect(publish(db, {
      cardId: created.id,
      authorId: 'author',
      baseRevision: 1,
    })).rejects.toThrowError(expect.objectContaining<Partial<WorkshopDraftError>>({ code: 'not_ready' })))

    const approved = (await approveCurrentDraft(db, { cardId: created.id, authorId: 'author' }))
    expect(approved.workspace.reviewStatus).toBe('approved')
    expect(approved.workspace.live).toBe(false)
    expect(approved.workspace.approvedVersionId).toBe(approved.versionId)

    const published = (await publish(db, {
      cardId: created.id,
      authorId: 'author',
      baseRevision: 1,
    }))
    expect(published.workspace.live).toBe(true)
    expect(published.versionId).toBe(approved.versionId)

    expect((await getHandoffReadiness(db, created.id, 'author'))).toEqual({
      ready: false,
      staticValidation: { valid: true, errors: [] },
      sandboxPassedForDraft: false,
    })
    ;(await expect(markSandboxPass(db, {
      cardId: created.id,
      authorId: 'author',
      versionId: approved.versionId,
      authorConfirmed: false,
      runtimeErrors: [],
    })).rejects.toThrowError(expect.objectContaining<Partial<WorkshopDraftError>>({ code: 'not_ready' })))
    ;(await expect(markSandboxPass(db, {
      cardId: created.id,
      authorId: 'author',
      versionId: approved.versionId,
      authorConfirmed: true,
      runtimeErrors: ['boom'],
    })).rejects.toThrowError(expect.objectContaining<Partial<WorkshopDraftError>>({ code: 'not_ready' })))

    ;(await markSandboxPass(db, {
      cardId: created.id,
      authorId: 'author',
      versionId: approved.versionId,
      authorConfirmed: true,
      runtimeErrors: [],
    }))
    expect((await getHandoffReadiness(db, created.id, 'author')).ready).toBe(true)

    ;(await unpublish(db, { cardId: created.id, authorId: 'author', baseRevision: 1 }))
    ;(await checkpointDraft(db, {
      cardId: created.id,
      authorId: 'author',
      baseRevision: 1,
      draft: baseDraft({
        artUrl: '/card-art/new.png',
      }),
    }))
    expect((await getHandoffReadiness(db, created.id, 'author'))).toMatchObject({
      ready: false,
      sandboxPassedForDraft: false,
    })
    expect((await loadWorkspace(db, created.id, 'author')).reviewStatus).toBe('stale')
  })

  it('enters review from unsubmitted and blocks re-entry after approval', async () => {
    const created = (await createCard(db, { authorId: 'author', draft: baseDraft() }))
    const inReview = (await enterReview(db, {
      cardId: created.id,
      authorId: 'author',
      prUrl: 'https://github.com/x/y/pull/9',
      expectedRevision: 1,
    }))
    expect(inReview.reviewStatus).toBe('in_review')
    expect(inReview.live).toBe(false)

    // re-submission while in_review is the update-PR path
    expect((await enterReview(db, {
      cardId: created.id,
      authorId: 'author',
      prUrl: 'https://github.com/x/y/pull/9',
      expectedRevision: 1,
    })).reviewStatus).toBe('in_review')

    // a checkpoint racing the GitHub round-trip invalidates the transition
    ;(await expect(enterReview(db, {
      cardId: created.id,
      authorId: 'author',
      prUrl: 'https://github.com/x/y/pull/9',
      expectedRevision: 0,
    })).rejects.toThrowError(expect.objectContaining<Partial<WorkshopDraftError>>({ code: 'conflict' })))

    ;(await approveCurrentDraft(db, { cardId: created.id, authorId: 'author' }))
    ;(await expect(enterReview(db, {
      cardId: created.id,
      authorId: 'author',
      prUrl: 'https://github.com/x/y/pull/9',
      expectedRevision: 1,
    })).rejects.toThrowError(expect.objectContaining<Partial<WorkshopDraftError>>({ code: 'conflict' })))
  })

  it('moves a reused PR binding to the latest review submission', async () => {
    const first = (await createCard(db, { authorId: 'author', draft: baseDraft() }))
    const second = (await createCard(db, {
      authorId: 'author',
      draft: baseDraft({
        cardId: 'CUSTOM_SecondFieldKeeper',
        cardJson: {
          ...baseDraft().cardJson,
          id: 'CUSTOM_SecondFieldKeeper',
        },
      }),
    }))
    const prUrl = 'https://github.com/x/y/pull/10'

    ;(await enterReview(db, {
      cardId: first.id,
      authorId: 'author',
      prUrl,
      expectedRevision: 1,
    }))
    ;(await enterReview(db, {
      cardId: second.id,
      authorId: 'author',
      prUrl,
      expectedRevision: 1,
    }))

    expect((await db.prepare(`
      SELECT review_status, live, github_pr_url
      FROM workshop_cards WHERE id = ?
    `).get(first.id))).toEqual({
      review_status: 'stale',
      live: 0,
      github_pr_url: null,
    })
    expect((await db.prepare(`
      SELECT review_status, github_pr_url
      FROM workshop_cards WHERE id = ?
    `).get(second.id))).toEqual({
      review_status: 'in_review',
      github_pr_url: prUrl,
    })

    ;(await approveCurrentDraft(db, { cardId: second.id, authorId: 'author' }))
    ;(await expect(enterReview(db, {
      cardId: first.id,
      authorId: 'author',
      prUrl,
      expectedRevision: 1,
    })).rejects.toThrowError(expect.objectContaining<Partial<WorkshopDraftError>>({ code: 'conflict' })))
  })

  it('does not let an older approval invalidate a newer submission', async () => {
    const created = (await createCard(db, { authorId: 'author', draft: baseDraft() }))
    const prUrl = 'https://github.com/x/y/pull/11'
    ;(await enterReview(db, {
      cardId: created.id,
      authorId: 'author',
      prUrl,
      expectedRevision: 1,
      commitSha: 'head-a',
    }))
    const binding = (await db.prepare(`
      SELECT review_commit_sha, review_version_id, updated_at
      FROM workshop_cards WHERE id = ?
    `).get(created.id)) as {
      review_commit_sha: string
      review_version_id: string
      updated_at: number
    }

    ;(await enterReview(db, {
      cardId: created.id,
      authorId: 'author',
      prUrl,
      expectedRevision: 1,
      commitSha: 'head-b',
    }))
    const approved = (await approveReviewedVersion(db, {
      prUrl,
      commitSha: 'head-a',
      reviewId: 'review-a',
      expectedBinding: {
        id: created.id,
        reviewCommitSha: binding.review_commit_sha,
        reviewVersionId: binding.review_version_id,
        updatedAt: binding.updated_at,
      },
    }))

    expect(approved).toBe(0)
    expect((await db.prepare(`
      SELECT review_status, review_commit_sha
      FROM workshop_cards WHERE id = ?
    `).get(created.id))).toEqual({
      review_status: 'in_review',
      review_commit_sha: 'head-b',
    })
  })

  it('blocks editing a live card, keeps approval across unpublish, voids it on edit', async () => {
    const created = (await createCard(db, { authorId: 'author', draft: baseDraft() }))
    ;(await approveCurrentDraft(db, { cardId: created.id, authorId: 'author' }))
    ;(await publish(db, { cardId: created.id, authorId: 'author', baseRevision: 1 }))

    // live card edits are blocked until an explicit unpublish
    ;(await expect(checkpointDraft(db, {
      cardId: created.id,
      authorId: 'author',
      baseRevision: 1,
      draft: baseDraft({
        cardJson: { ...baseDraft().cardJson, desc: ['edited'] },
      }),
    })).rejects.toThrowError(expect.objectContaining<Partial<WorkshopDraftError>>({
      code: 'live_edit_blocked',
      message: expect.stringContaining('unpublish'),
    })))

    // unpublish keeps the approval — an unchanged card re-publishes freely
    const offline = (await unpublish(db, { cardId: created.id, authorId: 'author', baseRevision: 1 }))
    expect(offline.live).toBe(false)
    expect(offline.reviewStatus).toBe('approved')
    expect((await publish(db, {
      cardId: created.id,
      authorId: 'author',
      baseRevision: 1,
    })).workspace.live).toBe(true)

    // editing content after unpublish voids the approval
    ;(await unpublish(db, { cardId: created.id, authorId: 'author', baseRevision: 1 }))
    const edited = (await checkpointDraft(db, {
      cardId: created.id,
      authorId: 'author',
      baseRevision: 1,
      draft: baseDraft({
        cardJson: { ...baseDraft().cardJson, desc: ['edited for real'] },
      }),
    }))
    expect(edited.reviewStatus).toBe('stale')
    expect(edited.approvedVersionId).toBeNull()
    ;(await expect(publish(db, {
      cardId: created.id,
      authorId: 'author',
      baseRevision: 2,
    })).rejects.toThrowError(expect.objectContaining<Partial<WorkshopDraftError>>({ code: 'not_ready' })))
  })

  it('re-verifies the atomic review snapshot at publish time', async () => {
    const created = (await createCard(db, { authorId: 'author', draft: baseDraft() }))
    ;(await approveCurrentDraft(db, {
      cardId: created.id,
      authorId: 'author',
      commitSha: 'sha-reviewed',
    }))

    setReviewDecisionProvider({
      getSnapshot: () => ({
        decision: 'approved',
        approvedCommitSha: 'sha-reviewed',
        headCommitSha: 'sha-reviewed',
      }),
    })
    expect((await publish(db, {
      cardId: created.id,
      authorId: 'author',
      baseRevision: 1,
    })).workspace.live).toBe(true)

    // author pushed a new commit after approval: head diverges -> reject + stale
    ;(await unpublish(db, { cardId: created.id, authorId: 'author', baseRevision: 1 }))
    setReviewDecisionProvider({
      getSnapshot: () => ({
        decision: 'approved',
        approvedCommitSha: 'sha-reviewed',
        headCommitSha: 'sha-new-push',
      }),
    })
    ;(await expect(publish(db, {
      cardId: created.id,
      authorId: 'author',
      baseRevision: 1,
    })).rejects.toThrowError(expect.objectContaining<Partial<WorkshopDraftError>>({ code: 'not_ready' })))
    const after = (await loadWorkspace(db, created.id, 'author'))
    expect(after.reviewStatus).toBe('stale')
    expect(after.live).toBe(false)
    expect(after.approvedVersionId).toBeNull()
  })

  it('keeps the approval when the review snapshot is temporarily unavailable', async () => {
    const created = (await createCard(db, { authorId: 'author', draft: baseDraft() }))
    ;(await approveCurrentDraft(db, {
      cardId: created.id,
      authorId: 'author',
      commitSha: 'sha-reviewed',
    }))
    setReviewDecisionProvider({
      getSnapshot: () => ({
        decision: 'unknown',
        approvedCommitSha: null,
        headCommitSha: null,
      }),
    })
    ;(await expect(publish(db, {
      cardId: created.id,
      authorId: 'author',
      baseRevision: 1,
    })).rejects.toThrowError(expect.objectContaining<Partial<WorkshopDraftError>>({
      code: 'not_ready',
      message: expect.stringContaining('try again'),
    })))
    const after = (await loadWorkspace(db, created.id, 'author'))
    expect(after.reviewStatus).toBe('approved')
    expect(after.approvedVersionId).not.toBeNull()
  })

  it('admin takedown forces a live approved card to stale offline', async () => {
    const created = (await createCard(db, { authorId: 'author', draft: baseDraft() }))
    ;(await approveCurrentDraft(db, { cardId: created.id, authorId: 'author' }))
    ;(await publish(db, { cardId: created.id, authorId: 'author', baseRevision: 1 }))

    expect((await adminTakedownCard(db, created.id))).toEqual({ reviewStatus: 'stale', live: false, removedRoomIds: [] })
    const after = (await loadWorkspace(db, created.id, 'author'))
    expect(after.approvedVersionId).toBeNull()
    // republishing requires another review round
    ;(await expect(publish(db, {
      cardId: created.id,
      authorId: 'author',
      baseRevision: 1,
    })).rejects.toThrowError(expect.objectContaining<Partial<WorkshopDraftError>>({ code: 'not_ready' })))
  })

  it('admin takedown atomically deletes persisted rooms embedding the card, exact-match only', async () => {
    const created = (await createCard(db, { authorId: 'author', draft: baseDraft() }))
    ;(await db.prepare(`INSERT INTO rooms (id, custom_card_ids, created_at, updated_at) VALUES ('embeds', ?, 1, 1)`)
      .run(JSON.stringify([created.id])))
    const lookalike = created.id.replace(/./, created.id.startsWith('X') ? 'Y' : 'X')
    ;(await db.prepare(`INSERT INTO rooms (id, custom_card_ids, created_at, updated_at) VALUES ('lookalike', ?, 1, 1)`)
      .run(JSON.stringify([lookalike])))
    const result = (await adminTakedownCard(db, created.id))
    expect(result.removedRoomIds).toEqual(['embeds'])
    expect((await db.prepare(`SELECT COUNT(*) AS n FROM rooms WHERE id = 'embeds'`).get())).toEqual({ n: 0 })
    expect((await db.prepare(`SELECT COUNT(*) AS n FROM rooms WHERE id = 'lookalike'`).get())).toEqual({ n: 1 })
  })

  it('admin takedown is a safe no-op for cards without approval', async () => {
    const created = (await createCard(db, { authorId: 'author', draft: baseDraft() }))
    expect((await adminTakedownCard(db, created.id))).toEqual({ reviewStatus: 'unsubmitted', live: false, removedRoomIds: [] })
    ;(await expect(adminTakedownCard(db, 'missing-card')).rejects
      .toThrowError(expect.objectContaining<Partial<WorkshopDraftError>>({ code: 'not_found' })))
  })

  it('graduates a merged PR: live snapshot serves the release window, then built_in retires it', async () => {
    const created = (await createCard(db, { authorId: 'author', draft: baseDraft() }))
    ;(await enterReview(db, {
      cardId: created.id,
      authorId: 'author',
      prUrl: 'https://github.com/x/y/pull/42',
      expectedRevision: 1,
    }))
    ;(await approveCurrentDraft(db, { cardId: created.id, authorId: 'author' }))
    ;(await publish(db, { cardId: created.id, authorId: 'author', baseRevision: 1 }))

    expect((await markCardMerged(db, { prUrl: 'https://github.com/x/y/pull/42' }))).toBe(1)
    const merged = (await loadWorkspace(db, created.id, 'author'))
    expect(merged.reviewStatus).toBe('merged')
    expect(merged.live).toBe(true)
    // release window: the approved snapshot keeps serving rooms
    expect((await loadLiveDraft(db, created.id))).toMatchObject({ name: 'Field Keeper' })
    // merged cards cannot be unpublished or edited in the workshop
    ;(await expect(unpublish(db, { cardId: created.id, authorId: 'author', baseRevision: 1 })).rejects
      .toThrowError(expect.objectContaining<Partial<WorkshopDraftError>>({ code: 'conflict' })))

    // a release containing the card ships: built-in registry takes over
    expect((await markBuiltInMergedCards(db, ['CUSTOM_FieldKeeper']))).toEqual({ flagged: 1, unflagged: 0 })
    ;(await expect(loadLiveDraft(db, created.id)).rejects
      .toThrowError(expect.objectContaining<Partial<WorkshopDraftError>>({ code: 'not_found' })))
    // idempotent: second startup flags nothing new
    expect((await markBuiltInMergedCards(db, ['CUSTOM_FieldKeeper']))).toEqual({ flagged: 0, unflagged: 0 })
    // rollback deployment without the card: fall back to the workshop snapshot
    expect((await markBuiltInMergedCards(db, []))).toEqual({ flagged: 0, unflagged: 1 })
    expect((await loadLiveDraft(db, created.id))).toMatchObject({ name: 'Field Keeper' })
  })

  it('treats merged cards as read-only in the workshop', async () => {
    const created = (await createCard(db, { authorId: 'author', draft: baseDraft() }))
    ;(await approveCurrentDraft(db, { cardId: created.id, authorId: 'author' }))
    ;(await db.prepare(`UPDATE workshop_cards SET review_status = 'merged' WHERE id = ?`).run(created.id))
    ;(await expect(checkpointDraft(db, {
      cardId: created.id,
      authorId: 'author',
      baseRevision: 1,
      draft: baseDraft({
        cardJson: { ...baseDraft().cardJson, desc: ['edited'] },
      }),
    })).rejects.toThrowError(expect.objectContaining<Partial<WorkshopDraftError>>({
      code: 'conflict',
      message: expect.stringContaining('read-only'),
    })))
  })

  it('does not mark an approved metadata-only card ready for PR handoff', async () => {
    const created = (await createCard(db, { authorId: 'author', draft: baseDraft() }))
    const approved = (await approveCurrentDraft(db, { cardId: created.id, authorId: 'author' }))
    ;(await markSandboxPass(db, {
      cardId: created.id,
      authorId: 'author',
      versionId: approved.versionId,
      authorConfirmed: true,
      runtimeErrors: [],
    }))

    expect((await getHandoffReadiness(db, created.id, 'author'))).toMatchObject({
      ready: false,
      staticValidation: {
        valid: false,
        errors: expect.arrayContaining([
          'Ability source is required for PR handoff',
        ]),
      },
    })
  })

  it('keeps an exact-version sandbox pass across private generation checkpoints', async () => {
    const created = (await createCard(db, { authorId: 'author', draft: handoffDraft() }))
    const approved = (await approveCurrentDraft(db, { cardId: created.id, authorId: 'author' }))
    ;(await markSandboxPass(db, {
      cardId: created.id,
      authorId: 'author',
      versionId: approved.versionId,
      authorConfirmed: true,
      runtimeErrors: [],
    }))

    const checkpointed = (await checkpointDraft(db, {
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
    }))

    expect(checkpointed.sandboxPassVersionId).toBe(approved.versionId)
    expect((await getHandoffReadiness(db, created.id, 'author')).ready).toBe(true)
  })
})


it('persists A and failed B privately, strips protocol, and preserves immutable adopted provenance', async () => {
  const makeCandidate = (id: string, valid: boolean) => ({
    id, kind: 'ability' as const, prompt: `request ${id}`, createdAt: 1,
    baseRevision: 1, stale: true,
    sourceCode: 'const CARD_IMPL = {}', cardJson: baseDraft().cardJson,
    validation: { valid }, compiledCode: 'const CARD_IMPL = {};', codeManifest: { listeners: [] },
    provenance: { attemptId: id, inputFingerprint: 'a'.repeat(64), promptVersion: 'v1', toolVersion: 'v1',
      provider: 'deepseek', endpoint: 'https://api.deepseek.com/v1/chat/completions', model: 'deepseek-v4-flash',
      modelRequests: 2, referenceCalls: 1, repairs: 0, elapsedMs: 10,
      usage: { inputTokens: 10, outputTokens: 5, cachedInputTokens: null, reasoningTokens: null }, references: [],
      raw: 'private-canary', apiKey: 'private-canary' },
    tool_calls: ['private-canary'],
  })
  const a = makeCandidate('A', true)
  const b = makeCandidate('B', false)
  const initial = await createCard(db, { authorId: 'author', draft: baseDraft() })
  const saved = await checkpointDraft(db, { cardId: initial.id, authorId: 'author', baseRevision: initial.revision,
    draft: { ...initial.draft, generation: { apiKey: 'private-canary', ability: { lastValid: a,
      latestResult: { kind: 'failed-source', attemptId: 'B', createdAt: 2, message: 'invalid', failedCandidate: b, reasoning: 'private-canary' } },
      art: { lastCompleted: { id: 'old-art', kind: 'art', prompt: 'field', promptFormat: 'subject', resultUrl: '/card-art/field.png', createdAt: 1, baseRevision: 1, stale: true } },
    } },
  })
  expect(saved.draft.generation).toMatchObject({ ability: { lastValid: { id: 'A' }, latestResult: { failedCandidate: { id: 'B', validation: { valid: false } } } } })
  expect((await loadWorkspace(db, initial.id, 'author')).draft.generation).toMatchObject({
    ability: { lastValid: { baseRevision: 1, stale: true }, latestResult: { failedCandidate: { baseRevision: 1, stale: true } } },
    art: { lastCompleted: { baseRevision: 1, stale: true } },
  })
  const row = await db.prepare('SELECT draft_generation_json FROM workshop_cards WHERE id = ?').get(initial.id)
  expect(JSON.stringify(row)).not.toContain('private-canary')
  await expect(adoptCandidate(db, { cardId: initial.id, authorId: 'author', baseRevision: saved.revision, candidate: b })).rejects.toMatchObject({ code: 'not_ready' })
  const adopted = await adoptCandidate(db, { cardId: initial.id, authorId: 'author', baseRevision: saved.revision, candidate: a })
  const reloaded = await loadWorkspace(db, initial.id, 'author')
  expect(reloaded.draft.generation).toMatchObject({ ability: { latestResult: { kind: 'failed-source', message: 'invalid' } } })
  expect(reloaded.draft.generation.ability).not.toHaveProperty('latestResult.failedCandidate')
  expect(reloaded.draft.generation.ability).not.toHaveProperty('lastValid')
  expect(reloaded.draft.generation.art).toHaveProperty('lastCompleted.id', 'old-art')
  const first = await db.prepare('SELECT provenance_json FROM workshop_card_versions WHERE id = ?').get(adopted.versionId)
  expect(JSON.stringify(first)).not.toContain('private-canary')
  expect(JSON.stringify(first)).not.toContain('failedCandidate')
  const same = await adoptCandidate(db, { cardId: initial.id, authorId: 'author', baseRevision: adopted.workspace.revision,
    candidate: { ...a, id: 'new-attempt', provenance: { ...a.provenance, attemptId: 'new-attempt' } },
  })
  expect(same.versionId).toBe(adopted.versionId)
  expect(await db.prepare('SELECT provenance_json FROM workshop_card_versions WHERE id = ?').get(same.versionId)).toEqual(first)
})
