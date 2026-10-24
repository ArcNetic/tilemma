# syntax=docker/dockerfile:1.7
ARG NODE_IMAGE=node:22-bookworm-slim

FROM ${NODE_IMAGE} AS toolchain
ARG LEAN_VERSION=4.35.0
ARG LEAN_SHA256=7289597a44543246c9227b8cae501767e095ce17f6d448b95fc4a8dc97268f6d
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl aria2 zstd git \
 && rm -rf /var/lib/apt/lists/*
RUN aria2c --console-log-level=warn -x 16 -s 16 -k 8M -d /tmp -o lean.tar.zst \
      "https://github.com/leanprover/lean4/releases/download/v${LEAN_VERSION}/lean-${LEAN_VERSION}-linux.tar.zst" \
 && echo "${LEAN_SHA256}  /tmp/lean.tar.zst" | sha256sum -c - \
 && mkdir -p /opt/lean \
 && tar --zstd -xf /tmp/lean.tar.zst -C /opt/lean --strip-components=1 \
 && rm /tmp/lean.tar.zst

FROM toolchain AS toolchain-slim
RUN rm -rf /opt/lean/src /opt/lean/share/doc /opt/lean/include

FROM toolchain AS lean-build
ARG LEAN_VERSION=4.35.0
ARG REPL_COMMIT=58bdde1ff173117960083cc5a052a11d51c49ff1
ENV PATH=/opt/lean/bin:$PATH
WORKDIR /app
COPY lean/lean-toolchain lean/lakefile.lean lean/ProofPuzzle.lean ./lean/
COPY lean/ProofPuzzle ./lean/ProofPuzzle
RUN cd lean && lake build
RUN git clone --depth 1 --branch "v${LEAN_VERSION}" https://github.com/leanprover-community/repl.git .repl \
 && test "$(git -C .repl rev-parse HEAD)" = "${REPL_COMMIT}" \
 && cd .repl && lake build

FROM ${NODE_IMAGE} AS app-build
RUN corepack enable
WORKDIR /src
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY packages ./packages
COPY server/package.json ./server/package.json
COPY web/package.json ./web/package.json
RUN pnpm install --frozen-lockfile
COPY server ./server
COPY web ./web
COPY levels ./levels
RUN pnpm -F @pp/web build && pnpm -F @pp/server bundle

FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production \
    PORT=8080 \
    HOST=0.0.0.0 \
    PATH=/opt/lean/bin:$PATH \
    LEAN_BIN=/opt/lean/bin/lean \
    LEAN_DIR=/app/lean \
    LEVELS_DIR=/app/levels \
    WEB_DIST=/app/web \
    REPL_BIN=/app/.repl/.lake/build/bin/repl \
    RUNNER=auto
RUN useradd --system --uid 10001 --home-dir /app --shell /usr/sbin/nologin app
COPY --from=toolchain-slim /opt/lean /opt/lean
COPY --from=lean-build /app/lean /app/lean
COPY --from=lean-build /app/.repl/.lake/build/bin/repl /app/.repl/.lake/build/bin/repl
COPY --from=app-build /src/server/dist/server.mjs /app/server.mjs
COPY --from=app-build /src/web/dist /app/web
COPY --from=app-build /src/levels /app/levels
WORKDIR /app
USER 10001
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8080/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "/app/server.mjs"]
