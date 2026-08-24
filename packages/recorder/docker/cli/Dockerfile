FROM node:22-bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends bash ca-certificates git \
    && rm -rf /var/lib/apt/lists/* \
    && corepack enable

WORKDIR /workspace
CMD ["sleep", "infinity"]
