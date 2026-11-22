#!/bin/bash
# Node.js for this user only (no admin, no Homebrew), when the computer has no Node 20+. macOS and Linux.
# Installs Node 24 LTS from nodejs.org into ~/roblox-shorts/tools/node, checked against nodejs.org's SHASUMS256.txt.
# Prints one plain line per step; the last line is  NODE=<path to node>  or  FAILED: <reason>.
set -u
T="$HOME/roblox-shorts/tools"
fail() { echo "FAILED: $1"; exit 1; }
if command -v node >/dev/null && node -e 'process.exit(Number(process.versions.node.split(".")[0]) < 20 ? 1 : 0)' 2>/dev/null; then echo "NODE=$(command -v node)"; exit 0; fi
if "$T/node/bin/node" -e 'process.exit(Number(process.versions.node.split(".")[0]) < 20 ? 1 : 0)' 2>/dev/null; then echo "NODE=$T/node/bin/node"; exit 0; fi
mkdir -p "$T" || fail "couldn't create $T"
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
get() { curl -fsSL --retry 3 --retry-delay 2 -o "$2" "$1" && return 0; curl -fsI --max-time 10 https://nodejs.org >/dev/null 2>&1 || fail "no internet connection. Connect, then try again."; fail "couldn't download $(basename "$1"). Try again in a minute."; }
sha() { if command -v shasum >/dev/null; then shasum -a 256 "$1" | cut -d' ' -f1; else sha256sum "$1" | cut -d' ' -f1; fi; }
case "$(uname -s)" in Darwin) OS=darwin ;; Linux) OS=linux ;; *) fail "this system isn't supported." ;; esac
case "$(uname -m)" in arm64|aarch64) ARCH=arm64 ;; x86_64|amd64) ARCH=x64 ;; *) fail "this processor isn't supported." ;; esac
echo "Getting Node.js…"
get "https://nodejs.org/dist/latest-v24.x/SHASUMS256.txt" "$TMP/sums"
line=$(grep -E "node-v[0-9.]+-$OS-$ARCH\.tar\.gz\$" "$TMP/sums" | head -1); [ -n "$line" ] || fail "couldn't find Node.js for this computer."
f=$(echo "$line" | awk '{print $2}')
get "https://nodejs.org/dist/latest-v24.x/$f" "$TMP/$f"
[ "$(sha "$TMP/$f")" = "$(echo "$line" | awk '{print $1}')" ] || fail "the download didn't match its official checksum. Try again."
rm -rf "$T/node" && mkdir -p "$T/node" && tar -xzf "$TMP/$f" -C "$T/node" --strip-components 1 || fail "couldn't unpack Node.js."
echo "NODE=$T/node/bin/node"
