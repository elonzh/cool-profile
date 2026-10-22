---
title: coolp 命令行、URL 与容器接口草案
status: draft
updated_at: 2026-10-22
---

## 应用入口

`coolp` 是同一个应用的命令行入口。以下为拟实现接口，当前尚未发布命令或容器镜像。

```text
coolp render <card> [options]
coolp batch --config <file> [--output-dir <directory>]
coolp serve [--host <address>] [--port <port>] [--config <file>]
```

`render` 生成一张卡片，`batch` 按配置逐项调用同一个生成函数，`serve` 启动 HTTP 服务。

## CLI 与 URL 的对应

```sh
coolp render snake --source cnb --subject elonzh --format svg --theme dark --locale zh-CN --output dist/snake.svg
```

```text
GET /v1/cards/snake.svg?source=cnb&subject=elonzh&theme=dark&locale=zh-CN
```

这两个入口解析为同一个生成请求，区别是文件交付与 HTTP 响应。URL 查询参数名与 CLI 长选项名一致；卡片 ID 与输出格式通过路径表达。

| 语义     | CLI                      | URL                                   | 默认值或约束                                |
| -------- | ------------------------ | ------------------------------------- | ------------------------------------------- |
| 卡片     | `render <card>`          | `/v1/cards/<card>.<format>` 中的 card | 必填                                        |
| 数据源   | `--source`               | `source`                              | 必填；首期 github、cnb                      |
| 资源 ID  | `--subject`              | `subject`                             | 必填；账号名、仓库路径等，随卡片定义        |
| 格式     | `--format`               | 路径扩展名                            | 卡片声明默认格式，见下表                    |
| 主题     | `--theme`                | `theme`                               | default，按卡片与数据源解析                 |
| 媒体语言 | `--locale`               | `locale`                              | zh-CN；首期 zh-CN、en                       |
| 年份     | `--year`                 | `year`                                | 时间范围类卡片选项；缺省由卡片定义          |
| 随机种子 | `--seed`                 | `seed`                                | 0，用于动画模拟                             |
| 效果选项 | 如 `--strategy`、`--fps` | 如 strategy、fps                      | 卡片声明类型、允许值与默认值                |
| 文件交付 | `--output` / `-o`        | 不提供                                | CLI 默认 `<card>.<format>`，`-` 表示 stdout |

两端共用校验与默认值函数。主题和语言不依赖浏览器、终端或服务器地区设置。缺省主题可以解析成 CNB、GitHub 的原生浅色配色；选择 dark 时使用对应深色配色。

CLI `--format` 缺省时使用卡片默认格式；URL 可以省略扩展名，此时使用同一默认值。显式格式以 `--format` 或路径扩展名指定，URL 不再提供重复的 format 查询参数。输出文件扩展名不参与选格式，和已确定的格式冲突时报告参数错误。使用 `--output -` 时，媒体写入 stdout，日志写入 stderr。

动画卡片的时间窗口缺省为最近 365 天；year 指定按数据源时区解释的日历年份。统计卡中的累计指标保留原始统计范围，不因为 year 参数被改称年度数值。没有对应时间能力的卡片不接受 year。

## 首期卡片 ID

| ID            | 效果         | 默认格式 | 允许格式  |
| ------------- | ------------ | -------- | --------- |
| snake         | 贪吃蛇动画   | svg      | svg、gif  |
| space-shooter | 太空射击动画 | gif      | gif、webp |
| contrib-3d    | 3D 活跃日历  | svg      | svg、png  |
| stats         | 统计总览     | svg      | svg、png  |
| languages     | 语言统计     | svg      | svg、png  |
| repo          | 仓库卡片     | svg      | svg、png  |

后三项属于同一个统计效果包。卡片声明自己的主题、格式与选项，共享解析器据此校验。

太空射击 strategy 为 column、row 或 random，默认 random；fps 默认 40。3D 日历的 animate 默认值随格式确定：SVG 为 true，PNG 为 false。CLI 用 `--animate false`、URL 用 `animate=false` 关闭 SVG 生长动画；PNG 显式传入 animate=true 时报告参数错误。语言支持与主题标识由卡片注册信息公开，CLI 帮助和画廊使用相同信息。

### 3D 日历

```sh
coolp render contrib-3d --source github --subject elonzh --format svg --theme season --locale en --year 2025 --output dist/contrib-3d.svg
```

```text
GET /v1/cards/contrib-3d.svg?source=github&subject=elonzh&theme=season&locale=en&year=2025
```

