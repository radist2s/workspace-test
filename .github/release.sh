#!/usr/bin/env sh
set -o errexit

echo "//npm.pkg.github.com/:_authToken=$1" > $HOME/.npmrc
yarn workspace @radist2s/app run build
yarn workspace @radist2s/app run build:paths-dependencies
yarn changeset publish
(git checkout HEAD -- .npmrc 2> /dev/null) || (rm .npmrc 2> /dev/null) || true
