export const candidateRepository = { id: 1164782262, full_name: 'titanxxh/open-agricola' }

export function finalSnapshotMetadata(sha: string, mainSha = sha, repository = candidateRepository): Record<string, unknown> {
  const prefix = `repos/${repository.full_name}`
  return {
    [prefix]: { ...repository, default_branch: 'main' },
    [`${prefix}/git/ref/heads/main`]: { ref: 'refs/heads/main', object: { type: 'commit', sha: mainSha } },
    [`${prefix}/rules/branches/main?per_page=100`]: [
      { type: 'pull_request' }, { type: 'non_fast_forward' }, { type: 'deletion' }, { type: 'required_linear_history' },
    ],
    [`${prefix}/branches/main/protection`]: { required_pull_request_reviews: null,
      allow_force_pushes: { enabled: true }, allow_deletions: { enabled: true }, required_linear_history: { enabled: false } },
    [`${prefix}/commits/${sha}/pulls?per_page=100`]: [{ number: 1 }],
    [`${prefix}/pulls/1`]: { number: 1, state: 'closed', merged: true, merged_at: '2026-10-30T00:00:00Z',
      merge_commit_sha: sha, base: { ref: 'main', repo: { ...repository } } },
  }
}
