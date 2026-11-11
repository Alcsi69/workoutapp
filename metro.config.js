// Metro config.
//
// The mobile bundle must never resolve `server/` or `admin-web/`: they are a
// standalone Node/web sibling with their own package.json + toolchain. The
// blockList keeps Metro from crawling or resolving anything under them (and
// their node_modules/dist trees) even if a stray import ever points there.
//
// Web: expo-sqlite runs on wa-sqlite (SQLite compiled to WebAssembly), which
// needs `.wasm` treated as an asset and a cross-origin-isolated document
// (SharedArrayBuffer). The COEP/COOP headers below are applied by the dev
// server; production hosting must send the same headers (see the Caddyfile
// block in docs/DEPLOYMENT.md).
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(projectRoot);

config.resolver.blockList = [
  // Sibling projects (never part of the mobile bundle).
  new RegExp(`^${path.resolve(projectRoot, 'server')}[/\\\\].*$`),
  new RegExp(`^${path.resolve(projectRoot, 'admin-web')}[/\\\\].*$`),
  // Headless verification build output.
  new RegExp(`^${path.resolve(projectRoot, '.verify-build')}[/\\\\].*$`),
];

// expo-sqlite on web: ship the wa-sqlite WebAssembly binary as an asset.
config.resolver.assetExts.push('wasm');

// expo-sqlite on web: SharedArrayBuffer is only exposed to cross-origin
// isolated documents, so the dev server has to opt in.
config.server.enhanceMiddleware = (middleware) => {
  return (req, res, next) => {
    res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    middleware(req, res, next);
  };
};

module.exports = config;
