/**
 * Starter templates.
 *
 * Derived from the shapes that actually dominate the published examples rather
 * than invented: building a static site and pushing it to a Pages branch is by
 * far the most common config, and every one of those files carries its setup
 * instructions in a header comment that does not survive copy-paste. The
 * checklist recovers that from the config itself.
 */

export interface Template {
  id: string;
  name: string;
  summary: string;
  source: string;
}

export const TEMPLATES: Template[] = [
  {
    id: 'pages',
    name: 'Static site to Pages',
    summary: 'Build with Hugo and push the result to a pages branch. Needs a forge token.',
    source: `when:
  - event: push
    branch: \${CI_REPO_DEFAULT_BRANCH}

steps:
  build:
    image: docker.io/klakegg/hugo:alpine
    commands:
      - hugo --minify

  publish:
    image: docker.io/bitnami/git
    environment:
      TOKEN:
        from_secret: forge_token
      MAIL:
        from_secret: mail
    commands:
      - git config --global user.email "$MAIL"
      - git config --global user.name "Woodpecker CI"
      - git clone -b pages https://$TOKEN@$CI_FORGE_URL/$CI_REPO.git pages
      - rm -rf pages/*
      - cp -ar public/. pages/
      - cd pages && git add --all && git commit -m "Deploy $CI_COMMIT_SHA" && git push
`,
  },
  {
    id: 'go',
    name: 'Go build and test',
    summary: 'Lint, test and build in parallel using depends_on.',
    source: `when:
  - event: push
  - event: pull_request

steps:
  lint:
    image: docker.io/library/golang:1.26
    depends_on: []
    commands:
      - go vet ./...

  test:
    image: docker.io/library/golang:1.26
    depends_on: []
    commands:
      - go test ./...

  build:
    image: docker.io/library/golang:1.26
    depends_on:
      - lint
      - test
    commands:
      - go build ./...
`,
  },
  {
    id: 'node',
    name: 'Node build and test',
    summary: 'Install once, then check and build.',
    source: `when:
  - event: push
  - event: pull_request

steps:
  install:
    image: docker.io/library/node:22-alpine
    commands:
      - npm ci

  test:
    image: docker.io/library/node:22-alpine
    commands:
      - npm test

  build:
    image: docker.io/library/node:22-alpine
    commands:
      - npm run build
`,
  },
  {
    id: 'matrix',
    name: 'Matrix across versions',
    summary: 'Run the same steps for several versions of a toolchain.',
    source: `matrix:
  GO_VERSION:
    - '1.25'
    - '1.26'

when:
  - event: push
  - event: pull_request

steps:
  test:
    image: docker.io/library/golang:\${GO_VERSION}
    commands:
      - go test ./...
`,
  },
  {
    id: 'blank',
    name: 'Minimal',
    summary: 'One step. The smallest configuration that runs.',
    source: `steps:
  build:
    image: docker.io/library/alpine
    commands:
      - echo "hello from Woodpecker"
`,
  },
];

export const DEFAULT_TEMPLATE = TEMPLATES[0] as Template;
