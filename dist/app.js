"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createApp = createApp;
const express_1 = __importDefault(require("express"));
const body_parser_1 = __importDefault(require("body-parser"));
const submit_1 = __importDefault(require("./routes/submit"));
const hackathon_1 = __importDefault(require("./routes/hackathon"));
const submission_1 = __importDefault(require("./routes/submission"));
const logger_1 = require("./lib/logger");
const mongoose_1 = __importDefault(require("mongoose"));
function createApp() {
    const app = (0, express_1.default)();
    app.use(body_parser_1.default.json({ limit: '1mb' }));
    // TODO: add rate-limiting middleware (per-IP or per-wallet)
    app.use('/api/submit', submit_1.default);
    app.use('/api/submission', submission_1.default);
    app.use('/api/hackathon', hackathon_1.default);
    app.get('/health', (req, res) => {
        const state = mongoose_1.default.connection.readyState; // 0=disconnected,1=connected,2=connecting,3=disconnecting
        res.json({ ok: true, dbConnected: state === 1, dbState: state, dbName: mongoose_1.default.connection.name || null });
    });
    // error handler
    app.use((err, req, res, next) => {
        logger_1.logger.error({ err }, 'unhandled error');
        res.status(500).json({ error: 'internal_error' });
    });
    return app;
}
exports.default = createApp;
