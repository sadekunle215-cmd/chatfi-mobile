import os
path = os.path.expanduser('~/chatfi-v2/App.tsx')

with open(path, 'r') as f:
    content = f.read()

# Remove the bad require inside Identicon and fix the import
old_identicon = '''  const { Svg, Rect } = require('react-native-svg');
  return (
    <Svg width={size} height={size} style={{ borderRadius: size / 2, overflow: 'hidden' }}>
      <Rect width={size} height={size} fill={colors.bg} />
      {cells.map((c, i) => (
        <Rect key={i} x={c.x} y={c.y} width={cell} height={cell} fill={c.color} />
      ))}
    </Svg>
  );'''

new_identicon = '''  return (
    <Svg width={size} height={size} style={{ borderRadius: size / 2, overflow: 'hidden' }}>
      <Rect width={size} height={size} fill={colors.bg} />
      {cells.map((c, i) => (
        <Rect key={i} x={c.x} y={c.y} width={cell} height={cell} fill={c.color} />
      ))}
    </Svg>
  );'''

if old_identicon in content:
    content = content.replace(old_identicon, new_identicon)
    print('Identicon body: FIXED')
else:
    print('NOT FOUND')

# Fix SVG import at top - replace any bad import
if "import Svg, { Rect } from 'react-native-svg';" not in content:
    # Add after first import line
    first_import = content.find('import ')
    end_of_line = content.find('\n', first_import)
    content = content[:end_of_line+1] + "import Svg, { Rect } from 'react-native-svg';\n" + content[end_of_line+1:]
    print('SVG import: ADDED')
else:
    print('SVG import: OK')

with open(path, 'w') as f:
    f.write(content)
