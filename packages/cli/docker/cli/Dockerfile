FROM node:22-bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends bash ca-certificates git \
    && rm -rf /var/lib/apt/lists/* \
    && npm install --global pnpm@10.30.1

WORKDIR /workspace
CMD ["sleep", "infinity"]
