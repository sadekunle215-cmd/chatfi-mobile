import os
path = os.path.expanduser('~/chatfi-v2/App.tsx')

with open(path, 'r') as f:
    lines = f.readlines()

start = None
end = None
for i, line in enumerate(lines):
    if '{/* WALLET MODAL */}' in line:
        start = i
    if start and i > start and '</Modal>' in line:
        end = i
        break

print(f'Found modal: lines {start+1} to {end+1}')

new_modal = '''        {/* WALLET MODAL */}
        <Modal visible={showWalletModal} animationType="slide" transparent>
          <View style={s.modalOverlay}>
            <View style={[s.modalCard, {maxHeight:'85%'}]}>
              <Text style={s.modalTitle}>Accounts</Text>
              {accounts.length > 0 && (
                <ScrollView style={{width:'100%', maxHeight:300, marginBottom:12}} showsVerticalScrollIndicator={false}>
                  {accounts.map((acc, idx) => (
                    <TouchableOpacity key={acc.id} onPress={() => { switchAccount(idx); setShowWalletModal(false); }}
                      style={{flexDirection:'row', alignItems:'center', padding:12, marginBottom:6, borderRadius:12,
                        backgroundColor: idx === activeAccIdx ? '#1a2a1a' : '#161b22',
                        borderWidth:1, borderColor: idx === activeAccIdx ? '#39FF82' : '#30363d'}}>
                      <View style={{width:36, height:36, borderRadius:18, backgroundColor:'#39FF82', alignItems:'center', justifyContent:'center', marginRight:12}}>
                        <Text style={{color:'#0d1117', fontWeight:'bold', fontSize:14}}>{(acc.name||'A').charAt(0)}</Text>
                      </View>
                      <View style={{flex:1}}>
                        <Text style={{color:'#e6edf3', fontWeight:'600', fontSize:14}}>{acc.name}</Text>
                        <Text style={{color:'#8b949e', fontSize:11}}>{acc.pubkey ? acc.pubkey.slice(0,4)+'...'+acc.pubkey.slice(-4) : ''}</Text>
                      </View>
                      {idx === activeAccIdx && <Text style={{color:'#39FF82', fontSize:18}}>✓</Text>}
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}
              {!showAddOptions ? (
                <TouchableOpacity style={s.greenBtn} onPress={() => setShowAddOptions(true)}>
                  <Text style={s.greenBtnTxt}>+ Add Account</Text>
                </TouchableOpacity>
              ) : (
                <View style={{width:'100%'}}>
                  <TouchableOpacity style={s.greenBtn} onPress={async () => { await addAccount(); setShowAddOptions(false); }}>
                    <Text style={s.greenBtnTxt}>Create New Wallet</Text>
                  </TouchableOpacity>
                  <Text style={s.orText}>— or import existing —</Text>
                  <TextInput style={s.seedInput} value={importSeed} onChangeText={setImportSeed} placeholder="Enter 12 or 24 word seed phrase..." placeholderTextColor={C.muted} multiline numberOfLines={3} />
                  <TouchableOpacity style={s.outlineBtn} onPress={importWallet}>
                    <Text style={s.outlineBtnTxt}>Import Wallet</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[s.closeBtn, {marginTop:8}]} onPress={() => setShowAddOptions(false)}>
                    <Text style={s.closeBtnTxt}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              )}
              <TouchableOpacity style={[s.closeBtn, {marginTop:8}]} onPress={() => { setShowWalletModal(false); setShowAddOptions(false); }}>
                <Text style={s.closeBtnTxt}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>\n'''

lines[start:end+1] = [new_modal]
with open(path, 'w') as f:
    f.writelines(lines)
print('PATCHED OK')
