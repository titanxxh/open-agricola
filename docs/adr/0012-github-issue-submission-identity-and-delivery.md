# 12. Bug reports use a dedicated least-privilege GitHub App

- Status: Accepted
- Date: 2026-07-27

## Context

Game Bug Reporter 必须能从对局内把现象和 Bug Report Anchor 提交到公开的 `titanxxh/open-agricola-issues`。有 GitHub 账号的玩家希望成为 Issue 作者，没有 GitHub 账号的玩家需要托管代提；两条路径都必须限制权限、承受撤销与限流，并在 GitHub 返回不确定结果时保留玩家描述且尽量避免重复 Issue。

现有站点 GitHub 登录 OAuth 只证明登录身份，不保存写权限令牌；Workshop GitHub OAuth 面向私有源码仓库提案，权限和生命周期也不适合公开 Bug Issue。GitHub Create Issue API 没有可依赖的幂等键，因此外部创建无法承诺严格 exactly-once。

## Decision

1. 单独注册一个公开 GitHub App，只安装到 `titanxxh/open-agricola-issues`，唯一可写仓库权限是 `Issues: write`。目标 owner、repository id 和 installation id 是服务端固定配置，不接受客户端传入；不使用现有登录 OAuth、Workshop OAuth 或个人 PAT。
2. 玩家本人提交使用 GitHub App user access token，因此 Issue 作者是玩家并同时归因于 App；提交前必须明确确认 GitHub 会公开该账号为作者，且站点删号无法匿名化这项 GitHub 作者身份。没有可用 Issue Submission Connection 时，玩家可以明确选择 Hosted Issue Identity，由同一 App 的 installation access token 代提，Issue 作者显示为 App `[bot]`；连接失效时不得自动切换作者身份。
3. Issue Submission Connection 独立于站点登录身份，绑定当前站点用户和 GitHub 返回的不可变数字用户 id。一个 GitHub 用户 id 只能连接一个站点用户；若站点账号已有 GitHub 登录身份，两者 id 必须一致。首次连接不自动增加 GitHub 登录方式。
4. GitHub 授权使用随机 `state` 和 PKCE `S256`。回调在服务端换取令牌并读取 GitHub 数字用户 id，访问令牌和刷新令牌只在后端 SQLite 中用独立部署密钥加密保存，不进入浏览器、URL、日志、Issue 或仓库。启用过期令牌：user access token 默认 8 小时，refresh token 默认 6 个月并按需原子轮换。
5. GitHub App client secret、webhook secret、令牌加密密钥和 App 私钥只作为部署密钥提供。App 私钥不入库；installation access token 按需生成且不落盘，最多使用其 GitHub 返回的一小时生命周期。用户主动断开、刷新失败、`github_app_authorization` 撤销 webhook 或 `401` 都使连接失效并删除本地令牌。
6. 玩家提交前，服务端先持久化 Bug Report Draft 和不可变 `submissionId`。现象去除首尾空白后必须非空且最多 2000 个 Unicode 字符；标题由服务端生成，正文去除换行和制表以外的控制字符并禁用玩家文本中的 GitHub `@mention` 通知，但保留可见原文和链接。
7. Issue 正文只包含玩家现象、`submissionId` 的无身份随机标记，以及已批准公开的站点 `userId`、`playerIndex`、`roomId`、房间生命周期、版本、`stepNo` 和 Frame Hash。它不包含其他玩家隐藏信息、完整状态、token、邮箱、可变显示名、原始命令或传输 payload。
8. 同一 `submissionId` 在站内只能有一个执行者。Issue 正文嵌入 `<!-- open-agricola-report:{submissionId} -->`；成功响应保存 Issue 编号和 URL。网络错误或 `5xx` 产生不确定结果时，执行者先从目标仓库最新 Issue 向前分页到本次尝试开始时间并匹配该标记，找到即视为成功，未找到才继续同一提交。
9. 自动失败处理固定为：`401` 或刷新失败要求玩家重连；带 `Retry-After` 或明确 rate-limit reset 的 `403`、`429` 按指定时间排队，其他 `403` 作为权限错误停止；网络错误和 `5xx` 在对账后按 30 秒、2 分钟、10 分钟重试；`410`、`422` 不自动重试。三次仍失败转为需手动重试，继续使用原 `submissionId` 和原草稿。
10. 新提交共享站内滥用额度，不因本人或托管身份而分开计算：每用户最多保留 5 个未提交草稿，每用户 10 分钟最多提交 3 个、24 小时最多 10 个；每用户每房间最多提交 5 个；每房间最多提交 30 个。同一 `submissionId` 的对账和重试不重复计数。GitHub 创建队列全站最多发出 20 次每分钟，超出只排队；站内额度拒绝时保留草稿并显示原因或下次可提交时间。
11. 只有同一 `submissionId` 被硬去重。同一 Bug Report Anchor 已有未关闭 Issue 时，界面展示已有 Issue，但不自动合并或阻止新提交；玩家必须明确选择打开已有 Issue 或继续提交，因为同一 Replay Frame 可能有不同现象。
12. 用户改用 Hosted Issue Identity 必须再次明确确认，正文始终记录实际 Game Bug Reporter 的站点 `userId` 和 `playerIndex`。只有已登录且服务器确认在目标 Room 入座的用户可以创建或重试该 Room 的 Bug Report Draft。
13. 主动断开或删号立即撤销并删除加密令牌。删号先按 ADR-0010 把已知 Issue 正文中的站点 `userId` 改为“已删除报告者”，再清除内部用户关联；玩家已明确放弃的失败提交是终态，不再阻塞删号，但提交配额和尝试账本仍保留。提交成功后不在站内重复保存现象，只长期保留 `submissionId`、`roomId`、Issue 编号、状态及账号存在期间的内部报告者关联；未完成草稿保留到玩家主动放弃或删号，提交尝试日志保留 30 天且不得包含令牌或原始 GitHub 响应。

