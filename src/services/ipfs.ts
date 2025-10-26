import axios from 'axios';
import { config } from '../config';
import { logger } from '../lib/logger';

export async function pinToIpfs(payload: any) {
  if (!config.pinataKey || !config.pinataSecret) {
    logger.info('PINATA keys not set, skipping pin');
    return null;
  }

  try {
    const url = 'https://api.pinata.cloud/pinning/pinJSONToIPFS';
    const res = await axios.post(url, payload, {
      headers: {
        pinata_api_key: config.pinataKey,
        pinata_secret_api_key: config.pinataSecret
      }
    });
    return { ipfsHash: res.data.IpfsHash };
  } catch (err) {
    logger.error({ err }, 'pinToIpfs failed');
    return null;
  }
}

export default pinToIpfs;
