import 'react-native-get-random-values';
import { Keypair } from '@solana/web3.js';
import * as bs58 from 'bs58';

const WORDLIST = ['abandon','ability','able','about','above','absent','absorb','abstract','absurd','abuse','access','accident','account','accuse','achieve','acid','acoustic','acquire','across','act','action','actor','actress','actual','adapt','add','addict','address','adjust','admit','adult','advance','advice','aerobic','afford','afraid','again','agent','agree','ahead','aim','air','airport','aisle','alarm','album','alcohol','alert','alien','all','alley','allow','almost','alone','alpha','already','also','alter','always','amateur','amazing','among','amount','amused','analyst','anchor','ancient','anger','angle','angry','animal','ankle','announce','annual','another','answer','antenna','antique','anxiety','any','apart','apology','appear','apple','approve','april','arch','arctic','area','arena','argue','arm','armor','army','around','arrange','arrest','arrive','arrow','art','artefact','artist','artwork','ask','aspect','assault','asset','assist','assume','asthma','athlete','atom','attack','attend','attitude','attract','auction','audit','august','aunt','author','auto','autumn','average','avocado','avoid','awake','aware','away','awesome','awful','awkward','axis'];

export const generateWallet = (): { mnemonic: string; keypair: Keypair } => {
  const keypair = Keypair.generate();
  const seed = Array.from(keypair.secretKey.slice(0, 16));
  const words = seed.map(byte => WORDLIST[byte % WORDLIST.length]);
  const mnemonic = words.join(' ');
  return { mnemonic, keypair };
};

export const getPublicKey = (secretKeyBase58: string): string => {
  try {
    const secretKey = bs58.decode(secretKeyBase58);
    const keypair = Keypair.fromSecretKey(secretKey);
    return keypair.publicKey.toString();
  } catch {
    return 'Invalid key';
  }
};

export const getKeypairFromSecret = (secretKeyBase58: string): Keypair => {
  const secretKey = bs58.decode(secretKeyBase58);
  return Keypair.fromSecretKey(secretKey);
};
