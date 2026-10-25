import { logger } from "./logger";

export interface ErrorReporter {
  report(error: unknown, context?: Record<string, unknown>): void;
}

// Free default (ADR 0008): structured log. A different reporter can be swapped in here.
export const errorReporter: ErrorReporter = {
  report(error, context) {
    logger.error({ err: error, ...context }, "unexpected error");
  },
};
