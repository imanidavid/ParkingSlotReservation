# syntax=docker/dockerfile:1
#
# Three stages: Node builds the React bundle, Maven builds the jar, a JRE image
# runs both. The frontend ships in the same image because the backend serves it
# as static files from the same origin (see ARCHITECTURE.md §8) — there is no
# separate web server to deploy.

# ---- frontend ------------------------------------------------------------------
FROM node:22-alpine AS web
WORKDIR /web

# Lockfile first, same reason as the pom below: the dependency layer is cached
# until the lockfile itself changes.
COPY package.json package-lock.json ./
RUN npm ci

COPY vite.config.js ./
COPY frontend ./frontend
RUN npm run build

# ---- backend -------------------------------------------------------------------
FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /src

# pom first, so the dependency layer is cached and only re-resolves when the pom
# actually changes rather than on every source edit.
COPY backend/pom.xml ./pom.xml
RUN mvn -B -q -DskipTests dependency:go-offline

COPY backend/src ./src
RUN mvn -B -q -DskipTests package \
    && mv target/$(ls target | grep -E '\.jar$' | grep -v -- '-plain\.jar$' | head -1) /app.jar

# ---- runtime -------------------------------------------------------------------
FROM eclipse-temurin:21-jre AS runtime

# curl is for the container healthcheck below, nothing else.
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

# Don't run the app as root.
RUN useradd --system --create-home --uid 10001 karita
WORKDIR /app

COPY --from=build /app.jar /app/app.jar
COPY --from=web --chown=karita:karita /web/frontend/dist /app/frontend

# The app resolves karita.frontend-dir relative to its working directory, which
# is ../frontend/dist when run from backend/ in a checkout. In the image the
# built bundle is copied to one absolute path instead.
ENV FRONTEND_DIR=/app/frontend \
    PORT=8080 \
    JAVA_OPTS="-XX:MaxRAMPercentage=75"

USER karita
EXPOSE 8080

# /login.html is served to signed-out visitors, so it answers 200 without
# credentials — which makes it the one honest liveness probe available without
# pulling in Actuator just for this.
HEALTHCHECK --interval=15s --timeout=3s --start-period=90s --retries=5 \
    CMD curl -fsS "http://localhost:${PORT}/login.html" > /dev/null || exit 1

ENTRYPOINT ["sh", "-c", "exec java $JAVA_OPTS -jar /app/app.jar"]
