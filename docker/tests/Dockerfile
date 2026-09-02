# Runs the Playwright suite itself, so a machine with only Docker can execute
# the tests. These are pure API tests — no browser is ever launched — so a
# plain Node image is enough and Playwright's browser download is skipped.
FROM node:22-slim

ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
# The service runs as the host UID, which has no home directory in this image;
# npm needs a writable HOME for its cache and logs.
ENV HOME=/tmp

WORKDIR /work

# Dependencies are baked into the image so a run doesn't reinstall them. The
# repo is mounted over /work at runtime, and an anonymous volume keeps this
# node_modules from being shadowed by the host's — see docker-compose.yml.
COPY package.json package-lock.json ./
RUN npm ci

CMD ["npm", "test"]
