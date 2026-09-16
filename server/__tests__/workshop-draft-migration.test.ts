import Database from 'better-sqlite3'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

const originalDbPath = process.env.DB_PATH
let tempDir = ''

afterEach(() => {
  if (originalDbPath === undefined) delete process.env.DB_PATH
  else process.env.DB_PATH = originalDbPath
  if (tempDir) rmSync(tempDir, { recursive: true, force: true })
  vi.resetModules()
})

describe('workshop draft migration', () => {
  it('preserves drafts and backfills immutable published versions', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'open-agricola-workshop-drafts-'))
    const path = join(tempDir, 'migration.db')
    const seed = new Database(path)
    seed.exec(`
      PRAGMA foreign_keys = ON;
      CREATE TABLE schema_version (version INTEGER PRIMARY KEY);
      INSERT INTO schema_version (version) VALUES (17);
      CREATE TABLE oauth_states (
        state_hash TEXT PRIMARY KEY,
        provider TEXT NOT NULL,
        intent TEXT NOT NULL,
        user_id TEXT,
        return_to TEXT,
        expires_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        used_at INTEGER
      );
      CREATE TABLE rooms (
        id TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE room_players (
        room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL,
        player_index INTEGER NOT NULL,
        joined_at INTEGER NOT NULL,
        PRIMARY KEY (room_id, user_id)
      );
      CREATE TABLE users (id TEXT PRIMARY KEY);
      INSERT INTO users (id) VALUES ('author');
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
        created_at INTEGER NOT NULL
      );
      CREATE TABLE card_likes (
        user_id TEXT NOT NULL REFERENCES users(id),
        card_id TEXT NOT NULL REFERENCES workshop_cards(id) ON DELETE CASCADE,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (user_id, card_id)
      );
      CREATE TABLE card_comments (
        id TEXT PRIMARY KEY,
        card_id TEXT NOT NULL REFERENCES workshop_cards(id) ON DELETE CASCADE,
        author_id TEXT NOT NULL REFERENCES users(id),
        body TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE sandbox_cards (
        user_id TEXT NOT NULL REFERENCES users(id),
        workshop_card_id TEXT NOT NULL REFERENCES workshop_cards(id) ON DELETE CASCADE,
        added_at INTEGER NOT NULL,
        PRIMARY KEY (user_id, workshop_card_id)
      );
      INSERT INTO workshop_cards (
        id, author_id, card_id, card_type, name, card_json, code_manifest,
        art_url, art_prompt, status, github_pr_url, created_at, updated_at
      ) VALUES
        (
          'draft', 'author', 'CUSTOM_Draft', 'minor', 'Draft',
          '{"id":"CUSTOM_Draft"}', '{}', '/draft.png', 'draw a field',
          'draft', NULL, 1, 1
        ),
        (
          'published', 'author', 'CUSTOM_Published', 'occupation', 'Published',
          '{"id":"CUSTOM_Published","desc":["final"]}', '{"effect":true}',
          '/published.png', 'draw a barn', 'published',
          'https://example.test/pr/1', 2, 3
        );
      INSERT INTO workshop_card_versions (
        id, card_id, card_json, code_manifest, art_url, version_number, created_by, created_at
      ) VALUES (
        'old-version', 'published', '{"id":"CUSTOM_Published","desc":["old"]}',
        '{}', '/old.png', 1, 'author', 2
      );
      INSERT INTO workshop_card_versions (
        id, card_id, card_json, code_manifest, art_url, version_number, created_by, created_at
      ) VALUES
        ('old-version-2', 'published', '{"id":"CUSTOM_Published"}', '{}', '/old-2.png', 2, 'author', 2),
        ('old-version-3', 'published', '{"id":"CUSTOM_Published"}', '{}', '/old-3.png', 3, 'author', 2),
        ('old-version-4', 'published', '{"id":"CUSTOM_Published"}', '{}', '/old-4.png', 4, 'author', 2),
        ('old-version-5', 'published', '{"id":"CUSTOM_Published"}', '{}', '/old-5.png', 5, 'author', 2),
        ('old-version-6', 'published', '{"id":"CUSTOM_Published"}', '{}', '/old-6.png', 6, 'author', 2);
      INSERT INTO card_likes VALUES ('author', 'published', 3);
      INSERT INTO card_comments VALUES ('comment', 'published', 'author', 'keep', 3);
      INSERT INTO sandbox_cards VALUES ('author', 'published', 3);
    `)
    seed.close()

    process.env.DB_PATH = path
    vi.resetModules()
    const { getDb } = await import('../db.ts')
    const db = getDb()

    expect(db.prepare('SELECT MAX(version) AS version FROM schema_version').get()).toEqual({ version: 30 })
    expect(db.prepare(`
      SELECT review_commit_sha, review_version_id FROM workshop_cards WHERE id = 'draft'
    `).get()).toEqual({ review_commit_sha: null, review_version_id: null })
    expect(db.prepare(`
      SELECT COUNT(*) AS count FROM github_webhook_events
    `).get()).toEqual({ count: 0 })
    // v26 (#632): every legacy card is forced back to unsubmitted/offline.
    expect(db.prepare(`
      SELECT id, draft_revision, review_status, live, approved_version_id,
             sandbox_pass_version_id, sandbox_passed_at
      FROM workshop_cards ORDER BY id
    `).all()).toEqual([
      {
        id: 'draft',
        draft_revision: 1,
        review_status: 'unsubmitted',
        live: 0,
        approved_version_id: null,
        sandbox_pass_version_id: null,
        sandbox_passed_at: null,
      },
      {
        id: 'published',
        draft_revision: 1,
        review_status: 'unsubmitted',
        live: 0,
        approved_version_id: null,
        sandbox_pass_version_id: null,
        sandbox_passed_at: null,
      },
    ])

    const generation = JSON.parse((db.prepare(`
      SELECT draft_generation_json FROM workshop_cards WHERE id = 'draft'
    `).get() as { draft_generation_json: string }).draft_generation_json)
    expect(generation).toEqual({
      art: {},
    })

    expect(db.prepare(`
      SELECT card_json, code_manifest, art_url, version_number, content_hash, provenance_json
      FROM workshop_card_versions
      WHERE card_id = 'published' AND version_number = 7
    `).get()).toEqual({
      card_json: '{"id":"CUSTOM_Published","desc":["final"]}',
      code_manifest: '{"effect":true}',
      art_url: '/published.png',
      version_number: 7,
      content_hash: null,
      provenance_json: '{}',
    })
    expect(db.prepare('SELECT content_hash, provenance_json FROM workshop_card_versions WHERE id = ?')
      .get('old-version-3')).toEqual({ content_hash: null, provenance_json: '{}' })
    expect(db.prepare(`
      SELECT COUNT(*) AS count, MIN(version_number) AS oldest, MAX(version_number) AS newest
      FROM workshop_card_versions WHERE card_id = 'published'
    `).get()).toEqual({ count: 5, oldest: 3, newest: 7 })
    expect(db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM card_likes) AS likes,
        (SELECT COUNT(*) FROM card_comments) AS comments,
        (SELECT COUNT(*) FROM sandbox_cards) AS sandbox,
        (SELECT github_pr_url FROM workshop_cards WHERE id = 'published') AS github_pr_url
    `).get()).toEqual({
      likes: 1,
      comments: 1,
      sandbox: 1,
      github_pr_url: 'https://example.test/pr/1',
    })
    db.close()
  })

  it('scrubs nested legacy art prompts from v27 drafts and version provenance', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'open-agricola-workshop-prompts-'))
    const path = join(tempDir, 'migration.db')
    const seed = new Database(path)
    seed.exec(`
      CREATE TABLE schema_version (version INTEGER PRIMARY KEY);
      INSERT INTO schema_version (version) VALUES (27);
      CREATE TABLE workshop_cards (
        id TEXT PRIMARY KEY,
        draft_generation_json TEXT NOT NULL,
        art_prompt TEXT,
        review_version_id TEXT,
        approved_version_id TEXT,
        sandbox_pass_version_id TEXT
      );
      CREATE TABLE workshop_card_versions (
        id TEXT PRIMARY KEY,
        card_id TEXT NOT NULL,
        version_number INTEGER NOT NULL,
        provenance_json TEXT NOT NULL
      );
    `)
    seed.prepare(`
      INSERT INTO workshop_cards (
        id, draft_generation_json, art_prompt,
        review_version_id, approved_version_id, sandbox_pass_version_id
      ) VALUES (?, ?, ?, NULL, NULL, NULL)
    `).run('card', JSON.stringify({
      art: {
        subject: 'current subject',
        prompt: 'full editable prompt',
        lastCompleted: {
          id: 'last',
          kind: 'art',
          prompt: 'Manually uploaded image',
          resultUrl: '/card-art/upload.png',
          provider: 'upload',
          createdAt: 100,
        },
        adopted: { id: 'adopted', prompt: 'full adopted prompt', provider: 'gemini' },
      },
    }), 'legacy column prompt')
    seed.prepare(`
      INSERT INTO workshop_card_versions (id, card_id, version_number, provenance_json)
      VALUES (?, ?, ?, ?)
    `).run('version', 'card', 1, JSON.stringify({
      art: { adopted: { id: 'adopted', prompt: 'full version prompt' } },
    }))

    const { runMigrations } = await import('../db.ts')
    runMigrations(seed, () => {})

    const card = seed.prepare(`
      SELECT draft_generation_json, art_prompt FROM workshop_cards WHERE id = 'card'
    `).get() as { draft_generation_json: string; art_prompt: string | null }
    expect(card.art_prompt).toBeNull()
    expect(JSON.parse(card.draft_generation_json)).toEqual({
      art: {
        subject: 'current subject',
        lastCompleted: {
          id: 'last',
          kind: 'art',
          prompt: 'current subject',
          promptFormat: 'subject',
          resultUrl: '/card-art/upload.png',
          provider: 'upload',
          createdAt: 100,
        },
      },
    })
    expect(JSON.parse((seed.prepare(`
      SELECT provenance_json FROM workshop_card_versions WHERE id = 'version'
    `).get() as { provenance_json: string }).provenance_json)).toEqual({})
    seed.close()
  })
})
