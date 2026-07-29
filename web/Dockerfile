FROM node:22-slim
RUN corepack enable
WORKDIR /srv
COPY package.json pnpm-lock.yaml ./
# `corepack prepare --activate` pins the pnpm version from package.json's `packageManager`
# field, and `--frozen-lockfile` fails rather than silently resolving different versions
# than the ones the gates ran against. Bare `pnpm install` did neither, so the image could
# drift from the developer's tree without anything failing.
RUN corepack prepare --activate && pnpm install --frozen-lockfile
COPY . .
EXPOSE 5173
CMD ["pnpm", "dev", "--host", "0.0.0.0", "--port", "5173"]
