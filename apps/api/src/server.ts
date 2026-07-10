import { buildApp } from './app';
import { loadConfig } from './config';

async function main(): Promise<void> {
  const config = loadConfig();
  const app = await buildApp({
    webOrigin: config.webOrigin,
    isProduction: config.isProduction,
  });

  try {
    await app.listen({ port: config.port, host: '0.0.0.0' });
    console.log(
      `sitelens-api listening on http://0.0.0.0:${config.port} (${config.nodeEnv})`,
    );
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

void main();
