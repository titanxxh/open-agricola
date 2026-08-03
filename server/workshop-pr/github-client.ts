type ClientOpts = {
  token: string
  upstreamOwner: string
  upstreamRepo: string
  forkPollIntervalMs?: number
  forkPollMaxMs?: number
}

export class GitHubApiError extends Error {
  public code: string
  public status?: number
  constructor(message: string, code: string, status?: number) {
    super(message)
    this.name = 'GitHubApiError'
    this.code = code
    this.status = status
  }
}

type CommitFile = { path: string; content: string; encoding: 'utf-8' | 'base64' }

export class GitHubClient {
  private readonly opts: ClientOpts
  constructor(opts: ClientOpts) {
    this.opts = opts
  }

  private async fetch(path: string, init?: RequestInit): Promise<Response> {
    const url = path.startsWith('http') ? path : `https://api.github.com${path}`
    const headers = new Headers(init?.headers)
    headers.set('Authorization', `Bearer ${this.opts.token}`)
    headers.set('Accept', 'application/vnd.github+json')
    headers.set('X-GitHub-Api-Version', '2022-11-28')
    return fetch(url, { ...init, headers })
  }

  async getUserLogin(): Promise<string> {
    const r = await this.fetch('/user')
    if (!r.ok) throw new GitHubApiError('user lookup failed', 'user_lookup_failed', r.status)
    const data = (await r.json()) as { login: string }
    return data.login
  }

  async ensureFork(): Promise<{ owner: string; repo: string }> {
    const login = await this.getUserLogin()
    const repo = this.opts.upstreamRepo
    if (login.toLowerCase() === this.opts.upstreamOwner.toLowerCase()) {
      return { owner: this.opts.upstreamOwner, repo }
    }
    const check = await this.fetch(`/repos/${login}/${repo}`)
    if (check.ok) return { owner: login, repo }
    if (check.status !== 404) {
      throw new GitHubApiError('fork lookup failed', 'fork_lookup_failed', check.status)
    }

    const create = await this.fetch(
      `/repos/${this.opts.upstreamOwner}/${repo}/forks`,
      { method: 'POST' },
    )
    if (!create.ok && create.status !== 202) {
      throw new GitHubApiError('fork create failed', 'fork_create_failed', create.status)
    }

    const interval = this.opts.forkPollIntervalMs ?? 2000
    const maxMs = this.opts.forkPollMaxMs ?? 30_000
    const started = Date.now()
    // First check is immediate (no sleep), subsequent checks sleep between them
    while (Date.now() - started < maxMs) {
      const poll = await this.fetch(`/repos/${login}/${repo}`)
      if (poll.ok) return { owner: login, repo }
      if (Date.now() - started + interval >= maxMs) break
      await new Promise((r) => setTimeout(r, interval))
    }
    throw new GitHubApiError('fork not ready within timeout', 'fork_pending')
  }

