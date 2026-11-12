import { z } from 'zod';

export type Env = {
  nodeEnv: 'development' | 'test' | 'production';
  port: number;
  databaseUrl: string;
  /** Where the web is served, without a trailing slash: redirects and the CSRF origin check use it. */
  appOrigin: string;
  github: { clientId: string; clientSecret: string } | null;
  /** Numeric GitHub user ids allowed to sign in: a login can be renamed, an id cannot. */
  allowedGithubIds: ReadonlySet<string>;
  testLogin: boolean;
  sessionTtlDays: number;
  /**
   * `local` runs Python straight on this machine, without isolation: only for the author's own
   * code on their own computer. `disabled` turns the arena's judge off. Docker comes later.
   */
  judge: { mode: 'local' | 'disabled'; pythonBin: string | null };
};

/** The parsed configuration, injected by type wherever it is needed. */
export class AppConfig {
  constructor(readonly env: Env) {}
}

const isOrigin = (value: string) => {
  try {
    return new URL(value).origin === value;
  } catch {
    return false;
  }
};

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: z.string().regex(/^postgres(ql)?:\/\/\S+$/),
  APP_ORIGIN: z.string().refine(isOrigin),
  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),
  ALLOWED_GITHUB_IDS: z
    .string()
    .default('')
    .refine((value) => value.split(',').every((id) => id.trim() === '' || /^\d+$/.test(id.trim()))),
  AUTH_TEST_LOGIN: z.enum(['true', 'false']).default('false'),
  SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),
  JUDGE_MODE: z.enum(['local', 'disabled']).optional(),
  /** A Python interpreter; without it the judge uses `py -3` on Windows and `python3` elsewhere. */
  PYTHON_BIN: z.string().optional(),
});

/**
 * Validates the process configuration once, at boot. Errors name the invalid variables and never
 * their values, because a value may be a secret.
 */
export function parseEnv(raw: Record<string, string | undefined>): Env {
  // An empty variable counts as unset.
  const input = Object.fromEntries(Object.entries(raw).filter(([, value]) => value !== undefined && value !== ''));
  const result = schema.safeParse(input);
  if (!result.success) {
    const names = new Set(result.error.issues.map((issue) => String(issue.path[0])));
    throw new Error(`Invalid configuration: ${[...names].sort().join(', ')}`);
  }

  const values = result.data;
  const invalid = new Set<string>();
  const hasId = values.GITHUB_CLIENT_ID !== undefined;
  const hasSecret = values.GITHUB_CLIENT_SECRET !== undefined;
  if (hasId !== hasSecret) {
    invalid.add('GITHUB_CLIENT_ID');
    invalid.add('GITHUB_CLIENT_SECRET');
  }
  if (values.NODE_ENV === 'production') {
    if (!hasId) invalid.add('GITHUB_CLIENT_ID');
    if (!hasSecret) invalid.add('GITHUB_CLIENT_SECRET');
    if (values.AUTH_TEST_LOGIN === 'true') invalid.add('AUTH_TEST_LOGIN');
    // A server must never run submitted code without isolation.
    if (values.JUDGE_MODE === 'local') invalid.add('JUDGE_MODE');
  }
  if (invalid.size > 0) throw new Error(`Invalid configuration: ${[...invalid].sort().join(', ')}`);

  return {
    nodeEnv: values.NODE_ENV,
    port: values.PORT,
    databaseUrl: values.DATABASE_URL,
    appOrigin: values.APP_ORIGIN,
    github:
      values.GITHUB_CLIENT_ID !== undefined && values.GITHUB_CLIENT_SECRET !== undefined
        ? { clientId: values.GITHUB_CLIENT_ID, clientSecret: values.GITHUB_CLIENT_SECRET }
        : null,
    allowedGithubIds: new Set(
      values.ALLOWED_GITHUB_IDS.split(',')
        .map((id) => id.trim())
        .filter((id) => id !== ''),
    ),
    testLogin: values.AUTH_TEST_LOGIN === 'true',
    sessionTtlDays: values.SESSION_TTL_DAYS,
    judge: {
      mode: values.JUDGE_MODE ?? (values.NODE_ENV === 'production' ? 'disabled' : 'local'),
      pythonBin: values.PYTHON_BIN ?? null,
    },
  };
}
