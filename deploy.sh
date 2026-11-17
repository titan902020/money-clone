#!/bin/sh
# Build and publish dist/ to the gh-pages branch (GitHub Pages)
set -e
npm run build
cd dist && touch .nojekyll
git init -q -b gh-pages && git add -A && git commit -qm "deploy" 
git push -f "$(git -C .. remote get-url origin)" gh-pages
rm -rf .git
