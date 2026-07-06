export type SpushErrorCode =
  | "CONFIG_INVALID"
  | "SECRET_ENV_MISSING"
  | "CONNECT_FAILED"
  | "AUTH_FAILED"
  | "TRANSFER_FAILED"
  | "VERIFY_FAILED"
  | "INTERNAL_ERROR";

export type ErrorIssue = {
  path: string;
  message: string;
};

const exitCodes: Record<SpushErrorCode, number> = {
  CONFIG_INVALID: 2,
  SECRET_ENV_MISSING: 2,
  CONNECT_FAILED: 3,
  AUTH_FAILED: 3,
  TRANSFER_FAILED: 4,
  VERIFY_FAILED: 5,
  INTERNAL_ERROR: 1,
};

export class SpushError extends Error {
  readonly code: SpushErrorCode;
  readonly issues: ErrorIssue[];
  readonly exitCode: number;

  constructor(code: SpushErrorCode, message: string, issues: ErrorIssue[] = []) {
    super(message);
    this.name = "SpushError";
    this.code = code;
    this.issues = issues;
    this.exitCode = exitCodes[code];
  }
}

export function toSpushError(error: unknown): SpushError {
  if (error instanceof SpushError) {
    return error;
  }

  if (error instanceof Error) {
    return new SpushError("INTERNAL_ERROR", error.message);
  }

  return new SpushError("INTERNAL_ERROR", "Unexpected internal error");
}