### 太空射击

```sh
coolp render space-shooter --source github --subject elonzh --format gif --theme dark --locale zh-CN --strategy column --fps 30 --seed 42 --output dist/space-shooter.gif
```

```text
GET /v1/cards/space-shooter.gif?source=github&subject=elonzh&theme=dark&locale=zh-CN&strategy=column&fps=30&seed=42
```

仓库卡使用 source=github、subject=elonzh/cool-profile；URL 中 subject 值进行百分号编码，仓库路径作为查询参数传递。后续 B 站和 Steam 资源可使用它们各自的 ID，沿用 source、subject、card 的含义。

## 批量文件生成

```sh
coolp batch --config coolp.yaml --output-dir dist
```

```yaml
cards:
  - card: snake
    source: cnb
    subject: elonzh
    format: svg
    theme: dark
    locale: zh-CN
    output: cnb-snake.svg
  - card: stats
    source: github
    subject: elonzh
    format: svg
    theme: default
    locale: en
    output: github-stats.svg
```

每一项使用相同的生成参数。output 相对批量输出目录解析；一次 batch 中相同的数据请求共享结果。单张卡通过 CLI 长选项或配置明确所有影响媒体的参数，批量文件只负责列出任务和文件位置。

## server

```sh
coolp serve --host 127.0.0.1 --port 3000
```

本地缺省监听 127.0.0.1:3000。容器部署显式使用 host=0.0.0.0。server 运行配置管理监听地址、凭证、数据缓存与媒体缓存的容量和有效期；这些是部署选项，不进入卡片 URL。

`GET /v1/cards/<card>[.<format>]` 返回媒体内容和正确的 Content-Type，`HEAD` 返回同一资源的响应头。ETag 按最终媒体内容计算，缓存有效时支持条件请求。服务不读取 Accept-Language 改变媒体语言，客户端用 locale 明确选择。

URL 与 CLI 使用相同的参数类型和卡片能力校验：未知参数、格式冲突或不适用的效果选项都是错误。CLI 参数错误退出码为 2，生成失败为 1；HTTP 参数错误为 400，卡片或来源资源不存在为 404，上游调用失败为 502，错误返回结构化 JSON。

凭证从运行环境读取，例如 GITHUB_TOKEN、CNB_TOKEN；URL 中不传递访问令牌。server 的媒体缓存键包含规范化请求、数据版本、权限作用域和渲染版本。

## 一个镜像，两种运行方式

拟发布同一个镜像：docker.cnb.cool/elonzh/cool-profile:latest。镜像包含命令行、server、编码器与字体。

```dockerfile
ENTRYPOINT ["coolp"]
CMD ["--help"]
```

本地或服务部署执行：

```sh
docker run --rm -p 3000:3000 docker.cnb.cool/elonzh/cool-profile:latest serve --host 0.0.0.0 --port 3000
```

CNB 插件执行生成子命令：

```yaml
$:
  web_trigger:
    - stages:
        - name: generate-profile
          image: docker.cnb.cool/elonzh/cool-profile:latest
          args: [render]
          settings:
            card: snake
            source: cnb
            subject: elonzh
            format: svg
            theme: dark
            locale: zh-CN
            output: dist/snake.svg
```

CNB 将 settings 转换为 PLUGIN_* 环境变量。render 命令在选项解析处读取这组输入，显式 CLI 参数优先；card 可来自位置参数或 PLUGIN_CARD，然后使用同一套参数校验。

GitHub Docker Action 通过根 action.yml 的 inputs、args 和 env 调用同一个镜像的 coolp render，参数名和默认值与本表保持一致。两种 CI 入口只生成工作区文件，提交 Git、上传制品和部署由后续步骤处理。

args 传给镜像的 ENTRYPOINT，并替换默认 CMD。CNB 插件、GitHub Action 和 server 不需要不同的镜像入口脚本。

## 平台依据

- [CNB 插件制作：settings 参数转换](https://docs.cnb.cool/zh/build/create-plugin.html)
- [CNB 语法：Job args](https://docs.cnb.cool/zh/build/grammar.html#job-args)
- [GitHub Docker Action args](https://docs.github.com/en/actions/reference/workflows-and-actions/metadata-syntax#runsargs)
- [Docker ENTRYPOINT 与 CMD](https://docs.docker.com/reference/dockerfile/#understand-how-cmd-and-entrypoint-interact)
