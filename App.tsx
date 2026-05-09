import { View, Text, TouchableOpacity, StyleSheet, ScrollView, TextInput, StatusBar, SafeAreaView, Modal, Alert } from 'react-native';
import { useState, useEffect } from 'react';
import Svg, { Path, Circle, Line, Polyline, Rect, Polygon } from 'react-native-svg';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { generateWallet, getPublicKey } from './wallet';

const C = {
  bg: '#0d1117',
  card: '#161b22',
  card2: '#1c2128',
  border: '#30363d',
  green: '#3fb950',
  blue: '#58a6ff',
  text: '#e6edf3',
  muted: '#8b949e',
  red: '#f85149',
};

const IconChat = ({size=22,color=C.muted}) => <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><Path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2
cd ~/chatfi-v2 && cat > App.tsx << 'EOF'
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, TextInput, StatusBar, SafeAreaView, Modal, Alert } from 'react-native';
import { useState, useEffect } from 'react';
import Svg, { Path, Circle, Line, Polyline, Rect, Polygon } from 'react-native-svg';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { generateWallet, getPublicKey } from './wallet';

const C = {
  bg: '#0d1117',
  card: '#161b22',
  card2: '#1c2128',
  border: '#30363d',
  green: '#3fb950',
  blue: '#58a6ff',
  text: '#e6edf3',
  muted: '#8b949e',
  red: '#f85149',
};

const IconChat = ({size=22,color=C.muted}) => <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><Path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></Svg>;
const IconSwap = ({size=22,color=C.muted}) => <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><Polyline points="17 1 21 5 17 9"/><Path d="M3 11V9a4 4 0 0 1 4-4h14"/><Polyline points="7 23 3 19 7 15"/><Path d="M21 13v2a4 4 0 0 1-4 4H3"/></Svg>;
const IconChart = ({size=22,color=C.muted}) => <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><Line x1="18" y1="20" x2="18" y2="10"/><Line x1="12" y1="20" x2="12" y2="4"/><Line x1="6" y1="20" x2="6" y2="14"/></Svg>;
const IconSettings = ({size=22,color=C.muted}) => <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><Circle cx="12" cy="12" r="3"/><Path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></Svg>;
const IconSend = ({size=18,color=C.bg}) => <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><Line x1="22" y1="2" x2="11" y2="13"/><Polygon points="22 2 15 22 11 13 2 9 22 2"/></Svg>;
const IconWallet = ({size=16,color=C.green}) => <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><Rect x="2" y="5" width="20" height="14" rx="2"/><Path d="M16 12h2"/><Path d="M2 10h20"/></Svg>;

const TABS = [
  {id:'chat',label:'Chat',Icon:IconChat},
  {id:'swap',label:'Swap',Icon:IconSwap},
  {id:'portfolio',label:'Portfolio',Icon:IconChart},
  {id:'settings',label:'Settings',Icon:IconSettings},
];

