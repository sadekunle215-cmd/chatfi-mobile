import { Buffer } from 'buffer';
global.Buffer = global.Buffer || Buffer;
import 'react-native-get-random-values';
import * as bip39 from 'bip39';
import { derivePath } from 'ed25519-hd-key';
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import { Transaction, SystemProgram, PublicKey } from '@solana/web3.js';

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

export function deriveWallet(mnemonic: string) {
  const seed = bip39.mnemonicToSeedSync(mnemonic);
  const { key } = derivePath(SOLANA_PATH, seed.toString('hex'));
  const keypair = nacl.sign.keyPair.fromSeed(key);
  const publicKey = bs58.encode(keypair.publicKey);
  return { mnemonic, publicKey, secretKey: keypair.secretKey };
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

const logoCache: Record<string, string> = {};

const symbolCache: Record<string, string> = {};
const nameCache: Record<string, string> = {};

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
        if (t.address) {
          if (t.logoURI) logoCache[t.address] = t.logoURI;
          if (t.symbol) symbolCache[t.address] = t.symbol;
          if (t.name) nameCache[t.address] = t.name;
        }
      });
    } catch {}
  }
  const result: Record<string, string> = {};
  mints.forEach(m => { if (logoCache[m]) result[m] = logoCache[m]; });
  return result;
}

export function getTokenSymbol(mint: string): string {
  return symbolCache[mint] || Object.keys(TOKENS).find(k => TOKENS[k] === mint) || mint.slice(0,4).toUpperCase();
}

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
    const symbol = symbolCache[mint] || Object.keys(TOKENS).find(k => TOKENS[k] === mint) || mint.slice(0,4).toUpperCase();
    tokens.push({ symbol, mint, amount, logoURI: '' });
    mints.push(mint);
  }

  const logos = await fetchTokenLogos(mints);
  tokens.forEach(t => { t.logoURI = logos[t.mint] || ''; });
  return { solBalance, tokens };
}

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

export async function sendSOL(secretKey: Uint8Array, recipient: string, lamports: number): Promise<string> {
  const keypair = nacl.sign.keyPair.fromSecretKey(secretKey);
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
