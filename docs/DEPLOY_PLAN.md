# 生产部署方案

本文件保留为旧链接入口。当前部署方案与操作步骤统一维护在
[`HOW_TO_DEPLOY.md`](HOW_TO_DEPLOY.md)。

前端自动部署行为以 `.github/workflows/deploy-pages.yml` 为准；后端仅在
owner 控制的本机通过 `deploy-backend.sh` 部署，SSH 身份只保留在本地。

同源前端启用、Pages 入口迁移、构建身份验收与回退也统一见该指南；托管前端与后端使用同一镜像。

独立预发布资源准备、维护入口、固定候选部署、身份审计、七天备份和隔离恢复，统一见该指南的 [owner 操作](HOW_TO_DEPLOY.md#operate-the-isolated-prerelease-target)。`pre.titanxxh.com` 的开放要求正式认证保护已经部署、同父域浏览器验收与实际前后端版本回执；正式版本变化后使用 reverify 重新验收，保留 pre 对局。`deploy-prerelease.sh` 只从可信 main 执行；实际资源安装和开放由 owner 现场票验收。

预发布镜像使用 GitHub 托管构建和独立 private GHCR 包，owner 核验固定回执后导入。正式宿主不承担候选或归档工具构建，缺少已验证镜像时拒绝操作；配置与导入命令见同一 owner 指南。
