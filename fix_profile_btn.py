import os
path = os.path.expanduser('~/chatfi-v2/App.tsx')

with open(path, 'r') as f:
    content = f.read()

old = "style={{ flex:1, backgroundColor:'#1c2128', borderRadius:14, padding:16, alignItems:'center', gap:6 }}>\n                  <Ionicons name='person-outline' size={24} color={C.text} />\n                  <Text style={{ color:C.text, fontSize:13 }}>Profile</Text>"
new = "style={{ flex:1, backgroundColor:'#1c2128', borderRadius:14, padding:12, alignItems:'center', gap:4 }}>\n                  <Ionicons name='person-outline' size={22} color={C.text} />\n                  <Text style={{ color:C.text, fontSize:12 }}>Profile</Text>"

if old in content:
    content = content.replace(old, new)
    print('PATCHED OK')
else:
    print('NOT FOUND - trying simple replace')
    content = content.replace(
        "padding:16, alignItems:'center', gap:6 }}>\n                  <Ionicons name='person-outline'",
        "padding:12, alignItems:'center', gap:4 }}>\n                  <Ionicons name='person-outline'"
    )
    print('Simple replace done')

with open(path, 'w') as f:
    f.write(content)
