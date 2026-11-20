#!/usr/bin/env bash
# Fills the trip window into the page, renders today's share card, and writes the site to _site/.
#   ARRIVE='2030-01-01T09:00+05:30' LEAVE='2030-01-15T18:00+05:30' ./build.sh
# Any ISO 8601 date-time with an offset works. Needs Chrome (set CHROME to override).
set -euo pipefail

: "${ARRIVE:?set ARRIVE, e.g. 2030-01-01T09:00+05:30}"
: "${LEAVE:?set LEAVE, e.g. 2030-01-15T18:00+05:30}"

# Which card today: the state, plus how close for "before". A new name per card
# means link previews pick up the change instead of serving a cached image.
KEY=$(node -e '
  const [a, l] = process.argv.slice(1).map(Date.parse), t = Date.now(), DAY = 864e5;
  if (isNaN(a) || isNaN(l)) { console.error("ARRIVE/LEAVE must be ISO date-times"); process.exit(1); }
  if (a >= l) { console.error("ARRIVE must be before LEAVE"); process.exit(1); }
  if (t >= l) console.log("after");
  else if (t >= a) console.log("here");
  else { const d = (a - t) / DAY; console.log("before-" + (d > 30 ? 1 : d > 10 ? 2 : d > 2 ? 3 : 4)); }
' "$ARRIVE" "$LEAVE")
OG="og-$KEY.png"

rm -rf _site && mkdir -p _site
cp -R fonts CNAME .nojekyll _site/
sed -e "s|__ARRIVE__|$ARRIVE|" -e "s|__LEAVE__|$LEAVE|" -e "s|__OG__|$OG|" index.html > _site/index.html

CHROME=${CHROME:-$(command -v google-chrome || command -v chromium || echo "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome")}
PORT=${PORT:-8799}
python3 -m http.server "$PORT" --directory _site >/dev/null 2>&1 &
SERVER=$!
trap 'kill $SERVER 2>/dev/null || true' EXIT
for _ in $(seq 50); do curl -sf "http://localhost:$PORT/" >/dev/null && break; sleep 0.1; done

CHROME="$CHROME" node render-card.mjs "http://localhost:$PORT/#card" "$PWD/_site/$OG"
test -s "_site/$OG" || { echo "share card render failed" >&2; exit 1; }

echo "built _site/ ($ARRIVE → $LEAVE, card: $OG)"
