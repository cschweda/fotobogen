#!/usr/bin/env bash
set -euo pipefail

# Publishes create-fotobogen, the one-line installer (npx create-fotobogen@latest), to npm.
# It does NOT publish Fotobogen itself, which is not an npm package: Fotobogen is released by
# tagging main (see the README, Branches).
#
# Usage:
#   ./publish.sh --dry-run   run every check and a dry-run publish; change nothing
#   ./publish.sh             run every check, then publish
#
# A release is two commands: ./publish.sh --dry-run, then ./publish.sh.
#
# The version published is the one in create-fotobogen/package.json. This script never changes
# it, and never commits or pushes to a branch: a push to main starts a production build of the
# website. To release a new version of the installer, change the version and add an entry to
# create-fotobogen/CHANGELOG.md in a pull request, merge it to main in the usual way, and then
# run this. The only thing it pushes is the tag create-fotobogen-vX.Y.Z, which builds nothing.
#
# It asks for npm's two-factor code last, just before it publishes: a code lasts about 30
# seconds, and the checks take minutes. Press Enter there instead of typing a code and npm
# prints a link to approve the publish in your browser. A dry run asks for nothing.
#
# Works in Git Bash on Windows as well as on macOS and Linux.
#
# Before anything is published, it checks that:
#   - you're in the Fotobogen root, on main, up to date with origin/main, with a clean tree;
#   - you're logged in to npm, and the version isn't on npm or tagged on another commit;
#   - create-fotobogen/CHANGELOG.md has an entry for the version;
#   - CI finished and passed for this commit (needs the GitHub CLI, logged in: without it a
#     publish stops, and a dry run only warns);
#   - the installer has no dependencies and no install scripts, so nothing runs on the machine
#     of someone who uses it but the two files in the package;
#   - the installer's tests pass, among them ones that run it for real against a repository
#     on this machine;
#   - the package holds exactly the files this script expects, and nothing else;
#   - the packed tarball installs in an empty project, prints the right version, and then
#     really installs Fotobogen: it fetches the newest release from GitHub, installs its
#     packages, and builds it.
# It then shows the commits to the installer since its last release, asks for the version to
# be typed, and then for npm's two-factor code. What it publishes is the same tarball it
# installed and ran. Afterwards it reads the version back from npm and compares the checksum.

PACKAGE_NAME="create-fotobogen"
PACKAGE_DIR="create-fotobogen"
BRANCH="main"
TAG_PREFIX="create-fotobogen-v"
EXPECTED_FILES="CHANGELOG.md LICENSE README.md bin/create-fotobogen.mjs lib/plan.mjs package.json"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'
info() { echo -e "${GREEN}[publish]${NC} $1"; }
warn() { echo -e "${YELLOW}[publish]${NC} $1"; }
error() { echo -e "${RED}[publish]${NC} $1" >&2; }
die() {
  error "$1"
  exit 1
}

# ─── Arguments ──────────────────────────────────────────────────────

DRY_RUN=false
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=true ;;
    *) die "Unknown argument '$arg'. Usage: ./publish.sh [--dry-run]. The version comes from $PACKAGE_DIR/package.json; the two-factor code is asked for at the end." ;;
  esac
done

# Reads a field of the installer's package.json (it is "type": "module", so force CommonJS here).
pkg_field() {
  node --input-type=commonjs -e "const v = require('./$PACKAGE_DIR/package.json').$1; console.log(v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : v)"
}

# ─── Tidy up, whatever happens ──────────────────────────────────────

SCRATCH=""
cleanup() {
  # The scratch folder holds the tarball that gets published, so it stays until the very end.
  [[ -z "$SCRATCH" ]] || rm -rf "$SCRATCH"
}
trap cleanup EXIT

# ─── Preflight ──────────────────────────────────────────────────────

[[ -f package.json && -f "$PACKAGE_DIR/package.json" ]] || die "Run this from the Fotobogen root (the folder that holds $PACKAGE_DIR/)."
[[ "$(pkg_field name)" == "$PACKAGE_NAME" ]] || die "$PACKAGE_DIR/package.json isn't $PACKAGE_NAME."
command -v pnpm >/dev/null || die "pnpm is required (npm install -g pnpm@10)."
command -v git >/dev/null || die "git is required."

CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
[[ "$CURRENT_BRANCH" == "$BRANCH" ]] || die "Publish from $BRANCH (you're on $CURRENT_BRANCH). Merge the installer's changes to $BRANCH first."

if [[ -n "$(git status --porcelain)" ]]; then
  git status --short
  die "Uncommitted changes. Commit or stash them first."
