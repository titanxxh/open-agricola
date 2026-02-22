# Open Agricola

一个基于 React + TypeScript + Vite 的 Agricola 规则与可视化实现。前端提供回合推进、行动选择、农场格网与手牌展示，后端用于状态持久化与操作校验。

## 功能概览

- 行动区与回合解锁展示
- 农场格网、围栏、播种/耕地交互
- 动物重组与回合收成
- 牌库与手牌展示
- 操作日志与开发模式面板

## 项目结构

```
src/
  app/            容器入口与页面组合
  components/     UI 组件
  hooks/          状态与交互 Hooks
  logic/          纯函数与规则逻辑
  services/       API 请求封装
  actions/        行动与效果实现
  engine/         规则引擎
  game/           领域模型与静态数据
  i18n/           文案与多语言
```

## 本地开发

```bash
npm install
```

前端开发服务器：

```bash
npm run dev
```

本地 API 服务：

```bash
npm run server
```

## 常用命令

```bash
npm run test
npm run lint
npm run build
```

## 运行说明

- 默认前端与 API 使用本地端口通信（见 services/api.ts）。
- 开发模式可在界面右上角开启，用于快速调整资源与回合。
