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
      INSERT INTO card_likes VALUES ('author', 'published', 3);
      INSERT INTO card_comments VALUES ('comment', 'published', 'author', 'keep', 3);
      INSERT INTO sandbox_cards VALUES ('author', 'published', 3);
    `)
    seed.close()

    process.env.DB_PATH = path
    vi.resetModules()
    const { getDb } = await import('../db.ts')
    const db = getDb()

    expect(db.prepare('SELECT MAX(version) AS version FROM schema_version').get()).toEqual({ version: 18 })
    expect(db.prepare(`
      SELECT id, draft_revision, published_version_id, sandbox_pass_version_id, sandbox_passed_at
      FROM workshop_cards ORDER BY id
    `).all()).toEqual([
      {
        id: 'draft',
        draft_revision: 1,
        published_version_id: null,
        sandbox_pass_version_id: null,
        sandbox_passed_at: null,
      },
      {
        id: 'published',
        draft_revision: 1,
        published_version_id: expect.any(String),
        sandbox_pass_version_id: null,
        sandbox_passed_at: null,
      },
    ])

    const generation = JSON.parse((db.prepare(`
      SELECT draft_generation_json FROM workshop_cards WHERE id = 'draft'
    `).get() as { draft_generation_json: string }).draft_generation_json)
    expect(generation).toEqual({
      art: { prompt: 'draw a field', resultUrl: '/draft.png' },
    })

    expect(db.prepare(`
      SELECT card_json, code_manifest, art_url, version_number, content_hash, provenance_json
      FROM workshop_card_versions
      WHERE id = (SELECT published_version_id FROM workshop_cards WHERE id = 'published')
    `).get()).toEqual({
      card_json: '{"id":"CUSTOM_Published","desc":["final"]}',
      code_manifest: '{"effect":true}',
      art_url: '/published.png',
      version_number: 2,
      content_hash: null,
      provenance_json: '{}',
    })
    expect(db.prepare('SELECT content_hash, provenance_json FROM workshop_card_versions WHERE id = ?')
      .get('old-version')).toEqual({ content_hash: null, provenance_json: '{}' })
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
})
