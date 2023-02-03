#!/usr/bin/env sh
set -o errexit

echo "//npm.pkg.github.com/:_authToken=$1" > $HOME/.npmrc
yarn release
git checkout HEAD -- .npmrc &> /dev/null || rm .npmrc &> /dev/null || true
