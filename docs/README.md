# Meadow Connection Meadow Endpoints

A meadow connection that fronts a remote [meadow-endpoints](https://fable-retold.github.io/meadow-endpoints/) REST API as a local meadow data source. It pairs with the in-meadow `Meadow-Provider-MeadowEndpoints` provider: the provider does the HTTP work, and this module is the connection-manager-shaped wrapper that owns the configuration shape, holds the shared cookie/header state, and logs into a remote authentication endpoint at connect time.

The result is that a consumer which already speaks meadow -- a beacon, a CLI, a service -- can pick `Type: 'MeadowEndpoints'` and read and write through someone else's meadow-endpoints API instead of a direct database connection.

## When to Use It

You have a process that speaks meadow and you want it to read and write through a remote meadow-endpoints API instead of a direct DB connection. The canonical case is a [retold-databeacon](https://fable-retold.github.io/retold-databeacon/) fronting the Headlight Platform API, where the authenticated user's session scopes data per customer -- the beacon never has to handle `IDCustomer` itself.

## What It Is (and Isn't)

This module is a **relay wrapper**, not a database driver. It does not issue the meadow CRUD requests itself -- that HTTP work lives in the meadow core provider `Meadow-Provider-MeadowEndpoints`. This module supplies three things around that provider:

- **Configuration shape** -- it resolves and normalizes the server address, port, protocol, endpoint prefix, headers, cookies, and authentication block.
- **Shared cookie / header state** -- it projects its resolved config onto `fable.settings.MeadowEndpoints`, sharing the `Headers` and `Cookies` objects by reference so the provider sees cookies the moment they are captured.
- **Authentication** -- at connect time it logs into a remote auth endpoint and harvests the session cookie, so every downstream meadow request carries the right session.

See [Architecture](architecture.md) for the full request flow.

## Install

```bash
npm install meadow-connection-meadow-endpoints
```

The dependency `meadow` is the data access layer this connection feeds, and `simple-get` (bundled) is used for the authentication request. The form schema file is pure data and safe to `require()` even when those are not present.

## Quick Look

Through [meadow-connection-manager](https://fable-retold.github.io/meadow-connection-manager/), a connection is just a config object with a `Type`:

```json
{
	"Type": "MeadowEndpoints",
	"Config":
	{
		"ServerProtocol": "https",
		"ServerAddress": "api.qa.headlight.com",
		"ServerPort": 443,
		"ServerEndpointPrefix": "1.0/",
		"Authentication":
		{
			"UserName": "alice@example.com",
			"Password": "...",
			"CookieName": "SessionID",
			"AutoConnect": true
		}
	}
}
```

The manager maps `Type: 'MeadowEndpoints'` to this module, sets `fable.settings.MeadowEndpoints` from the config, instantiates the connection, and calls `connectAsync()`. From then on, meadow entities set to the `MeadowEndpoints` provider relay their CRUD through the remote API.

For a standalone walkthrough that instantiates the connection directly, see the [Quickstart](quickstart.md).

## Customer Scoping

Every meadow request issued by the provider carries the captured session cookie. The upstream API (Headlight, for example) enforces customer scoping based on that session, so the consumer process never needs to know `IDCustomer` -- whatever the authenticated user can see is what it serves. The auth response is exposed as `this.sessionInfo` for callers that want to read fields like `CustomerID` for their own decisions.

## Learn More

- [Quickstart](quickstart.md) -- Instantiate the connection and authenticate, step by step
- [Architecture](architecture.md) -- The relay design, request flow, and how it loads through the connection manager
- [Configuration & Authentication](configuration.md) -- Every config key, the form schema, and how the session scopes customers
- [API Reference](api.md) -- Methods and properties on the connection class
- [Meadow](https://fable-retold.github.io/meadow/) -- The data access layer, host of `Meadow-Provider-MeadowEndpoints`
- [Meadow Endpoints](https://fable-retold.github.io/meadow-endpoints/) -- The server framework this connection talks to
