import { createApp } from './bootstrap';
import { loadConfig } from './config';

async function bootstrap() {
  const config = loadConfig();
  const app = await createApp(config);
  await app.listen(config.port, config.host);
}
bootstrap().catch(() => {
  console.error('Startup failed: check configuration and service logs');
  process.exitCode = 1;
});
