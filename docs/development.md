---
title: 工程开发与双远程同步
updated_at: 2026-10-22
---

## 当前工程

Node.js 24 及以上、pnpm 11.8.0。根目录使用 pnpm workspace，工作区路径为 `apps/*` 和 `packages/*`，公共开发依赖通过 catalog 管理。效果包在架构确认后建立。

```sh
pnpm install --frozen-lockfile
pnpm hooks:install
pnpm check
```

Oxlint 检查代码，Oxfmt 处理格式，TypeScript 开启严格类型检查。prek 在提交时运行格式与 lint 修复；修复后检查差异、重新暂存并再次提交。当前检查覆盖工程配置，效果的构建与测试随实现加入。

## 双远程

| Remote   | 地址                                         |
| -------- | -------------------------------------------- |
| `origin` | `https://cnb.cool/elonzh/cool-profile`       |
| `github` | `https://github.com/elonzh/cool-profile.git` |

两个远程共用同一条 `main` 历史。完成提交后执行：

```sh
pnpm sync:remotes
```

命令按顺序推送两个远程；一个推送失败时保留已完成的结果，修复访问或远程差异后重试，并核对两个远程的提交 ID。Tag 发布时同样推送至两个 remote。

GitHub 与 CNB 各自运行工程检查。跨平台自动镜像与插件、Action 发布方式属于[架构草案](architecture.md)，在方案确认后实施。
