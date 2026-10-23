# Cool Profile

[English](README.en.md)

把动态信息变成图片与动画，嵌入个人主页、README 和网站。

支持 GitHub 与 CNB，默认中文，可选英文和多种主题。提供贪吃蛇、太空射击、3D 活跃日历和统计卡片。

## 效果

![CNB 贪吃蛇](cards/activity/snake/examples/cnb-default.zh-CN.svg)

![GitHub 彩虹贪吃蛇](cards/activity/snake/examples/github-rainbow.zh-CN.svg)

![CNB 3D 活跃日历](cards/activity/city/examples/cnb-default.zh-CN.svg)

![GitHub 积木日历](cards/activity/city/examples/github-blocks.zh-CN.svg)

![CNB 太空射击](cards/activity/shooter/examples/cnb-default.zh-CN.gif)

![GitHub 街机太空射击](cards/activity/shooter/examples/github-arcade.zh-CN.gif)

![CNB 中文统计卡](cards/profile/stats/examples/cnb-default.zh-CN.svg)

![GitHub 深色统计卡](cards/profile/stats/examples/github-dark.zh-CN.svg)

![CNB 语言分布](cards/profile/languages/examples/cnb-default.zh-CN.svg)

![GitHub 深色仓库卡](cards/repository/overview/examples/github-dark.zh-CN.svg)

语言卡提供条形、紧凑、横向圆环、纵向圆环和饼图，统计与仓库卡支持 67 套主题。3D 卡默认同时展示城市、雷达和语言图，也可单独生成。

![ 独立贡献雷达](cards/profile/radar/examples/cnb-dark.zh-CN.svg)

![紧凑语言图](cards/profile/languages/examples/compact-cnb-default.zh-CN.svg)

![语言饼图](cards/profile/languages/examples/pie-github-radical.zh-CN.svg)

## 命令行

使用镜像生成文件：

```sh
docker run --rm -v "$PWD:/workspace" -e CNB_TOKEN \
  docker.cnb.cool/elonzh/cool-profile:latest render activity/snake --source cnb --subject elonzh --output snake.svg
```

从源码运行需要 Node.js 24+ 和 pnpm。在仓库目录首次执行：

```sh
pnpm install --frozen-lockfile
pnpm build
```

GitHub 统计与日历使用 `GITHUB_TOKEN`，CNB 使用 `CNB_TOKEN`。
CNB 令牌需要 `account-profile:r`、`account-engage:r`；仓库卡还需要 `repo-basic-info:r`。

```sh
pnpm coolp render activity/snake --source cnb --subject elonzh --output snake.svg
pnpm coolp render activity/snake --source github --subject elonzh --format gif --theme rainbow --output snake.gif
pnpm coolp render activity/city --source cnb --subject elonzh --format png --theme blocks --output city.png
pnpm coolp render activity/shooter --source github --subject elonzh --theme arcade --output shooter.gif
pnpm coolp render profile/stats --source cnb --subject elonzh --output stats.svg
pnpm coolp render profile/stats --source github --subject elonzh --format png --theme dark --locale en --output stats.png
pnpm coolp render profile/languages --source cnb --subject elonzh --layout compact --theme tokyonight --output languages.svg
pnpm coolp render profile/radar --source cnb --subject elonzh --theme dark --output radar.svg
pnpm coolp render repository/overview --source github --subject Platane/snk --theme dark --output repo.svg
```

将 subject 换成你的账号，仓库卡则填写完整仓库路径。语言卡默认统计 GitHub 代码字节、CNB 仓库数，使用 `--metric repositories` 可在两个平台上按主要语言统计仓库数。

批量生成使用 `pnpm coolp batch --config coolp.yaml`，配置方式见[配置示例](docs/architecture.md#配置结构与下发)。

## CNB 插件

在密钥仓库的 `profile.yml` 中设置 `PROFILE_CNB_TOKEN`，然后配置流水线：

```yaml
main:
  push:
    - imports:
        - https://cnb.cool/your-org/secrets/-/blob/main/profile.yml
      stages:
        - name: 生成主页动画
          image: docker.cnb.cool/elonzh/cool-profile:latest
          args: [render]
          settings:
            card: activity/snake
            params: { source: cnb, subject: elonzh }
            tokens: { cnb: $PROFILE_CNB_TOKEN }
            theme: dark
            output: profile/snake.svg
```

`card` 可换成任意卡片 ID，`params` 填对应参数。`format`、`theme`、`locale` 与命令行同义。

## GitHub Action

```yaml
steps:
  - uses: actions/checkout@v6
  - uses: elonzh/cool-profile@main
    with:
      card: activity/snake
      params: '{"source":"github","subject":"${{ github.repository_owner }}"}'
      theme: rainbow
      output: profile/snake.svg
```

默认使用工作流的 GitHub 令牌，也可通过 `github-token`、`cnb-token` 提供自己的令牌。

## 图片服务

```sh
docker run --rm -p 3000:3000 -e GITHUB_TOKEN -e CNB_TOKEN \
  docker.cnb.cool/elonzh/cool-profile:latest serve --host 0.0.0.0
```

打开 `http://localhost:3000/`，可以查看效果、调整参数、生成图片，并复制命令、URL 或配置。

访问 `http://localhost:3000/v1/cards/profile/stats.svg?source=cnb&subject=elonzh` 可直接获取图片。
添加 `theme=dark`、`locale=en` 切换主题和语言，路径后缀可改为 `.png`。

[GitHub](https://github.com/elonzh/cool-profile) · [CNB](https://cnb.cool/elonzh/cool-profile)
