# Stage 1: Build the Next.js standalone output
FROM node:22-bookworm-slim AS builder

WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

COPY package.json package-lock.json ./
RUN npm ci --legacy-peer-deps

COPY prisma ./prisma
RUN npx prisma generate

COPY . .

RUN npm run build

# Stage 2: Production runtime with Playwright and Python tooling
FROM mcr.microsoft.com/playwright:v1.59.1-noble AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PYTHONUNBUFFERED=1
ENV PYTHONIOENCODING=utf-8
ENV PYTHONUTF8=1
ENV PYTHON_CMD=python3
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV VIRTUAL_ENV=/opt/venv
ENV PATH="/opt/venv/bin:${PATH}"

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    graphviz \
    fonts-noto-cjk \
    fonts-dejavu-core \
    libgomp1 \
    python3 \
    python3-pip \
    python3-venv \
  && python3 -m venv /opt/venv \
  && /opt/venv/bin/python -m pip install --no-cache-dir --upgrade pip setuptools wheel \
  && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./requirements.txt
RUN /opt/venv/bin/pip install --no-cache-dir -r requirements.txt

RUN groupadd --system --gid 1001 appgroup \
  && useradd --system --uid 1001 --gid appgroup --home-dir /app --shell /usr/sbin/nologin appuser

COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/scripts/charts ./scripts/charts

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

RUN mkdir -p /app/data /app/prisma /app/public/charts /app/.tmp \
  && chown -R appuser:appgroup /app

USER appuser

EXPOSE 3000

CMD ["node", "server.js"]
