-- Include waiting Team member accounts in the native retained identity audit.
CREATE OR REPLACE VIEW prerelease_retained_identity_refs AS
  WITH retained(user_id) AS (
    SELECT id FROM users
    UNION SELECT user_id FROM prerelease_external_identities
    UNION SELECT created_by FROM rooms WHERE created_by IS NOT NULL
    UNION SELECT jsonb_array_elements_text(invited_user_ids) FROM rooms WHERE invited_user_ids IS NOT NULL
    UNION SELECT member->>'userId' FROM rooms CROSS JOIN LATERAL jsonb_array_elements(team_members_json) member WHERE member->>'userId' IS NOT NULL
    UNION SELECT user_id FROM room_players
    UNION SELECT user_id FROM game_result_players WHERE user_id IS NOT NULL
    UNION SELECT user_id FROM game_context_participants WHERE user_id IS NOT NULL
    UNION SELECT user_id FROM game_termination_players WHERE user_id IS NOT NULL
    UNION SELECT user_id FROM game_opening_accounts
  )
  SELECT retained.user_id,projection.source_grant_id FROM retained
    LEFT JOIN prerelease_external_identities projection ON projection.user_id=retained.user_id;
