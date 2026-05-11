import os
path = os.path.expanduser('~/chatfi-v2/App.tsx')

with open(path, 'r') as f:
    content = f.read()

# Fix 1: Change "Create New Wallet" button to call addAccount + close modal
old = '            <TouchableOpacity style={s.greenBtn} onPress={createWallet}>'
new = '            <TouchableOpacity style={s.greenBtn} onPress={async () => { await addAccount(); setShowWalletModal(false); }}>'

if old in content:
    content = content.replace(old, new)
    print('Fix 1: PATCHED OK')
else:
    print('Fix 1: NOT FOUND')

with open(path, 'w') as f:
    f.write(content)
