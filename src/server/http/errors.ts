export class HttpError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields?: Record<string, string>;

  constructor(status: number, code: string, message: string, fields?: Record<string, string>) {
    super(message);
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

export function isDatabaseUnavailable(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const text = `${error.name} ${error.message}`.toLowerCase();
  return (
    text.includes("econnrefused") ||
    text.includes("connection refused") ||
    text.includes("connection terminated") ||
    text.includes("connect econnreset") ||
    text.includes("database is closed") ||
    text.includes("the database system is") ||
    text.includes("unavailable") ||
    text.includes("socket") ||
    text.includes("closed unexpectedly")
  );
}
