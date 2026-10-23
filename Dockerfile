FROM node:slim AS build
WORKDIR /build
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
RUN npm install --global "$(node -p 'require("./package.json").packageManager')"
COPY . .
RUN pnpm install --frozen-lockfile && pnpm build \
    && pnpm release:stage \
    && cd dist/npm && npm install --omit=dev --no-audit --no-fund

FROM node:slim
LABEL org.opencontainers.image.source="https://cnb.cool/elonzh/cool-profile"
COPY --from=build /build/dist/npm /opt/cool-profile
RUN chmod +x /opt/cool-profile/dist/coolp.mjs /opt/cool-profile/action.mjs \
    && ln -s /opt/cool-profile/dist/coolp.mjs /usr/local/bin/coolp
WORKDIR /workspace
EXPOSE 3000
ENTRYPOINT ["coolp"]
CMD ["--help"]
