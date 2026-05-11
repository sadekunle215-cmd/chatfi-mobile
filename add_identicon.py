import os
path = os.path.expanduser('~/chatfi-v2/App.tsx')

with open(path, 'r') as f:
    content = f.read()

# Add Identicon component after imports
identicon_component = '''
// Deterministic identicon from wallet address
function Identicon({ address, size = 48 }: { address: string, size?: number }) {
  const seed = address || 'default';
  const hash = Array.from(seed).reduce((acc, c) => ((acc << 5) - acc + c.charCodeAt(0)) | 0, 0);
  const absHash = Math.abs(hash);
  
  const hue = absHash % 360;
  const colors = {
    bg: `hsl(${hue}, 30%, 12%)`,
    c1: `hsl(${hue}, 80%, 55%)`,
    c2: `hsl(${(hue + 120) % 360}, 70%, 45%)`,
    c3: `hsl(${(hue + 240) % 360}, 60%, 50%)`,
  };
  
  const grid = 5;
  const cell = size / grid;
  const cells: {x:number,y:number,color:string}[] = [];
  
  for (let row = 0; row < grid; row++) {
    for (let col = 0; col < Math.ceil(grid / 2); col++) {
      const idx = row * 3 + col;
      const on = (absHash >> (idx % 32)) & 1;
      if (on) {
        const color = [colors.c1, colors.c2, colors.c3][idx % 3];
        cells.push({ x: col * cell, y: row * cell, color });
        if (col < Math.floor(grid / 2)) {
          cells.push({ x: (grid - 1 - col) * cell, y: row * cell, color });
        }
      }
    }
  }
  
  const { Svg, Rect } = require('react-native-svg');
  return (
    <Svg width={size} height={size} style={{ borderRadius: size / 2, overflow: 'hidden' }}>
      <Rect width={size} height={size} fill={colors.bg} />
      {cells.map((c, i) => (
        <Rect key={i} x={c.x} y={c.y} width={cell} height={cell} fill={c.color} />
      ))}
    </Svg>
  );
}

'''

# Insert after the last import line
import_end = content.rfind("from './wallet';")
if import_end == -1:
    import_end = content.rfind("from './sendMsg';")

insert_pos = content.find('\n', import_end) + 1
content = content[:insert_pos] + identicon_component + content[insert_pos:]
print('Identicon component: ADDED')

# Replace CF avatar in modal header (48x48)
old_avatar1 = """<View style={{ width:48, height:48, borderRadius:24, backgroundColor:C.green, alignItems:'center', justifyContent:'center', marginRight:12 }}>
                <Text style={{ color:'#0d1117', fontWeight:'bold', fontSize:18 }}>{(accounts?.[activeAccIdx]?.name || userName || "CF")[0].toUpperCase()}</Text>
              </View>"""
new_avatar1 = """<Identicon address={accounts?.[activeAccIdx]?.pubkey || ''} size={48} />"""

if old_avatar1 in content:
    content = content.replace(old_avatar1, new_avatar1)
    print('Header avatar: PATCHED')
else:
    print('Header avatar: NOT FOUND - trying simpler replace')
    content = content.replace(
        "fontSize:18 }}>{(accounts?.[activeAccIdx]?.name || userName || \"CF\")[0].toUpperCase()}</Text>",
        "fontSize:18 }}>{'  '}</Text>"
    )

# Replace CF in account row (40x40)
content = content.replace(
    ">CF</Text>\n              </View>\n              <View style={{ flex:1 }}>\n                <Text style={{ color:C.text, fontWe\night:'600' }}>",
    ">CF</Text>\n              </View>\n              <View style={{ flex:1 }}>\n                <Text style={{ color:C.text, fontWe\night:'600' }}>"
)

with open(path, 'w') as f:
    f.write(content)
print('DONE')
