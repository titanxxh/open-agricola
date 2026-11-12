// Only the external GitHub boundary is replaced. Auth, HTTP, service and PostgreSQL stay real.
const originalFetch = globalThis.fetch
const repository = 'titanxxh/open-agricola'
const commits = ['a'.repeat(40), 'b'.repeat(40)]
const pull = { number: 1500, merged: true, merged_at: '2026-11-01T00:00:00Z', merge_commit_sha: commits[1],
  html_url: `https://github.com/${repository}/pull/1500`, base: { ref: 'main', repo: { full_name: repository } } }
globalThis.fetch = async (resource, options) => {
  const address = new URL(String(resource))
  if (address.origin !== 'https://api.github.com' || !address.pathname.startsWith(`/repos/${repository}/`)) return originalFetch(resource, options)
  const path = address.pathname.slice(`/repos/${repository}/`.length)
  if (path === 'pulls/1500') return Response.json(pull)
  if (commits.some(commit => path === `commits/${commit}/pulls`)) return Response.json([pull])
  if (commits.some(commit => path === `commits/${commit}`)) return Response.json({ sha: path.split('/')[1] })
  if (path === `compare/${commits[0]}...${commits[1]}`) return Response.json({ status: 'ahead', merge_base_commit: { sha: commits[0] } })
  throw new Error(`Unexpected GitHub fixture request: ${path}`)
}
