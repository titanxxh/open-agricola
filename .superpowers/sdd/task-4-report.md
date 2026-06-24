## Task 4 Report: Client Cookie Auth And Token Removal

### 实现内容

- `AuthContext` 删除 legacy `open-agricola-token`、`token` state、`register` API 和 bearer header；`/api/auth/me/login/logout/logout-all` 改用 `credentials: 'include'`。
- `AuthContextValue` 增加 `logoutAll` 和 `oauthStartUrl(provider, intent)`；`logout` 改为 `Promise<void>`。
- `apiFetch` 统一带 `credentials: 'include'`，不再追加 `Authorization`。
- `HttpGameTransport` HTTP fetch 改用 cookie credentials；`WsGameTransport` 不再读取 localStorage，也不再发送 `{ type: 'auth', token }`。
- `workshop-pr` helper 改用 cookie credentials，保留 popup OAuth postMessage 逻辑。
- `LobbyPage`、`WorkshopPage`、`AiCardDesigner` 的 authenticated API 请求改走 `apiFetch` 或等价 cookie fetch fallback。
- `LobbyPage` 测试 mock 删除 `token`，新增 `apiFetch`。
- 新增 `client/contexts/__tests__/AuthContext.test.tsx` 覆盖 legacy token 不再读写。

### TDD RED 证据

命令：

```bash
pnpm exec vitest run --project fast-client client/contexts/__tests__/AuthContext.test.tsx
```

结果：失败，1 failed。

关键失败：

```text
AssertionError: expected "getItem" to not be called with arguments: [ 'open-agricola-token' ]
```

### GREEN / 验证命令

命令：

```bash
pnpm exec vitest run --project fast-client client/contexts/__tests__/AuthContext.test.tsx client/app/__tests__/LobbyPage.test.tsx client/services/__tests__/gameTransport.test.ts client/services/__tests__/workshop-pr.test.ts
```

结果：通过，4 files / 21 tests passed。

命令：

```bash
pnpm exec vitest run --project fast-client client/app/workshop/__tests__/AiCardDesigner.test.tsx client/app/workshop/ProposeModal.test.tsx
```

结果：通过，2 files / 6 tests passed。

命令：

```bash
rg "open-agricola-token|localStorage\.getItem\(|localStorage\.setItem\(|Authorization" client/contexts client/services client/app
```

结果：只剩 AuthContext token-removal 测试断言、Locale/LLM config localStorage、LLM provider API-key Authorization，以及 LLM provider tests；未发现 legacy auth token 或 app auth bearer 用途。

命令：

```bash
pnpm run lint
```

结果：退出码 0；仍有既存 warnings。

### 变更文件

- `client/contexts/AuthContext.tsx`
- `client/contexts/__tests__/AuthContext.test.tsx`
- `client/services/gameTransport.ts`
- `client/services/workshop-pr.ts`
- `client/app/workshop/AiCardDesigner.tsx`
- `client/app/WorkshopPage.tsx`
- `client/app/LobbyPage.tsx`
- `client/app/__tests__/LobbyPage.test.tsx`
- `.superpowers/sdd/task-4-report.md`

### 自审发现

- 没有修改 `docs/superpowers/*`。
- 没有引入 runtime dependency。
- 没有实现邮箱验证、短信验证、发邮件或 provider email 隐式合并。
- `LoginPage` 仍引用 removed `register`，这是 brief 指出的 Task 5 接续窗口；本任务未为旧本地注册 UI 保留接口。

### Concerns

- `pnpm run build` 预计会在 Task 5 前因 `LoginPage` 仍引用 `register` 而失败；本任务按 brief 未修 LoginPage。
- `pnpm run lint` 有大量既存 warnings，但退出码为 0。
