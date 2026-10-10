-- Account binding completes in the original frontend cookie partition.
-- The verifier is server-only and shares oauth_states' ten-minute lifetime.
ALTER TABLE oauth_states ADD COLUMN account_pkce_verifier TEXT;