fi

info "Checking that $BRANCH is up to date with origin..."
git fetch --quiet origin "$BRANCH" --tags
[[ "$(git rev-parse HEAD)" == "$(git rev-parse "origin/$BRANCH")" ]] ||
  die "$BRANCH and origin/$BRANCH differ. Pull first. (This script never pushes to $BRANCH.)"

if npm whoami >/dev/null 2>&1; then
  info "npm user: $(npm whoami)"
elif [[ "$DRY_RUN" == true ]]; then
  # Logging in writes a token to ~/.npmrc, and a dry run changes nothing.
  warn "Not logged in to npm. The dry run continues; a real publish will ask you to log in."
else
  warn "Not logged in to npm. Logging in now..."
  npm login
  info "npm user: $(npm whoami)"
fi

# ─── Which version ──────────────────────────────────────────────────

VERSION=$(pkg_field version)
[[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || die "The version in $PACKAGE_DIR/package.json is '$VERSION', not a plain x.y.z."

FIRST_TIME=false
if ! npm view "$PACKAGE_NAME" version >/dev/null 2>&1; then
  FIRST_TIME=true
  warn "$PACKAGE_NAME isn't on npm yet: this is its first publish."
fi
if npm view "$PACKAGE_NAME@$VERSION" version >/dev/null 2>&1; then
  die "$PACKAGE_NAME@$VERSION is already on npm. To release again, raise the version in $PACKAGE_DIR/package.json (and add it to its CHANGELOG.md) in a pull request, merge it to $BRANCH, and run this again."
fi
info "Version to publish: $VERSION"

TAG="$TAG_PREFIX$VERSION"
if git rev-parse -q --verify "refs/tags/$TAG" >/dev/null; then
  [[ "$(git rev-list -n 1 "$TAG")" == "$(git rev-parse HEAD)" ]] || die "Tag $TAG already exists on another commit."
  TAG_EXISTS=true
  info "Tag $TAG already marks this commit."
else
  TAG_EXISTS=false
fi

grep -qE "^## \[$VERSION\]" "$PACKAGE_DIR/CHANGELOG.md" ||
  die "$PACKAGE_DIR/CHANGELOG.md has no '## [$VERSION]' entry."
info "$PACKAGE_DIR/CHANGELOG.md has an entry for $VERSION."

# ─── CI status for this commit ──────────────────────────────────────

# Only a run that finished and passed counts. A run still going, none found, or no way to look
# (no GitHub CLI, or not logged in to it) stops a publish, and a dry run only warns.
CI_PROBLEM=""
if command -v gh >/dev/null && gh auth status >/dev/null 2>&1; then
  CI=$(gh run list --commit "$(git rev-parse HEAD)" --workflow ci.yml --limit 1 \
    --json status,conclusion --jq '.[0] | "\(.status) \(.conclusion)"' 2>/dev/null || true)
  case "$CI" in
    "completed success") info "CI passed for this commit." ;;
    "") CI_PROBLEM="GitHub gave no answer" ;;
    "null null") CI_PROBLEM="no CI run found" ;;
    *) CI_PROBLEM="${CI% }" ;;
  esac
else
  CI_PROBLEM="the GitHub CLI isn't installed or isn't logged in"
fi
if [[ -n "$CI_PROBLEM" ]]; then
  if [[ "$DRY_RUN" == true ]]; then
    warn "CI hasn't passed for this commit ($CI_PROBLEM). A publish would stop here."
  else
    die "CI hasn't passed for this commit ($CI_PROBLEM)."
  fi
fi

# ─── Nothing but its own two files ──────────────────────────────────

# No dependencies means there is nothing to lock and nothing of anyone else's to audit. No
# scripts means npm runs nothing when the package is installed.
for field in dependencies optionalDependencies peerDependencies bundledDependencies bundleDependencies scripts; do
  [[ -z "$(pkg_field "$field")" ]] || die "$PACKAGE_DIR/package.json has '$field'. The installer is published with none, so that it runs nothing but its own files."
done
[[ "$(pkg_field 'bin["create-fotobogen"]')" == "bin/create-fotobogen.mjs" ]] || die "$PACKAGE_DIR/package.json doesn't point 'create-fotobogen' at bin/create-fotobogen.mjs."
info "The installer has no dependencies and no scripts."

# ─── Tests ──────────────────────────────────────────────────────────

