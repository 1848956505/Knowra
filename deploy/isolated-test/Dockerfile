FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY . .
ARG KNOWRA_BUILD_COMMIT
ARG KNOWRA_BUILD_STATE
RUN npm ci --ignore-scripts && npm run prisma:generate && KNOWRA_BUILD_COMMIT="$KNOWRA_BUILD_COMMIT" KNOWRA_BUILD_STATE="$KNOWRA_BUILD_STATE" NODE_ENV=production npm run build:web
# 专用测试镜像保留Prisma迁移CLI；不用于替换生产JSON发布包。
RUN mkdir -p /var/lib/knowra-test && chown node:node /var/lib/knowra-test
USER node
ENV NODE_ENV=production KNOWRA_TEST_CONTAINER=1 KNOWRA_TEST_PORT=43100 KNOWRA_TEST_DATA_ROOT=/var/lib/knowra-test
CMD ["node", "scripts/start-isolated-test.mjs"]
