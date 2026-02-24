# AGENTS

## 变更约定
- 每次修改代码后，自动运行单元测试（npm test）。
- 每次修改代码后，自动重启前端与后端服务。
- 每次修改代码后，更新文档：docs/IMPLEMENTATION_STATUS.md 与 docs/ENGINE_ARCHITECTURE.md
- 最后，提交代码到 Git 仓库，commit 标题需要符合规范：
  - 格式：`feat: 新增功能描述` 或 `fix: 修复问题描述` 或 `refactor: 代码重构描述`
  - 描述：简洁明了，避免使用中文

## 启动命令
- 前端：npm run dev，注意需要启动4个不同的浏览器窗口表示4个玩家。
- 后端：npm run server
