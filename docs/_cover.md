# Meadow Connection Meadow Endpoints

> A remote meadow-endpoints REST API as a local meadow data source

A meadow connection provider that fronts a remote
[meadow-endpoints](https://fable-retold.github.io/meadow-endpoints/) server.
Point a beacon, CLI, or service at the Headlight Platform API (or any
meadow-endpoints server) and treat it like any other database connection.

- **Relay, not driver** -- wraps the in-meadow `Meadow-Provider-MeadowEndpoints`, supplying the config shape, authentication, and a shared cookie jar
- **Logs in for you** -- authenticates at connect time and harvests the session cookie
- **Customer scoping for free** -- the upstream session scopes data; the consumer never handles `IDCustomer`
- **Type dispatch** -- selected via `Type: 'MeadowEndpoints'` through meadow-connection-manager
- **Form schema included** -- pure-data field list for connection UIs

[Get Started](README.md)
[Quickstart](quickstart.md)
[Architecture](architecture.md)
[Configuration](configuration.md)
[API Reference](api.md)
[GitHub](https://github.com/fable-retold/meadow-connection-meadow-endpoints)

