import mongoose from 'mongoose';
import createApp from './app';
import { config } from './config';
import { logger } from './lib/logger';

async function main() {
  await mongoose.connect(config.mongoUri);
  const conn = mongoose.connection;
  const app = createApp();
  const server = app.listen(config.port, () => {
    logger.info({ port: config.port, mongoUri: config.mongoUri, dbName: conn.name }, 'server listening');
  });

  const shutdown = async (signal?: string) => {
    logger.info({ signal }, 'shutting down');
    try {
      await mongoose.disconnect();
      await new Promise<void>((resolve, reject) => {
        server.close((err?: Error) => {
          if (err) return reject(err);
          resolve();
        });
      });
      process.exit(0);
    } catch (err) {
      logger.error({ err }, 'error during shutdown');
      process.exit(1);
    }
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('unhandledRejection', (reason) => {
    logger.error({ reason }, 'unhandledRejection');
  });
}

main().catch((err) => {
  logger.error({ err }, 'failed to start');
  process.exit(1);
});
