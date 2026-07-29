#!/bin/sh
# Runs nginx and the Node app as siblings under tini (PID 1). If either one dies, this
# script exits and tini reaps the container — Docker's restart policy then restarts the
# whole thing cleanly, instead of silently limping along with only one process alive
# (the old `nginx && node dist/index.js` form never noticed if nginx died after boot).
#
# Polls rather than `wait -n` — this runs under Alpine's BusyBox ash, which doesn't
# support bash's `wait -n`, and pulling in bash just for this isn't worth the image size.
set -e

nginx -g "daemon off;" &
NGINX_PID=$!

node dist/index.js &
NODE_PID=$!

while kill -0 "$NGINX_PID" 2>/dev/null && kill -0 "$NODE_PID" 2>/dev/null; do
  sleep 1
done

kill "$NGINX_PID" "$NODE_PID" 2>/dev/null || true
exit 1
