#!/bin/bash
# Build: bundle ES modules into one IIFE (works on older iOS Safari / in-app browsers) and lower CSS
set -e
cd "$(dirname "$0")/public"
E=${ESBUILD:-/opt/data/tools/esbuild/node_modules/.bin/esbuild}
V=$(date +%s)
$E js/app.js --bundle --format=iife --target=es2017,safari12,chrome64 --minify --sourcemap --outfile=app.bundle.js --log-level=warning
$E styles.css --target=safari12,chrome64 --minify --outfile=app.bundle.css --log-level=warning
sed -i "s/const V = 'shukr-[^']*'/const V = 'shukr-$V'/" sw.js
sed -i -E "s#/app\.bundle\.(js|css)\?v=[0-9]+#/app.bundle.\1?v=$V#g" index.html sw.js
echo "built v=$V"; ls -la app.bundle.*
