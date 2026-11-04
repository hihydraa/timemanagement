import type { Context } from 'hono';
import type { ZodType, ZodTypeDef } from 'zod';

export class ApiError extends Error {
  constructor(
    public status: 400 | 401 | 403 | 404 | 409 | 413 | 429,
    public code: string,
    message: string,
    /** วินาทีที่ควรรอ (ใช้กับ 429) */
    public retryAfter?: number,
  ) {
    super(message);
  }
}

export function errorBody(code: string, message: string) {
  return { error: { code, message } };
}

export async function parseJson<T>(
  c: Context,
  schema: ZodType<T, ZodTypeDef, unknown>,
): Promise<T> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    throw new ApiError(400, 'invalid_json', 'รูปแบบ JSON ไม่ถูกต้อง');
  }
  const r = schema.safeParse(raw);
  if (!r.success) {
    const first = r.error.issues[0];
    throw new ApiError(
      400,
      'validation_error',
      `${first?.path.join('.') || 'body'}: ${first?.message ?? 'ข้อมูลไม่ถูกต้อง'}`,
    );
  }
  return r.data;
}

export function parseQuery<T>(c: Context, schema: ZodType<T, ZodTypeDef, unknown>): T {
  const r = schema.safeParse(c.req.query());
  if (!r.success) {
    const first = r.error.issues[0];
    throw new ApiError(
      400,
      'validation_error',
      `${first?.path.join('.') || 'query'}: ${first?.message ?? 'พารามิเตอร์ไม่ถูกต้อง'}`,
    );
  }
  return r.data;
}
