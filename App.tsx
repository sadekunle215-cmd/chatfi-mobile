import React, { useState, useEffect, useCallback } from 'react';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { Image, View, Text, TouchableOpacity, StyleSheet, ScrollView, TextInput, StatusBar, SafeAreaView, Modal, Alert, ActivityIndicator, Clipboard, RefreshControl, KeyboardAvoidingView, Platform, Animated } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { generateWallet, getPublicKey, importWallet as deriveWallet, signAndSendTransaction } from './wallet';
import nacl from 'tweetnacl';
import { askAI, getJupiterQuote, executeSwap as executeSwapTx, getTokenPrice, createTriggerOrder, createRecurringOrder } from './sendMsg';
import { TOKENS, DECIMALS, getWalletBalances, getTokenPrices } from './wallet';

const C = {
  bg: '#0d1117', card: '#161b22', card2: '#1c2128',
  border: '#30363d', green: '#3fb950', blue: '#58a6ff',
  text: '#e6edf3', muted: '#8b949e', red: '#f85149', orange: '#d29922',
};

const RPC = 'https://api.mainnet-beta.solana.com';

const TABS = [
  { id: 'chat', label: 'Chat', icon: 'chatbubble-outline', iconActive: 'chatbubble' },
  { id: 'swap', label: 'Swap', icon: 'swap-horizontal-outline', iconActive: 'swap-horizontal' },
  { id: 'portfolio', label: 'Portfolio', icon: 'time-outline', iconActive: 'time' },
  { id: 'dapp', label: 'Dapp', icon: 'compass-outline', iconActive: 'compass-sharp' },
];

const TOKEN_LIST = ['SOL','USDC','JUP','BONK','WIF','USDT'];

const TOKEN_MINTS: Record<string, string> = {
  SOL: 'So11111111111111111111111111111111111111112',
  USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  USDT: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
  JUP: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN',
  BONK: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
  WIF: 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm',
};


const POPULAR_DAPPS = [
  { name: 'Jupiter', url: 'https://jup.ag', domain: 'jup.ag', desc: 'Best swap aggregator' },
  { name: 'Raydium', url: 'https://raydium.io', domain: 'raydium.io', desc: 'AMM & liquidity' },
  { name: 'Orca', url: 'https://orca.so', domain: 'orca.so', desc: 'User-friendly DEX' },
  { name: 'Kamino', url: 'https://kamino.finance', domain: 'kamino.finance', desc: 'Yield & lending' },
  { name: 'Drift', url: 'https://drift.trade', domain: 'drift.trade', desc: 'Perp trading' },
  { name: 'Marinade', url: 'https://marinade.finance', domain: 'marinade.finance', desc: 'Liquid staking' },
  { name: 'Magic Eden', url: 'https://magiceden.io', domain: 'magiceden.io', desc: 'NFT marketplace' },
  { name: 'Tensor', url: 'https://tensor.trade', domain: 'tensor.trade', desc: 'NFT trading' },
];



function TokenModal({ token, pubkey, onClose }) {
  const [view, setView] = React.useState('main');
  const [importSeedInput, setImportSeedInput] = React.useState('');
  const [sendAddr, setSendAddr] = React.useState('');
  const [sendAmt, setSendAmt] = React.useState('');
  if (!token) return null;

  return (
    <Modal visible={!!token} animationType="slide" transparent onRequestClose={onClose}>
      <View style={{ flex:1, backgroundColor:'rgba(0,0,0,0.6)', justifyContent:'flex-end' }} pointerEvents="box-none">
        <View style={{ backgroundColor:'#161b22', borderTopLeftRadius:24, borderTopRightRadius:24, paddingHorizontal:16, paddingVertical:24, maxHeight:'85%' }}>

          {/* Header */}
          <View style={{ flexDirection:'row', alignItems:'center', marginBottom:20 }}>
            <Image source={{ uri: token.logoURI || 'https://img.jup.ag/tokens/'+token.mint }}
              style={{ width:44, height:44, borderRadius:22, backgroundColor:C.card2, marginRight:12 }} />
            <View style={{ flex:1 }}>
              <Text style={{ color:C.text, fontWeight:'bold', fontSize:18 }}>{token.symbol}</Text>
              <Text style={{ color:C.muted, fontSize:13 }}>{token.amount?.toFixed(4)} {token.symbol}</Text>
            </View>
            <TouchableOpacity onPress={onClose}>
              <Text style={{ color:C.muted, fontSize:22 }}>✕</Text>
            </TouchableOpacity>
          </View>

          {view === 'main' && (
            <View style={{ flexDirection:'row', gap:12, marginBottom:8 }}>
              <TouchableOpacity onPress={() => setView('receive')}
                style={{ flex:1, backgroundColor:C.card, borderRadius:14, padding:16, alignItems:'center', gap:6 }}>
                <Ionicons name="arrow-down-outline" size={24} color={C.text} />
                <Text style={{ color:C.text, fontWeight:'600' }}>Receive</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setView('send')}
                style={{ flex:1, backgroundColor:C.green, borderRadius:14, padding:16, alignItems:'center', gap:6 }}>
                <Ionicons name="arrow-up-outline" size={24} color="#0d1117" />
                <Text style={{ color:'#0d1117', fontWeight:'bold' }}>Send</Text>
              </TouchableOpacity>
            </View>
          )}

          {view === 'receive' && (
            <ScrollView>
              <TouchableOpacity onPress={() => setView('main')} style={{ marginBottom:16 }}>
                <Text style={{ color:C.text, fontSize:16 }}>‹ Back</Text>
              </TouchableOpacity>
              <Text style={{ color:C.text, fontWeight:'bold', fontSize:16, marginBottom:16, textAlign:'center' }}>
                Receive {token.symbol}
              </Text>
              <View style={{ backgroundColor:C.card, borderRadius:16, padding:20, alignItems:'center', marginBottom:16 }}>
                <Image source={{ uri: 'https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=' + (pubkey||'') }}
                  style={{ width:200, height:200, borderRadius:8 }} />
              </View>
              <Text style={{ color:C.muted, fontSize:12, textAlign:'center', marginBottom:8 }}>Your wallet address</Text>
              <TouchableOpacity onPress={() => Alert.alert('Copied', pubkey||'')}
                style={{ backgroundColor:C.card, borderRadius:12, padding:14 }}>
                <Text style={{ color:C.green, fontSize:12, fontFamily:'monospace', textAlign:'center' }}>{pubkey}</Text>
              </TouchableOpacity>
              <Text style={{ color:C.muted, fontSize:11, textAlign:'center', marginTop:8 }}>Tap address to copy</Text>
            </ScrollView>
          )}

          {view === 'send' && (
            <ScrollView>
              <TouchableOpacity onPress={() => setView('main')} style={{ marginBottom:16 }}>
                <Text style={{ color:C.text, fontSize:16 }}>‹ Back</Text>
              </TouchableOpacity>
              <Text style={{ color:C.text, fontWeight:'bold', fontSize:16, marginBottom:16 }}>Send {token.symbol}</Text>
              <Text style={{ color:C.muted, fontSize:13, marginBottom:6 }}>Recipient Address</Text>
              <TextInput value={sendAddr} onChangeText={setSendAddr}
                placeholder="Enter Solana address..." placeholderTextColor={C.muted}
                style={{ backgroundColor:C.card, color:C.text, borderRadius:12, padding:14, fontSize:13, marginBottom:16 }}
                autoCapitalize="none" />
              <Text style={{ color:C.muted, fontSize:13, marginBottom:6 }}>Amount ({token.symbol})</Text>
              <TextInput value={sendAmt} onChangeText={setSendAmt}
                placeholder="0.00" placeholderTextColor={C.muted} keyboardType="numeric"
                style={{ backgroundColor:C.card, color:C.text, borderRadius:12, padding:14, fontSize:20, fontWeight:'bold', marginBottom:24 }} />
              <TouchableOpacity style={{ backgroundColor:C.green, borderRadius:14, padding:16, alignItems:'center' }}
                onPress={() => Alert.alert('Send', `Send ${sendAmt} ${token.symbol} to ${sendAddr.slice(0,8)}...?`)}>
                <Text style={{ color:'#0d1117', fontWeight:'bold', fontSize:16 }}>Send {token.symbol}</Text>
              </TouchableOpacity>
            </ScrollView>
          )}

        </View>
      </View>
    </Modal>
  );
}


