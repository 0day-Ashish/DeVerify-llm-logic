"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.pinToIpfs = pinToIpfs;
const axios_1 = __importDefault(require("axios"));
const config_1 = require("../config");
const logger_1 = require("../lib/logger");
async function pinToIpfs(payload) {
    if (!config_1.config.pinataKey || !config_1.config.pinataSecret) {
        logger_1.logger.info('PINATA keys not set, skipping pin');
        return null;
    }
    try {
        const url = 'https://api.pinata.cloud/pinning/pinJSONToIPFS';
        const res = await axios_1.default.post(url, payload, {
            headers: {
                pinata_api_key: config_1.config.pinataKey,
                pinata_secret_api_key: config_1.config.pinataSecret
            }
        });
        return { ipfsHash: res.data.IpfsHash };
    }
    catch (err) {
        logger_1.logger.error({ err }, 'pinToIpfs failed');
        return null;
    }
}
exports.default = pinToIpfs;
