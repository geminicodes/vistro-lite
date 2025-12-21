'use server';

type LogLevel = 'info' | 'warn' | 'error';

type MetaValue = Record<string, unknown> | string | number | boolean | null | undefined;
type MetaInput = MetaValue | MetaValue[];

const SENSITIVE_KEY_PATTERN = /(token|secret|authorization|apikey|password)/i;
const SENSITIVE_VALUE_PATTERN = /(Bearer\s+[A-Za-z0-9._-]+|sk_[A-Za-z0-9]+|token|secret)/i;

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  msg: string;
  meta?: unknown;
}

const redactValue = (value: unknown): unknown => {
  if (value == null) {
    return value;
  }

  if (typeof value === 'string') {
    return SENSITIVE_VALUE_PATTERN.test(value) ? '[REDACTED]' : value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item));
  }

  if (typeof value === 'object') {
    const record: Record<string, unknown> = {};

    for (const [key, val] of Object.entries(value)) {
      if (SENSITIVE_KEY_PATTERN.test(key)) {
        record[key] = '[REDACTED]';
        continue;
      }

      record[key] = redactValue(val);
    }

    return record;
  }

  return value;
};

const log = (level: LogLevel, msg: string, meta?: MetaInput): void => {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    msg,
  };

  if (meta !== undefined) {
    entry.meta = redactValue(meta);
  }

  const json = JSON.stringify(entry);

  switch (level) {
    case 'warn':
      console.warn(json);
      break;
    case 'error':
      console.error(json);
      break;
    case 'info':
    default:
      console.log(json);
  }
};

export const info = (msg: string, meta?: MetaInput): void => log('info', msg, meta);
export const warn = (msg: string, meta?: MetaInput): void => log('warn', msg, meta);
export const error = (msg: string, meta?: MetaInput): void => log('error', msg, meta);
