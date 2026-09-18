export type ActionErrorCode = "VALIDATION" | "NOT_FOUND" | "CONFLICT" | "UPSTREAM" | "INTERNAL";

export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; code: ActionErrorCode; message: string };

/** Erreur métier typée, traduite en ActionResult par les server actions. */
export class DomainError extends Error {
  constructor(
    readonly code: ActionErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "DomainError";
  }
}

export const ok = <T>(data: T): ActionResult<T> => ({ ok: true, data });
export const fail = (code: ActionErrorCode, message: string): ActionResult<never> => ({
  ok: false,
  code,
  message,
});
