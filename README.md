# Cool Profile

[English](README.en.md)

把动态信息变成图片与动画，嵌入个人主页、README 和网站。

支持 GitHub 与 CNB，默认中文，可选英文和明暗主题。当前提供统计卡片；贪吃蛇、太空射击和 3D 活跃日历开发中。

## 效果

![CNB 中文统计卡](cards/stats/examples/cnb-default.zh-CN.svg)

![GitHub 深色统计卡](cards/stats/examples/github-dark.zh-CN.svg)

## 使用

需要 Node.js 24+ 和 pnpm。在仓库目录首次执行：

```sh
pnpm install --frozen-lockfile
pnpm build
```

GitHub 使用 `GITHUB_TOKEN`，CNB 使用 `CNB_TOKEN`；CNB 令牌需要 `account-profile:r`、`account-engage:r` 权限。

```sh
pnpm coolp render stats --source cnb --subject elonzh --output stats.svg
pnpm coolp render stats --source github --subject elonzh --format png --theme dark --locale en --output stats.png
```

将 subject 换成你的账号。批量生成使用 `pnpm coolp batch --config coolp.yaml`，配置方式见[配置示例](docs/architecture.md#配置结构与下发)。

启动图片服务：

```sh
pnpm coolp serve
```

访问 `http://localhost:3000/v1/cards/stats.svg?source=cnb&subject=elonzh` 即可获取图片。添加 `theme=dark`、`locale=en` 切换主题和语言，路径后缀可改为 `.png`。

[GitHub](https://github.com/elonzh/cool-profile) · [CNB](https://cnb.cool/elonzh/cool-profile)
