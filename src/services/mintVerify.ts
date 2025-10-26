import { ethers } from 'ethers';
import { config } from '../config';

export async function verifyMint(evidence: any) {
  if (!evidence || !evidence.txHash) return { ok: false, reason: 'no_tx' };
  const rpc = config.alfajoresRpc;
  if (!rpc) return { ok: false, reason: 'no_rpc' };

  try {
    const provider = new ethers.JsonRpcProvider(rpc);
    const receipt = await provider.getTransactionReceipt(evidence.txHash);
    if (!receipt) return { ok: false, reason: 'tx_not_found' };

    // Find Transfer event signature for ERC721: Transfer(address,address,uint256)
    const transferTopic = ethers.id('Transfer(address,address,uint256)');
    const transferLog = (receipt.logs || []).find((l: any) => l.topics && l.topics[0] === transferTopic);
    if (!transferLog) return { ok: false, reason: 'no_transfer_event' };

    // Minimal decode - ethers v6 requires ABI
    const iface = new ethers.Interface([`event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)`]);
    const decoded = iface.parseLog(transferLog);
    if (!decoded) return { ok: false, reason: 'parse_log_failed' };
    const tokenId = (decoded as any).args?.tokenId?.toString?.() || evidence.tokenId || null;
    const to = (decoded as any).args?.to || null;

    // Optional tokenURI check
    let metadataOk = null;
    if (evidence.tokenURI && evidence.contractAddress) {
      try {
        const erc = new ethers.Contract(evidence.contractAddress, [
          'function tokenURI(uint256) view returns (string)'
        ], provider as any);
        const onchain = await erc.tokenURI(tokenId);
        if (onchain !== evidence.tokenURI) metadataOk = false;
        else metadataOk = true;
      } catch (err) {
        metadataOk = null;
      }
    }

    return { ok: true, details: { tokenId, to, metadataOk } };
  } catch (err: any) {
    return { ok: false, reason: err?.message || 'error' };
  }
}

export default verifyMint;
