-- Retire only the Workshop submission OAuth cache. Login OAuth and Bug Report grants are independent.
-- Removing local ciphertext does not revoke a GitHub-side user grant; see the cutover runbook.
DROP TABLE workshop_oauth_handshakes;