function TokLogo({uri, symbol, style, fallback}: {uri:string, symbol:string, style:any, fallback?:string}) {
  const [tries, setTries] = React.useState(0);
  const mint = uri.split('/').pop(); const proxy = 'https://chatfi.pro/api/portfolio?tokenImage=' + mint; const sources = [uri, proxy, fallback || ''].filter(Boolean);
  if(tries >= sources.length) return <View style={[style,{alignItems:'center',justifyContent:'center',backgroundColor:'#1a2a1a'}]}><Text style={{color:'#39ff14',fontSize:11,fontWeight:'bold'}}>{symbol?symbol.slice(0,3):''}</Text></View>;
  return <Image source={{uri:sources[tries]}} style={style} onError={()=>setTries(t=>t+1)} />;
}
function AccountModal({ visible, onClose, pubkey, wallet, onRemoveWallet, userName, setUserName, accounts, activeAccIdx, switchAccount, addAccount, importSeedInput, setImportSeedInput }: any) {
  const [view, setView] = React.useState('main');
  const [nameInput, setNameInput] = React.useState(userName || '');
  React.useEffect(() => { setNameInput(userName || ''); }, [userName]);
  const short = pubkey ? pubkey.slice(0,6)+'...'+pubkey.slice(-4) : '';

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={{ flex:1, backgroundColor:'rgba(0,0,0,0.6)', justifyContent:'flex-end' }} pointerEvents="box-none">
        <View style={{ backgroundColor:'#161b22', borderTopLeftRadius:24, borderTopRightRadius:24, maxHeight:'90%' }}>

          {view === 'main' && (
            <ScrollView>
              {/* Header */}
              <View style={{ flexDirection:'row', alignItems:'center', padding:20, borderBottomWidth:1, borderBottomColor:'#30363d' }}>
                <View style={{ width:48, height:48, borderRadius:24, backgroundColor:C.green, alignItems:'center', justifyContent:'center', marginRight:12 }}>
                  <Text style={{ color:'#0d1117', fontWeight:'bold', fontSize:18 }}>{userName ? userName[0].toUpperCase() : 'CF'}</Text>
                </View>
                <View style={{ flex:1 }}>
                  <Text style={{ color:C.text, fontWeight:'bold', fontSize:16 }}>{userName || 'ChatFi Wallet'}</Text>
                  <Text style={{ color:C.muted, fontSize:12 }}>{short || 'No wallet connected'}</Text>
                </View>
                <TouchableOpacity onPress={onClose}>
                  <Text style={{ color:C.muted, fontSize:22, paddingLeft:12 }}>✕</Text>
                </TouchableOpacity>
              </View>

              {/* Profile & Settings buttons */}
              <View style={{ flexDirection:'row', gap:12, padding:16 }}>
                <TouchableOpacity onPress={() => setView('profile')} style={{ flex:1, backgroundColor:'#1c2128', borderRadius:14, padding:16, alignItems:'center', gap:6 }}>
                  <Ionicons name='person-outline' size={24} color={C.text} />
                  <Text style={{ color:C.text, fontSize:13 }}>Profile</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setView('settings')} style={{ flex:1, backgroundColor:'#1c2128', borderRadius:14, padding:16, alignItems:'center', gap:6 }}>
                  <Ionicons name='settings-outline' size={24} color={C.text} />
                  <Text style={{ color:C.text, fontSize:13 }}>Settings</Text>
                </TouchableOpacity>
              </View>

              {/* Wallet balance */}
              <View style={{ margin:16, backgroundColor:'#1c2128', borderRadius:14, padding:20 }}>
                <Text style={{ color:C.muted, fontSize:13 }}>Wallet Address</Text>
                <Text style={{ color:C.green, fontSize:12, marginTop:4, fontFamily:'monospace' }}>{pubkey || 'Not connected'}</Text>
              </View>

              {/* Accounts */}
              <Text style={{ color:C.muted, fontSize:11, fontWeight:'600', paddingHorizontal:16, marginBottom:8, letterSpacing:1 }}>YOUR ACCOUNTS</Text>
              <View style={{ marginHorizontal:16, backgroundColor:'#1c2128', borderRadius:14, marginBottom:16 }}>
                <View style={{ flexDirection:'row', alignItems:'center', padding:16, borderBottomWidth:1, borderBottomColor:'#30363d' }}>
                  <View style={{ width:40, height:40, borderRadius:20, backgroundColor:C.green, alignItems:'center', justifyContent:'center', marginRight:12 }}>
                    <Text style={{ color:'#0d1117', fontWeight:'bold' }}>CF</Text>
                  </View>
                  <View style={{ flex:1 }}>
                    <Text style={{ color:C.text, fontWeight:'600' }}>Account 1</Text>
                    <Text style={{ color:C.muted, fontSize:12 }}>{short}</Text>
                  </View>
                  <Text style={{ color:C.green, fontSize:16 }}>✓</Text>
                </View>
              </View>
            </ScrollView>
          )}

          {view === 'addAccount' && (
            <ScrollView>
              <View style={{ flexDirection:'row', alignItems:'center', padding:20, borderBottomWidth:1, borderBottomColor:'#30363d' }}>
                <TouchableOpacity onPress={() => setView('manageAccounts')} style={{ marginRight:12 }}>
                  <Text style={{ color:C.text, fontSize:20 }}>‹</Text>
                </TouchableOpacity>
                <Text style={{ color:C.text, fontSize:18, fontWeight:'bold', flex:1 }}>Add Account</Text>
                <TouchableOpacity onPress={onClose}>
                  <Text style={{ color:C.muted, fontSize:22 }}>✕</Text>
                </TouchableOpacity>
              </View>
              <View style={{ padding:20, gap:12 }}>
                <TouchableOpacity onPress={() => { addAccount(); setView('manageAccounts'); }}
                  style={{ backgroundColor:C.green, borderRadius:14, padding:18, alignItems:'center' }}>
                  <Ionicons name="add-circle-outline" size={24} color="#0d1117" />
                  <Text style={{ color:'#0d1117', fontWeight:'bold', fontSize:16 }}>Create New Account</Text>
                  <Text style={{ color:'#0d1117', fontSize:12, marginTop:4, textAlign:'center', width:'100%' }}>Generate a new wallet</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setView('importAccount')}
                  style={{ backgroundColor:'#1c2128', borderRadius:14, padding:18, alignItems:'center', borderWidth:1, borderColor:C.green }}>
                  <Ionicons name="download-outline" size={24} color={C.green} />
                  <Text style={{ color:C.green, fontWeight:'bold', fontSize:16 }}>Import Account</Text>
                  <Text style={{ color:C.muted, fontSize:12, marginTop:4, textAlign:'center', width:'100%' }}>Use existing seed phrase</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          )}

          {view === 'importAccount' && (
            <ScrollView>
              <View style={{ flexDirection:'row', alignItems:'center', padding:20, borderBottomWidth:1, borderBottomColor:'#30363d' }}>
                <TouchableOpacity onPress={() => setView('addAccount')} style={{ marginRight:12 }}>
                  <Text style={{ color:C.text, fontSize:20 }}>‹</Text>
                </TouchableOpacity>
                <Text style={{ color:C.text, fontSize:18, fontWeight:'bold', flex:1 }}>Import Account</Text>
                <TouchableOpacity onPress={onClose}>
                  <Text style={{ color:C.muted, fontSize:22 }}>✕</Text>
                </TouchableOpacity>
              </View>
              <View style={{ padding:20 }}>
                <Text style={{ color:C.muted, fontSize:13, marginBottom:8 }}>Enter your seed phrase</Text>
                <TextInput
                  value={importSeedInput}
                  onChangeText={setImportSeedInput}
                  placeholder="Enter 12 or 24 word seed phrase..."
                  placeholderTextColor={C.muted}
                  multiline numberOfLines={3}
                  autoCapitalize="none"
                  style={{ backgroundColor:'#1c2128', color:C.text, borderRadius:12, padding:14, fontSize:14, marginBottom:16, minHeight:80 }}
                />
                <TouchableOpacity
                  onPress={async () => {
                    const words = importSeedInput.trim().split(/\s+/);
                    if (words.length !== 12 && words.length !== 24) {
                      Alert.alert('Invalid', 'Enter a valid 12 or 24 word seed phrase');
                      return;
                    }
                    try {
                      const { publicKey: pk } = deriveWallet(importSeedInput.trim());
                      const raw = await AsyncStorage.getItem('accounts');
                      const existing = raw ? JSON.parse(raw) : [];
                      const newAcc = {id: existing.length+1, name:'Account '+(existing.length+1), mnemonic:importSeedInput.trim(), pubkey:pk};
                      const updated = [...existing, newAcc];
                      await AsyncStorage.setItem('accounts', JSON.stringify(updated));
                      await AsyncStorage.setItem('active_acc', String(existing.length));
                      switchAccount(updated.length-1);
                      setImportSeedInput('');
                      setView('manageAccounts');
                      Alert.alert('Imported!', 'Account added successfully.');
                    } catch { Alert.alert('Error', 'Invalid seed phrase'); }
                  }}
                  style={{ backgroundColor:C.green, borderRadius:12, padding:14, alignItems:'center' }}>
                  <Text style={{ color:'#0d1117', fontWeight:'bold', fontSize:15 }}>Import Account</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          )}

          {view === 'profile' && (
            <ScrollView>
              <View style={{ flexDirection:'row', alignItems:'center', padding:20, borderBottomWidth:1, borderBottomColor:'#30363d' }}>
                <TouchableOpacity onPress={() => setView('main')} style={{ marginRight:12 }}>
                  <Text style={{ color:C.text, fontSize:20 }}>‹</Text>
                </TouchableOpacity>
                <Text style={{ color:C.text, fontSize:18, fontWeight:'bold', flex:1 }}>Profile</Text>
                <TouchableOpacity onPress={onClose}>
                  <Text style={{ color:C.muted, fontSize:22 }}>✕</Text>
                </TouchableOpacity>
              </View>
              <View style={{ padding:20 }}>
                <View style={{ alignItems:'center', marginBottom:24 }}>
                  <View style={{ width:72, height:72, borderRadius:36, backgroundColor:C.green, alignItems:'center', justifyContent:'center', marginBottom:12 }}>
                    <Text style={{ color:'#0d1117', fontWeight:'bold', fontSize:28 }}>{nameInput ? nameInput[0].toUpperCase() : 'CF'}</Text>
                  </View>
                  <Text style={{ color:C.muted, fontSize:12 }}>{pubkey ? pubkey.slice(0,6)+'...'+pubkey.slice(-4) : ''}</Text>
                </View>
                <Text style={{ color:C.muted, fontSize:13, marginBottom:8 }}>Display Name</Text>
                <TextInput
                  value={nameInput}
                  onChangeText={setNameInput}
                  placeholder="Enter your name..."
                  placeholderTextColor={C.muted}
                  style={{ backgroundColor:'#1c2128', color:C.text, borderRadius:12, padding:14, fontSize:15, marginBottom:16 }}
                />
                <TouchableOpacity
                  onPress={async () => { setUserName(nameInput); await AsyncStorage.setItem('user_name', nameInput); Alert.alert('Saved!', 'Name saved successfully.'); setView('main'); }}
                  style={{ backgroundColor:C.green, borderRadius:12, padding:14, alignItems:'center' }}>
                  <Text style={{ color:'#0d1117', fontWeight:'bold', fontSize:15 }}>Save Name</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          )}

          {view === 'settings' && (
            <ScrollView>
              <View style={{ flexDirection:'row', alignItems:'center', padding:20, borderBottomWidth:1, borderBottomColor:'#30363d' }}>
                <TouchableOpacity onPress={() => setView('main')} style={{ marginRight:12 }}>
                  <Text style={{ color:C.text, fontSize:20 }}>‹</Text>
                </TouchableOpacity>
                <Text style={{ color:C.text, fontSize:18, fontWeight:'bold', flex:1 }}>Settings</Text>
                <TouchableOpacity onPress={onClose}>
                  <Text style={{ color:C.muted, fontSize:22 }}>✕</Text>
                </TouchableOpacity>
              </View>

              {[
                { label:'Manage Accounts', sub:'View seed phrase, remove wallet', onPress: () => setView('manageAccounts') },
                { label:'Security & Privacy', sub:'Backup & security options', onPress: () => {} },
                { label:'Connected Apps', sub:'DApps connected to your wallet', onPress: () => {} },
                { label:'About ChatFi', sub:'Version 1.0.0', onPress: () => {} },
              ].map((item, i, arr) => (
                <TouchableOpacity key={i} onPress={item.onPress}
                  style={{ flexDirection:'row', alignItems:'center', paddingHorizontal:20, paddingVertical:16,
                    borderBottomWidth: i < arr.length-1 ? 1 : 0, borderBottomColor:'#30363d' }}>
                  <View style={{ flex:1 }}>
                    <Text style={{ color:C.text, fontSize:15 }}>{item.label}</Text>
                    <Text style={{ color:C.muted, fontSize:12, marginTop:2 }}>{item.sub}</Text>
                  </View>
                  <Text style={{ color:C.muted, fontSize:18 }}>›</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}

          {view === 'manageAccounts' && (
            <ScrollView>
              <View style={{ flexDirection:'row', alignItems:'center', padding:20, borderBottomWidth:1, borderBottomColor:'#30363d' }}>
                <TouchableOpacity onPress={() => setView('settings')} style={{ marginRight:12 }}>
                  <Text style={{ color:C.text, fontSize:20 }}>‹</Text>
                </TouchableOpacity>
                <Text style={{ color:C.text, fontSize:18, fontWeight:'bold', flex:1 }}>Manage Accounts</Text>
                <TouchableOpacity onPress={onClose}>
                  <Text style={{ color:C.muted, fontSize:22 }}>✕</Text>
                </TouchableOpacity>
              </View>
            <View style={{ margin:16, backgroundColor:'#1c2128', borderRadius:14, overflow:'hidden' }}>
              {(accounts||[]).map((acc,idx)=>(
                <TouchableOpacity key={acc.id} onPress={()=>switchAccount(idx)}
                  style={{ flexDirection:'row', alignItems:'center', padding:16, borderBottomWidth:1, borderBottomColor:'#30363d' }}>
                  <View style={{ width:36,height:36,borderRadius:18,backgroundColor:C.green,alignItems:'center',justifyContent:'center',marginRight:12 }}>
                    <Text style={{ color:'#0d1117',fontWeight:'bold',fontSize:14 }}>{acc.name[0]}</Text>
                  </View>
                  <View style={{ flex:1 }}>
                    <Text style={{ color:C.text,fontSize:15,fontWeight:'600' }}>{acc.name}</Text>
                    <Text style={{ color:C.muted,fontSize:12 }}>{(acc.pubkey||"").slice(0,6)+'...'+(acc.pubkey||"").slice(-4)}</Text>
                  </View>
                  {idx===activeAccIdx && <Text style={{ color:C.green,fontSize:18 }}>✓</Text>}
                </TouchableOpacity>
              ))}
              <TouchableOpacity onPress={() => setView('addAccount')}
                style={{ flexDirection:'row', alignItems:'center', padding:16, borderBottomWidth:1, borderBottomColor:'#30363d' }}>
                <Text style={{ color:C.green,flex:1,fontSize:15,fontWeight:'600' }}>+ Add Account</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={()=>Alert.alert('Seed Phrase', wallet||'No seed phrase found', [{text:'OK'}])}
                style={{ flexDirection:'row', alignItems:'center', padding:16, borderBottomWidth:1, borderBottomColor:'#30363d' }}>
                <Text style={{ color:C.text,flex:1,fontSize:15 }}>View Seed Phrase</Text>
                <Text style={{ color:C.muted }}>›</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={()=>{ Alert.alert('Remove Wallet','Are you sure?',[{text:'Cancel'},{text:'Remove',style:'destructive',onPress:onRemoveWallet}]); }}
                style={{ flexDirection:'row', alignItems:'center', padding:16 }}>
                <Text style={{ color:C.red,flex:1,fontSize:15 }}>Remove Wallet</Text>
                <Text style={{ color:C.muted }}>›</Text>
              </TouchableOpacity>
            </View>
            </ScrollView>
          )}

        </View>
      </View>
    </Modal>
  );
}

function DappBrowser({ walletAddress }) {
  const [url, setUrl] = React.useState('');
  const [activeUrl, setActiveUrl] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [canGoBack, setCanGoBack] = React.useState(false);
  const [canGoForward, setCanGoForward] = React.useState(false);
  const [bookmarks, setBookmarks] = React.useState([]);
  const [showBookmarks, setShowBookmarks] = React.useState(false);
  const [pageTitle, setPageTitle] = React.useState('');
  const webRef = React.useRef(null);

  const navigate = (u) => {
    let target = u.trim();
    if (!target.startsWith('http')) target = 'https://' + target;
    setActiveUrl(target);
    setUrl(target);
    setShowBookmarks(false);
  };

  const addBookmark = () => {
    if (!activeUrl) return;
    if (!bookmarks.find(b => b.url === activeUrl)) {
      setBookmarks([...bookmarks, { url: activeUrl, title: pageTitle || activeUrl }]);
    }
  };

  const removeBookmark = (u) => setBookmarks(bookmarks.filter(b => b.url !== u));
  const isBookmarked = bookmarks.find(b => b.url === activeUrl);

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      {/* URL Bar */}
      <View style={{ flexDirection: 'row', alignItems: 'center', padding: 8, gap: 6, backgroundColor: C.card, borderBottomWidth: 1, borderBottomColor: C.border }}>
        <TouchableOpacity onPress={() => webRef.current?.goBack()} disabled={!canGoBack}>
          <Text style={{ color: canGoBack ? C.text : C.muted, fontSize: 18, paddingHorizontal: 4 }}>‹</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => webRef.current?.goForward()} disabled={!canGoForward}>
          <Text style={{ color: canGoForward ? C.text : C.muted, fontSize: 18, paddingHorizontal: 4 }}>›</Text>
        </TouchableOpacity>
        <TextInput
          style={{ flex: 1, backgroundColor: C.bg, color: C.text, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7, fontSize: 13 }}
          value={url}
          onChangeText={setUrl}
          onSubmitEditing={() => navigate(url)}
          placeholder="Search or enter DApp URL..."
          placeholderTextColor={C.muted}
          autoCapitalize="none"
          keyboardType="url"
        />
        <TouchableOpacity onPress={() => webRef.current?.reload()}>
          <Text style={{ color: C.text, fontSize: 16, paddingHorizontal: 4 }}>↺</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={addBookmark}>
          <Text style={{ fontSize: 16, paddingHorizontal: 4, color: isBookmarked ? C.green : C.muted }}>★</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setShowBookmarks(!showBookmarks)}>
          <Text style={{ color: C.muted, fontSize: 13, paddingHorizontal: 4 }}>☰</Text>
        </TouchableOpacity>
      </View>

      {/* Bookmarks dropdown */}
      {showBookmarks && (
        <View style={{ backgroundColor: C.card, borderBottomWidth: 1, borderBottomColor: C.border, maxHeight: 180 }}>
          <Text style={{ color: C.muted, fontSize: 11, paddingHorizontal: 16, paddingTop: 8, fontWeight: '600' }}>BOOKMARKS</Text>
          <ScrollView>
            {bookmarks.length === 0 && <Text style={{ color: C.muted, padding: 16, fontSize: 13 }}>No bookmarks yet</Text>}
            {bookmarks.map((b, i) => (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.border }}>
                <Image source={{ uri: 'https://www.google.com/s2/favicons?domain=' + new URL(b.url).hostname + '&sz=32' }} style={{ width: 18, height: 18, borderRadius: 4, marginRight: 10 }} />
                <TouchableOpacity style={{ flex: 1 }} onPress={() => { navigate(b.url); setShowBookmarks(false); }}>
                  <Text style={{ color: C.text, fontSize: 13 }} numberOfLines={1}>{b.title}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => removeBookmark(b.url)}>
                  <Text style={{ color: C.red, fontSize: 16, paddingLeft: 12 }}>✕</Text>
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Main content */}
      {!activeUrl ? (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>
          <Text style={{ color: C.muted, fontSize: 11, fontWeight: '600', letterSpacing: 1, marginBottom: 12 }}>POPULAR DAPPS</Text>
          {POPULAR_DAPPS.map((d, i) => (
            <TouchableOpacity key={i} onPress={() => navigate(d.url)}
              style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.border }}>
              <Image source={{ uri: 'https://www.google.com/s2/favicons?domain=' + d.domain + '&sz=64' }}
                style={{ width: 36, height: 36, borderRadius: 8, marginRight: 14, backgroundColor: C.card }} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: C.text, fontSize: 15, fontWeight: '600' }}>{d.name}</Text>
                <Text style={{ color: C.muted, fontSize: 12, marginTop: 2 }}>{d.desc}</Text>
              </View>
              <Text style={{ color: C.muted, fontSize: 18 }}>›</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      ) : (
        <View style={{ flex: 1 }}>
          {loading && <ActivityIndicator style={{ position: 'absolute', top: 20, alignSelf: 'center', zIndex: 10 }} color={C.green} />}
          <WebView
            ref={webRef}
            source={{ uri: activeUrl }}
            onLoadStart={() => setLoading(true)}
            onLoadEnd={() => setLoading(false)}
            onNavigationStateChange={s => {
              setCanGoBack(s.canGoBack);
              setCanGoForward(s.canGoForward);
              setUrl(s.url);
              setPageTitle(s.title);
            }}
            style={{ flex: 1 }}
          />
        </View>
      )}
    </View>
  );
}

