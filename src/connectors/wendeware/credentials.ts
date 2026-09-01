/**
 * Placeholder secret resolution until a real secret store (Vault, AWS Secrets Manager, ...) is
 * integrated. `connectors.secret_reference` still never holds a plaintext credential (CLAUDE.md)
 * — it holds a reference this function resolves at call time, not a value persisted anywhere.
 *
 * Convention: "env:CLIENT_ID_VAR,env:CLIENT_SECRET_VAR" — two env var *names*, comma-separated.
 */
export interface WendewareCredentials {
  readonly clientId: string;
  readonly clientSecret: string;
}

const ENV_PREFIX = "env:";

export function resolveCredentialsFromEnv(secretReference: string): WendewareCredentials {
  const parts = secretReference.split(",").map((p) => p.trim());
  if (parts.length !== 2) {
    throw new Error(
      `Invalid secret_reference "${secretReference}" — expected "env:CLIENT_ID_VAR,env:CLIENT_SECRET_VAR"`,
    );
  }

  const [clientIdVar, clientSecretVar] = parts.map((p) => {
    if (!p.startsWith(ENV_PREFIX)) {
      throw new Error(`Invalid secret_reference part "${p}" — expected an "${ENV_PREFIX}..." entry`);
    }
    return p.slice(ENV_PREFIX.length);
  }) as [string, string];

  const clientId = process.env[clientIdVar];
  const clientSecret = process.env[clientSecretVar];
  if (!clientId || !clientSecret) {
    throw new Error(`Environment variables "${clientIdVar}" and/or "${clientSecretVar}" are not set`);
  }

  return { clientId, clientSecret };
}
