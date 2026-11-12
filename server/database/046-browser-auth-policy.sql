ALTER TABLE sessions ADD COLUMN auth_policy_version integer NOT NULL DEFAULT 1;

-- One transition, recorded by the migration runner. Source revocation triggers preserve events.
DELETE FROM sessions WHERE auth_policy_version = 1;
DELETE FROM oauth_states;
DELETE FROM oauth_onboarding_tickets;
DELETE FROM observability_tickets;
DELETE FROM prerelease_identity_handoffs;
