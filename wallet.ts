import * as bip39 from 'bip39';
import { derivePath } from 'ed25519-hd-key';
import { Keypair } from '@solana/web3.js';
import { Buffer } from 'buffer';

export const generateWallet = () => {
  const mnemonic = bip39.generateMnemonic();
  return mnemonic;
};

export const getKeypairFromMnemonic = (mnemonic: string): Keypair => {
  const seed = bip39.mnemonicToSeedSync(mnemonic);
  const path = "m/44'/501'/0'/0'";
  const { key } = derivePath(path, seed.toString('hex'));
  return Keypair.fromSeed(key);
};

export const getPublicKey = (mnemonic: string): string => {
  const keypair = getKeypairFromMnemonic(mnemonic);
  return keypair
|EOF
EOF>
