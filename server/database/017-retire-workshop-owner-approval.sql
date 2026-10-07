-- Inspect production bindings before deploying this provider change. Never silently unpublish a live card.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM workshop_cards
    WHERE approved_review_id LIKE 'owner:%' AND live = 1 AND built_in = 0 AND review_status != 'merged') THEN
    RAISE EXCEPTION 'Live synthetic Workshop approvals require explicit author unpublish before App cutover';
  END IF;
END $$;

-- Preserve the exact old approval as cutover audit, not as approval on a new bot PR.
INSERT INTO github_propose_audit(id,user_id,workshop_card_id,action,pr_url,error_code,error_message,created_at)
SELECT 'workshop-app-cutover:' || id,author_id,id,'legacy_approval_retired',github_pr_url,NULL,
  json_build_object('approvedReviewId',approved_review_id,'approvedVersionId',approved_version_id,
    'approvedCommitSha',approved_commit_sha)::text,
  (extract(epoch FROM clock_timestamp()) * 1000)::bigint
FROM workshop_cards
WHERE approved_review_id LIKE 'owner:%' AND live = 0 AND built_in = 0 AND review_status != 'merged'
ON CONFLICT (id) DO NOTHING;

UPDATE workshop_cards SET review_status = 'stale',approved_review_id = NULL,
  approved_version_id = NULL,approved_commit_sha = NULL,approved_at = NULL,
  github_pr_last_synced_at = NULL,
  updated_at = GREATEST(updated_at + 1,(extract(epoch FROM clock_timestamp()) * 1000)::bigint)
WHERE approved_review_id LIKE 'owner:%' AND live = 0 AND built_in = 0 AND review_status != 'merged';
