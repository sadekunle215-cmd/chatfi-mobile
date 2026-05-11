import os
path = os.path.expanduser('~/chatfi-v2/App.tsx')

with open(path, 'r') as f:
    content = f.read()

# Fix 1: Add missing props to AccountModal function signature
old_sig = 'function AccountModal({ visible, onClose, pubkey, wallet, onRemoveWallet, userName, setUserName })'
new_sig = 'function AccountModal({ visible, onClose, pubkey, wallet, onRemoveWallet, userName, setUserName, accounts, activeAccIdx, switchAccount, addAccount })'

if old_sig in content:
    content = content.replace(old_sig, new_sig)
    print('Signature: PATCHED OK')
else:
    print('Signature: NOT FOUND')

# Fix 2: Add missing props at call site
old_call = '''      <AccountModal
        visible={showAccountModal}
        onClose={() => setShowAccountModal(false)}
        pubkey={pubkey}
        wallet={wallet}
        userName={userName}
        setUserName={setUserName}
        onRemoveWallet={async () => {'''

new_call = '''      <AccountModal
        visible={showAccountModal}
        onClose={() => setShowAccountModal(false)}
        pubkey={pubkey}
        wallet={wallet}
        userName={userName}
        setUserName={setUserName}
        accounts={accounts}
        activeAccIdx={activeAccIdx}
        switchAccount={switchAccount}
        addAccount={addAccount}
        onRemoveWallet={async () => {'''

if old_call in content:
    content = content.replace(old_call, new_call)
    print('Call site: PATCHED OK')
else:
    print('Call site: NOT FOUND')

with open(path, 'w') as f:
    f.write(content)
