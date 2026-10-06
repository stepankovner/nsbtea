/** Ошибки API в едином виде: backend отдаёт {detail, code, field?, errors?, ...extra}. */

const SERVER_UNAVAILABLE = "Сервер временно недоступен. Попробуйте через минуту.";
const GENERIC = "Что-то пошло не так. Попробуйте ещё раз или обновите страницу.";
const NETWORK = "Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.";

export interface FieldError {
  field: string;
  message: string;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly field: string | null;
  readonly errors: FieldError[];
  readonly extra: Record<string, unknown>;

  constructor(
    status: number,
    message: string,
    code = "error",
    options: { field?: string | null; errors?: FieldError[]; extra?: Record<string, unknown> } = {},
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.field = options.field ?? null;
    this.errors = options.errors ?? [];
    this.extra = options.extra ?? {};
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function toApiError(status: number, body: unknown): ApiError {
  if (isRecord(body) && typeof body.detail === "string") {
    const { detail, code, field, errors, ...extra } = body;
    const list = Array.isArray(errors)
      ? errors.filter(
          (e): e is FieldError =>
            isRecord(e) && typeof e.field === "string" && typeof e.message === "string",
        )
      : [];
    return new ApiError(status, detail, typeof code === "string" ? code : `http_${status}`, {
      field: typeof field === "string" ? field : null,
      errors: list,
      extra,
    });
  }
  const message = status === 502 || status === 503 || status === 504 ? SERVER_UNAVAILABLE : GENERIC;
  return new ApiError(status, message, `http_${status}`);
}

/** Ошибки по полям: из списка валидации и из `field` ошибки предметной области. */
export function fieldErrors(error: ApiError): Record<string, string> {
  const result: Record<string, string> = {};
  for (const e of error.errors) result[e.field] ??= e.message;
  if (error.field) result[error.field] ??= error.message;
  return result;
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof TypeError) return NETWORK;
  return GENERIC;
}
