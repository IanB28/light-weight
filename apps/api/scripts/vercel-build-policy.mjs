export function shouldVerifyProductionSchema(env = process.env) {
  return env.VERCEL_ENV === 'production';
}
