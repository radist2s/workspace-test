#!/usr/bin/env sh
set -o errexit

if [ "$GITHUB_ACTIONS" = "true" ]; then
  echo "//npm.pkg.github.com/:_authToken=$1" > $HOME/.npmrc
else
  echo "//npm.pkg.github.com/:_authToken=$1" >> .npmrc
fi

yarn workspace @radist2s/app run build
yarn workspace @radist2s/app run build:paths-dependencies
yarn changeset publish

if [ "$GITHUB_ACTIONS" != "true" ]; then
  (git checkout HEAD -- .npmrc 2> /dev/null) || (rm .npmrc 2> /dev/null) || true
fi
