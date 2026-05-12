import { Buffer } from 'buffer';
global.Buffer = global.Buffer || Buffer;
import 'react-native-get-random-values';
import * as bip39 from 'bip39';
import { derivePath } from 'ed25519-hd-key';
import nacl from 'tweetnacl';
import bs58 from 'bs58';


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

export function deriveWalletAtIndex(mnemonic: string, index: number) {
  const seed = bip39.mnemonicToSeedSync(mnemonic);
  const path = `m/44'/501'/${index}'/0'`;
  const { key } = derivePath(path, seed.toString('hex'));
  const keypair = nacl.sign.keyPair.fromSeed(key);
  const publicKey = bs58.encode(keypair.publicKey);
  return { mnemonic, publicKey, secretKey: keypair.secretKey };
}

export function generateWallet(wordCount: number = 12) {
  return deriveWallet(bip39.generateMnemonic(wordCount === 24 ? 256 : 128));
}

export function getPublicKey(mnemonic: string): string {
  return deriveWallet(mnemonic).publicKey;
}

export function importWallet(mnemonic: string) {
  return deriveWallet(mnemonic);
}

export function signAndSendTransaction() {}

export function getPrivateKey(mnemonic: string): string {
  const { secretKey } = deriveWallet(mnemonic);
  return bs58.encode(secretKey);
}

const metaCache: Record<string, { symbol: string; name: string; logoURI: string }> = {
  'So11111111111111111111111111111111111111112':  { symbol: 'SOL',  name: 'Solana',    logoURI: 'https://img.jup.ag/tokens/So11111111111111111111111111111111111111112' },
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': { symbol: 'USDC', name: 'USD Coin', logoURI: 'https://img.jup.ag/tokens/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' },
  'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB': { symbol: 'USDT', name: 'Tether',   logoURI: 'https://img.jup.ag/tokens/Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB' },
  'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN':  { symbol: 'JUP',  name: 'Jupiter',  logoURI: 'https://img.jup.ag/tokens/JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN' },
  'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263': { symbol: 'BONK', name: 'Bonk',     logoURI: 'https://img.jup.ag/tokens/DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263' },
  'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm': { symbol: 'WIF',  name: 'dogwifhat',logoURI: 'https://img.jup.ag/tokens/EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm' },
};

let jupListFetched = false;

async function ensureJupList() {
  if (jupListFetched) return;
  try {
    const res = await fetch('https://token.jup.ag/strict');
    const list: any[] = await res.json();
    list.forEach((t: any) => {
      if (t.address && !metaCache[t.address]) {
        metaCache[t.address] = {
          symbol: t.symbol || t.address.slice(0, 4).toUpperCase(),
          name: t.name || t.symbol || t.address.slice(0, 8),
          logoURI: t.logoURI || `https://img.jup.ag/tokens/${t.address}`,
        };
      }
    });
    jupListFetched = true;
  } catch {}
}

export async function fetchTokenLogos(mints: string[]): Promise<Record<string, string>> {
  await ensureJupList();
  const result: Record<string, string> = {};
  mints.forEach(m => {
    result[m] = metaCache[m]?.logoURI || `https://img.jup.ag/tokens/${m}`;
  });
  return result;
}

export async function getWalletBalances(pubkey: string) {
  await ensureJupList();

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
  const tokens: { symbol: string; name: string; mint: string; amount: number; logoURI: string }[] = [];

  for (const { account } of accounts) {
    const info = account.data.parsed.info;
    const mint: string = info.mint;
    const amount: number = info.tokenAmount.uiAmount;
    if (!amount || amount === 0) continue;
    const meta = metaCache[mint];
    tokens.push({
      symbol: meta?.symbol || mint.slice(0, 4).toUpperCase(),
      name: meta?.name || mint.slice(0, 8) + '...',
      mint,
      amount,
      logoURI: meta?.logoURI || `https://img.jup.ag/tokens/${mint}`,
    });
  }

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
  const { Transaction, SystemProgram, PublicKey } = require('@solana/web3.js');
  const keypair = nacl.sign.keyPair.fromSecretKey(secretKey);
  const fromPubkey = new PublicKey(bs58.encode(keypair.publicKey));
  const bhRes = await fetch(RPC, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getLatestBlockhash', params: [{ commitment: 'confirmed' }] }),
  });
  const blockhash = (await bhRes.json()).result.value.blockhash;
  const tx = new Transaction();
  tx.add(SystemProgram.transfer({ fromPubkey, toPubkey: new PublicKey(recipient), lamports }));
  tx.feePayer = fromPubkey;
  tx.recentBlockhash = blockhash;
  const sig = nacl.sign.detached(tx.serializeMessage(), secretKey);
  tx.addSignature(fromPubkey, Buffer.from(sig));
  const raw = tx.serialize().toString('base64');
  const sendRes = await fetch(RPC, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'sendTransaction', params: [raw, { encoding: 'base64', preflightCommitment: 'confirmed' }] }),
  });
  const result = await sendRes.json();
  if (result.error) throw new Error(result.error.message);
  return result.result;
}
