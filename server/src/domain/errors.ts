/** A known, expected failure with a friendly message the UI can show as-is. */
export class AppError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    message: string,
    public readonly fields?: Record<string, string>,
  ) {
    super(message);
  }
}

export const notFound = (what = 'Leave request') =>
  new AppError('NOT_FOUND', 404, `${what} not found.`);
