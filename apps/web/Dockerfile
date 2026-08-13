FROM node:22-bookworm-slim AS base
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile

FROM deps AS build
ARG NEXT_PUBLIC_API_URL=http://localhost:3001/api
ARG NEXT_PUBLIC_CHECKIN_API_URL=http://localhost:3001/api/check-in
ARG NEXT_PUBLIC_DEVICE_API_KEY=success-device-key-change-me
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_CHECKIN_API_URL=$NEXT_PUBLIC_CHECKIN_API_URL
ENV NEXT_PUBLIC_DEVICE_API_KEY=$NEXT_PUBLIC_DEVICE_API_KEY
COPY packages/shared packages/shared
COPY apps/web apps/web
RUN pnpm --filter @center-erp/shared build || true
RUN pnpm --filter @center-erp/web build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
COPY --from=build /app/apps/web/public ./apps/web/public
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
