import 'react-native-get-random-values';
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import { generateMnemonic, mnemonicToSeedSync, validateMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english';
import { derivePath } from 'ed25519-hd-key';

export type WalletKeys = {
  mnemonic: string;
  publicKey: string;
  secretKey: Uint8Array;
};

const DERIVATION_PATH = "m/44'/501'/0'/0'";

export const generateWallet = (): WalletKeys => {
  const mnemonic = generateMnemonic(wordlist);
  return importWallet(mnemonic);
};

export const importWallet = (mnemonic: string): WalletKeys => {
  const trimmed = mnemonic.trim();
  if (!validateMnemonic(trimmed, wordlist)) {
    throw new Error('Invalid mnemonic phrase');
  }
  const seed = mnemonicToSeedSync(trimmed);
  const { key } = derivePath(DERIVATION_PATH, Buffer.from(seed).toString('hex'));
  const keypair = nacl.sign.keyPair.fromSeed(key);
  return {
    mnemonic: trimmed,
    publicKey: bs58.encode(keypair.publicKey),
    secretKey: keypair.secretKey,
  };
};

export const getPublicKey = (mnemonic: string): string => {
  try { return importWallet(mnemonic).publicKey; }
  catch { return 'ErrorGeneratingKey'; }
};

export const deriveWallet = importWallet;
