import os
path = os.path.expanduser('~/chatfi-v2/App.tsx')

with open(path, 'r') as f:
    content = f.read()

old = """      const { publicKey: pk } = deriveWallet(importSeed.trim());
      await AsyncStorage.setItem('wallet_mnemonic', importSeed.trim());
      setWallet(importSeed.trim()); setPubkey(pk);
      setShowWalletModal(false); setImportSeed('');
      Alert.alert('Wallet Imported!', 'Your wallet is ready.');"""

new = """      const { publicKey: pk } = deriveWallet(importSeed.trim());
      await AsyncStorage.setItem('wallet_mnemonic', importSeed.trim());
      setWallet(importSeed.trim()); setPubkey(pk);
      const newAcc = {id: accounts.length+1, name:'Account '+(accounts.length+1), mnemonic:importSeed.trim(), pubkey:pk};
      const updated = [...accounts, newAcc];
      setAccounts(updated);
      setActiveAccIdx(updated.length-1);
      await AsyncStorage.setItem('accounts', JSON.stringify(updated));
      await AsyncStorage.setItem('active_acc', String(updated.length-1));
      setShowWalletModal(false); setImportSeed(''); setShowAddOptions(false);
      Alert.alert('Wallet Imported!', 'Your wallet is ready.');"""

if old in content:
    content = content.replace(old, new)
    print('PATCHED OK')
else:
    print('NOT FOUND')
    idx = content.find('Your wallet is ready')
    print(repr(content[idx-200:idx+50]))

with open(path, 'w') as f:
    f.write(content)
