import os
path = os.path.expanduser('~/chatfi-v2/App.tsx')

with open(path, 'r') as f:
    content = f.read()

# Fix seed phrase to use active account mnemonic
old = "onPress={()=>Alert.alert('Seed Phrase', wallet||'No seed phrase found', [{text:'OK'}])}"
new = "onPress={()=>{ const m = accounts[activeAccIdx]?.mnemonic || wallet; Alert.alert('Seed Phrase', m||'No seed phrase found', [{text:'OK'}]); }}"

if old in content:
    content = content.replace(old, new)
    print('PATCHED OK')
else:
    print('NOT FOUND')
    idx = content.find("No seed phrase found")
    if idx > 0:
        print(repr(content[idx-150:idx+50]))

with open(path, 'w') as f:
    f.write(content)
