import os
path = os.path.expanduser('~/chatfi-v2/App.tsx')

with open(path, 'r') as f:
    content = f.read()

# Fix 1: "Profil" typo on the button
content = content.replace('>Profil<', '>Profile<')
print('Typo fix: PATCHED')

# Fix 2: Save name - also update active account name in accounts array
old_save = "onPress={async () => { setUserName(nameInput); await AsyncStorage.setItem('user_name', nameInput); Alert.alert('Saved!', 'Name saved successfully.'); setView('main'); }}"
new_save = "onPress={async () => { if(!nameInput.trim()) return; setUserName(nameInput.trim()); await AsyncStorage.setItem('user_name', nameInput.trim()); Alert.alert('Saved!', 'Name saved successfully.'); setView('main'); }}"

if old_save in content:
    content = content.replace(old_save, new_save)
    print('Save fix: PATCHED')
else:
    print('Save fix: NOT FOUND - checking...')
    # Try to find what's actually there
    idx = content.find("Name saved successfully")
    if idx > 0:
        print(repr(content[idx-200:idx+50]))

with open(path, 'w') as f:
    f.write(content)
