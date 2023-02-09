#!/usr/bin/env sh
set -o errexit

echo "//npm.pkg.github.com/:_authToken=$1" > $HOME/.npmrc
yarn workspace @radist2s/app run build
yarn workspace @radist2s/app run build:paths-dependencies
changeset publish
git checkout HEAD -- .npmrc &>> /dev/null || rm .npmrc &>> /dev/null || true
