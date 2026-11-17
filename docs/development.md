# Development and validation

[Overview](../README.md) | [Preview guide](preview-guide.md)

The extension uses the published `abctools@0.3.0` npm package, including its
portable preferences, configuration APIs and named template expansion.
No sibling checkout is required, and no template parser is duplicated in the
extension.

Development tooling requires Node.js 20.19+, 22.13+, or 24+. This does not
change the extension's VS Code runtime requirement. ESLint and TypeScript-ESLint
use a patched minimatch 11 override because their declared minimatch 10
dependencies are covered by GHSA-g3hv-75wg-m249. Revisit the override when
upstream dependencies adopt the fix. Asset copying uses Node's filesystem APIs
rather than the legacy copyfiles/glob dependency chain.

```sh
npm install
npm test
npm run test:host
```

The test suite covers the portable store and bundled renderer. `test:host`
requires the installed `code` executable and a display; it uses an isolated
profile for activation/preview/bridge smoke tests.

## Debugging

Press F5 to launch the Extension Development Host. The workspace disables
`debug.javascript.enableNetworkView` to avoid an intermittent debugger startup
crash in VS Code 1.146.0 / JavaScript Debugger 1.140.1
([vscode-js-debug#2462](https://github.com/microsoft/vscode-js-debug/issues/2462)).
The affected host exits with code 134 before extension activation. This disables
the debugger's network inspector only; breakpoints, ABC preview restoration and
playback remain enabled. Retry several F5 launches to check whether this
workaround resolves a local startup crash.

## Browser tests

```sh
npx playwright install chromium
npm run test:grid-browser
npm run test:measure-browser
```

An existing Chrome executable can instead be selected with
`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`.

For a local browser harness running the actual webview scripts with an invented
tune:

```sh
node test/preview-server.mjs
```

Open the printed loopback URL. The harness uses temporary personal storage and
does not load library material. It is not an extension-host integration test.

## Shared ABC configuration

Store frequently used `%%` directives in per-folder `.abcconfig` files, managed
through [abctools](https://github.com/laurent-yin/abctools).
See [choro-abc](https://github.com/laurent-yin/choro-abc) for a real-world
library using abctools to manage and export ABC notation.
