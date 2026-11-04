CREATE TABLE room_retention_policy (
  singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK(singleton),
  revision BIGINT NOT NULL CHECK(revision > 0),
  waiting_days INTEGER NOT NULL CHECK(waiting_days BETWEEN 1 AND 90),
  playing_days INTEGER NOT NULL CHECK(playing_days BETWEEN 1 AND 90),
  updated_at BIGINT CHECK(updated_at >= 0),
  updated_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL
);

INSERT INTO room_retention_policy(singleton, revision, waiting_days, playing_days)
VALUES(TRUE, 1, 3, 7);

CREATE TABLE room_retention_policy_audit (
  revision BIGINT PRIMARY KEY,
  previous_revision BIGINT NOT NULL CHECK(revision = previous_revision + 1),
  previous_waiting_days INTEGER NOT NULL CHECK(previous_waiting_days BETWEEN 1 AND 90),
  previous_playing_days INTEGER NOT NULL CHECK(previous_playing_days BETWEEN 1 AND 90),
  waiting_days INTEGER NOT NULL CHECK(waiting_days BETWEEN 1 AND 90),
  playing_days INTEGER NOT NULL CHECK(playing_days BETWEEN 1 AND 90),
  actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at BIGINT NOT NULL CHECK(created_at >= 0)
);
