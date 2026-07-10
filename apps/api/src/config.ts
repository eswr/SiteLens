/** API version reported by the health endpoints. */
export const API_VERSION = '0.1.0';

export interface AppConfig {
  port: number;
  nodeEnv: string;
  webOrigin: string;
  isProduction: boolean;
}

/** Read runtime configuration from the environment, with safe defaults. */
export function loadConfig(): AppConfig {
  const nodeEnv = process.env.NODE_ENV ?? 'development';
  const parsedPort = Number(process.env.PORT);
  const port = Number.isFinite(parsedPort) && parsedPort > 0 ? parsedPort : 4000;
  const webOrigin = process.env.WEB_ORIGIN ?? 'http://localhost:5173';
  return {
    port,
    nodeEnv,
    webOrigin,
    isProduction: nodeEnv === 'production',
  };
}