export default function App() {
  const [tab, setTab] = useState('chat');
  const [wallet, setWallet] = useState<string|null>(null);
  const [pubkey, setPubkey] = useState<string|null>(null);
  const [showWalletModal, setShowWalletModal] = useState(false);
  const [showSeedModal, setShowSeedModal] = useState(false);
  const [seedPhrase, setSeedPhrase] = useState('');
  const [importSeed, setImportSeed] = useState('');
  const [msgs, setMsgs] = useState([
    {id:1, text:'Welcome to ChatFi! Your AI-powered DeFi assistant on Solana.\n\nCreate or import a wallet to get started.', from:'bot'}
  ]);
  const [input, setInput] = useState('');
  const [from, setFrom] = useState('SOL');
  const [to, setTo] = useState('USDC');
  const [amt, setAmt] = useState('');

  useEffect(() => {
    AsyncStorage.getItem('wallet_mnemonic').then(m => {
      if (m) {
        setWallet(m);
        setPubkey(getPublicKey(m));
      }
    });
  }, []);

  const createWallet = () => {
    const mnemonic = generateWallet();
    setSeedPhrase(mnemonic);
    setShowSeedModal(true);
  };

  const confirmSeed = async () => {
    await AsyncStorage.setItem('wallet_mnemonic', seedPhrase);
    setWallet(seedPhrase);
    setPubkey(getPublicKey(seedPhrase));
    setShowSeedModal(false);
    setShowWalletModal(false);
    Alert.alert('Wallet Created!', 'Your wallet is ready. Keep your seed phrase safe!');
  };

  const importWallet = async () => {
    const words = importSeed.trim().split(/\s+/);
    if (words.length !== 12 && words.length !== 24) {
      Alert.alert('Invalid', 'Please enter a valid 12 or 24 word seed phrase');
      return;
    }
    try {
      const pk = getPublicKey(importSeed.trim());
      await AsyncStorage.setItem('wallet_mnemonic', importSeed.trim());
      setWallet(importSeed.trim());
      setPubkey(pk);
      setShowWalletModal(false);
      setImportSeed('');
      Alert.alert('Wallet Imported!', 'Your wallet has been imported successfully.');
    } catch {
      Alert.alert('Error', 'Invalid seed phrase');
    }
  };

  const send = () => {
    if (!input.trim()) return;
    const q = input;
    setMsgs(p => [...p, {id:Date.now(), text:q, from:'user'}]);
    setInput('');
    setTimeout(() => {
      setMsgs(p => [...p, {id:Date.now()+1, text:'AI backend coming soon. Your wallet: ' + (pubkey ? pubkey.slice(0,8)+'...' : 'not connected'), from:'bot'}]);
    }, 400);
  };

  const shortKey = pubkey ? pubkey.slice(0,4)+'...'+pubkey.slice(-4) : null;

  return (
    <SafeAreaView style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />

      <View style={s.header}>
        <View style={s.logoRow}>
          <View style={s.logoDot}/>
          <Text style={s.logoText}>ChatFi</Text>
        </View>
        <TouchableOpacity style={[s.walletBtn, wallet && s.walletBtnConnected]} onPress={() => setShowWalletModal(true)}>
          <IconWallet size={14} color={wallet ? C.green : C.muted}/>
          <Text style={[s.walletBtnTxt, wallet && {color:C.green}]}>{wallet ? shortKey : 'Connect'}</Text>
        </TouchableOpacity>
      </View>

      <View style={s.content}>
        {tab==='chat' && (
          <View style={s.flex}>
            <ScrollView style={s.msgs} contentContainerStyle={{paddingBottom:16}}>
              {msgs.map(m => (
                <View key={m.id} style={[s.bubble, m.from==='user' ? s.userBubble : s.botBubble]}>
                  {m.from==='bot' && <View style={s.botTag}><View style={s.botDot}/><Text style={s.botTagTxt}>ChatFi AI</Text></View>}
                  <Text style={s.bubbleTxt}>{m.text}</Text>
                </View>
              ))}
            </ScrollView>
            <View style={s.inputRow}>
              <TextInput style={s.input} value={input} onChangeText={setInput} placeholder="Ask ChatFi anything..." placeholderTextColor={C.muted} onSubmitEditing={send}/>
              <TouchableOpacity style={s.sendBtn} onPress={send}><IconSend size={16} color={C.bg}/></TouchableOpacity>
            </View>
          </View>
        )}

        {tab==='swap' && (
          <ScrollView style={s.pad}>
            <Text style={s.pageTitle}>Swap</Text>
            <View style={s.card}>
              <Text style={s.cardLabel}>You Pay</Text>
              <TextInput style={s.bigInput} value={amt} onChangeText={setAmt} placeholder="0" placeholderTextColor={C.border} keyboardType="numeric"/>
              <View style={s.tokenRow}>
                {['SOL','USDC','JUP','BONK','WIF'].map(t => (
                  <TouchableOpacity key={t} onPress={()=>setFrom(t)} style={[s.chip, from===t && s.chipActive]}>
                    <Text style={[s.chipTxt, from===t && s.chipTxtActive]}>{t}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <View style={s.arrowRow}><Text style={{color:C.green,fontSize:20}}>↓</Text></View>
            <View style={s.card}>
              <Text style={s.cardLabel}>You Receive</Text>
              <Text style={s.bigOutput}>—</Text>
              <View style={s.tokenRow}>
                {['SOL','USDC','JUP','BONK','WIF'].map(t => (
                  <TouchableOpacity key={t} onPress={()=>setTo(t)} style={[s.chip, to===t && s.chipActive]}>
                    <Text style={[s.chipTxt, to===t && s.chipTxtActive]}>{t}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <TouchableOpacity style={s.greenBtn}><Text style={s.greenBtnTxt}>Get Quote</Text></TouchableOpacity>
            {!wallet && <TouchableOpacity style={s.outlineBtn} onPress={()=>setShowWalletModal(true)}><IconWallet size={15} color={C.blue}/><Text style={s.outlineBtnTxt}>Connect Wallet to Swap</Text></TouchableOpacity>}
          </ScrollView>
        )}

        {tab==='portfolio' && (
          <ScrollView style={s.pad}>
            <Text style={s.pageTitle}>Portfolio</Text>
            {!wallet ? (
              <View style={s.emptyState}>
                <Text style={s.emptyTitle}>No Wallet Connected</Text>
                <Text style={s.emptyText}>Create or import a wallet to view your portfolio</Text>
                <TouchableOpacity style={s.greenBtn} onPress={()=>setShowWalletModal(true)}><Text style={s.greenBtnTxt}>Get Started</Text></TouchableOpacity>
              </View>
            ) : (
              <View>
                <View style={s.balanceCard}>
                  <Text style={s.balLabel}>Wallet</Text>
                  <Text style={s.walletAddress}>{pubkey?.slice(0,20)}...</Text>
                  <Text style={s.balValue}>$0.00</Text>
                  <Text style={s.balSub}>Connect to mainnet to load balances</Text>
                </View>
              </View>
            )}
          </ScrollView>
        )}

        {tab==='settings' && (
          <ScrollView style={s.pad}>
            <Text style={s.pageTitle}>Settings</Text>
            {wallet && (
              <View style={s.card}>
                <Text style={s.cardLabel}>Connected Wallet</Text>
                <Text style={s.settingVal} numberOfLines={1}>{pubkey}</Text>
              </View>
            )}
            {[
              {label:'RPC Endpoint', val:'mainnet-beta'},
              {label:'Slippage', val:'0.5%'},
              {label:'Theme', val:'Dark'},
              {label:'Version', val:'1.0.0'},
            ].map(r => (
              <View key={r.label} style={s.settingRow}>
                <Text style={s.settingLabel}>{r.label}</Text>
                <Text style={s.settingVal}>{r.val}</Text>
              </View>
            ))}
            {wallet && (
              <TouchableOpacity style={s.dangerBtn} onPress={async()=>{
                Alert.alert('Remove Wallet','This will remove your wallet from this device. Make sure you have your seed phrase!',
                  [{text:'Cancel',style:'cancel'},{text:'Remove',style:'destructive',onPress:async()=>{
                    await AsyncStorage.removeItem('wallet_mnemonic');
                    setWallet(null); setPubkey(null);
                  }}]);
              }}>
                <Text style={s.dangerBtnTxt}>Remove Wallet</Text>
              </TouchableOpacity>
            )}
          </ScrollView>
        )}
      </View>

      <View style={s.tabBar}>
        {TABS.map(({id,label,Icon}) => {
          const active = tab===id;
          return (
            <TouchableOpacity key={id} style={s.tabItem} onPress={()=>setTab(id)}>
              <Icon size={22} color={active ? C.green : C.muted}/>
              <Text style={[s.tabLabel, active && s.tabLabelActive]}>{label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Wallet Modal */}
      <Modal visible={showWalletModal} animationType="slide" transparent>
        <View style={s.modalOverlay}>
          <View style={s.modalCard}>
            <Text style={s.modalTitle}>Wallet</Text>
            <TouchableOpacity style={s.greenBtn} onPress={createWallet}>
              <Text style={s.greenBtnTxt}>Create New Wallet</Text>
            </TouchableOpacity>
            <Text style={s.orText}>— or import existing —</Text>
            <TextInput
              style={s.seedInput}
              value={importSeed}
              onChangeText={setImportSeed}
              placeholder="Enter 12 or 24 word seed phrase..."
              placeholderTextColor={C.muted}
              multiline
              numberOfLines={3}
            />
            <TouchableOpacity style={s.outlineBtn} onPress={importWallet}>
              <Text style={s.outlineBtnTxt}>Import Wallet</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.closeBtn} onPress={()=>setShowWalletModal(false)}>
              <Text style={s.closeBtnTxt}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Seed Phrase Modal */}
      <Modal visible={showSeedModal} animationType="slide" transparent>
        <View style={s.modalOverlay}>
          <View style={s.modalCard}>
            <Text style={s.modalTitle}>Your Seed Phrase</Text>
            <Text style={s.seedWarning}>Write these 12 words down and keep them safe. Never share them with anyone!</Text>
            <View style={s.seedGrid}>
              {seedPhrase.split(' ').map((word, i) => (
                <View key={i} style={s.seedWord}>
                  <Text style={s.seedNum}>{i+1}</Text>
                  <Text style={s.seedWordTxt}>{word}</Text>
                </View>
              ))}
            </View>
            <TouchableOpacity style={s.greenBtn} onPress={confirmSeed}>
              <Text style={s.greenBtnTxt}>I've Written It Down</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.closeBtn} onPress={()=>setShowSeedModal(false)}>
              <Text style={s.closeBtnTxt}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root:{flex:1,backgroundColor:C.bg},
  flex:{flex:1},
  header:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',paddingHorizontal:20,paddingVertical:14,borderBottomWidth:1,borderBottomColor:C.border},
  logoRow:{flexDirection:'row',alignItems:'center',gap:8},
  logoDot:{width:10,height:10,borderRadius:5,backgroundColor:C.green},
  logoText:{color:C.text,fontSize:20,fontWeight:'bold'},
  walletBtn:{flexDirection:'row',alignItems:'center',gap:6,borderWidth:1,borderColor:C.border,borderRadius:20,paddingHorizontal:14,paddingVertical:7},
  walletBtnConnected:{borderColor:C.green},
  walletBtnTxt:{color:C.muted,fontSize:13,fontWeight:'600'},
  content:{flex:1},
  pad:{padding:16},
  msgs:{flex:1,paddingHorizontal:16,paddingTop:16},
  bubble:{marginBottom:12,maxWidth:'85%'},
  userBubble:{alignSelf:'flex-end',backgroundColor:C.card2,borderRadius:16,borderBottomRightRadius:4,padding:12,borderWidth:1,borderColor:C.border},
  botBubble:{alignSelf:'flex-start',backgroundColor:C.card,borderRadius:16,borderBottomLeftRadius:4,padding:12,borderWidth:1,borderColor:C.border},
  botTag:{flexDirection:'row',alignItems:'center',gap:5,marginBottom:6},
  botDot:{width:6,height:6,borderRadius:3,backgroundColor:C.green},
  botTagTxt:{color:C.green,fontSize:11,fontWeight:'600'},
  bubbleTxt:{color:C.text,fontSize:14,lineHeight:21},
  inputRow:{flexDirection:'row',paddingHorizontal:16,paddingVertical:12,borderTopWidth:1,borderTopColor:C.border,gap:10},
  input:{flex:1,backgroundColor:C.card,color:C.text,borderRadius:24,paddingHorizontal:18,paddingVertical:11,fontSize:14,borderWidth:1,borderColor:C.border},
  sendBtn:{width:44,height:44,borderRadius:22,backgroundColor:C.green,alignItems:'center',justifyContent:'center'},
  pageTitle:{color:C.text,fontSize:22,fontWeight:'bold',marginBottom:18},
  card:{backgroundColor:C.card,borderRadius:16,padding:16,borderWidth:1,borderColor:C.border,marginBottom:8},
  cardLabel:{color:C.muted,fontSize:12,marginBottom:8},
  bigInput:{color:C.text,fontSize:32,fontWeight:'bold',paddingVertical:4},
  bigOutput:{color:C.muted,fontSize:32,fontWeight:'bold',paddingVertical:4,marginBottom:8},
  tokenRow:{flexDirection:'row',flexWrap:'wrap',gap:6,marginTop:8},
  chip:{paddingHorizontal:12,paddingVertical:6,borderRadius:20,backgroundColor:C.bg,borderWidth:1,borderColor:C.border},
  chipActive:{backgroundColor:C.green,borderColor:C.green},
  chipTxt:{color:C.muted,fontSize:12},
  chipTxtActive:{color:C.bg,fontWeight:'bold'},
  arrowRow:{alignItems:'center',paddingVertical:8},
  greenBtn:{backgroundColor:C.green,borderRadius:14,padding:16,alignItems:'center',marginTop:8},
  greenBtnTxt:{color:C.bg,fontWeight:'bold',fontSize:16},
  outlineBtn:{flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8,borderWidth:1,borderColor:C.blue,borderRadius:14,padding:14,marginTop:8},
  outlineBtnTxt:{color:C.blue,fontWeight:'600',fontSize:14},
  emptyState:{alignItems:'center',paddingTop:60,gap:12},
  emptyTitle:{color:C.text,fontSize:18,fontWeight:'bold'},
  emptyText:{color:C.muted,fontSize:14,textAlign:'center'},
  balanceCard:{backgroundColor:C.card,borderRadius:16,padding:20,borderWidth:1,borderColor:C.border,alignItems:'center',marginBottom:16},
  balLabel:{color:C.muted,fontSize:12},
  walletAddress:{color:C.blue,fontSize:13,marginVertical:4},
  balValue:{color:C.text,fontSize:36,fontWeight:'bold'},
  balSub:{color:C.muted,fontSize:12,marginTop:4},
  settingRow:{flexDirection:'row',justifyContent:'space-between',paddingVertical:16,borderBottomWidth:1,borderBottomColor:C.border},
  settingLabel:{color:C.text,fontSize:15},
  settingVal:{color:C.green,fontSize:14,flex:1,textAlign:'right'},
  dangerBtn:{borderWidth:1,borderColor:C.red,borderRadius:14,padding:14,alignItems:'center',marginTop:16},
  dangerBtnTxt:{color:C.red,fontWeight:'600',fontSize:14},
  modalOverlay:{flex:1,backgroundColor:'rgba(0,0,0,0.7)',justifyContent:'flex-end'},
  modalCard:{backgroundColor:C.card,borderTopLeftRadius:24,borderTopRightRadius:24,padding:24,borderWidth:1,borderColor:C.border},
  modalTitle:{color:C.text,fontSize:20,fontWeight:'bold',marginBottom:16,textAlign:'center'},
  orText:{color:C.muted,fontSize:13,textAlign:'center',marginVertical:12},
  seedInput:{backgroundColor:C.bg,color:C.text,borderRadius:12,padding:14,fontSize:14,borderWidth:1,borderColor:C.border,minHeight:80,textAlignVertical:'top'},
  closeBtn:{padding:14,alignItems:'center',marginTop:8},
  closeBtnTxt:{color:C.muted,fontSize:14},
  seedWarning:{color:C.orange,fontSize:13,textAlign:'center',marginBottom:16,lineHeight:20},
  seedGrid:{flexDirection:'row',flexWrap:'wrap',gap:8,marginBottom:16},
  seedWord:{width:'30%',flexDirection:'row',alignItems:'center',backgroundColor:C.bg,borderRadius:8,padding:8,borderWidth:1,borderColor:C.border,gap:6},
  seedNum:{color:C.muted,fontSize:11,width:16},
  seedWordTxt:{color:C.text,fontSize:13,fontWeight:'600'},
  orange:{color:'#d29922'},
  tabBar:{flexDirection:'row',backgroundColor:C.card,borderTopWidth:1,borderTopColor:C.border,paddingTop:10,paddingBottom:24},
  tabItem:{flex:1,alignItems:'center',gap:4},
  tabLabel:{color:C.muted,fontSize:11},
  tabLabelActive:{color:C.green,fontWeight:'600'},
});
