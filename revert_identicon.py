import os
path = os.path.expanduser('~/chatfi-v2/App.tsx')

with open(path, 'r') as f:
    content = f.read()

# Remove SVG import if added at top
content = content.replace("import Svg, { Rect } from 'react-native-svg';\n", '')

# Remove Identicon component entirely
start = content.find('\n// Deterministic identicon')
end = content.find('\nfunction TokLogo')
if start > 0 and end > 0:
    content = content[:start] + content[end:]
    print('Identicon component: REMOVED')
else:
    print(f'NOT FOUND: start={start}, end={end}')

# Restore green circle avatar in header (48x48)
content = content.replace(
    '<Identicon address={pubkey || accounts?.[activeAccIdx]?.pubkey || ""} size={48} />',
    '<View style={{ width:48, height:48, borderRadius:24, backgroundColor:C.green, alignItems:\'center\', justifyContent:\'center\', marginRight:12 }}>\n                <Text style={{ color:\'#0d1117\', fontWeight:\'bold\', fontSize:18 }}>{(accounts?.[activeAccIdx]?.name || userName || "A")[0].toUpperCase()}</Text>\n              </View>'
)

# Restore green circle avatar in row (40x40)
content = content.replace(
    '<Identicon address={pubkey || accounts?.[activeAccIdx]?.pubkey || ""} size={40} />',
    '<View style={{ width:40, height:40, borderRadius:20, backgroundColor:C.green, alignItems:\'center\', justifyContent:\'center\', marginRight:12 }}>\n              <Text style={{ color:\'#0d1117\', fontWeight:\'bold\', fontSize:16 }}>{(accounts?.[activeAccIdx]?.name || "A")[0].toUpperCase()}</Text>\n            </View>'
)
print('Avatars: RESTORED')

with open(path, 'w') as f:
    f.write(content)
