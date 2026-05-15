import { Buffer } from 'buffer';
global.Buffer = global.Buffer || Buffer;
import 'react-native-get-random-values';
import * as bip39 from 'bip39';
import { derivePath } from 'ed25519-hd-key';
import nacl from 'tweetnacl';
import bs58 from 'bs58';


const PROXY = 'https://chatfi.pro/api/jupiter';

export async function rpcFetch(method: string, params: any[]): Promise<any> {
  const res = await fetch(PROXY, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: 'SOLANA_RPC', method: 'POST', body: { jsonrpc: '2.0', id: 1, method, params } })
  });
  return res.json();
}
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

  const solBalance = ((await rpcFetch('getBalance', [pubkey])).result?.value || 0) / 1e9;

  const accounts = (await rpcFetch('getTokenAccountsByOwner', [pubkey, { programId: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' }, { encoding: 'jsonParsed' }])).result?.value || [];
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
  const blockhash = (await rpcFetch('getLatestBlockhash', [{ commitment: 'confirmed' }])).result.value.blockhash;
  const tx = new Transaction();
  tx.add(SystemProgram.transfer({ fromPubkey, toPubkey: new PublicKey(recipient), lamports }));
  tx.feePayer = fromPubkey;
  tx.recentBlockhash = blockhash;
  const sig = nacl.sign.detached(tx.serializeMessage(), secretKey);
  tx.addSignature(fromPubkey, Buffer.from(sig));
  const raw = tx.serialize().toString('base64');
  const result = await rpcFetch('sendTransaction', [raw, { encoding: 'base64', preflightCommitment: 'confirmed' }]);
  if (result.error) throw new Error(result.error.message);
  return result.result;
}

export async function sendSPLToken(
  secretKey: Uint8Array,
  mint: string,
  recipient: string,
  amount: number,
  decimals: number
): Promise<string> {
  const { Transaction, PublicKey, TransactionInstruction } = require('@solana/web3.js');
  const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
  const ASSOC_PROGRAM_ID = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJe1bS4');
  const SYS_PROGRAM_ID   = new PublicKey('11111111111111111111111111111111');
  const keypair    = nacl.sign.keyPair.fromSecretKey(secretKey);
  const fromPubkey = new PublicKey(bs58.encode(keypair.publicKey));
  const mintPubkey = new PublicKey(mint);
  const toPubkey   = new PublicKey(recipient);

  // Derive ATAs
  const [fromATA] = await PublicKey.findProgramAddress(
    [fromPubkey.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mintPubkey.toBuffer()],
    ASSOC_PROGRAM_ID
  );
  const [toATA] = await PublicKey.findProgramAddress(
    [toPubkey.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mintPubkey.toBuffer()],
    ASSOC_PROGRAM_ID
  );

  const tx = new Transaction();

  // Create recipient ATA if it doesn't exist
  const toATAInfo = await rpcFetch('getAccountInfo', [toATA.toString(), { encoding: 'base64' }]);
  if (!toATAInfo?.result?.value) {
    tx.add(new TransactionInstruction({
      keys: [
        { pubkey: fromPubkey,   isSigner: true,  isWritable: true  },
        { pubkey: toATA,        isSigner: false, isWritable: true  },
        { pubkey: toPubkey,     isSigner: false, isWritable: false },
        { pubkey: mintPubkey,   isSigner: false, isWritable: false },
        { pubkey: SYS_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      programId: ASSOC_PROGRAM_ID,
      data: Buffer.alloc(0),
    }));
  }

  // Token transfer instruction
  const amountRaw = BigInt(Math.floor(amount * Math.pow(10, decimals)));
  const data = Buffer.alloc(9);
  data.writeUInt8(3, 0);
  data.writeBigUInt64LE(amountRaw, 1);

  tx.add(new TransactionInstruction({
    keys: [
      { pubkey: fromATA,   isSigner: false, isWritable: true  },
      { pubkey: toATA,     isSigner: false, isWritable: true  },
      { pubkey: fromPubkey, isSigner: true, isWritable: false },
    ],
    programId: TOKEN_PROGRAM_ID,
    data,
  }));

  const blockhash = (await rpcFetch('getLatestBlockhash', [{ commitment: 'confirmed' }])).result.value.blockhash;
  tx.feePayer = fromPubkey;
  tx.recentBlockhash = blockhash;
  const sig = nacl.sign.detached(tx.serializeMessage(), secretKey);
  tx.addSignature(fromPubkey, Buffer.from(sig));
  const raw = tx.serialize().toString('base64');
  const result = await rpcFetch('sendTransaction', [raw, { encoding: 'base64', preflightCommitment: 'confirmed' }]);
  if (result.error) throw new Error(result.error.message);
  return result.result;
}
