import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { runMigrations } from '../db.ts'

describe('bug report migration', () => {
  it('upgrades a v24 database with bug-report security state', () => {
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
      CREATE TABLE bug_report_evidence_audit (
        id INTEGER PRIMARY KEY,
        submission_id TEXT NOT NULL REFERENCES bug_reports(submission_id),
        maintainer_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        room_id TEXT NOT NULL,
        step_no INTEGER NOT NULL,
        frame_hash TEXT NOT NULL,
        perspective TEXT NOT NULL,
        reason TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE users (id TEXT PRIMARY KEY);
      CREATE TABLE rooms (id TEXT PRIMARY KEY);
      CREATE TABLE room_players (
        room_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        player_index INTEGER NOT NULL
      );
      CREATE TABLE game_contexts (
        room_id TEXT PRIMARY KEY,
        lifecycle TEXT NOT NULL
      );
      INSERT INTO bug_reports VALUES ('submitted', 7);
      INSERT INTO users VALUES ('maintainer-1');
      INSERT INTO bug_report_evidence_audit
      VALUES (
        1, 'submitted', 'maintainer-1', 'room-1', 5, 'hash', 'open', 'reason', 1
      );
    `)

    runMigrations(db)

    expect(db.prepare('SELECT MAX(version) AS version FROM schema_version').get())
      .toEqual({ version: 30 })
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
      'confirmed_github_user_id',
    ]))
    expect((db.pragma('table_info(account_deletion_requests)') as Array<{
      name: string
    }>).map(({ name }) => name)).toEqual([
      'user_id',
      'requested_at',
      'next_attempt_at',
      'last_error_code',
    ])
    expect((db.pragma('table_info(github_grant_revocations)') as Array<{
      name: string
    }>).map(({ name }) => name)).toEqual([
      'token_hash',
      'access_token_ciphertext',
      'access_token_nonce',
      'access_token_tag',
      'key_id',
      'next_attempt_at',
      'last_error_code',
      'created_at',
      'updated_at',
    ])
    expect((db.pragma('index_list(bug_report_evidence_audit)') as Array<{
      name: string
    }>).map(({ name }) => name)).toContain(
      'idx_bug_report_evidence_audit_maintainer',
    )
    expect(db.prepare(`
      SELECT maintainer_identity FROM bug_report_evidence_audit WHERE id = 1
    `).get()).toEqual({ maintainer_identity: 'maintainer-1' })
    expect(db.prepare(`
      SELECT github_issue_state FROM bug_reports WHERE submission_id = 'submitted'
    `).get()).toEqual({ github_issue_state: 'open' })
    db.prepare(`
      UPDATE bug_reports
      SET github_issue_state = 'deleted'
      WHERE submission_id = 'submitted'
    `).run()
    expect(db.prepare(`
      SELECT github_issue_state FROM bug_reports WHERE submission_id = 'submitted'
    `).get()).toEqual({ github_issue_state: 'deleted' })
    expect((db.pragma('table_info(game_context_participants)') as Array<{
      name: string
    }>).map(({ name }) => name)).toEqual([
      'room_id',
      'player_index',
      'user_id',
    ])
    db.close()
  })
})
