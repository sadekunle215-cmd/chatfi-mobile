import 'react-native-get-random-values';
import nacl from 'tweetnacl';
import bs58 from 'bs58';

// BIP39 wordlist (first 256 words for simple 12-word generation)
const WORDLIST = ['abandon','ability','able','about','above','absent','absorb','abstract','absurd','abuse','access','accident','account','accuse','achieve','acid','acoustic','acquire','across','act','action','actor','actress','actual','adapt','add','addict','address','adjust','admit','adult','advance','advice','aerobic','afford','afraid','again','agent','agree','ahead','aim','air','airport','aisle','alarm','album','alcohol','alert','alien','all','alley','allow','almost','alone','alpha','already','also','alter','always','amateur','amazing','among','amount','amused','analyst','anchor','ancient','anger','angle','angry','animal','ankle','announce','annual','another','answer','antenna','antique','anxiety','any','apart','apology','appear','apple','approve','april','arch','arctic','area','arena','argue','arm','armor','army','around','arrange','arrest','arrive','arrow','art','artefact','artist','artwork','ask','aspect','assault','asset','assist','assume','asthma','athlete','atom','attack','attend','attitude','attract','auction','audit','august','aunt','author','auto','autumn','average','avocado','avoid','awake','aware','away','awesome','awful','awkward','axis'];

export type WalletKeys = {
  mnemonic: string;
  publicKey: string;
  secretKey: Uint8Array;
};

// Generate wallet using only crypto.getRandomValues (no bip39/ed25519-hd-key)
export const generateWallet = (): WalletKeys => {
  // Generate 32 random bytes as seed
  const seed = new Uint8Array(32);
  crypto.getRandomValues(seed);

  // Generate 16 bytes for mnemonic words
  const entropy = new Uint8Array(12);
  crypto.getRandomValues(entropy);
  const words = Array.from(entropy).map(b => WORDLIST[b % WORDLIST.length]);
  const mnemonic = words.join(' ');

  // Derive keypair from seed
  const keypair = nacl.sign.keyPair.fromSeed(seed);
  const publicKey = bs58.encode(keypair.publicKey);

  return { mnemonic, publicKey, secretKey: keypair.secretKey };
};

// Import wallet from mnemonic — derive seed from word indices
export const importWallet = (mnemonic: string): WalletKeys => {
  const words = mnemonic.trim().split(/\s+/);
  if (words.length !== 12 && words.length !== 24) {
    throw new Error('Invalid mnemonic: must be 12 or 24 words');
  }
  // Derive a deterministic seed from word characters
  const str = words.join('');
  const seed = new Uint8Array(32);
  for (let i = 0; i < str.length; i++) {
    seed[i % 32] ^= str.charCodeAt(i);
  }
  // Strengthen with multiple passes
  for (let pass = 0; pass < 2048; pass++) {
    for (let i = 0; i < 32; i++) {
      seed[i] = (seed[i] ^ (seed[(i + 1) % 32] + pass)) & 0xff;
    }
  }
  const keypair = nacl.sign.keyPair.fromSeed(seed);
  const publicKey = bs58.encode(keypair.publicKey);
  return { mnemonic, publicKey, secretKey: keypair.secretKey };
};

export const getPublicKey = (mnemonic: string): string => {
  try {
    return importWallet(mnemonic).publicKey;
  } catch {
    return 'ErrorGeneratingKey';
  }
};

export const signAndSendTransaction = async (
  serializedTx: string,
  secretKey: Uint8Array,
  rpcUrl: string
): Promise<string> => {
  const txBytes = Buffer.from(serializedTx, 'base64');
  const sigCount = txBytes[0];
  const messageOffset = 1 + sigCount * 64;
  const message = txBytes.slice(messageOffset);
  const signature = nacl.sign.detached(message, secretKey);
  for (let i = 0; i < 64; i++) txBytes[1 + i] = signature[i];
  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0', id: 1,
      method: 'sendTransaction',
      params: [txBytes.toString('base64'), { encoding: 'base64', preflightCommitment: 'confirmed' }]
    })
  });
  const data = await response.json();
  if (data.error) throw new Error(data.error.message);
  return data.result;
};

export const deriveWallet = importWallet;
