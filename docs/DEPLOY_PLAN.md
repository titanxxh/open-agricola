# 生产部署方案

本文件保留为旧链接入口。当前部署方案与操作步骤统一维护在
[`HOW_TO_DEPLOY.md`](HOW_TO_DEPLOY.md)。

前端自动部署行为以 `.github/workflows/deploy-pages.yml` 为准；后端仅在
owner 控制的本机通过 `deploy-backend.sh` 部署，SSH 身份只保留在本地。

同源前端启用、Pages 入口迁移、构建身份验收与回退也统一见该指南；托管前端与后端使用同一镜像。

独立预发布资源准备、维护入口、固定候选部署、身份审计、七天备份和隔离恢复，统一见该指南的 [owner 操作](HOW_TO_DEPLOY.md#operate-the-isolated-prerelease-target)。`deploy-prerelease.sh` 只从可信 main 执行；实际资源安装和开放由 owner 现场票验收。
