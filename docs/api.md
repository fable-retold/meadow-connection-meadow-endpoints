# API Reference

The connection class `MeadowConnectionMeadowEndpoints` extends `FableServiceProviderBase`. This page documents its public methods and properties as implemented in `source/Meadow-Connection-MeadowEndpoints.js`, plus the form schema export.

The class is the default export of the package:

```javascript
const libMeadowConnectionMeadowEndpoints = require('meadow-connection-meadow-endpoints');
```

---

## Constructor

```javascript
new MeadowConnectionMeadowEndpoints(pFable, pManifest, pServiceHash)
```

Standard Fable service constructor. The second argument doubles as the options object: config is read from `options.MeadowEndpoints` if present, otherwise from the options object itself, layered over `fable.settings.MeadowEndpoints` and the built-in defaults.

The constructor:

- Sets `serviceType` to `'MeadowConnectionMeadowEndpoints'`.
- Resolves and normalizes settings (string port, trailing-slash prefix).
- Initializes `headers`, `cookies`, `authentication`, `connected` (`false`), and `sessionInfo` (`null`).
- Projects the resolved config onto `fable.settings.MeadowEndpoints`, sharing `headers` and `cookies` by reference.
- If an `Authentication` block is present and `AutoConnect` is not `false`, kicks off `connect()` on a best-effort basis (errors are logged, not thrown).

When instantiated through `meadow-connection-manager`, the manager passes an empty options object and supplies the config via `fable.settings.MeadowEndpoints` instead.

---

## Properties

| Property | Type | Description |
|----------|------|-------------|
| `serviceType` | string | Always `'MeadowConnectionMeadowEndpoints'` |
| `settings` | object | The resolved endpoint settings (`ServerProtocol`, `ServerAddress`, `ServerPort`, `ServerEndpointPrefix`, ...) |
| `headers` | object | Outbound headers, shared by reference with `fable.settings.MeadowEndpoints.Headers` |
| `cookies` | string[] | Outbound cookies as `name=value` strings, shared by reference with `fable.settings.MeadowEndpoints.Cookies` |
| `authentication` | object \| null | The `Authentication` block, or `null` if none was configured |
| `connected` | boolean | `true` after a successful connect; `false` initially and after `disconnect()` |
| `sessionInfo` | object \| null | The parsed auth response after a successful authenticated connect; `null` otherwise |
| `schemaProvider` | null | Always `null` -- the upstream owns its schema (getter) |

---

## Methods

### `buildURL(pPath)`

Build the absolute URL for a path under the configured endpoint prefix. A leading `/` on `pPath` is trimmed. Returns a string of the form `<protocol>://<address>:<port>/<prefix><path>`.

```javascript
_Connection.buildURL('Project/123');
// 'https://api.qa.headlight.com:443/1.0/Project/123'
```

---

### `addCookie(pCookie)`

Append a fully-formed cookie value (for example `SessionID=abc`) to the shared outbound cookie list. No-ops on a non-string or empty value. The cookie is visible to the meadow provider on its next request.

---

### `setHeader(pName, pValue)`

Set or remove an outbound header. Passing `null` or `undefined` as the value removes the header; otherwise the value is stored as a string. No-ops on a non-string or empty name.

```javascript
_Connection.setHeader('X-Trace', 'abc123');
_Connection.setHeader('X-Trace', null); // removes it
```

---

### `connect()`

Synchronous connect compatibility shim. The standard meadow connection interface has a sync `connect()` for drivers that do not need the network; here the network call is asynchronous, so this kicks off `connectAsync()` with a no-op callback and returns immediately. Use `connectAsync()` when you need to wait or inspect the result.

---

### `connectAsync(fCallback)`

Authenticate against the configured remote endpoint and capture the session cookie.

```javascript
_Connection.connectAsync(
	(pError, pSessionInfo) =>
	{
		if (pError) return console.error(pError.message);
		console.log('connected =', _Connection.connected);
	});
```

Behavior:

- **No `Authentication` configured:** sets `connected = true` and calls back with `(null, null)`. The provider then sends whatever `Headers` / `Cookies` were pre-populated.
- **`Authentication` configured:** requires `UserName` and `Password` (else calls back with an Error). Sends a `POST` (or the configured `Method`) to `<prefix><Endpoint>` with a JSON body carrying the username/password under the configured field names, plus `Content-Type: application/json` and the current headers.

The callback signature is `(pError, pSessionInfo)`.

Error and rejection cases:

| Condition | Result |
|-----------|--------|
| Network/request error | `(pError, null)` |
| HTTP status outside 200-299 | Error: `auth failed (status N)` |
| Body `LoggedIn: false` | Error: `auth rejected - <reason>` (reason from body `Error`, else `rejected`) |
| Auth succeeded but no cookie captured | Error: no `<CookieName>` cookie returned, with `sessionInfo` passed through |
| Success | `(null, sessionInfo)`, `connected = true`, cookie appended to `cookies` |

On success the parsed body is stored as `sessionInfo`.

---

### `disconnect(fCallback)`

Best-effort teardown. Sets `connected = false`, clears the shared `cookies` array (in place, so the provider's shared reference is cleared too), and resets `sessionInfo` to `null` so a re-connect starts clean. Never throws; calls back with `(null)`.

```javascript
_Connection.disconnect(
	() => console.log('Disconnected.'));
```

---

### `listTables(fCallback)`

Discovery via meadow-endpoints is not a generic operation, so this calls back with `(null, [])`. Callers that want introspection should hit the upstream's documented routes.

---

### `introspectDatabaseSchema(fCallback)`

Not supported -- the upstream owns its own schema. Calls back with an `Error`.

---

## Form Schema Export

The form schema is a separate pure-data module, safe to `require()` without `simple-get` / `meadow`:

```javascript
const libFormSchema = require('meadow-connection-meadow-endpoints/source/Meadow-Connection-MeadowEndpoints-FormSchema.js');

libFormSchema.Provider;    // 'MeadowEndpoints'
libFormSchema.DisplayName; // 'Meadow Endpoints (REST)'
libFormSchema.Fields;      // array of field descriptors
```

See [Configuration & Authentication](configuration.md) for the full field table. `meadow-connection-manager` loads this file via `getProviderFormSchema('MeadowEndpoints')` without triggering the driver `require()`.

---

## Notes on the Relay

The meadow CRUD requests (Create / Read / Update / Delete / Count) are **not** methods on this class -- they are implemented in the meadow core provider `Meadow-Provider-MeadowEndpoints`, which reads the shared `fable.settings.MeadowEndpoints` (including the cookie jar this class maintains). See [Architecture](architecture.md) for that split.