export default function App() {
  const [tab, setTab] = useState('chat');
  const [splashDone, setSplashDone] = useState(false);
  const [subtitleText, setSubtitleText] = useState('');
  const letterAnims = 'CHATFI'.split('').map(() => new Animated.Value(0));
  const [wallet, setWallet] = useState<string | null>(null);
  const [pubkey, setPubkey] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<{id:number,name:string,mnemonic:string,pubkey:string}[]>([]);
  const [activeAccIdx, setActiveAccIdx] = useState(0);
  const [showWalletModal, setShowWalletModal] = useState(false);
  const [showSeedModal, setShowSeedModal] = useState(false);
  const [showSendModal, setShowSendModal] = useState(false);
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [selectedToken, setSelectedToken] = useState<any>(null);
  const [userName, setUserName] = useState('');
  const [showNameEdit, setShowNameEdit] = useState(false);
  const [accountView, setAccountView] = useState('main');
  const [showReceiveModal, setShowReceiveModal] = useState(false);
  const [seedPhrase, setSeedPhrase] = useState('');
  const [importSeed, setImportSeed] = useState('');
  const [msgs, setMsgs] = useState([
    { id: 1, text: 'Welcome to ChatFi! Your AI DeFi assistant on Solana.\n\nTry:\n• "swap 1 SOL to USDC"\n• "price of JUP"\n• "what is yield farming?"', from: 'bot' }
  ]);
  const [input, setInput] = useState('');
  const inputRef = React.useRef('');
  const [aiLoading, setAiLoading] = useState(false);

  // Swap state

  const [fromToken, setFromToken] = useState('SOL');
  const [toToken, setToToken] = useState('USDC');
  const [amt, setAmt] = useState('');
  const [quote, setQuote] = useState<any>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [showFromSearch, setShowFromSearch] = useState(false);
  const [showToSearch, setShowToSearch] = useState(false);
  const [slippage, setSlippage] = useState('0.5');
  const [fromSearch, setFromSearch] = useState('');
  const [toSearch, setToSearch] = useState('');
  const [fromResults, setFromResults] = useState<any[]>([]);
  const [toResults, setToResults] = useState<any[]>([]);
  const [fromToken2, setFromToken2] = useState<{symbol:string,mint:string,logoURI?:string}>({symbol:'SOL',mint:'So11111111111111111111111111111111111111112'});
  const [toToken2, setToToken2] = useState<{symbol:string,mint:string,logoURI?:string}>({symbol:'USDC',mint:'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'});

  // Portfolio state
  const [solBalance, setSolBalance] = useState<number | null>(null);
  const [solPrice, setSolPrice] = useState<number>(0);
  const [tokenBalances, setTokenBalances] = useState<Array<{symbol: string, mint: string, amount: number, logoURI: string, price: number}>>([]);
  const [portfolioLoading, setPortfolioLoading] = useState(false);
  const [portfolioRefreshing, setPortfolioRefreshing] = useState(false);

  // Send state
  const [sendTo, setSendTo] = useState('');
  const [sendAmt, setSendAmt] = useState('');
  const [sendLoading, setSendLoading] = useState(false);
  const [sendToken, setSendToken] = useState('SOL');

  // Settings
  const [rpcEndpoint, setRpcEndpoint] = useState('mainnet-beta');

  useEffect(() => {
    const anims = letterAnims.map((anim, i) =>
      Animated.timing(anim, { toValue: 1, duration: 300, delay: i * 80, useNativeDriver: true })
    );
    Animated.stagger(120, anims).start(() => {
      setTimeout(() => setSplashDone(true), 400);
    const full = 'DeFi, but conversational...';
    let idx = 0;
    const typer = setInterval(() => {
      idx++;
      setSubtitleText(full.slice(0, idx));
      if(idx >= full.length) clearInterval(typer);
    }, 60);
    });
  }, []);

  useEffect(() => {
    AsyncStorage.getItem('user_name').then(n => { if(n) setUserName(n); });
    AsyncStorage.getItem('accounts').then(async raw => {
      if(raw) {
        const accs = JSON.parse(raw);
        const idxRaw = await AsyncStorage.getItem('active_acc');
        const idx = idxRaw ? parseInt(idxRaw) : 0;
        setAccounts(accs); setActiveAccIdx(idx);
        if(accs[idx]){ setWallet(accs[idx].mnemonic); setPubkey(accs[idx].pubkey); }
      } else {
        if (!raw) AsyncStorage.getItem('wallet_mnemonic').then(m => {
          if(m){
            const acc = [{id:1,name:'Account 1',mnemonic:m,pubkey:getPublicKey(m)}];
            setAccounts(acc);
            AsyncStorage.setItem('accounts', JSON.stringify(acc));
            AsyncStorage.setItem('active_acc','0');
        AsyncStorage.removeItem('wallet_mnemonic');
            setWallet(m); setPubkey(getPublicKey(m));
          }
        });
      }
    });
  }, []);

  useEffect(() => {
    if (pubkey && tab === 'portfolio') fetchPortfolio();
  }, [pubkey, tab]);

  const addAccount = async () => {
    const w = generateWallet();
    const newAcc = {id:accounts.length+1,name:'Account '+(accounts.length+1),mnemonic:w.mnemonic,pubkey:w.publicKey};
    const updated = [...accounts, newAcc];
    setAccounts(updated);
    await AsyncStorage.setItem('accounts', JSON.stringify(updated));
    Alert.alert('Account Added','Account '+(accounts.length+1)+' created!');
  };
  const switchAccount = async (idx:number) => {
    const acc = accounts[idx];
    setActiveAccIdx(idx); setWallet(acc.mnemonic); setPubkey(acc.pubkey);
    await AsyncStorage.setItem('active_acc', String(idx));
    await AsyncStorage.setItem('wallet_mnemonic', acc.mnemonic);
  };
  const fetchPortfolio = async () => {
    if (!pubkey) return;
    setPortfolioLoading(true);
    try {
      const res = await fetch('https://chatfi.pro/api/portfolio?wallet=' + pubkey);
      const data = await res.json();
      if (data.tokens) {
        const tokens = data.tokens.map((t: any) => ({
          symbol: t.symbol,
          name: t.name || t.symbol,
          mint: t.mint,
          amount: t.amount,
          logoURI: t.logoURI || '',
          price: t.price || 0,
        }));
        const sol = tokens.find((t:any) => t.symbol === 'SOL');
        setSolBalance(sol?.amount || 0);
        setSolPrice(sol?.price || 0);
        setTokenBalances(tokens);
      }
      try {
        const mints=data.tokens.map((t:any)=>t.mint).filter(Boolean).join(",");
        const pr=await fetch("https://chatfi.pro/api/jupiter",{
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify({url:'https://api.jup.ag/price/v3?ids='+mints,method:'GET'})
        });
        const pd=await pr.json();
        if(pd){
          const solMint="So11111111111111111111111111111111111111112";
          setSolPrice(pd[solMint]?.usdPrice||0);
          const updated=data.tokens.map((t:any)=>({...t,price:pd[t.mint]?.usdPrice||t.price||0}));
          setTokenBalances(updated);
          setTotalUSD(updated.reduce((s:number,t:any)=>s+(Number(t.amount)||0)*(Number(t.price)||0),0));
        }
      } catch(e){}
  } catch(e){console.log("Portfolio error",e);}
    setPortfolioLoading(false);
    setPortfolioRefreshing(false);
  };

  const createWallet = () => {
    try {
      const { mnemonic, publicKey: genPk } = generateWallet();
      setSeedPhrase(mnemonic);
      setShowSeedModal(true);
    } catch (e) {
      Alert.alert('Error', 'Failed to generate wallet: ' + (e?.message || String(e)) + '');
    }
  };

  const confirmSeed = async () => {
    const pk = getPublicKey(seedPhrase);
    const raw = await AsyncStorage.getItem('accounts');
    const existing = raw ? JSON.parse(raw) : [];
    const newAcc = {id: existing.length+1, name:'Account '+(existing.length+1), mnemonic:seedPhrase, pubkey:pk};
    const updated = [...existing, newAcc];
    setAccounts(updated);
    await AsyncStorage.setItem('accounts', JSON.stringify(updated));
    await AsyncStorage.setItem('active_acc', String(existing.length));
    setWallet(seedPhrase);
    setPubkey(pk);
    setShowSeedModal(false);
    setShowWalletModal(false);
    Alert.alert('Wallet Created!', 'Keep your seed phrase safe!');
  };

  const importWallet = async () => {
    const words = importSeed.trim().split(/\s+/);
    if (words.length !== 12 && words.length !== 24) {
      Alert.alert('Invalid', 'Enter a valid 12 or 24 word seed phrase');
      return;
    }
    try {
      const { publicKey: pk } = deriveWallet(importSeed.trim());
      const raw2 = await AsyncStorage.getItem('accounts');
      const existing2 = raw2 ? JSON.parse(raw2) : [];
      const newAcc2 = {id: existing2.length+1, name:'Account '+(existing2.length+1), mnemonic:importSeed.trim(), pubkey:pk};
      const updated2 = [...existing2, newAcc2];
      setAccounts(updated2);
      await AsyncStorage.setItem('accounts', JSON.stringify(updated2));
      await AsyncStorage.setItem('active_acc', String(existing2.length));
      setWallet(importSeed.trim()); setPubkey(pk);
      setShowWalletModal(false); setImportSeed('');
      Alert.alert('Wallet Imported!', 'Your wallet is ready.');
    } catch { Alert.alert('Error', 'Invalid seed phrase'); }
  };

  const sendMsg = async (overrideText?: string) => {
    const q = (overrideText || inputRef.current || input).trim();
    if (!q || aiLoading) return;
    setMsgs(p => [...p, { id: Date.now(), text: q, from: 'user' }]);
    const msgText = q;
    setInput('');
    setAiLoading(true);
    try {
      const response = await askAI(q, pubkey);
      setMsgs(p => [...p, { id: Date.now() + 1, text: response.text, from: 'bot' }]);
      await dispatchAction(response.action, response.actionData);
    } catch (e) {
      setMsgs(p => [...p, { id: Date.now() + 1, text: 'Error: ' + e.message, from: 'bot' }]);
    }
    setAiLoading(false);
  };

  const dispatchAction = async (action: string | null, data: any) => {
    if (!action) return;
    if (!wallet && action !== 'FETCH_PRICE') {
      setMsgs(p => [...p, { id: Date.now(), text: 'Please create or connect a wallet first.', from: 'bot' }]);
      return;
    }
    try {
      const { publicKey: pk, secretKey } = deriveWallet(wallet!);
      const RPC_URL = 'https://api.mainnet-beta.solana.com';

      switch (action) {
        case 'SWAP': {
          const { from, to, amount } = data;
          if (!from || !to || !amount) { setMsgs(p => [...p, { id: Date.now(), text: 'Missing swap details.', from: 'bot' }]); break; }
          setMsgs(p => [...p, { id: Date.now(), text: `Executing swap: ${amount} ${from} → ${to}...`, from: 'bot' }]);
          const txSig = await executeSwapTx(TOKENS[from], TOKENS[to], parseFloat(amount), DECIMALS[from] || 6, pk, secretKey, RPC_URL);
          setMsgs(p => [...p, { id: Date.now(), text: `✅ Swap done!\nTx: ${txSig.slice(0,20)}...\nhttps://solscan.io/tx/${txSig}`, from: 'bot' }]);
          fetchPortfolio();
          break;
        }
        case 'FETCH_PRICE': {
          const price = await getTokenPrice(data.token);
          setMsgs(p => [...p, { id: Date.now(), text: price, from: 'bot' }]);
          break;
        }
        case 'FETCH_PORTFOLIO': {
          setTab('portfolio');
          fetchPortfolio();
          break;
        }
        case 'SHOW_SWAP': {
          setFromToken(data.from || 'SOL');
          setToToken(data.to || 'USDC');
          if (data.amount) setAmt(String(data.amount));
          setTab('swap');
          break;
        }
        case 'SHOW_TRIGGER': {
          const { from, to, amount, targetPrice, direction } = data;
          if (!from || !to || !amount || !targetPrice) {
            setMsgs(p => [...p, { id: Date.now(), text: 'Please specify token, amount and target price for the limit order.', from: 'bot' }]);
            break;
          }
          setMsgs(p => [...p, { id: Date.now(), text: `⏳ Placing limit order: ${direction === 'below' ? 'Buy' : 'Sell'} ${amount} ${from} when ${to} hits $${targetPrice}...`, from: 'bot' }]);
          const fromDec = DECIMALS[from] || 6;
          const toDec   = DECIMALS[to]   || 6;
          const txSig = await createTriggerOrder(
            TOKENS[from], TOKENS[to],
            fromDec, toDec,
            parseFloat(amount), parseFloat(targetPrice),
            direction || 'below',
            pk, secretKey
          );
          setMsgs(p => [...p, { id: Date.now(), text: `✅ Limit order placed!\nWill ${direction === 'below' ? 'buy' : 'sell'} ${amount} ${from} when ${to} hits $${targetPrice}\nTx: ${txSig.slice(0,20)}...\nhttps://solscan.io/tx/${txSig}`, from: 'bot' }]);
          break;
        }
        case 'SHOW_RECURRING': {
          const { from, to, amountPerCycle, intervalSecs, numberOfOrders } = data;
          if (!from || !to || !amountPerCycle) {
            setMsgs(p => [...p, { id: Date.now(), text: 'Please specify from token, to token, and amount per cycle for DCA.', from: 'bot' }]);
            break;
          }
          const interval = intervalSecs || 86400;
          const orders   = numberOfOrders || 7;
          const intervalLabel = interval === 86400 ? 'daily' : interval === 604800 ? 'weekly' : `every ${interval}s`;
          setMsgs(p => [...p, { id: Date.now(), text: `⏳ Setting up DCA: ${amountPerCycle} ${from} → ${to} ${intervalLabel} for ${orders} orders...`, from: 'bot' }]);
          const txSig = await createRecurringOrder(
            TOKENS[from], TOKENS[to],
            DECIMALS[from] || 6,
            parseFloat(amountPerCycle),
            interval, orders,
            pk, secretKey
          );
          setMsgs(p => [...p, { id: Date.now(), text: `✅ DCA order created!\n${amountPerCycle} ${from} → ${to} ${intervalLabel} × ${orders}\nTx: ${txSig.slice(0,20)}...\nhttps://solscan.io/tx/${txSig}`, from: 'bot' }]);
          break;
        }
        case 'SHOW_SEND': {
          setShowSendModal(true);
          break;
        }
        case 'SHOW_EARN':
        case 'SHOW_LOCK':
        case 'SHOW_STUDIO': {
          const labels: Record<string, string> = {
            SHOW_EARN: 'Jupiter Earn',
            SHOW_LOCK: 'Jupiter Lock',
            SHOW_STUDIO: 'Jupiter Studio'
          };
          setMsgs(p => [...p, { id: Date.now(), text: `Opening ${labels[action]} — visit jup.ag for full access.`, from: 'bot' }]);
          break;
        }
        default:
          break;
      }
    } catch (e: any) {
      setMsgs(p => [...p, { id: Date.now(), text: `❌ ${e.message || 'Action failed'}`, from: 'bot' }]);
    }
  };

  const fetchQuote = async () => {
    if (!amt || isNaN(parseFloat(amt))) { Alert.alert('Invalid amount'); return; }
    if (fromToken === toToken) { Alert.alert('Select different tokens'); return; }
    setQuoteLoading(true);
    setQuote(null);
    try {
      const q = await getJupiterQuote(fromToken, toToken, parseFloat(amt));
      setQuote(q);
    } catch { Alert.alert('Failed to fetch quote'); }
    setQuoteLoading(false);
  };

  const executeSwap = async () => {
    if (!wallet) { Alert.alert('No wallet', 'Create or connect a wallet first'); return; }
    if (!quote) { Alert.alert('No Quote', 'Get a quote first before swapping'); return; }
    try {
      const { mnemonic, publicKey: pk, secretKey } = deriveWallet(wallet);
      const RPC = 'https://api.mainnet-beta.solana.com';
      Alert.alert('Swapping', `Executing ${fromToken} → ${toToken} swap...`);
      const txSig = await executeSwapTx(
        TOKENS[fromToken], TOKENS[toToken],
        parseFloat(swapAmt), DECIMALS[fromToken] || 6,
        pk, secretKey, RPC
      );
      Alert.alert('Swap Done!', `Transaction: ${txSig.slice(0,20)}...`);
      fetchPortfolio();
    } catch (e) {
      Alert.alert('Swap Failed', e.message || 'Unknown error');
    }
  };

  const searchJupTokens = async (query: string, setResults: any) => {
    if (!query || query.length < 1) { setResults([]); return; }
    try {
      const res = await fetch('https://api.jup.ag/tokens/v2/search?query=' + encodeURIComponent(query) + '&limit=6');
      const data = await res.json();
      setResults(Array.isArray(data) ? data : (data.tokens || []));
    } catch { setResults([]); }
  };

  const sendTokens = async () => {
    if (!sendTo || !sendTo.trim()) { Alert.alert('Missing address', 'Enter a recipient address'); return; }
    if (!sendAmt || isNaN(parseFloat(sendAmt))) { Alert.alert('Invalid amount', 'Enter a valid amount'); return; }
    setSendLoading(true);
    try {
      const { secretKey } = deriveWallet(wallet);
      const mint = TOKENS[sendToken] || TOKENS['SOL'];
      const decimals = DECIMALS[sendToken] ?? 9;
      const amountNum = Math.round(parseFloat(sendAmt) * Math.pow(10, decimals));
      const res = await fetch('https://chatfi.pro/api/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sender: pk, recipient: sendTo.trim(), amount: String(amountNum), mint }),
      });
      const data = await res.json();
      if (!res.ok || !data.tx) throw new Error(data.error || 'Failed to build transaction');
      const txBytes = Uint8Array.from(Buffer.from(data.tx, 'base64'));
      const numSigs = txBytes[0];
      const msgBytes = txBytes.slice(1 + numSigs * 64);
      const userSig = nacl.sign.detached(msgBytes, secretKey);
      txBytes.set(userSig, 1);
      const txB64 = Buffer.from(txBytes).toString('base64');
      const rpcRes = await fetch('https://api.mainnet-beta.solana.com', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'sendTransaction', params: [txB64, { encoding: 'base64', preflightCommitment: 'confirmed' }] }),
      });
      const rpcData = await rpcRes.json();
      if (rpcData.error) throw new Error(rpcData.error.message);
      Alert.alert('Sent!', `Sent ${sendAmt} ${sendToken} to ${sendTo.slice(0,8)}...`);
      setShowSendModal(false); setSendAmt(''); setSendTo('');
    } catch (e) {
      Alert.alert('Send Failed', e.message || 'Unknown error');
    } finally { setSendLoading(false); }
  };

  const copyAddress = () => {
    if (pubkey) {
      Clipboard.setString(pubkey);
      Alert.alert('Copied!', 'Wallet address copied to clipboard');
    }
  };

  const shortKey = pubkey ? pubkey.slice(0, 4) + '...' + pubkey.slice(-4) : null;

  if (!splashDone) {
    return (
      <View style={{ flex: 1, backgroundColor: '#0a0a0a', alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ flexDirection: 'row', gap: 4 }}>
          {'CHATFI'.split('').map((letter, i) => (
            <Animated.Text key={i} style={{
              fontSize: 48, fontWeight: 'bold', color: '#39FF82',
              opacity: letterAnims[i],
              transform: [{ translateY: letterAnims[i].interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }],
              textShadowColor: '#39FF82', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 12
            }}>{letter}</Animated.Text>
          ))}
        </View>
        <Text style={{ color: '#888', fontSize: 14, marginTop: 12, letterSpacing: 1 }}>{subtitleText}</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={s.root}>
      <TokenModal token={selectedToken} pubkey={pubkey} onClose={() => setSelectedToken(null)} />
      <AccountModal
        visible={showAccountModal}
        onClose={() => setShowAccountModal(false)}
        pubkey={pubkey}
        wallet={wallet}
        accounts={accounts}
        activeAccIdx={activeAccIdx}
        switchAccount={switchAccount}
        addAccount={addAccount}
            importSeedInput={importSeedInput}
            setImportSeedInput={setImportSeedInput}
        userName={userName}
        setUserName={setUserName}
        onRemoveWallet={async () => {
          await AsyncStorage.removeItem('wallet_mnemonic');
          setWallet(null);
          setPubkey(null);
          setShowAccountModal(false);
        }}
      />
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />

      <View style={s.header}>
        <View style={s.logoRow}>
          
          <TouchableOpacity onPress={() => setShowAccountModal(true)} style={{flexDirection:'row',alignItems:'center',gap:8}}><View style={{width:36,height:36,borderRadius:18,backgroundColor:C.green}} />{userName ? <Text style={{color:C.text,fontWeight:'600',fontSize:15}}>{userName}</Text> : null}</TouchableOpacity>
        </View>
        <TouchableOpacity style={[s.walletBtn, wallet ? s.walletBtnOn : null]} onPress={() => { if(pubkey){ Clipboard.setString(pubkey); Alert.alert('Copied!', 'Wallet address copied.'); } }}>
          <Text style={[s.walletBtnTxt, wallet ? { color: C.green } : null]}>{wallet ? shortKey : 'Connect Wallet'}</Text>
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView style={s.content} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={0}>

        {/* CHAT */}
        {tab === 'chat' && (
          <View style={s.flex}>
            <ScrollView style={s.msgs} contentContainerStyle={{ paddingBottom: 16 }}>
              {msgs.map(m => (
                <View key={m.id} style={[s.bubble, m.from === 'user' ? s.userBubble : s.botBubble]}>
                  {m.from === 'bot' && <View style={s.botTag}><View style={s.botDot} /><Text style={s.botTagTxt}>ChatFi AI</Text></View>}
                  <Text style={s.bubbleTxt}>{m.text}</Text>
                </View>
              ))}
              {aiLoading && (
                <View style={[s.botBubble, s.bubble]}>
                  <View style={s.botTag}><View style={s.botDot} /><Text style={s.botTagTxt}>ChatFi AI</Text></View>
                  <ActivityIndicator color={C.green} size="small" />
                </View>
              )}
            </ScrollView>
            <View style={s.inputRow}>
              <TextInput style={s.input} value={input} onChangeText={setInput} placeholder="Ask ChatFi anything..." placeholderTextColor={C.muted} onSubmitEditing={() => sendMsg(input)} editable={!aiLoading} />
              <TouchableOpacity style={[s.sendBtn, aiLoading && { opacity: 0.5 }]} onPress={() => sendMsg(inputRef.current || input)} disabled={aiLoading}>
                <Ionicons name="send" size={20} color="#0d1117" />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* SWAP */}
              {tab === 'swap' && (
        <ScrollView style={s.pad} keyboardShouldPersistTaps="handled">
          <View style={s.swapCard}>
            <Text style={s.swapCardLabel}>You Pay</Text>
            <View style={s.swapCardRow}>
              <TextInput style={s.swapAmtInput} value={amt} onChangeText={setAmt} placeholder="0" placeholderTextColor={C.border} keyboardType="numeric" />
              <TouchableOpacity style={s.tokenSelBtn} onPress={()=>{setShowFromSearch(!showFromSearch);setShowToSearch(false);}}>
                <TokLogo uri={'https://img.jup.ag/tokens/'+(TOKENS[fromToken]||'')} symbol={fromToken} style={s.tokenLogo} />
                <Text style={s.tokenSelTxt}>{fromToken}</Text>
                <Text style={{color:C.muted,marginLeft:4,fontSize:12}}>▾</Text>
              </TouchableOpacity>
            </View>
            {showFromSearch&&(
              <View style={s.tokenDropdown}>
                <TextInput style={s.tokenSearchIn} placeholder="Search token..." placeholderTextColor={C.muted} autoFocus onChangeText={async(q)=>{if(q.length>1) await searchJupTokens(q,setFromResults); else setFromResults([]);}} />
                {fromResults.slice(0,5).map(t=>(
                  <TouchableOpacity key={t.address} style={s.tokenResultRow} onPress={()=>{setFromToken(t.symbol);TOKENS[t.symbol]=t.address;setShowFromSearch(false);setQuote(null);}}>
                    <TokLogo uri={t.logoURI || 'https://img.jup.ag/tokens/'+t.address} symbol={t.symbol} style={s.tokenLogo} />
                    <View style={{flex:1,marginLeft:8}}>
                      <Text style={s.tokenResTxt}>{t.symbol}</Text>
                      <Text style={s.tokenResSub} numberOfLines={1}>{t.name}</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

          <TouchableOpacity style={s.swapDirBtn} onPress={()=>{const tmp=fromToken;setFromToken(toToken);setToToken(tmp);setQuote(null);}}>
            <Text style={{color:C.green,fontSize:20,fontWeight:'bold'}}>⇅</Text>
          </TouchableOpacity>

          <View style={s.swapCard}>
            <Text style={s.swapCardLabel}>You Receive</Text>
            <View style={s.swapCardRow}>
              <Text style={s.swapAmtOut}>{quote?Number(quote.outAmount).toFixed(6):'—'}</Text>
              <TouchableOpacity style={s.tokenSelBtn} onPress={()=>{setShowToSearch(!showToSearch);setShowFromSearch(false);}}>
                <TokLogo uri={'https://img.jup.ag/tokens/'+(TOKENS[toToken]||'')} symbol={toToken} style={s.tokenLogo} />
                <Text style={s.tokenSelTxt}>{toToken}</Text>
                <Text style={{color:C.muted,marginLeft:4,fontSize:12}}>▾</Text>
              </TouchableOpacity>
            </View>
            {showToSearch&&(
              <View style={s.tokenDropdown}>
                <TextInput style={s.tokenSearchIn} placeholder="Search token..." placeholderTextColor={C.muted} autoFocus onChangeText={async(q)=>{if(q.length>1) await searchJupTokens(q,setToResults); else setToResults([]);}} />
                {toResults.slice(0,5).map(t=>(
                  <TouchableOpacity key={t.address} style={s.tokenResultRow} onPress={()=>{setToToken(t.symbol);TOKENS[t.symbol]=t.address;setShowToSearch(false);setQuote(null);}}>
                    <TokLogo uri={t.logoURI || 'https://img.jup.ag/tokens/'+t.address} symbol={t.symbol} style={s.tokenLogo} />
                    <View style={{flex:1,marginLeft:8}}>
                      <Text style={s.tokenResTxt}>{t.symbol}</Text>
                      <Text style={s.tokenResSub} numberOfLines={1}>{t.name}</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

          {quote&&(
            <View style={s.quoteBox}>
              <Text style={s.quoteRow}>Price impact: <Text style={s.quoteVal}>{quote.priceImpact}%</Text></Text>
              <Text style={s.quoteRow}>Route: <Text style={s.quoteVal}>{quote.route}</Text></Text>
              <Text style={s.quoteRow}>Slippage: <Text style={s.quoteVal}>{slippage}%</Text></Text>
            </View>
          )}

          <View style={s.slippageRow}>
            <Text style={s.cardLabel}>Slippage: </Text>
            {['0.1','0.5','1.0'].map(v=>(
              <TouchableOpacity key={v} onPress={()=>setSlippage(v)} style={[s.slippageChip,slippage===v&&s.chipActive]}>
                <Text style={[s.chipTxt,slippage===v&&s.chipTxtActive]}>{v}%</Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity style={s.greenBtn} onPress={fetchQuote}>
            {quoteLoading?<ActivityIndicator color={C.bg} />:<Text style={s.greenBtnTxt}>Get Quote</Text>}
          </TouchableOpacity>

          {quote&&(
            <TouchableOpacity style={[s.greenBtn,{marginTop:8}]} onPress={executeSwap}>
              <Text style={s.greenBtnTxt}>Swap {fromToken} → {toToken}</Text>
            </TouchableOpacity>
          )}

          {!wallet&&(
            <TouchableOpacity style={s.outlineBtn} onPress={()=>setShowWalletModal(true)}>
              <Text style={s.outlineBtnTxt}>Connect Wallet to Swap</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      )}

                  {/* PORTFOLIO */}
      {tab === 'portfolio' && (
        <ScrollView style={s.pad} refreshControl={<RefreshControl refreshing={portfolioRefreshing} onRefresh={()=>{setPortfolioRefreshing(true);fetchPortfolio();}} tintColor={C.green} />}>
          {!wallet ? (
            <View style={s.emptyState}>
              <Text style={s.emptyTitle}>No Wallet</Text>
              <Text style={s.emptyText}>Create or import a wallet to view your portfolio</Text>
              <TouchableOpacity style={s.greenBtn} onPress={()=>setShowWalletModal(true)}>
                <Text style={s.greenBtnTxt}>Get Started</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View>
              {/* Big Balance */}
              <View style={s.pfBalanceSection}>
                <Text style={s.pfBalanceAmt}>
                  {portfolioLoading ? '...' : '$'+(tokenBalances.reduce((sum,t) => sum + (t.amount||0)*(t.price||0), 0)).toFixed(4)}
                </Text>
                <TouchableOpacity onPress={copyAddress}>
                  <Text style={s.pfAddressTxt}>{pubkey ? pubkey.slice(0,4)+'....'+pubkey.slice(-4) : ''}</Text>
                </TouchableOpacity>
              </View>

              {/* 4 Action Buttons */}
              <View style={s.pfActions}>
                <TouchableOpacity style={s.pfActionBtn} onPress={()=>setShowSendModal(true)}>
                  <View style={s.pfActionIcon}><Text style={s.pfActionIconTxt}>↑</Text></View>
                  <Text style={s.pfActionLbl}>Send</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.pfActionBtn} onPress={()=>setTab('swap')}>
                  <View style={s.pfActionIcon}><Text style={s.pfActionIconTxt}>⇄</Text></View>
                  <Text style={s.pfActionLbl}>Swap</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.pfActionBtn} onPress={()=>setShowReceiveModal(true)}>
                  <View style={s.pfActionIcon}><Text style={s.pfActionIconTxt}>↓</Text></View>
                  <Text style={s.pfActionLbl}>Receive</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.pfActionBtn} onPress={copyAddress}>
                  <View style={s.pfActionIcon}><Text style={s.pfActionIconTxt}>⧉</Text></View>
                  <Text style={s.pfActionLbl}>Copy</Text>
                </TouchableOpacity>
              </View>

              {/* Token List */}
              <Text style={s.pfSectionLbl}>Tokens</Text>
              {tokenBalances.length===0&&!portfolioLoading&&(
                <Text style={{color:C.muted,textAlign:'center',marginTop:16}}>No tokens found</Text>
              )}
              {portfolioLoading&&<ActivityIndicator color={C.green} style={{marginTop:20}} />}
              {/* SOL Row */}
              {solBalance !== null && solBalance > 0 && (
                <TouchableOpacity style={s.pfTokenRow} onPress={()=>{}}>
                  <TokLogo uri={'https://img.jup.ag/tokens/So11111111111111111111111111111111111111112'} fallback={'https://cdn.jsdelivr.net/gh/solana-labs/token-list@main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png'} symbol={'SOL'} style={s.pfTokenLogo} />
                  <View style={{flex:1,marginLeft:12}}>
                    <Text style={s.pfTokenName}>SOL</Text>
                    <Text style={s.pfTokenAmt}>{(solBalance||0).toFixed(4)} SOL</Text>
                  </View>
                  <Text style={s.pfTokenVal}>{solPrice ? '$'+((solBalance||0)*(solPrice||0)).toFixed(2) : '—'}</Text>
                </TouchableOpacity>
              )}
              {tokenBalances.filter(t=>t.mint!=='So11111111111111111111111111111111111111112').map((t,i)=>(
                <TouchableOpacity key={i} style={s.pfTokenRow} onPress={() => setSelectedToken(t)}>
                  <TokLogo uri={t.logoURI || 'https://img.jup.ag/tokens/'+t.mint} fallback={'https://cdn.jsdelivr.net/gh/solana-labs/token-list@main/assets/mainnet/'+t.mint+'/logo.png'} symbol={t.symbol} style={s.pfTokenLogo} />
                  <View style={{flex:1,marginLeft:12}}>
                    <Text style={s.pfTokenName}>{t.symbol}</Text>
                    <Text style={s.pfTokenAmt}>{t.amount.toFixed(4)} {t.symbol}</Text>
                  </View>
                  <Text style={s.pfTokenVal}>{t.price ? '$'+((t.amount||0)*(t.price||0)).toFixed(2) : '—'}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </ScrollView>
      )}

            {/* DAPP BROWSER */}
        {tab === 'dapp' && (
          <DappBrowser walletAddress={pubkey} />
        )}
        {/* SETTINGS */}
      {tab === 'settings' && (
        <ScrollView style={s.pad}>
          {/* Wallet profile row */}
          {wallet && (
            <View style={s.stGroup}>
              <TouchableOpacity style={s.stProfileRow} onPress={copyAddress}>
                <View style={s.stAvatar}><Text style={s.stAvatarTxt}>◎</Text></View>
                <View style={{flex:1,marginLeft:12}}>
                  <Text style={s.stProfileAddr}>{pubkey?pubkey.slice(0,6)+'...'+pubkey.slice(-6):''}</Text>
                  <Text style={s.stProfileSub}>Tap to copy</Text>
                </View>
                <Text style={{color:C.muted}}>›</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* RPC */}
          <View style={s.stGroup}>
            <Text style={s.stGroupLabel}>RPC Endpoint</Text>
            {['mainnet-beta','devnet','testnet'].map(ep=>(
              <TouchableOpacity key={ep} style={s.stRow} onPress={()=>setRpcEndpoint(ep)}>
                <Text style={s.stRowTxt}>{ep}</Text>
                {rpcEndpoint===ep&&<Text style={{color:C.green,fontSize:16}}>✓</Text>}
              </TouchableOpacity>
            ))}
          </View>

          {/* Slippage */}
          <View style={s.stGroup}>
            <Text style={s.stGroupLabel}>Slippage Tolerance</Text>
            <View style={{flexDirection:'row',gap:8,padding:12}}>
              {['0.1','0.5','1.0','2.0'].map(v=>(
                <TouchableOpacity key={v} onPress={()=>setSlippage(v)} style={[s.slippageChip,slippage===v&&s.chipActive]}>
                  <Text style={[s.chipTxt,slippage===v&&s.chipTxtActive]}>{v}%</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Info rows */}
          <View style={s.stGroup}>
            <View style={s.stRow}>
              <Text style={s.stRowTxt}>Theme</Text>
              <Text style={s.stRowVal}>Dark</Text>
            </View>
            <View style={[s.stRow,{borderBottomWidth:0}]}>
              <Text style={s.stRowTxt}>Version</Text>
              <Text style={s.stRowVal}>1.0.0</Text>
            </View>
          </View>

          {/* Danger */}
          {wallet && (
            <View style={{gap:12,marginTop:8}}>
              <TouchableOpacity style={s.dangerBtn} onPress={()=>{Alert.alert('Seed Phrase','Only view in a private place.',[{text:'Cancel',style:'cancel'},{text:'Show',onPress:()=>Alert.alert('Your Seed Phrase',wallet||'')}]);}}>
                <Text style={s.dangerBtnTxt}>Show Seed Phrase</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.dangerBtn} onPress={()=>{Alert.alert('Remove Wallet','Make sure you have your seed phrase!',[{text:'Cancel',style:'cancel'},{text:'Remove',style:'destructive',onPress:async()=>{await AsyncStorage.removeItem('wallet_mnemonic');setWallet(null);setPubkey(null);setSolBalance(null);}}]);}}>
                <Text style={s.dangerBtnTxt}>Remove Wallet</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      )}
      </KeyboardAvoidingView>

      {/* TAB BAR */}
      <View style={s.tabBar}>
        {TABS.map((t) => { const { id, label, icon } = t;
          const active = tab === id;
          return (
            <TouchableOpacity key={id} style={s.tabItem} onPress={() => setTab(id)}>
              <Ionicons name={active ? (t.iconActive || t.icon) : t.icon} size={22} color={active ? '#39FF82' : 'rgba(255,255,255,0.4)'} />
              <Text style={[s.tabLabel, active && s.tabLabelActive]}>{label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* WALLET MODAL */}
      <Modal visible={showWalletModal} animationType="slide" transparent>
        <View style={s.modalOverlay}>
          <View style={s.modalCard}>
            <Text style={s.modalTitle}>Wallet</Text>
            <TouchableOpacity style={s.greenBtn} onPress={createWallet}>
              <Text style={s.greenBtnTxt}>Create New Wallet</Text>
            </TouchableOpacity>
            <Text style={s.orText}>— or import existing —</Text>
            <TextInput style={s.seedInput} value={importSeed} onChangeText={setImportSeed} placeholder="Enter 12 or 24 word seed phrase..." placeholderTextColor={C.muted} multiline numberOfLines={3} />
            <TouchableOpacity style={s.outlineBtn} onPress={importWallet}>
              <Text style={s.outlineBtnTxt}>Import Wallet</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.closeBtn} onPress={() => setShowWalletModal(false)}>
              <Text style={s.closeBtnTxt}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* SEED MODAL */}
      <Modal visible={showSeedModal} animationType="slide" transparent>
        <View style={s.modalOverlay}>
          <View style={s.modalCard}>
            <Text style={s.modalTitle}>Your Seed Phrase</Text>
            <Text style={s.seedWarning}>Write these words down. Never share them!</Text>
            <View style={s.seedGrid}>
              {seedPhrase.split(' ').map((word, i) => (
                <View key={i} style={s.seedWord}>
                  <Text style={s.seedNum}>{i + 1}</Text>
                  <Text style={s.seedWordTxt}>{word}</Text>
                </View>
              ))}
            </View>
            <TouchableOpacity style={s.greenBtn} onPress={confirmSeed}>
              <Text style={s.greenBtnTxt}>I've Written It Down</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.closeBtn} onPress={() => setShowSeedModal(false)}>
              <Text style={s.closeBtnTxt}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* SEND MODAL */}
      <Modal visible={showSendModal} animationType="slide" transparent>
        <View style={s.modalOverlay}>
          <View style={s.modalCard}>
            <Text style={s.modalTitle}>Send SOL</Text>
            <Text style={s.cardLabel}>Recipient Address</Text>
            <TextInput style={s.seedInput} value={sendTo} onChangeText={setSendTo} placeholder="Solana wallet address..." placeholderTextColor={C.muted} autoCapitalize="none" />
            <Text style={[s.cardLabel, { marginTop: 12 }]}>Amount (SOL)</Text>
            <TextInput style={[s.seedInput, { minHeight: 0, height: 48 }]} value={sendAmt} onChangeText={setSendAmt} placeholder="0.00" placeholderTextColor={C.muted} keyboardType="numeric" />
            <TouchableOpacity style={[s.greenBtn, { marginTop: 16 }]} onPress={sendTokens} disabled={sendLoading}>
              {sendLoading ? <ActivityIndicator color={C.bg} /> : <Text style={s.greenBtnTxt}>Send</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={s.closeBtn} onPress={() => setShowSendModal(false)}>
              <Text style={s.closeBtnTxt}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* RECEIVE MODAL */}
      <Modal visible={showReceiveModal} animationType="slide" transparent>
        <View style={s.modalOverlay}>
          <View style={s.modalCard}>
            <Text style={s.modalTitle}>Receive</Text>
            <Text style={s.seedWarning}>Share this address to receive SOL and tokens</Text>
            <View style={s.addressBox}>
              <Text style={s.addressTxt} selectable>{pubkey}</Text>
            </View>
            <TouchableOpacity style={s.greenBtn} onPress={copyAddress}>
              <Text style={s.greenBtnTxt}>Copy Address</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.closeBtn} onPress={() => setShowReceiveModal(false)}>
              <Text style={s.closeBtnTxt}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  flex: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, paddingTop: 44, borderBottomWidth: 1, borderBottomColor: 'transparent', backgroundColor: '#080c0a' },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  logoDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: C.green },
  logoText: { color: C.text, fontSize: 20, fontWeight: 'bold' },
  walletBtn: { borderWidth: 1, borderColor: C.border, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7 },
  walletBtnOn: { borderColor: C.green },
  walletBtnTxt: { color: C.muted, fontSize: 12, fontWeight: '600' },
  content: { flex: 1 },
  pad: { padding: 16 },
  msgs: { flex: 1, paddingHorizontal: 16, paddingTop: 16 },
  bubble: { marginBottom: 12, maxWidth: '85%' },
  userBubble: { alignSelf: 'flex-end', backgroundColor: C.card2, borderRadius: 16, borderBottomRightRadius: 4, padding: 12, borderWidth: 1, borderColor: C.border },
  botBubble: { alignSelf: 'flex-start', backgroundColor: C.card, borderRadius: 16, borderBottomLeftRadius: 4, padding: 12, borderWidth: 1, borderColor: C.border },
  botTag: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 6 },
  botDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.green },
  botTagTxt: { color: C.green, fontSize: 11, fontWeight: '600' },
  bubbleTxt: { color: C.text, fontSize: 14, lineHeight: 21 },
  inputRow: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1, borderTopColor: C.border, gap: 10 },
  input: { flex: 1, backgroundColor: C.card, color: C.text, borderRadius: 24, paddingHorizontal: 18, paddingVertical: 11, fontSize: 14, borderWidth: 1, borderColor: C.border },
  sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.green, alignItems: 'center', justifyContent: 'center' },
  sendBtnTxt: { color: C.bg, fontSize: 20, fontWeight: 'bold' },
  pageTitle: { color: C.text, fontSize: 22, fontWeight: 'bold', marginBottom: 18 },
  card: { backgroundColor: 'rgba(20,40,28,0.9)', borderRadius: 20, padding: 16, borderWidth: 1, borderColor: 'rgba(57,255,130,0.2)', marginBottom: 8, shadowColor: '#39FF82', shadowOffset: {width:0,height:2}, shadowOpacity: 0.08, shadowRadius: 12, elevation: 4 },
  cardLabel: { color: C.muted, fontSize: 12, marginBottom: 8 },
  bigInput: { color: C.text, fontSize: 32, fontWeight: 'bold', paddingVertical: 4 },
  bigOutput: { color: C.muted, fontSize: 32, fontWeight: 'bold', paddingVertical: 4, marginBottom: 8 },
  tokenRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: C.bg, borderWidth: 1, borderColor: C.border },
  chipActive: { backgroundColor: C.green, borderColor: C.green },
  chipTxt: { color: C.muted, fontSize: 12 },
  chipTxtActive: { color: C.bg, fontWeight: 'bold' },
  arrowRow: { alignItems: 'center', paddingVertical: 8 },
  quoteBox: { backgroundColor: C.card, borderRadius: 12, padding: 14, marginTop: 8, borderWidth: 1, borderColor: C.border },
  quoteRow: { color: C.muted, fontSize: 13, marginBottom: 4 },
  quoteVal: { color: C.text, fontWeight: 'bold' },
  greenBtn: { backgroundColor: C.green, borderRadius: 14, padding: 16, alignItems: 'center', marginTop: 8 },
  swapExecBtn: { backgroundColor: C.blue, borderRadius: 14, padding: 16, alignItems: 'center', marginTop: 8 },
  greenBtnTxt: { color: C.bg, fontWeight: 'bold', fontSize: 16 },
  outlineBtn: { borderWidth: 1, borderColor: C.blue, borderRadius: 14, padding: 14, alignItems: 'center', marginTop: 8 },
  outlineBtnTxt: { color: C.blue, fontWeight: '600', fontSize: 14 },
  slippageRow: { flexDirection: 'row', alignItems: 'center', marginTop: 12, gap: 8 },
  slippageChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 16, backgroundColor: C.bg, borderWidth: 1, borderColor: C.border },
  emptyState: { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyTitle: { color: C.text, fontSize: 18, fontWeight: 'bold' },
  emptyText: { color: C.muted, fontSize: 14, textAlign: 'center' },
  balanceCard: { backgroundColor: 'rgba(20,40,28,0.95)', borderRadius: 24, padding: 20, borderWidth: 1, borderColor: 'rgba(57,255,130,0.3)', alignItems: 'center', marginBottom: 16, shadowColor: '#39FF82', shadowOffset: {width:0,height:4}, shadowOpacity: 0.15, shadowRadius: 20, elevation: 8 },
  balLabel: { color: C.muted, fontSize: 12 },
  balValue: { color: C.text, fontSize: 36, fontWeight: 'bold', marginVertical: 6 },
  walletAddress: { color: C.blue, fontSize: 11, marginBottom: 16 },
  portfolioActions: { flexDirection: 'row', gap: 12, marginTop: 4 },
  portfolioAction: { alignItems: 'center', backgroundColor: C.card2, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10, borderWidth: 1, borderColor: C.border },
  portfolioActionIcon: { color: C.green, fontSize: 18, fontWeight: 'bold' },
  portfolioActionTxt: { color: C.text, fontSize: 10, marginTop: 2 },
  sectionLabel: { color: C.muted, fontSize: 11, fontWeight: '600', marginBottom: 8, letterSpacing: 1 },
  assetRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.card, borderRadius: 14, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: C.border },
  assetIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.card2, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  assetIconTxt: { color: C.green, fontWeight: 'bold', fontSize: 15 },
  assetInfo: { flex: 1 },
  assetName: { color: C.text, fontSize: 14, fontWeight: '600' },
  assetPrice: { color: C.muted, fontSize: 12, marginTop: 2 },
  assetBal: { color: C.text, fontSize: 14, fontWeight: '600' },
  settingRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: C.border },
  settingLabel: { color: C.text, fontSize: 15 },
  settingVal: { color: C.green, fontSize: 14, flex: 1, textAlign: 'right' },
  rpcOption: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.border },
  rpcTxt: { color: C.muted, fontSize: 14 },
  dangerBtn: { borderWidth: 1, borderColor: C.red, borderRadius: 14, padding: 14, alignItems: 'center', marginTop: 16 },
  dangerBtnTxt: { color: C.red, fontWeight: '600', fontSize: 14 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: C.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, borderWidth: 1, borderColor: C.border, maxHeight: '90%' },
  modalTitle: { color: C.text, fontSize: 20, fontWeight: 'bold', marginBottom: 16, textAlign: 'center' },
  orText: { color: C.muted, fontSize: 13, textAlign: 'center', marginVertical: 12 },
  seedInput: { backgroundColor: C.bg, color: C.text, borderRadius: 12, padding: 14, fontSize: 14, borderWidth: 1, borderColor: C.border, minHeight: 80, textAlignVertical: 'top' },
  closeBtn: { padding: 14, alignItems: 'center', marginTop: 8, minWidth: 80 },
  closeBtnTxt: { color: C.muted, fontSize: 14, textAlign: 'center' },
  seedWarning: { color: C.orange, fontSize: 13, textAlign: 'center', marginBottom: 16, lineHeight: 20 },
  seedGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  seedWord: { width: '30%', flexDirection: 'row', alignItems: 'center', backgroundColor: C.bg, borderRadius: 8, padding: 8, borderWidth: 1, borderColor: C.border, gap: 6 },
  seedNum: { color: C.muted, fontSize: 11, width: 16 },
  seedWordTxt: { color: C.text, fontSize: 13, fontWeight: '600' },
  addressBox: { backgroundColor: C.bg, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: C.border, marginBottom: 16 },
  addressTxt: { color: C.text, fontSize: 13, lineHeight: 20 },
  tabBar: { flexDirection: 'row', backgroundColor: '#080c0a', borderTopWidth: 1, borderTopColor: 'transparent', paddingTop: 10, paddingBottom: 24, paddingHorizontal: 4 },
  tabItem: { flex: 1, alignItems: 'center', gap: 4, paddingHorizontal: 2 },
  tabIcon: { fontSize: 22, color: 'rgba(255,255,255,0.4)' },
  tabIconActive: { color: '#39FF82', textShadowColor: '#39FF82', textShadowOffset: {width:0,height:0}, textShadowRadius: 8 },
  tabLabel: { color: 'rgba(255,255,255,0.4)', fontSize: 10, marginTop: 2 },
  tabLabelActive: { color: '#39FF82', fontWeight: '600' },
  swapCard:{ backgroundColor:C.card, borderRadius:16, padding:16, marginBottom:4 },
  swapCardLabel:{ color:C.muted, fontSize:13, marginBottom:10 },
  swapCardRow:{ flexDirection:'row', alignItems:'center', justifyContent:'space-between' },
  swapAmtInput:{ flex:1, color:C.text, fontSize:34, fontWeight:'600', padding:0, minWidth:0 },
  swapAmtOut:{ flex:1, color:C.text, fontSize:34, fontWeight:'600' },
  tokenSelBtn:{ flexDirection:'row', alignItems:'center', backgroundColor:C.bg, borderRadius:20, paddingHorizontal:12, paddingVertical:8 },
  tokenLogo:{ width:26, height:26, borderRadius:13, backgroundColor:C.border },
  tokenSelTxt:{ color:C.text, fontSize:15, fontWeight:'700', marginLeft:6 },
  tokenDropdown:{ marginTop:10, backgroundColor:C.bg, borderRadius:12, padding:8 },
  tokenSearchIn:{ color:C.text, backgroundColor:C.card, borderRadius:8, paddingHorizontal:12, paddingVertical:9, marginBottom:6, fontSize:14 },
  tokenResultRow:{ flexDirection:'row', alignItems:'center', paddingVertical:10, borderBottomWidth:1, borderBottomColor:C.border },
  tokenResTxt:{ color:C.text, fontSize:14, fontWeight:'600' },
  tokenResSub:{ color:C.muted, fontSize:12, marginTop:2 },
  swapDirBtn:{ alignSelf:'center', backgroundColor:C.card, borderRadius:22, padding:12, marginVertical:6, borderWidth:3, borderColor:C.bg },
  pfBalanceSection:{ alignItems:'center', paddingVertical:24 },
  pfBalanceAmt:{ color:C.text, fontSize:40, fontWeight:'700', letterSpacing:-1 },
  pfAddressTxt:{ color:C.muted, fontSize:13, marginTop:6 },
  pfActions:{ flexDirection:'row', justifyContent:'space-around', marginBottom:24 },
  pfActionBtn:{ alignItems:'center', gap:6 },
  pfActionIcon:{ width:52, height:52, borderRadius:14, backgroundColor:C.card, alignItems:'center', justifyContent:'center' },
  pfActionIconTxt:{ color:C.text, fontSize:20 },
  pfActionLbl:{ color:C.text, fontSize:12, fontWeight:'500' },
  pfSectionLbl:{ color:C.text, fontSize:18, fontWeight:'700', marginBottom:12 },
  pfTokenRow:{ flexDirection:'row', alignItems:'center', paddingVertical:14, borderBottomWidth:1, borderBottomColor:C.border },
  pfTokenLogo:{ width:40, height:40, borderRadius:20, backgroundColor:C.border },
  pfTokenName:{ color:C.text, fontSize:15, fontWeight:'600' },
  pfTokenAmt:{ color:C.muted, fontSize:13, marginTop:2 },
  pfTokenVal:{ color:C.text, fontSize:15, fontWeight:'500' },
  stGroup:{ backgroundColor:C.card, borderRadius:16, marginBottom:12, overflow:'hidden' },
  stGroupLabel:{ color:C.muted, fontSize:12, fontWeight:'600', paddingHorizontal:16, paddingTop:12, paddingBottom:4, textTransform:'uppercase', letterSpacing:0.5 },
  stRow:{ flexDirection:'row', alignItems:'center', justifyContent:'space-between', paddingHorizontal:16, paddingVertical:14, borderBottomWidth:1, borderBottomColor:C.border },
  stRowTxt:{ color:C.text, fontSize:15 },
  stRowVal:{ color:C.green, fontSize:15 },
  stProfileRow:{ flexDirection:'row', alignItems:'center', padding:16 },
  stAvatar:{ width:44, height:44, borderRadius:22, backgroundColor:C.border, alignItems:'center', justifyContent:'center' },
  stAvatarTxt:{ color:C.green, fontSize:20 },
  stProfileAddr:{ color:C.text, fontSize:15, fontWeight:'600' },
  stProfileSub:{ color:C.muted, fontSize:12, marginTop:2 },
});
