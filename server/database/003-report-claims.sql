ALTER TABLE github_grant_revocations ADD COLUMN claim_token TEXT;
ALTER TABLE github_grant_revocations ADD COLUMN claim_until BIGINT;
