FROM node:slim AS build
WORKDIR /build
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
RUN npm install --global "$(node -p 'require("./package.json").packageManager')"
COPY . .
RUN pnpm install --frozen-lockfile && pnpm build \
    && pnpm --filter @cool-profile/coolp deploy --prod --legacy /app

FROM node:slim
LABEL org.opencontainers.image.source="https://cnb.cool/elonzh/cool-profile"
COPY --from=build /app /opt/cool-profile
COPY LICENSE /opt/cool-profile/LICENSE
RUN chmod +x /opt/cool-profile/dist/coolp.mjs /opt/cool-profile/action.mjs \
    && ln -s /opt/cool-profile/dist/coolp.mjs /usr/local/bin/coolp
WORKDIR /workspace
EXPOSE 3000
ENTRYPOINT ["coolp"]
CMD ["--help"]
