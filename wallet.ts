import 'react-native-get-random-values';

const WORDLIST = ['abandon','ability','able','about','above','absent','absorb','abstract','absurd','abuse','access','accident','account','accuse','achieve','acid','acoustic','acquire','across','act','action','actor','actress','actual','adapt','add','addict','address','adjust','admit','adult','advance','advice','aerobic','afford','afraid','again','agent','agree','ahead','aim','air','airport','aisle','alarm','album','alcohol','alert','alien','all','alley','allow','almost','alone','alpha','already','also','alter','always','amateur','amazing','among','amount','amused','analyst','anchor','ancient','anger','angle','angry','animal','ankle','announce','annual','another','answer','antenna','antique','anxiety','any','apart','apology','appear','apple','approve','april','arch','arctic','area','arena','argue','arm','armor','army','around','arrange','arrest','arrive','arrow','art','artefact','artist','artwork','ask','aspect','assault','asset','assist','assume','asthma','athlete','atom','attack','attend','attitude','attract','auction','audit','august','aunt','author','auto','autumn','average','avocado','avoid','awake','aware','away','awesome','awful','awkward','axis','baby','balance','bamboo','banana','banner','bar','barely','bargain','barrel','base','basic','basket','battle','beach','bean','beauty','because','become','beef','before','begin','behave','behind','believe','below','belt','bench','benefit','best','betray','better','between','beyond','bicycle','bid','bike','bind','biology','bird','birth','bitter','black','blade','blame','blanket','blast','bleak','bless','blind','blood','blossom','blouse','blue','blur','blush','board','boat','body','boil','bomb','bone','book','boost','border','boring','borrow','boss','bottom','bounce','box','boy','bracket','brain','brand','brave','breeze','brick','bridge','brief','bright','bring','brisk','broccoli','broken','bronze','broom','brother','brown','brush','bubble','buddy','budget','buffalo','build','bulb','bulk','bullet','bundle','bunker','burden','burger','burst','bus','business','busy','butter','buyer','buzz'];

export const generateWallet = (): string => {
  try {
    const array = new Uint8Array(16);
    crypto.getRandomValues(array);
    const words = Array.from(array).map(b => WORDLIST[b % WORDLIST.length]);
    return words.join(' ');
  } catch (e) {
    const words = [];
    for (let i = 0; i < 12; i++) {
      words.push(WORDLIST[Math.floor(Math.random() * WORDLIST.length)]);
    }
    return words.join(' ');
  }
};

export const getPublicKey = (mnemonic: string): string => {
  try {
    const words = mnemonic.split(' ');
    let hash = 5381;
    for (const word of words) {
      for (let i = 0; i < word.length; i++) {
        hash = ((hash << 5) + hash) ^ word.charCodeAt(i);
        hash = hash >>> 0;
      }
    }
    const chars = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    let address = '';
    let n = hash;
    for (let i = 0; i < 32; i++) {
      address += chars[n % chars.length];
      n = Math.floor(n / chars.length) + (i * 7919) + hash;
      n = n >>> 0;
    }
    return address;
  } catch {
    return 'ErrorGeneratingKey';
  }
};
