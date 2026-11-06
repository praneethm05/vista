import { z } from 'zod';

const envSchema = z.object({
  MONGODB_URI: z.string().min(1, 'MONGODB_URI is missing. Copy .env.example to .env and fill it in.'),
  CLERK_SECRET_KEY: z.string().min(1, 'CLERK_SECRET_KEY is missing.'),
  CLERK_PUBLISHABLE_KEY: z.string().min(1, 'CLERK_PUBLISHABLE_KEY is missing.'),
  PORT: z.coerce.number().default(4000),
  CLIENT_ORIGIN: z.string().default('http://localhost:5173'),
});

export function loadEnv() {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error('\n✗ Invalid environment:\n' + parsed.error.issues.map((i) => `  - ${i.message}`).join('\n') + '\n');
    process.exit(1);
  }
  return parsed.data;
}
