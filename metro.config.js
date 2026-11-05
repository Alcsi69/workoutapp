// Metro config.
//
// The mobile bundle must never resolve `server/` or `admin-web/`: they are a
// standalone Node/web sibling with their own package.json + toolchain. The
// blockList keeps Metro from crawling or resolving anything under them (and
// their node_modules/dist trees) even if a stray import ever points there.
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

module.exports = config;
