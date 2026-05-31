/**
 * Connection form schema for MeadowEndpoints.
 *
 * Consumed by:
 *   meadow-connection-manager#getProviderFormSchema('MeadowEndpoints')
 *   ...and any UI that wants to render a "connect to a meadow-endpoints
 *   API" form (retold-databeacon's Connections panel, retold-data-mapper,
 *   the lab Stack form, etc.) without re-encoding the field list.
 *
 * Pure data — safe to require() even when simple-get / meadow are not
 * installed.
 */
'use strict';

module.exports =
	{
		Provider:    'MeadowEndpoints',
		DisplayName: 'Meadow Endpoints (REST)',
		Description: 'Connect to a remote meadow-endpoints REST API (e.g. the Headlight Platform API). Customer scoping is enforced by the authenticated upstream session.',
		Fields:
		[
			{ Name: 'ServerProtocol',       Label: 'Protocol',       Type: 'Select', Default: 'https', Required: true, Options: [ 'https', 'http' ] },
			{ Name: 'ServerAddress',        Label: 'Host',           Type: 'String', Default: '127.0.0.1', Required: true, Placeholder: '127.0.0.1' },
			{ Name: 'ServerPort',           Label: 'Port',           Type: 'Number', Default: 443,    Required: true, Min: 1, Max: 65535 },
			{ Name: 'ServerEndpointPrefix', Label: 'Endpoint Prefix',Type: 'String', Default: '1.0/', Required: true, Help: 'Path prefix appended after the host. Trailing slash recommended.' },

			{ Name: 'Authentication.UserName',      Label: 'Username',         Type: 'String',   Group: 'Authentication', Help: 'Headlight LoginID. Sent as UserName on /Authenticate.' },
			{ Name: 'Authentication.Password',      Label: 'Password',         Type: 'Password', Group: 'Authentication' },
			{ Name: 'Authentication.Endpoint',      Label: 'Auth Endpoint',    Type: 'String',   Default: 'Authenticate', Group: 'Authentication' },
			{ Name: 'Authentication.Method',        Label: 'Auth Method',      Type: 'Select',   Default: 'POST', Options: [ 'POST', 'GET' ], Group: 'Authentication' },
			{ Name: 'Authentication.UserNameField', Label: 'Username Field',   Type: 'String',   Default: 'UserName', Group: 'Authentication', Help: 'Body field name carrying the username.' },
			{ Name: 'Authentication.PasswordField', Label: 'Password Field',   Type: 'String',   Default: 'Password', Group: 'Authentication' },
			{ Name: 'Authentication.CookieName',    Label: 'Session Cookie',   Type: 'String',   Default: 'SessionID', Group: 'Authentication', Help: 'Set-Cookie name to harvest from the auth response.' },
			{ Name: 'Authentication.AutoConnect',   Label: 'Auto-Connect',     Type: 'Boolean',  Default: true,        Group: 'Authentication', Help: 'Authenticate during construction. Disable to call connectAsync() yourself.' }
		]
	};
