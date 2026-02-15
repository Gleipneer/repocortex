/**
 * Contract freeze: only this schema version is supported. Reject unknown versions.
 */
export const SUPPORTED_SCHEMA_VERSION = "1.0" as const;

export function assertSupportedVersion(
  schemaVersion: unknown,
  artifactName: string
): asserts schemaVersion is typeof SUPPORTED_SCHEMA_VERSION {
  if (schemaVersion !== SUPPORTED_SCHEMA_VERSION) {
    throw new Error(
      `Unsupported schemaVersion "${schemaVersion}" in ${artifactName}; supported: ${SUPPORTED_SCHEMA_VERSION}`
    );
  }
}