info "Installing the test tools..."
pnpm install --frozen-lockfile
info "Running the installer's tests..."
pnpm exec vitest run tests/unit/create-fotobogen.test.ts tests/unit/create-fotobogen-run.test.ts
for file in "$PACKAGE_DIR/bin/create-fotobogen.mjs" "$PACKAGE_DIR/lib/plan.mjs"; do
  node --check "$file" || die "$file does not parse."
done
[[ -z "$(git status --porcelain)" ]] || die "The checks changed the tree:"$'\n'"$(git status --short)"

# ─── What's in the package ──────────────────────────────────────────

info "Checking the packed files..."
FILES=$(cd "$PACKAGE_DIR" && npm pack --dry-run --json --ignore-scripts | node --input-type=commonjs -e '
  const [pack] = JSON.parse(require("fs").readFileSync(0, "utf8"));
  console.log(pack.files.map((f) => f.path).sort().join(" "));
')
# Exactly these and no others, so a file taken in by mistake is found here and not published.
[[ "$FILES" == "$EXPECTED_FILES" ]] ||
  die "The package would hold: $FILES"$'\n'"It should hold exactly: $EXPECTED_FILES"
head -1 "$PACKAGE_DIR/bin/create-fotobogen.mjs" | grep -q '^#!/usr/bin/env node' || die "bin/create-fotobogen.mjs has no #!/usr/bin/env node line."
info "$(wc -w <<<"$FILES" | tr -d ' ') files, exactly the ones expected."

# ─── Install the real tarball and run it ────────────────────────────

info "Installing the packed tarball in an empty project..."
SCRATCH=$(mktemp -d)
(cd "$PACKAGE_DIR" && npm pack --ignore-scripts --pack-destination "$SCRATCH" >/dev/null)
TARBALL=$(ls "$SCRATCH"/*.tgz)
(
  # Each step says "|| exit 1": inside "( ... ) || die", a failing command does not stop the rest by itself.
  cd "$SCRATCH" || exit 1
  npm init -y >/dev/null || exit 1
  npm install --ignore-scripts --no-audit --no-fund "$TARBALL" >/dev/null || exit 1
  INSTALLED=$(npx --no-install create-fotobogen --version) || exit 1
  [[ "$INSTALLED" == "$VERSION" ]] || {
    echo "create-fotobogen --version printed '$INSTALLED', expected '$VERSION'" >&2
    exit 1
  }
  npx --no-install create-fotobogen --help | grep -q 'npx create-fotobogen@latest' || {
    echo "create-fotobogen --help did not print its usage" >&2
    exit 1
  }
) || die "The packed tarball didn't install and run."
info "The packed tarball installs, and create-fotobogen --version prints $VERSION."

# The real thing, from the tarball: fetch the newest Fotobogen from GitHub, install its packages,
# build it. This is what someone typing the one line gets, and it takes a few minutes.
info "Installing Fotobogen for real with the packed installer (a few minutes)..."
(
  cd "$SCRATCH" || exit 1
  # Through npx, as someone typing the one line runs it: npx changes the environment it is run in.
  npx --no-install create-fotobogen trial-install --yes || {
    echo "the installer stopped with an error (printed above)" >&2
    exit 1
  }
  [[ -f trial-install/.output/server/index.mjs ]] || {
    echo "the installer finished, but there is no built server in trial-install/.output" >&2
    exit 1
  }
  WANT=$(git -C trial-install describe --tags --exact-match 2>/dev/null || true)
  GOT=$(node --input-type=commonjs -e "console.log(require('./trial-install/package.json').version)") || exit 1
  [[ "$WANT" == "v$GOT" ]] || {
    echo "the install is at '$WANT' but its package.json says '$GOT'" >&2
    exit 1
  }
  echo "$GOT" >"$SCRATCH/installed-version"
) || die "The packed installer did not install Fotobogen."
info "The packed installer fetched, installed, and built Fotobogen $(cat "$SCRATCH/installed-version")."
rm -rf "$SCRATCH/trial-install"

# ─── Dry run ────────────────────────────────────────────────────────

info "npm publish --dry-run..."
npm publish "$TARBALL" --dry-run --access public --ignore-scripts

# What changed in the installer since its last release, and who made it: shown by a dry run as
# well as a publish, to look over before anything goes out. A commit's author and subject are
# anyone's words, so a control character in them is shown as an escape.
LAST_TAG=$(git describe --tags --abbrev=0 --match "$TAG_PREFIX*" 2>/dev/null || true)
if [[ -n "$LAST_TAG" && "$LAST_TAG" != "$TAG" ]]; then
  info "The commits to the installer since $LAST_TAG, and who made them:"
  RANGE="$LAST_TAG..HEAD"
else
  info "The commits to the installer so far, and who made them:"
  RANGE="HEAD"
fi
git log --format='  %h  %an  %s' "$RANGE" -- "$PACKAGE_DIR" publish.sh |
  node --input-type=commonjs -e '
    const text = require("fs").readFileSync(0, "utf8");
    const shown = (c) => "\\u{" + c.codePointAt(0).toString(16) + "}";
    process.stdout.write(text.replace(/(?![\n\t])[\p{Cc}\p{Cf}\u{2028}\u{2029}]/gu, shown));
  '

if [[ "$DRY_RUN" == true ]]; then
  info "Dry run complete. Nothing was published or changed."
  exit 0
fi

# ─── Confirm ────────────────────────────────────────────────────────

echo ""
if [[ "$FIRST_TIME" == true ]]; then
  warn "About to publish $PACKAGE_NAME@$VERSION for the FIRST TIME (public). A version published to npm cannot be published again, even after it is removed."
else
  warn "About to publish $PACKAGE_NAME@$VERSION. A version published to npm cannot be published again, even after it is removed."
fi
read -r -p "To publish it, type the version ($VERSION): " REPLY
[[ "$REPLY" == "$VERSION" ]] || {
  info "Aborted. Nothing was published."
  exit 0
}

# ─── Publish ────────────────────────────────────────────────────────

# npm asks every publish for a fresh two-factor code, and a code lasts about 30 seconds, so it
# is asked for now, after every check and the typed version. With no code, npm prints a link
# to approve the publish in a browser, and waits. Anything else stops here, nothing published.
echo ""
echo "npm needs to know it is you. Either:"
echo "  - type the 6-digit code from your authenticator app, or"
echo "  - press Enter, and npm will print a link to approve this in your browser."
read -r -p "Code (or Enter for the link): " OTP || OTP=""

# The tarball that was installed and run above, not a new one packed from the folder.
if [[ "$OTP" =~ ^[0-9]{6}$ ]]; then
  npm publish "$TARBALL" --access public --ignore-scripts --otp "$OTP" ||
    die "npm did not publish it (a code lasts about 30 seconds, so it may have run out). Nothing was published. Run ./publish.sh again."
elif [[ -z "$OTP" ]]; then
  info "Open the link npm prints below, approve it, and come back here."
  npm publish "$TARBALL" --access public --ignore-scripts --auth-type=web ||
    die "npm did not publish it. Nothing was published. Run ./publish.sh again."
else
  die "That isn't a 6-digit code, so nothing was published. Run ./publish.sh again, and type npm's code or press Enter when it asks."
fi
info "Published $PACKAGE_NAME@$VERSION."

# ─── Read it back ───────────────────────────────────────────────────

# npm can take a little while to show a new version. What it then holds must be the tarball
# that was tested here: the same checksum.
LOCAL_SUM=$(node --input-type=commonjs -e '
  const { createHash } = require("crypto");
  console.log(createHash("sha1").update(require("fs").readFileSync(process.argv[1])).digest("hex"));
' "$TARBALL")
REMOTE_SUM=""
for _ in 1 2 3 4 5 6 7 8 9 10 11 12; do
  REMOTE_SUM=$(npm view "$PACKAGE_NAME@$VERSION" dist.shasum 2>/dev/null || true)
  [[ -n "$REMOTE_SUM" ]] && break
  sleep 5
done
if [[ -z "$REMOTE_SUM" ]]; then
  warn "npm isn't showing $VERSION yet. Check in a minute: npm view $PACKAGE_NAME@$VERSION"
elif [[ "$REMOTE_SUM" == "$LOCAL_SUM" ]]; then
  info "npm holds $PACKAGE_NAME@$VERSION, with the checksum of the tarball tested here."
else
  error "npm holds $PACKAGE_NAME@$VERSION with checksum $REMOTE_SUM, but the tarball tested here is $LOCAL_SUM. Look into this before telling anyone to use it."
fi

# ─── Tag ────────────────────────────────────────────────────────────

# Only the tag is pushed. Nothing is committed and no branch is pushed, so no site is built.
if [[ "$TAG_EXISTS" == false ]]; then
  git tag -a "$TAG" -m "$PACKAGE_NAME $VERSION"
fi
if ! git push origin "$TAG"; then
  error "Published to npm, but pushing the tag failed. Push it by hand:"
  error "  git push origin $TAG"
  exit 1
fi

echo ""
info "Done: $PACKAGE_NAME@$VERSION"
info "npm: https://www.npmjs.com/package/$PACKAGE_NAME"
info "Anyone can now install Fotobogen with: npx $PACKAGE_NAME@latest"
