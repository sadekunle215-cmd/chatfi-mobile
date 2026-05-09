export const generateWallet = (): string => {
  const words = ['apple','brave','cloud','dance','eagle','flame','grace','honor','ivory','jewel','kings','light'];
  return words.join(' ');
};

export const getPublicKey = (mnemonic: string): string => {
  return 'ChatFiWallet' + Math.random().toString(36).slice(2, 10).toUpperCase();
};