## Consequences

- 本人提交和托管代提共享一个最小权限 GitHub App，但作者身份始终由玩家明确选择。
- 站点登录、Workshop 提案和 Bug Issue 提交保持三条独立授权链，避免扩大现有凭据权限。
- 外部 API 不支持幂等创建，因此系统提供持久草稿、单执行者、稳定标记和提交前对账，但明确不宣称严格 exactly-once。
- 生产部署必须配置 App、安装、回调、webhook 和四类服务端密钥，并验证撤销、刷新、限流、未知结果对账和删号匿名化。
- 目标仓库的新 Issue 不依赖玩家拥有标签、受理人或 milestone 权限；后续分诊应使用仓库自身自动化或 Hosted Issue Identity，不扩大 user access token 权限。

## Alternatives considered

- **复用站点 GitHub 登录 OAuth**：拒绝。它当前只承担登录身份，增加 Issue 写权限会把认证和外部写入耦合。
- **复用 Workshop GitHub OAuth**：拒绝。它面向私有源码仓库并使用更宽权限，不符合公开 issues-only 仓库的最小权限边界。
- **用维护者个人 PAT 托管代提**：拒绝。长期个人凭据会扩大泄露影响，Issue 作者也会错误显示为维护者本人。
- **不保存刷新令牌，每次提交重新连接**：拒绝。违背首次连接后持续可用的产品语义，也不能改善托管路径。
- **连接失效后自动改用 App `[bot]`**：拒绝。它会在玩家不知情时改变公开作者身份。
- **按 Anchor 或文本自动合并 Issue**：拒绝。同一步可能出现不同现象，文本相似也不足以证明同一个 Bug。
- **把重试当成新的提交**：拒绝。GitHub 的不确定响应会制造重复 Issue，并绕过站内额度。

## References

- [Generating a user access token for a GitHub App](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app)
- [Generating an installation access token for a GitHub App](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-an-installation-access-token-for-a-github-app)
- [REST API endpoints for issues](https://docs.github.com/en/rest/issues/issues)
- [Best practices for creating a GitHub App](https://docs.github.com/en/apps/creating-github-apps/about-creating-github-apps/best-practices-for-creating-a-github-app)
- [Rate limits for the REST API](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api)
- [Webhook events and payloads](https://docs.github.com/en/webhooks/webhook-events-and-payloads)
