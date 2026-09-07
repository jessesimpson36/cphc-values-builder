# Build and serve the values generator as a static site.
#
# No image is published anywhere — see issue #28. The app is a static bundle
# with no backend, so this exists for people who would rather self-host it than
# use https://cphc-values-wizard.vercel.app/:
#
#   docker build -t cphc-values-builder .
#   docker run --rm -p 8080:8080 cphc-values-builder
#
# src/schemas/, src/uiSchema.json and src/pathIndex.json are committed, so the
# build needs no network access to the Camunda chart repository and no `npm run
# parse` step.

FROM node:26-alpine AS build

WORKDIR /app

# Dependencies first, so a source-only change does not reinstall them.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# nginx-unprivileged rather than plain nginx: it listens on 8080 and runs as a
# non-root user out of the box, so the image works unmodified under OpenShift's
# restricted-v2 SCC and any cluster that rejects root containers. That is the
# same constraint this tool exists to help people configure around, so shipping
# an image that could not run there would be a poor advertisement.
FROM nginxinc/nginx-unprivileged:alpine

COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 8080
