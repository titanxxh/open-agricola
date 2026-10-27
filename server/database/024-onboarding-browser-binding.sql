ALTER TABLE oauth_states ADD COLUMN onboarding_challenge TEXT;
ALTER TABLE oauth_onboarding_tickets ADD COLUMN onboarding_challenge TEXT;
