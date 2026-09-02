/**
 * Placeholder secret resolution until a real secret store is integrated — same convention as
 * wendeware/credentials.ts. `connectors.secret_reference` never holds a plaintext credential
 * (CLAUDE.md), only a reference this function resolves at call time.
 *
 * Convention: "env:IDENTIFIER_VAR,env:SECRET_VAR" — two env var *names*, comma-separated.
 */
export interface ScholtCredentials {
  readonly identifier: string;
  readonly secret: string;
}

const ENV_PREFIX = "env:";

export function resolveCredentialsFromEnv(secretReference: string): ScholtCredentials {
  const parts = secretReference.split(",").map((p) => p.trim());
  if (parts.length !== 2) {
    throw new Error(`Invalid secret_reference "${secretReference}" — expected "env:IDENTIFIER_VAR,env:SECRET_VAR"`);
  }

  const [identifierVar, secretVar] = parts.map((p) => {
    if (!p.startsWith(ENV_PREFIX)) {
      throw new Error(`Invalid secret_reference part "${p}" — expected an "${ENV_PREFIX}..." entry`);
    }
    return p.slice(ENV_PREFIX.length);
  }) as [string, string];

  const identifier = process.env[identifierVar];
  const secret = process.env[secretVar];
  if (!identifier || !secret) {
    throw new Error(`Environment variables "${identifierVar}" and/or "${secretVar}" are not set`);
  }

  return { identifier, secret };
}

/** `Authorization: Basic base64(identifier:secret)` (docs/data-requirements-scholt.md). */
export function toBasicAuthHeader(creds: ScholtCredentials): string {
  return `Basic ${Buffer.from(`${creds.identifier}:${creds.secret}`).toString("base64")}`;
}
