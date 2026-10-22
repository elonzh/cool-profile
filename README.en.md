# Cool Profile

[简体中文](README.md)

Turn changing information into images and animations for your profile, README, or website.

Supports GitHub and CNB, with Chinese as the default, English output, and multiple themes. Includes snake
animations, space shooters, 3D activity calendars, and statistics cards.

## Preview

![CNB activity snake](cards/snake/examples/cnb-default.en.svg)

![GitHub rainbow snake](cards/snake/examples/github-rainbow.en.svg)

![CNB 3D activity calendar](cards/contrib-3d/examples/cnb-default.en.svg)

![GitHub block calendar](cards/contrib-3d/examples/github-blocks.en.svg)

![CNB space shooter](cards/space-shooter/examples/cnb-default.en.gif)

![GitHub arcade space shooter](cards/space-shooter/examples/github-arcade.en.gif)

![CNB statistics card](cards/stats/examples/cnb-default.en.svg)

![GitHub dark statistics card](cards/stats/examples/github-dark.en.svg)

![CNB language distribution](cards/stats/examples/languages-cnb-default.en.svg)

![GitHub dark repository card](cards/stats/examples/repo-github-dark.en.svg)

## CLI

Generate a file with the image:

```sh
docker run --rm -v "$PWD:/workspace" -e CNB_TOKEN \
  docker.cnb.cool/elonzh/cool-profile:latest render snake --source cnb --subject elonzh --locale en --output snake.svg
```

To run from source, use Node.js 24+ and pnpm. Run these commands once from the repository:

```sh
pnpm install --frozen-lockfile
pnpm build
```

GitHub stats and calendars use `GITHUB_TOKEN`; CNB uses `CNB_TOKEN`. CNB tokens need `account-profile:r` and
`account-engage:r`; repository cards also need `repo-basic-info:r`.

```sh
pnpm coolp render snake --source cnb --subject elonzh --locale en --output snake.svg
pnpm coolp render snake --source github --subject elonzh --format gif --theme rainbow --locale en --output snake.gif
pnpm coolp render contrib-3d --source cnb --subject elonzh --format png --theme blocks --locale en --output city.png
pnpm coolp render space-shooter --source github --subject elonzh --theme arcade --locale en --output shooter.gif
pnpm coolp render stats --source cnb --subject elonzh --locale en --output stats.svg
pnpm coolp render stats --source github --subject elonzh --format png --theme dark --locale en --output stats.png
pnpm coolp render languages --source cnb --subject elonzh --locale en --output languages.svg
pnpm coolp render repo --source github --subject Platane/snk --theme dark --locale en --output repo.svg
```

Replace subject with your account, or a full repository path for repo cards. Languages default to code bytes on
GitHub and repository counts on CNB. Use `--metric repositories` on either platform to count repos by primary
language.

For batch output, use `pnpm coolp batch --config coolp.yaml`; see the [configuration
example](docs/architecture.md#配置结构与下发).

## CNB plugin

Set `PROFILE_CNB_TOKEN` in your secret repository's `profile.yml`, then configure the pipeline:

```yaml
main:
  push:
    - imports:
        - https://cnb.cool/your-org/secrets/-/blob/main/profile.yml
      stages:
        - name: Generate profile animation
          image: docker.cnb.cool/elonzh/cool-profile:latest
          args: [render]
          settings:
            card: snake
            params: { source: cnb, subject: elonzh }
            tokens: { cnb: $PROFILE_CNB_TOKEN }
            theme: dark
            locale: en
            output: profile/snake.svg
```

Use any card ID for `card` and its parameters for `params`. `format`, `theme` and `locale` have the same meaning as
their CLI options.

## GitHub Action

```yaml
steps:
  - uses: actions/checkout@v6
  - uses: elonzh/cool-profile@main
    with:
      card: snake
      params: '{"source":"github","subject":"${{ github.repository_owner }}"}'
      theme: rainbow
      locale: en
      output: profile/snake.svg
```

The action uses the workflow's GitHub token by default. Use `github-token` or `cnb-token` to provide your own.

## Image server

```sh
docker run --rm -p 3000:3000 -e GITHUB_TOKEN -e CNB_TOKEN \
  docker.cnb.cool/elonzh/cool-profile:latest serve --host 0.0.0.0
```

Open `http://localhost:3000/?ui=en` to explore effects, edit parameters, generate images and copy commands, URLs or
configuration.

Use `http://localhost:3000/v1/cards/stats.svg?source=cnb&subject=elonzh&locale=en` for a direct image.
Add `theme=dark` to change the theme, or use the `.png` extension for PNG output.

[GitHub](https://github.com/elonzh/cool-profile) · [CNB](https://cnb.cool/elonzh/cool-profile)
