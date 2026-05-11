import os
path = os.path.expanduser('~/chatfi-v2/App.tsx')

with open(path, 'r') as f:
    content = f.read()

# Fix 1: Add showAddOptions state after showWalletModal
old_state = 'const [showWalletModal, setShowWalletModal] = useState(false);'
new_state = 'const [showWalletModal, setShowWalletModal] = useState(false);\n  const [showAddOptions, setShowAddOptions] = useState(false);'
if old_state in content:
    content = content.replace(old_state, new_state)
    print('State: PATCHED OK')
else:
    print('State: NOT FOUND')

# Fix 2: Fix "Clos" -> "Close"
content = content.replace('>Clos<', '>Close<')
print('Close text: PATCHED')

with open(path, 'w') as f:
    f.write(content)
