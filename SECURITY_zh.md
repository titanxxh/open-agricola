# 安全策略

[English](SECURITY.md) | [中文](SECURITY_zh.md)

> 本文件是中文翻译镜像；[SECURITY.md](SECURITY.md) 是唯一权威版本。

## 支持的版本

仅支持最新的 `main` 分支和当前线上部署，不维护单独的发布分支。

## 报告安全漏洞

**请勿通过公开 GitHub Issue 报告安全漏洞。**

请使用以下任一私密渠道：

- **GitHub 私密漏洞报告**（启用后推荐）：进入本仓库的
  [Security 页面](https://github.com/titanxxh/open-agricola/security)，点击“Report a vulnerability”；如果该入口不可用，请使用下面的邮件渠道。
- **电子邮件**：<titanxxh@gmail.com>

请包含：

- 漏洞及其影响的说明
- 复现步骤或概念验证
- 受影响的组件，例如认证、WebSocket 房间、自定义卡沙盒、HTTP API 或部署配置

我们会在 7 天内确认收到报告。问题确认并修复后，我们会在修复说明中致谢；如希望匿名，请在报告中说明。

## 范围

我们特别关注：

- 自定义卡沙盒逃逸（isolated-vm / worker 隔离）
- 认证、session 和 OAuth 漏洞
- 跨房间信息泄漏或通过 WebSocket 未授权修改状态
- SQL 注入或数据完整性问题

不在范围内：针对公开演示实例的拒绝服务，以及需要物理接触服务器才能利用的问题。
