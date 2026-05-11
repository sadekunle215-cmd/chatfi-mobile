import 'react-native-get-random-values';
import * as bip39 from 'bip39';
import { derivePath } from 'ed25519-hd-key';
import { PublicKey, Transaction, SystemProgram, Keypair } from '@solana/web3.js';
import nacl from 'tweetnacl';

const RPC = 'https://api.mainnet-beta.solana.com';
const SOLANA_PATH = "m/44'/501'/0'/0'";

export const TOKENS: Record<string, string> = {
  SOL:  'So11111111111111111111111111111111111111112',
  USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  USDT: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
  JUP:  'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN',
  BONK: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
  WIF:  'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm',
};

export const DECIMALS: Record<string, number> = {
  SOL: 9, USDC: 6, USDT: 6, JUP: 6, BONK: 5, WIF: 6,
};

// ── Wallet Generation ────────────────────────────────────────
export function deriveWallet(mnemonic: string) {
  const seed = bip39.mnemonicToSeedSync(mnemonic);
  const { key } = derivePath(SOLANA_PATH, seed.toString('hex'));
  const keypair = Keypair.fromSeed(key);
  return { mnemonic, publicKey: keypair.publicKey.toBase58(), secretKey: keypair.secretKey };
}

export function generateWallet() {
  return deriveWallet(bip39.generateMnemonic());
}

export function getPublicKey(mnemonic: string): string {
  return deriveWallet(mnemonic).publicKey;
}

export function importWallet(mnemonic: string) {
  return deriveWallet(mnemonic);
}

export function signAndSendTransaction() {}

// ── Logos ────────────────────────────────────────────────────
const logoCache: Record<string, string> = {};

export async function fetchTokenLogos(mints: string[]): Promise<Record<string, string>> {
  const needed = mints.filter(m => m && !logoCache[m]);
  if (needed.length > 0) {
    try {
      const res = await fetch('https://token-list-api.solana.com/v1/mints?chainId=101', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ addresses: needed }),
      });
      const data = await res.json();
      (data.content || []).forEach((t: any) => {
        if (t.address && t.logoURI) logoCache[t.address] = t.logoURI;
      });
    } catch {}
  }
  const result: Record<string, string> = {};
  mints.forEach(m => { if (logoCache[m]) result[m] = logoCache[m]; });
  return result;
}

// ── Balances ─────────────────────────────────────────────────
export async function getWalletBalances(pubkey: string) {
  const solRes = await fetch(RPC, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getBalance', params: [pubkey] }),
  });
  const solBalance = ((await solRes.json()).result?.value || 0) / 1e9;

  const tokenRes = await fetch(RPC, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0', id: 2, method: 'getTokenAccountsByOwner',
      params: [pubkey, { programId: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' }, { encoding: 'jsonParsed' }],
    }),
  });
  const accounts = (await tokenRes.json()).result?.value || [];
  const tokens: { symbol: string; mint: string; amount: number; logoURI: string }[] = [];
  const mints: string[] = [];

  for (const { account } of accounts) {
    const info = account.data.parsed.info;
    const mint: string = info.mint;
    const amount: number = info.tokenAmount.uiAmount;
    if (!amount || amount === 0) continue;
    const symbol = Object.keys(TOKENS).find(k => TOKENS[k] === mint) || mint.slice(0, 4).toUpperCase();
    tokens.push({ symbol, mint, amount, logoURI: '' });
    mints.push(mint);
  }

  const logos = await fetchTokenLogos(mints);
  tokens.forEach(t => { t.logoURI = logos[t.mint] || ''; });
  return { solBalance, tokens };
}

// ── Prices ────────────────────────────────────────────────────
export async function getTokenPrices(mints: string[]): Promise<Record<string, number>> {
  try {
    const res = await fetch(`https://lite-api.jup.ag/price/v2?ids=${mints.join(',')}`);
    const data = await res.json();
    const prices: Record<string, number> = {};
    Object.entries(data.data || {}).forEach(([mint, val]: any) => {
      prices[mint] = parseFloat(val.price) || 0;
    });
    return prices;
  } catch { return {}; }
}

// ── Send SOL (raw RPC, no Connection class) ───────────────────
export async function sendSOL(secretKey: Uint8Array, recipient: string, lamports: number): Promise<string> {
  const keypair = Keypair.fromSecretKey(secretKey);
  const bhRes = await fetch(RPC, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getLatestBlockhash', params: [{ commitment: 'confirmed' }] }),
  });
  const blockhash = (await bhRes.json()).result.value.blockhash;
  const tx = new Transaction();
  tx.add(SystemProgram.transfer({ fromPubkey: keypair.publicKey, toPubkey: new PublicKey(recipient), lamports }));
  tx.feePayer = keypair.publicKey;
  tx.recentBlockhash = blockhash;
  const sig = nacl.sign.detached(tx.serializeMessage(), secretKey);
  tx.addSignature(keypair.publicKey, Buffer.from(sig));
  const raw = tx.serialize().toString('base64');
  const sendRes = await fetch(RPC, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'sendTransaction', params: [raw, { encoding: 'base64', preflightCommitment: 'confirmed' }] }),
  });
  const result = await sendRes.json();
  if (result.error) throw new Error(result.error.message);
  return result.result;
}
