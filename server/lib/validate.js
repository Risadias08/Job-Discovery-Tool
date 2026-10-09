import { z } from 'zod';

export class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/** Parse `data` with a zod schema or throw a 400 HttpError. */
export function parse(schema, data) {
  const r = schema.safeParse(data);
  if (!r.success) {
    const msg = r.error.issues.map((i) => `${i.path.join('.') || 'input'}: ${i.message}`).join('; ');
    throw new HttpError(400, 'invalid_input', msg);
  }
  return r.data;
}

export const idParam = z.coerce.number().int().positive();
export { z };
