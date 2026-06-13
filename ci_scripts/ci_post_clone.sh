#!/bin/sh
# Xcode Cloud runs this automatically after cloning the repo.
# We need Node + the Capacitor plugins on disk before xcodebuild resolves SPM packages.

set -e

echo "▶︎ Installing Node via Homebrew"
brew install node

echo "▶︎ Installing npm dependencies (from repo root)"
cd "$CI_PRIMARY_REPOSITORY_PATH"
npm install

echo "▶︎ Building web bundle"
npm run build

echo "▶︎ Syncing Capacitor iOS"
npx cap sync ios

echo "✅ ci_post_clone.sh finished"
