"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
const app_1 = __importDefault(require("./app"));
const config_1 = require("./config");
const logger_1 = require("./lib/logger");
async function main() {
    await mongoose_1.default.connect(config_1.config.mongoUri);
    const conn = mongoose_1.default.connection;
    const app = (0, app_1.default)();
    const server = app.listen(config_1.config.port, () => {
        logger_1.logger.info({ port: config_1.config.port, mongoUri: config_1.config.mongoUri, dbName: conn.name }, 'server listening');
    });
    process.on('SIGINT', async () => {
        logger_1.logger.info('shutting down');
        await mongoose_1.default.disconnect();
        server.close(() => process.exit(0));
    });
}
main().catch((err) => {
    logger_1.logger.error({ err }, 'failed to start');
    process.exit(1);
});
