import os
path = os.path.expanduser('~/chatfi-v2/App.tsx')

with open(path, 'r') as f:
    content = f.read()

old = """      <AccountModal
        visible={showAccountModal}
        onClose={() => setShowAccountModal(false)}
        pubkey={pubkey}
        wallet={wallet}
        onRemoveWallet={async () => {"""

new = """      <AccountModal
        visible={showAccountModal}
        onClose={() => setShowAccountModal(false)}
        pubkey={pubkey}
        wallet={wallet}
        userName={userName}
        setUserName={setUserName}
        onRemoveWallet={async () => {"""

if old in content:
    content = content.replace(old, new)
    print('PATCHED OK')
else:
    print('NOT FOUND')

with open(path, 'w') as f:
    f.write(content)