  async createCommit(opts: {
    forkOwner: string
    files: CommitFile[]
    message: string
    author: { name: string; email: string }
    upstreamBaseSha?: string
  }): Promise<{ commitSha: string; upstreamBaseSha: string }> {
    const { forkOwner, files, message, author } = opts
    const repo = this.opts.upstreamRepo

    const upstreamBaseSha = opts.upstreamBaseSha ?? await this.getUpstreamMainSha()

    const blobs: Array<{ path: string; sha: string }> = []
    for (const f of files) {
      const r = await this.fetch(`/repos/${forkOwner}/${repo}/git/blobs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: f.content, encoding: f.encoding }),
      })
      if (!r.ok) throw new GitHubApiError(`blob failed: ${f.path}`, 'blob_failed', r.status)
      const { sha } = (await r.json()) as { sha: string }
      blobs.push({ path: f.path, sha })
    }

    const treeResp = await this.fetch(`/repos/${forkOwner}/${repo}/git/trees`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        base_tree: upstreamBaseSha,
        tree: blobs.map((b) => ({ path: b.path, mode: '100644', type: 'blob', sha: b.sha })),
      }),
    })
    if (!treeResp.ok) throw new GitHubApiError('tree failed', 'tree_failed', treeResp.status)
    const { sha: treeSha } = (await treeResp.json()) as { sha: string }

    const commitResp = await this.fetch(`/repos/${forkOwner}/${repo}/git/commits`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        tree: treeSha,
        parents: [upstreamBaseSha],
        author: { ...author, date: new Date().toISOString() },
      }),
    })
    if (!commitResp.ok) {
      throw new GitHubApiError('commit failed', 'commit_failed', commitResp.status)
    }
    const { sha: commitSha } = (await commitResp.json()) as { sha: string }

    return { commitSha, upstreamBaseSha }
  }

  async getUpstreamMainSha(): Promise<string> {
    const repo = this.opts.upstreamRepo
    const upstreamRef = await this.fetch(
      `/repos/${this.opts.upstreamOwner}/${repo}/git/ref/heads/main`,
    )
    if (!upstreamRef.ok) {
      throw new GitHubApiError('upstream ref failed', 'upstream_ref_failed', upstreamRef.status)
    }
    return ((await upstreamRef.json()) as { object: { sha: string } }).object.sha
  }

  async upsertBranch(opts: {
    forkOwner: string
    branchName: string
    commitSha: string
  }): Promise<void> {
    const { forkOwner, branchName, commitSha } = opts
    const repo = this.opts.upstreamRepo
    const check = await this.fetch(`/repos/${forkOwner}/${repo}/git/ref/heads/${branchName}`)
    if (check.ok) {
      const patch = await this.fetch(
        `/repos/${forkOwner}/${repo}/git/refs/heads/${branchName}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sha: commitSha, force: true }),
        },
      )
      if (!patch.ok) {
        throw new GitHubApiError('ref update failed', 'ref_update_failed', patch.status)
      }
    } else if (check.status === 404) {
      const post = await this.fetch(`/repos/${forkOwner}/${repo}/git/refs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ref: `refs/heads/${branchName}`, sha: commitSha }),
      })
      if (!post.ok) {
        throw new GitHubApiError('ref create failed', 'ref_create_failed', post.status)
      }
    } else {
      throw new GitHubApiError('ref lookup failed', 'ref_lookup_failed', check.status)
    }
  }

  async findReusablePr(opts: {
    forkOwner: string
    branchName: string
  }): Promise<{
    number: number
    url: string
    baseRefName: string
    isDraft: boolean
    state: 'open' | 'closed'
    conflictingOpenPrNumbers?: number[]
  } | null> {
    const head = `${opts.forkOwner}:${opts.branchName}`
    const r = await this.fetch(
      `/repos/${this.opts.upstreamOwner}/${this.opts.upstreamRepo}/pulls?head=${encodeURIComponent(head)}&state=all`,
    )
    if (!r.ok) throw new GitHubApiError('pr lookup failed', 'pr_lookup_failed', r.status)
    const list = (await r.json()) as Array<{
      number: number
      html_url: string
      base: { ref: string }
      draft: boolean
      state: 'open' | 'closed'
      merged_at: string | null
    }>
    const unmerged = list.filter((item) => item.merged_at === null)
    const eligible = unmerged.filter((item) => item.base.ref === 'main' && !item.draft)
    const pr = eligible.find((item) => item.state === 'open')
      ?? eligible[0]
      ?? unmerged.find((item) => item.state === 'open')
      ?? unmerged[0]
    if (!pr) return null
    const conflictingOpenPrNumbers = pr.state === 'closed'
      ? unmerged
        .filter((item) => item.state === 'open' && item.base.ref === pr.base.ref)
        .map((item) => item.number)
      : []
    return {
      number: pr.number,
      url: pr.html_url,
      baseRefName: pr.base.ref,
      isDraft: pr.draft,
      state: pr.state,
      conflictingOpenPrNumbers,
    }
  }

  async openPr(opts: {
    forkOwner: string
    branchName: string
    title: string
    body: string
  }): Promise<{
    number: number
    url: string
    baseRefName: string
    isDraft: boolean
    state: 'open'
  }> {
    const r = await this.fetch(
      `/repos/${this.opts.upstreamOwner}/${this.opts.upstreamRepo}/pulls`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: opts.title,
          body: opts.body,
          head: `${opts.forkOwner}:${opts.branchName}`,
          base: 'main',
          maintainer_can_modify: true,
        }),
      },
    )
    if (!r.ok) throw new GitHubApiError('pr create failed', 'pr_create_failed', r.status)
    const pr = (await r.json()) as { number: number; html_url: string }
    return {
      number: pr.number,
      url: pr.html_url,
      baseRefName: 'main',
      isDraft: false,
      state: 'open',
    }
  }

  async setPrState(prNumber: number, state: 'open' | 'closed'): Promise<void> {
    const r = await this.fetch(
      `/repos/${this.opts.upstreamOwner}/${this.opts.upstreamRepo}/pulls/${prNumber}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state }),
      },
    )
    if (!r.ok) throw new GitHubApiError('pr state update failed', 'pr_state_update_failed', r.status)
  }

  async commentOnPr(opts: { prNumber: number; body: string }): Promise<void> {
    try {
      await this.fetch(
        `/repos/${this.opts.upstreamOwner}/${this.opts.upstreamRepo}/issues/${opts.prNumber}/comments`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ body: opts.body }),
        },
      )
    } catch {
      // best-effort; swallow errors
    }
  }

  async getUpstreamFile(path: string, ref = 'main'): Promise<string> {
    const r = await this.fetch(
      `/repos/${this.opts.upstreamOwner}/${this.opts.upstreamRepo}/contents/${path}?ref=${encodeURIComponent(ref)}`,
    )
    if (!r.ok) throw new GitHubApiError(`contents failed: ${path}`, 'contents_failed', r.status)
    const data = (await r.json()) as { content: string; encoding: string }
    if (data.encoding !== 'base64') {
      throw new GitHubApiError('unexpected encoding', 'contents_encoding', 500)
    }
    return Buffer.from(data.content, 'base64').toString('utf-8')
  }
}
