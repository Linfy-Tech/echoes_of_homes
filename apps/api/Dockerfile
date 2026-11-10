FROM node:24.15.0-bookworm-slim

WORKDIR /app
RUN corepack enable && corepack prepare pnpm@12.16.1 --activate

COPY . .
RUN pnpm install --frozen-lockfile

ENV NODE_ENV=production
EXPOSE 4000
CMD ["node", "--experimental-strip-types", "apps/api/src/server.ts"]
