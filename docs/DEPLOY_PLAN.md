# 生产部署方案

本文件保留为旧链接入口。当前部署方案与操作步骤统一维护在
[`HOW_TO_DEPLOY.md`](HOW_TO_DEPLOY.md)。

前端自动部署行为以 `.github/workflows/deploy-pages.yml` 为准；后端仅在
owner 控制的本机通过 `deploy-backend.sh` 部署，SSH 身份只保留在本地。

同源前端启用、Pages 入口迁移、构建身份验收与回退也统一见该指南；托管前端与后端使用同一镜像。
