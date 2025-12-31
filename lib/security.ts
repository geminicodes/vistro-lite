/* eslint-disable no-restricted-syntax */
'use server';

import { timingSafeEqual } from 'node:crypto';

export class HttpError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const safeTimingEqual = (a: string, b: string): boolean => {
  const aBuf = Buffer.from(a, 'utf8');
  const bBuf = Buffer.from(b, 'utf8');

  if (aBuf.length !== bBuf.length) {
    return false;
  }

  return timingSafeEqual(aBuf, bBuf);
};

export const getRequestId = (request: Request): string =>
  request.headers.get('x-request-id')?.trim() || crypto.randomUUID();

export const getClientIpHint = (request: Request): string | null => {
  const forwarded = request.headers.get('x-forwarded-for')?.trim();
  if (forwarded) {
    return forwarded.split(',')[0]?.trim() ?? null;
  }

  return request.headers.get('x-real-ip')?.trim() ?? null;
};

export const requireBearerApiKey = (request: Request, envName = 'TRANSLATE_API_KEY'): void => {
  const expected = process.env[envName]?.trim() ?? '';

  if (!expected) {
    throw new HttpError(
      500,
      'misconfigured',
      `${envName} is not configured. Refusing to run an unauthenticated endpoint.`,
    );
  }

  const auth = request.headers.get('authorization') ?? '';
  const match = /^Bearer\s+(.+)$/i.exec(auth);
  const received = match?.[1]?.trim() ?? '';

  if (!received || !safeTimingEqual(received, expected)) {
    throw new HttpError(401, 'unauthorized', 'Unauthorized.');
  }
};

