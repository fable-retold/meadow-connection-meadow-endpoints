# Quickstart

This guide walks through pointing meadow at a remote meadow-endpoints REST API: install, configure, authenticate, and relay CRUD through the upstream server. Two paths are covered -- using the connection through [meadow-connection-manager](https://fable-retold.github.io/meadow-connection-manager/) (the usual case), and instantiating the connection directly.

---

## Prerequisites

- Node.js
- A reachable [meadow-endpoints](https://fable-retold.github.io/meadow-endpoints/) server (for example, the Headlight Platform API)
- Credentials for that server if it requires authentication

---

## Install

```bash
npm install meadow-connection-meadow-endpoints fable
```

---

## Path A: Through the Connection Manager (recommended)

The connection manager maps a `Type` string to the right connection module, sets up `fable.settings`, instantiates the provider, and connects it. You hand it a config object:

```javascript
const libFable = require('fable');
const libMeadowConnectionManager = require('meadow-connection-manager');

let _Fable = new libFable(
	{
		"Product": "BeaconExample",
		"ProductVersion": "1.0.0",
		"LogStreams": [ { "streamtype": "console" } ]
	});

_Fable.serviceManager.addAndInstantiateServiceType(
	'MeadowConnectionManager', libMeadowConnectionManager);

let tmpConnectionConfig =
	{
		Type: 'MeadowEndpoints',
		ServerProtocol: 'https',
		ServerAddress: 'api.qa.headlight.com',
		ServerPort: 443,
		ServerEndpointPrefix: '1.0/',
		Authentication:
		{
			UserName: 'alice@example.com',
			Password: 'wonderland',
			CookieName: 'SessionID'
		}
	};

_Fable.MeadowConnectionManager.connect('headlight-qa', tmpConnectionConfig,
	(pError, pConnection) =>
	{
		if (pError)
		{
			console.error('Connect failed:', pError.message);
			return;
		}
		console.log('Connected to the remote meadow-endpoints API.');
	});
```

The manager sets `fable.settings.MeadowEndpoints` from the config, instantiates this module, and calls `connectAsync()` -- which authenticates against the upstream `Authenticate` endpoint and captures the session cookie. From here, meadow entities set to the `MeadowEndpoints` provider relay through the remote API.

> The connection config keys (`Server*`, `Authentication.*`) are the same whether you nest them under a `Config` block in a stored connection record or pass them flat as shown above. See [Configuration & Authentication](configuration.md) for the full key list.

---

## Path B: Instantiate the Connection Directly

For a standalone process or a test, you can construct the connection without the manager. The constructor signature is the standard Fable service shape: `(pFable, pOptions, pServiceHash)`.

```javascript
const libFable = require('fable');
const libMeadowConnectionMeadowEndpoints = require('meadow-connection-meadow-endpoints');

let _Fable = new libFable(
	{
		"Product": "BeaconExample",
		"LogStreams": [ { "streamtype": "console" } ]
	});

let _Connection = new libMeadowConnectionMeadowEndpoints(
	_Fable,
	{
		ServerProtocol: 'https',
		ServerAddress: 'api.qa.headlight.com',
		ServerPort: 443,
		ServerEndpointPrefix: '1.0/',
		Authentication:
		{
			UserName: 'alice@example.com',
			Password: 'wonderland',
			AutoConnect: false
		}
	},
	'headlight-qa');
```

Options are read from `options.MeadowEndpoints` if present, otherwise from the options object itself. The resolved config is also projected onto `_Fable.settings.MeadowEndpoints` for the provider to read.

---

## Authenticating

If `Authentication.AutoConnect` is left at its default (`true`), the connection authenticates during construction on a best-effort basis -- it never throws out of the constructor, but logs an error and leaves `connected` false if auth fails.

To control timing, set `AutoConnect: false` and call `connectAsync()` yourself:

```javascript
_Connection.connectAsync(
	(pError, pSessionInfo) =>
	{
		if (pError)
		{
			console.error('Authentication failed:', pError.message);
			return;
		}

		console.log('Authenticated. connected =', _Connection.connected);
		// The auth response is available for scoping decisions:
		if (pSessionInfo)
		{
			console.log('Customer:', pSessionInfo.CustomerID);
		}
	});
```

On success, the harvested session cookie is appended to the shared cookie list, so every subsequent meadow request carries it. If no `Authentication` block is configured at all, `connectAsync()` just marks the connection connected and returns -- the provider then sends whatever `Headers` / `Cookies` you pre-populated.

---

## Relaying Meadow CRUD

Once connected, point a meadow entity at the `MeadowEndpoints` provider. The provider builds the request path and HTTP verb from the FoxHound `MeadowEndpoints` dialect and sends it with the shared cookies/headers:

```javascript
const libMeadow = require('meadow');

let tmpBookMeadow = libMeadow.new(_Fable, 'Book')
	.setProvider('MeadowEndpoints');

tmpBookMeadow.doReads(tmpBookMeadow.query,
	(pError, pQuery, pRecords) =>
	{
		if (pError) return console.error(pError);
		console.log(`Read ${pRecords.length} book(s) from the remote API.`);
	});
```

> The schema and routes are owned by the upstream meadow-endpoints server -- this connection does not generate DDL or introspect the remote schema. See [Configuration & Authentication](configuration.md) for the limits.

---

## Disconnecting

```javascript
_Connection.disconnect(
	(pError) =>
	{
		// Best-effort: clears the shared cookies and session info so a
		// re-connect starts clean. Never throws.
		console.log('Disconnected.');
	});
```

---

## Summary

| Step | What It Does |
|------|-------------|
| Configure | Set `Server*` + `Authentication` keys (manager config or constructor options) |
| Authenticate | `AutoConnect`, or call `connectAsync()` to log in and capture the session cookie |
| Relay CRUD | Set a meadow entity's provider to `'MeadowEndpoints'`; requests carry the session |
| Scope | The upstream session scopes data per customer; read `sessionInfo` if you need `CustomerID` |
| Disconnect | `disconnect()` clears the shared cookie jar |
