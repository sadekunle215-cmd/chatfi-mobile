import os
path = os.path.expanduser('~/chatfi-v2/App.tsx')

with open(path, 'r') as f:
    lines = f.readlines()

# Line 204: header avatar (48x48) - replace the whole View with Identicon
# Line 238-239: row avatar (40x40)

new_lines = []
i = 0
while i < len(lines):
    line = lines[i]
    # Header avatar line 204 (0-indexed: 203)
    if i == 203 and 'width:48, height:48' in line and 'C.green' in line:
        new_lines.append('              <Identicon address={pubkey || accounts?.[activeAccIdx]?.pubkey || ""} size={48} />\n')
        # Skip next line (the CF Text)
        i += 2
        continue
    # Row avatar line 238 (0-indexed: 237)
    elif i == 237 and 'width:40, height:40' in line and 'C.green' in line:
        new_lines.append('              <Identicon address={pubkey || accounts?.[activeAccIdx]?.pubkey || ""} size={40} />\n')
        # Skip next two lines (Text CF and closing View)
        i += 3
        continue
    else:
        new_lines.append(line)
    i += 1

with open(path, 'w') as f:
    f.writelines(new_lines)
print('PATCHED OK')

# Also add SVG import at top if not present
with open(path, 'r') as f:
    content = f.read()
if "from 'react-native-svg'" not in content:
    content = "import Svg, { Rect } from 'react-native-svg';\n" + content
    with open(path, 'w') as f:
        f.write(content)
    print('SVG import: ADDED')
else:
    print('SVG import: already exists')
