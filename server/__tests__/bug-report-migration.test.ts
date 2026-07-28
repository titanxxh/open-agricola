import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { runMigrations } from '../db.ts'

describe('bug report migration', () => {
  it('upgrades a v24 database with PKCE and delivery lifecycle columns', () => {
    const db = new Database(':memory:')
    db.exec(`
      CREATE TABLE schema_version (version INTEGER PRIMARY KEY);
      INSERT INTO schema_version VALUES (24);
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
      CREATE TABLE bug_reports (
        submission_id TEXT PRIMARY KEY,
        github_issue_number INTEGER
      );
      INSERT INTO bug_reports VALUES ('submitted', 7);
    `)

    runMigrations(db)

    expect(db.prepare('SELECT MAX(version) AS version FROM schema_version').get())
      .toEqual({ version: 25 })
    expect((db.pragma('table_info(oauth_states)') as Array<{ name: string }>)
      .map(({ name }) => name)).toEqual(expect.arrayContaining([
      'pkce_verifier_ciphertext',
      'pkce_verifier_nonce',
      'pkce_verifier_tag',
      'pkce_verifier_key_id',
    ]))
    expect((db.pragma('table_info(bug_reports)') as Array<{ name: string }>)
      .map(({ name }) => name)).toEqual(expect.arrayContaining([
      'last_error_code',
      'discarded_at',
      'github_issue_state',
      'duplicate_confirmed_at',
    ]))
    expect(db.prepare(`
      SELECT github_issue_state FROM bug_reports WHERE submission_id = 'submitted'
    `).get()).toEqual({ github_issue_state: 'open' })
    db.close()
  })
})
