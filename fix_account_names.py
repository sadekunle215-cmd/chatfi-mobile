import os
path = os.path.expanduser('~/chatfi-v2/App.tsx')

with open(path, 'r') as f:
    content = f.read()

# Fix 1: Header "ChatFi Wallet" -> active account name
old1 = ">ChatFi Wallet</Text>"
new1 = ">{accounts?.[activeAccIdx]?.name || userName || 'My Wallet'}</Text>"

if old1 in content:
    content = content.replace(old1, new1)
    print('Header name: PATCHED OK')
else:
    print('Header name: NOT FOUND')

# Fix 2: Avatar "CF" -> first letter of active account name
old2 = ">CF</Text>\n              </View>\n              <View style={{ flex:1 }}>\n                <Text style={{ color:C.text, fontWeig\nht:'bold', fontSize:16 }}>"
# Use simpler approach
content = content.replace(
    'fontSize:18 }}>CF</Text>',
    'fontSize:18 }}>{(accounts?.[activeAccIdx]?.name || userName || "CF")[0].toUpperCase()}</Text>'
)
print('Avatar letter: PATCHED')

# Fix 3: "Account 1" in the account row -> active account name  
old3 = ">Account 1</Text>"
new3 = ">{accounts?.[activeAccIdx]?.name || 'Account 1'}</Text>"

if old3 in content:
    content = content.replace(old3, new3)
    print('Row name: PATCHED OK')
else:
    print('Row name: NOT FOUND')

with open(path, 'w') as f:
    f.write(content)
