import os
path = os.path.expanduser('~/chatfi-v2/App.tsx')

with open(path, 'r') as f:
    content = f.read()

old = """      } else {
        AsyncStorage.getItem('wallet_mnemonic').then(m => {
          if(m){
            const acc = [{id:1,name:'Account 1',mnemonic:m,pubkey:getPublicKey(m)}];
            setAccounts(acc);
            AsyncStorage.setItem('accounts', JSON.stringify(acc));
            AsyncStorage.setItem('active_acc','0');
            setWallet(m); setPubkey(getPublicKey(m));
          }
        });
      }"""

new = """      } else {
        AsyncStorage.getItem('wallet_mnemonic').then(m => {
          if(m){
            const acc = [{id:1,name:'Account 1',mnemonic:m,pubkey:getPublicKey(m)}];
            setAccounts(acc);
            AsyncStorage.setItem('accounts', JSON.stringify(acc));
            AsyncStorage.setItem('active_acc','0');
            setWallet(m); setPubkey(getPublicKey(m));
          } else {
            try {
              const w = generateWallet();
              const acc = [{id:1,name:'Account 1',mnemonic:w.mnemonic,pubkey:w.publicKey}];
              setAccounts(acc);
              setWallet(w.mnemonic);
              setPubkey(w.publicKey);
              AsyncStorage.setItem('accounts', JSON.stringify(acc));
              AsyncStorage.setItem('active_acc','0');
              AsyncStorage.setItem('wallet_mnemonic', w.mnemonic);
            } catch(e) { console.error('generateWallet failed:', e); }
          }
        });
      }"""

if old in content:
    content = content.replace(old, new)
    with open(path, 'w') as f:
        f.write(content)
    print('PATCHED OK')
else:
    print('NOT FOUND - check whitespace')
