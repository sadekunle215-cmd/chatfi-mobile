import 'react-native-get-random-values';
import * as bip39 from 'bip39';
import { derivePath } from 'ed25519-hd-key';
import nacl from 'tweetnacl';
import bs58 from 'bs58';

export type WalletKeys = {
  mnemonic: string;
  publicKey: string;
  secretKey: Uint8Array;
};

// Generate a real BIP39 wallet
export const generateWallet = (): WalletKeys => {
  const mnemonic = bip39.generateMnemonic();
  return deriveKeysFromMnemonic(mnemonic);
};

// Import existing wallet from seed phrase
export const importWallet = (mnemonic: string): WalletKeys => {
  if (!bip39.validateMnemonic(mnemonic)) {
    throw new Error('Invalid mnemonic phrase');
  }
  return deriveKeysFromMnemonic(mnemonic);
};

// Derive real ed25519 keypair from mnemonic
const deriveKeysFromMnemonic = (mnemonic: string): WalletKeys => {
  const seed = bip39.mnemonicToSeedSync(mnemonic);
  const path = "m/44'/501'/0'/0'";
  const { key } = derivePath(path, seed.toString('hex'));
  const keypair = nacl.sign.keyPair.fromSeed(key);
  const publicKey = bs58.encode(keypair.publicKey);
  return { mnemonic, publicKey, secretKey: keypair.secretKey };
};

// Get public key string from mnemonic
export const getPublicKey = (mnemonic: string): string => {
  try {
    const { publicKey } = deriveKeysFromMnemonic(mnemonic);
    return publicKey;
  } catch {
    return 'ErrorGeneratingKey';
  }
};

// Sign and send a Jupiter swap transaction
export const signAndSendTransaction = async (
  serializedTx: string,
  secretKey: Uint8Array,
  rpcUrl: string
): Promise<string> => {
  const txBytes = Buffer.from(serializedTx, 'base64');

  // Solana tx layout: [sigCount(1)] [sig slots(sigCount*64)] [message...]
  const sigCount = txBytes[0];
  const messageOffset = 1 + sigCount * 64;
  const message = txBytes.slice(messageOffset);

  const signature = nacl.sign.detached(message, secretKey);

  // Write signature into slot 0
  for (let i = 0; i < 64; i++) {
    txBytes[1 + i] = signature[i];
  }

  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'sendTransaction',
      params: [
        txBytes.toString('base64'),
        { encoding: 'base64', preflightCommitment: 'confirmed' }
      ]
    })
  });

  const data = await response.json();
  if (data.error) throw new Error(data.error.message);
  return data.result; // transaction signature
};
