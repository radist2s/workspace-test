#!/usr/bin/env bash

RED='\033[0;31m'
NO_COLOR='\033[0m'

while IFS= read -r line; do
  if [[ $line = "??"* ]]; then # If the $line starts with the double `??`
    if [[ $line = *".md" ]] || [[ $line = *".MD" ]]; then # If the $line ends with `*.md`
      echo -e "${RED}Changesets file must be staged\n${line}${NO_COLOR}"
      exit 1
    fi
  fi
done <<< "$(git status .changeset -u --porcelain --no-column)"
