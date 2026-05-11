import os
path = os.path.expanduser('~/chatfi-v2/App.tsx')

with open(path, 'r') as f:
    content = f.read()

# Fix 1: Wrong default view in TokenModal
old1 = "function TokenModal({ token, pubkey, onClose }) {\n  const [view, setView] = React.useState('manageAccounts');"
new1 = "function TokenModal({ token, pubkey, onClose }) {\n  const [view, setView] = React.useState('main');"

if old1 in content:
    content = content.replace(old1, new1)
    print('Default view: FIXED')
else:
    print('Default view: NOT FOUND')

# Fix 2: Replace emoji receive icon
content = content.replace(
    "<Text style={{ fontSize:24 }}>📥</Text>",
    "<Ionicons name='arrow-down-outline' size={24} color={C.text} />"
)
# Fix 3: Replace emoji send icon  
content = content.replace(
    "<Text style={{ fontSize:24 }}>📤</Text>",
    "<Ionicons name='arrow-up-outline' size={24} color={'#0d1117'} />"
)
print('Icons: FIXED')

with open(path, 'w') as f:
    f.write(content)
