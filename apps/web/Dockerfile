# syntax=docker/dockerfile:1
#
# The Rolewright app image (ADR 0009). Build from the REPOSITORY ROOT so the
# engine is inside the context:
#
#   docker build -f apps/web/Dockerfile -t rolewright .
#
# Layout inside the image matches the repository (/app/apps/web and
# /app/packages/engine), so the app's default engine path also resolves.

ARG NODE_IMAGE=node:24-bookworm-slim@sha256:dc26ae92c9fb15cf6b1d63e20f0944b2efe0f115b20e00be48fb23fceb061c54

# ---- engine: copy, drop what the app never reads, install runtime deps -------
FROM ${NODE_IMAGE} AS engine
WORKDIR /app/packages/engine
COPY packages/engine/ ./
# Legacy UI, tests and fixtures stay out of the image (ADR 0007).
RUN rm -rf web tests test-fixtures node_modules \
      test-all.mjs seed-fixture.mjs updater-migration-tests.mjs
# --ignore-scripts skips the engine's postinstall browser download; Chromium is
# installed explicitly in the runtime stage with system libraries.
RUN npm install --ignore-scripts --omit=dev --no-audit --no-fund

# ---- build: app dependencies and `next build` ---------------------------------
FROM ${NODE_IMAGE} AS build
WORKDIR /app/apps/web
ENV NEXT_TELEMETRY_DISABLED=1
COPY apps/web/package.json apps/web/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY apps/web/ ./
# The build reads the engine's files (fact gate, templates) only at run time.
COPY --from=engine /app/packages/engine /app/packages/engine
RUN npm run build
RUN npm prune --omit=dev

# ---- runtime ----------------------------------------------------------------
FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    CAREER_OPS_CODE_ROOT=/app/packages/engine \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

WORKDIR /app/apps/web
COPY --from=engine /app/packages/engine /app/packages/engine

# Chromium for the engine's pinned Playwright, plus the system libraries it
# needs. Installed as root into a shared path, then made readable.
RUN cd /app/packages/engine \
 && npx --no-install playwright install --with-deps chromium \
 && rm -rf /var/lib/apt/lists/* \
 && chmod -R a+rX /ms-playwright

COPY --from=build /app/apps/web /app/apps/web

RUN groupadd --system --gid 10001 rolewright \
 && useradd --system --uid 10001 --gid rolewright --home-dir /home/rolewright --create-home rolewright \
 && chown -R rolewright:rolewright /app/apps/web/.next
USER rolewright

# Cloud Run sets PORT (the Terraform sets 8080). No NODE_OPTIONS.
EXPOSE 8080
CMD ["sh", "-c", "exec npm run start -- -p \"${PORT:-8080}\""]
