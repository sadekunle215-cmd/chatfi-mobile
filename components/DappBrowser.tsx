import React from 'react';
import { View, Text, TouchableOpacity, TextInput, ActivityIndicator, Alert, Linking, ScrollView, Image, StatusBar, Modal } from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import * as ExpoLinking from 'expo-linking';
import nacl from 'tweetnacl';
import { rpcFetch } from '../wallet';
import { C, POPULAR_DAPPS } from '../theme';

function DappBrowser({ walletAddress, secretKey, wallet, mwaInitUrl, onMwaHandled }:any) {
  const [tabs, setTabs] = React.useState([{ id: 1, url: 'https://chatfi.pro', title: 'ChatFi' }]);
  const [activeTabId, setActiveTabId] = React.useState(1);
  const [url, setUrl] = React.useState('https://chatfi.pro');
  const [activeUrl, setActiveUrl] = React.useState('https://chatfi.pro');
  const [loading, setLoading] = React.useState(false);
  const [canGoBack, setCanGoBack] = React.useState(false);
  const [canGoForward, setCanGoForward] = React.useState(false);
  const [bookmarks, setBookmarks] = React.useState([]);
  const [showBookmarks, setShowBookmarks] = React.useState(false);
  const [pageTitle, setPageTitle] = React.useState('');
  const webRef = React.useRef(null);
  const tabCounter = React.useRef(2);

  const addTab = () => {
    const id = tabCounter.current++;
    const newTab = { id, url: 'https://chatfi.pro', title: 'New Tab' };
    setTabs(prev => [...prev, newTab]);
    setActiveTabId(id);
    setActiveUrl('https://chatfi.pro');
    setUrl('https://chatfi.pro');
    setPageTitle('New Tab');
  };

  const closeTab = (id) => {
    setTabs(prev => {
      const remaining = prev.filter(t => t.id !== id);
      if (remaining.length === 0) {
        const newId = tabCounter.current++;
        const newTab = { id: newId, url: 'https://chatfi.pro', title: 'ChatFi' };
        setActiveTabId(newId);
        setActiveUrl('https://chatfi.pro');
        setUrl('https://chatfi.pro');
        return [newTab];
      }
      if (id === activeTabId) {
        const last = remaining[remaining.length - 1];
        setActiveTabId(last.id);
        setActiveUrl(last.url);
        setUrl(last.url);
        setPageTitle(last.title);
      }
      return remaining;
    });
  };

  const switchTab = (tab) => {
    setActiveTabId(tab.id);
    setActiveUrl(tab.url);
    setUrl(tab.url);
    setPageTitle(tab.title);
  };

  const navigate = (u) => {
    let target = u.trim();
    if (!target.startsWith('http')) target = 'https://' + target;
    setActiveUrl(target);
    setUrl(target);
    setShowBookmarks(false);
    setTabs(prev => prev.map(t => t.id === activeTabId ? { ...t, url: target } : t));
  };

  React.useEffect(() => {
    if (mwaInitUrl) { navigate(mwaInitUrl); onMwaHandled?.(); }
  }, [mwaInitUrl]);

  const addBookmark = () => {
    if (!activeUrl) return;
    if (!bookmarks.find(b => b.url === activeUrl)) {
      setBookmarks([...bookmarks, { url: activeUrl, title: pageTitle || activeUrl }]);
    }
  };

  const removeBookmark = (u) => setBookmarks(bookmarks.filter(b => b.url !== u));
  const isBookmarked = bookmarks.find(b => b.url === activeUrl);

  const hostname = activeUrl ? (() => { try { return new URL(activeUrl).hostname; } catch { return activeUrl; } })() : '';
  const isHttps = activeUrl?.startsWith('https');
  const [editingUrl, setEditingUrl] = React.useState(false);
  const [showMenu, setShowMenu] = React.useState(false);
  const [showTabSwitcher, setShowTabSwitcher] = React.useState(false);
  const [pendingTx, setPendingTx] = React.useState<any>(null);

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>

      {/* Top Browser Bar */}
      <View style={{ backgroundColor: C.card, paddingTop: StatusBar.currentHeight || 0, borderBottomWidth: 1, borderBottomColor: C.border }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 8, gap: 8 }}>
          {/* URL Bar */}
          <TouchableOpacity style={{ flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: C.bg, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, gap: 6 }}
            onPress={() => setEditingUrl(true)}>
            {activeUrl
              ? <Image source={{ uri: 'https://www.google.com/s2/favicons?domain='+hostname+'&sz=32' }} style={{ width: 16, height: 16, borderRadius: 3 }} />
              : <Ionicons name="search-outline" size={15} color={C.muted} />}
            {isHttps && <Ionicons name="lock-closed" size={12} color={C.green} />}
            <Text style={{ flex: 1, color: activeUrl ? C.text : C.muted, fontSize: 14 }} numberOfLines={1}>
              {activeUrl ? hostname : 'Search or enter URL...'}
            </Text>
            {loading && <ActivityIndicator size="small" color={C.green} />}
          </TouchableOpacity>
                    {/* Tab count button */}
          <TouchableOpacity onPress={() => { setShowMenu(false); setShowTabSwitcher(true); }}
            style={{ width:34, height:28, borderRadius:7, borderWidth:2, borderColor:C.text, alignItems:'center', justifyContent:'center' }}>
            <Text style={{ color:C.text, fontWeight:'700', fontSize:12 }}>{tabs.length}</Text>
          </TouchableOpacity>
          {/* 3-dot menu button */}
          <TouchableOpacity onPress={() => setShowMenu(m => !m)} style={{ padding: 8 }}>
            <Ionicons name="ellipsis-vertical" size={20} color={C.text} />
          </TouchableOpacity>
        </View>

        {/* URL edit input */}
        {editingUrl && (
          <View style={{ paddingHorizontal: 10, paddingBottom: 10 }}>
            <TextInput
              style={{ backgroundColor: C.bg, color: C.text, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, borderWidth: 1.5, borderColor: C.green }}
              value={url} onChangeText={setUrl}
              onSubmitEditing={() => { navigate(url); setEditingUrl(false); }}
              onBlur={() => setEditingUrl(false)}
              placeholder="Search or enter URL..." placeholderTextColor={C.muted}
              autoCapitalize="none" keyboardType="url" autoFocus
            />
          </View>
        )}

        {/* 3-dot dropdown menu */}
        {showMenu && (
          <View style={{ position: 'absolute', top: (StatusBar.currentHeight||0)+48, right: 10, backgroundColor: C.card, borderRadius: 14, borderWidth: 1, borderColor: C.border, zIndex: 999, minWidth: 200, shadowColor:'#000', shadowOpacity:0.3, shadowRadius:8, elevation:10 }}>
            {/* Nav row */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.border }}>
              <TouchableOpacity onPress={() => { webRef.current?.goBack(); setShowMenu(false); }} disabled={!canGoBack} style={{ alignItems: 'center', padding: 6 }}>
                <Ionicons name="chevron-back" size={22} color={canGoBack ? C.text : C.muted} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { webRef.current?.goForward(); setShowMenu(false); }} disabled={!canGoForward} style={{ alignItems: 'center', padding: 6 }}>
                <Ionicons name="chevron-forward" size={22} color={canGoForward ? C.text : C.muted} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { webRef.current?.reload(); setShowMenu(false); }} style={{ alignItems: 'center', padding: 6 }}>
                <Ionicons name="refresh" size={22} color={C.text} />
              </TouchableOpacity>
            </View>
            {/* Menu items */}
            {[
              { icon: isBookmarked ? 'star' : 'star-outline', label: isBookmarked ? 'Bookmarked' : 'Add Bookmark', color: isBookmarked ? C.green : C.text, action: () => { addBookmark(); setShowMenu(false); } },
              { icon: 'list-outline', label: 'Bookmarks', color: C.text, action: () => { setShowBookmarks(s => !s); setShowMenu(false); } },
              { icon: 'home-outline', label: 'Home', color: C.text, action: () => { setActiveUrl(''); setTimeout(()=>{setActiveUrl('https://chatfi.pro');setUrl('https://chatfi.pro');},50); setShowMenu(false); } },
            ].map((item, i) => (
              <TouchableOpacity key={i} onPress={item.action}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 18, paddingVertical: 14, borderTopWidth: i > 0 ? 1 : 0, borderTopColor: C.border }}>
                <Ionicons name={item.icon} size={20} color={item.color} />
                <Text style={{ color: item.color, fontSize: 15 }}>{item.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {loading && <View style={{ height: 2, backgroundColor: C.green }} />}
      </View>

      {/* Bookmarks Panel */}
      {showBookmarks && (
        <View style={{ backgroundColor: C.card, borderBottomWidth: 1, borderBottomColor: C.border, maxHeight: 240 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 }}>
            <Text style={{ color: C.text, fontWeight: '700', fontSize: 15 }}>Bookmarks</Text>
            <TouchableOpacity onPress={() => setShowBookmarks(false)}><Ionicons name="close" size={20} color={C.muted} /></TouchableOpacity>
          </View>
          <ScrollView>
            {bookmarks.length === 0
              ? <Text style={{ color: C.muted, padding: 16, fontSize: 13, textAlign: 'center' }}>No bookmarks yet. Tap ★ to add one.</Text>
              : bookmarks.map((b, i) => (
                <View key={i} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1, borderTopColor: C.border }}>
                  <Image source={{ uri: 'https://www.google.com/s2/favicons?domain='+(() => { try { return new URL(b.url).hostname } catch { return '' } })()+'&sz=32' }}
                    style={{ width: 24, height: 24, borderRadius: 6, marginRight: 12 }} />
                  <TouchableOpacity style={{ flex: 1 }} onPress={() => { navigate(b.url); setShowBookmarks(false); }}>
                    <Text style={{ color: C.text, fontSize: 13, fontWeight: '600' }} numberOfLines={1}>{b.title}</Text>
                    <Text style={{ color: C.muted, fontSize: 11, marginTop: 2 }} numberOfLines={1}>{b.url}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => removeBookmark(b.url)} style={{ padding: 6 }}>
                    <Ionicons name="trash-outline" size={16} color={C.muted} />
                  </TouchableOpacity>
                </View>
              ))}
          </ScrollView>
        </View>
      )}

      {/* Home Screen */}
      {!activeUrl ? (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20 }}>
          <View style={{ backgroundColor: C.card, borderRadius: 16, padding: 16, marginBottom: 24, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: '#0d2a0d', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="wallet-outline" size={20} color={C.green} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: C.text, fontWeight: '700', fontSize: 14 }}>Wallet Connected</Text>
              <Text style={{ color: C.muted, fontSize: 12, marginTop: 2 }}>{walletAddress ? walletAddress.slice(0,8)+'...'+walletAddress.slice(-6) : 'No wallet'}</Text>
            </View>
            <View style={{ backgroundColor: '#0d2a0d', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 }}>
              <Text style={{ color: C.green, fontSize: 12, fontWeight: '700' }}>● Live</Text>
            </View>
          </View>
          <Text style={{ color: C.muted, fontSize: 11, fontWeight: '700', letterSpacing: 1.5, marginBottom: 16 }}>POPULAR DAPPS</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
            {POPULAR_DAPPS.map((d, i) => (
              <TouchableOpacity key={i} onPress={() => navigate(d.url)}
                style={{ width: '47%', backgroundColor: C.card, borderRadius: 16, padding: 14, gap: 8 }}>
                <Image source={{ uri: 'https://www.google.com/s2/favicons?domain='+d.domain+'&sz=64' }}
                  style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: C.bg }} />
                <Text style={{ color: C.text, fontSize: 14, fontWeight: '700' }}>{d.name}</Text>
                <Text style={{ color: C.muted, fontSize: 11 }} numberOfLines={2}>{d.desc}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      ) : (
        <View style={{ flex: 1 }}>
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
            injectedJavaScriptBeforeContentLoaded={SOLANA_WALLET_INJECTION.replace(/\${PUBLIC_KEY}/g, walletAddress || '')}
            onMessage={async (event) => {
              try {
                const { id, method, params } = JSON.parse(event.nativeEvent.data);
                if (!secretKey) { webRef.current?.postMessage(JSON.stringify({ id, error: 'No wallet' })); return; }
                if (method === 'signMessage') {
                  const msgBytes = Uint8Array.from(atob(params.message), c => c.charCodeAt(0));
                  const sig = nacl.sign.detached(msgBytes, secretKey);
                  webRef.current?.postMessage(JSON.stringify({ id, result: btoa(String.fromCharCode(...sig)) }));
                } else if (method === 'signTransaction' || method === 'signAndSend') {
                  setPendingTx({ id, method, params });
                  return;
                }
              } catch(e) {
                try { const { id } = JSON.parse(event.nativeEvent.data); webRef.current?.postMessage(JSON.stringify({ id, error: e.message })); } catch(_) {}
              }
            }}
            javaScriptEnabled={true}
            domStorageEnabled={true}
            style={{ flex: 1 }}
          />
        </View>
      )}


      {/* TX Approval Modal */}
      {pendingTx && (
        <Modal visible animationType="slide" transparent onRequestClose={() => { webRef.current?.postMessage(JSON.stringify({ id: pendingTx.id, error: 'User rejected' })); setPendingTx(null); }}>
          <View style={{ flex:1, backgroundColor:'rgba(0,0,0,0.75)', justifyContent:'flex-end' }}>
            <View style={{ backgroundColor:C.card, borderTopLeftRadius:24, borderTopRightRadius:24, padding:24, paddingBottom:40 }}>
              <View style={{ alignItems:'center', marginBottom:16 }}>
                <View style={{ width:48, height:48, borderRadius:24, backgroundColor:'#1a2a1a', alignItems:'center', justifyContent:'center', marginBottom:12 }}>
                  <Ionicons name="swap-horizontal" size={24} color={C.green} />
                </View>
                <Text style={{ color:C.text, fontWeight:'700', fontSize:20 }}>Approve Transaction</Text>
                <Text style={{ color:C.muted, fontSize:13, marginTop:6, textAlign:'center' }}>{hostname} wants to sign a transaction</Text>
              </View>
              <View style={{ backgroundColor:C.bg, borderRadius:14, padding:14, marginBottom:20 }}>
                <Text style={{ color:C.muted, fontSize:11, marginBottom:4 }}>WALLET</Text>
                <Text style={{ color:C.text, fontSize:13, fontFamily:'monospace' }}>{walletAddress?.slice(0,16)}...{walletAddress?.slice(-8)}</Text>
                <Text style={{ color:C.muted, fontSize:11, marginTop:8, marginBottom:4 }}>ACTION</Text>
                <Text style={{ color:C.text, fontSize:13 }}>{pendingTx.method === 'signAndSend' ? '⚡ Sign & Send Transaction' : '✍️ Sign Only'}</Text>
                <Text style={{ color:C.muted, fontSize:11, marginTop:8, marginBottom:4 }}>SITE</Text>
                <Text style={{ color:C.green, fontSize:13 }}>{hostname}</Text>
                <Text style={{ color:C.muted, fontSize:11, marginTop:8, marginBottom:4 }}>NETWORK FEE</Text>
                <Text style={{ color:C.text, fontSize:13 }}>~0.000005 SOL</Text>
              </View>
              <View style={{ flexDirection:'row', gap:12 }}>
                <TouchableOpacity
                  onPress={() => { webRef.current?.postMessage(JSON.stringify({ id: pendingTx.id, error: 'User rejected' })); setPendingTx(null); }}
                  style={{ flex:1, backgroundColor:C.bg, borderRadius:14, padding:16, alignItems:'center', borderWidth:1, borderColor:C.red }}>
                  <Text style={{ color:C.red, fontWeight:'700', fontSize:16 }}>Reject</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    onPress={async () => {
                    const { id, method: m, params: p } = pendingTx;
                    try {
                      const { VersionedTransaction, Keypair, Transaction } = require('@solana/web3.js');
                      const keypair = Keypair.fromSecretKey(secretKey);
                      const txBytes = Buffer.from(p.tx, 'base64');
                      let signed;
                      try {
                        // Try versioned transaction first
                        const tx = VersionedTransaction.deserialize(txBytes);
                        tx.sign([keypair]);
                        signed = Buffer.from(tx.serialize()).toString('base64');
                      } catch {
                        try {
                          // Fall back to legacy transaction
                          const tx = Transaction.from(txBytes);
                          tx.partialSign(keypair);
                          signed = tx.serialize({ requireAllSignatures: false, verifySignatures: false }).toString('base64');
                        } catch(e2) {
                          throw new Error('Failed to deserialize transaction: ' + e2.message);
                        }
                      }
                      if (m === 'signAndSend') {
                        const r = await fetch('https://api.mainnet-beta.solana.com', {
                          method:'POST', headers:{'Content-Type':'application/json'},
                          body: JSON.stringify({ jsonrpc:'2.0', id:1, method:'sendTransaction', params:[signed,{encoding:'base64',skipPreflight:false,preflightCommitment:'confirmed',maxRetries:3}] })
                        });
                        const rd = await r.json();
                        if (rd.error) throw new Error(rd.error.message);
                        webRef.current?.postMessage(JSON.stringify({ id, result: rd.result }));
                      } else {
                        // Return signed transaction bytes for signTransaction
                        webRef.current?.postMessage(JSON.stringify({ id, result: signed }));
                      }
                      setPendingTx(null);
                    } catch(e:any) {
                      webRef.current?.postMessage(JSON.stringify({ id, error: e.message }));
                      setPendingTx(null);
                      Alert.alert('Transaction Failed', e.message);
                    }
                    }}
                  style={{ flex:1, backgroundColor:C.green, borderRadius:14, padding:16, alignItems:'center' }}>
                  <Text style={{ color:'#000', fontWeight:'700', fontSize:16 }}>Approve</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}

      {/* Tab Switcher Modal */}
      <Modal visible={showTabSwitcher} animationType="fade" transparent={false} onRequestClose={() => setShowTabSwitcher(false)}>
        <View style={{ flex:1, backgroundColor:C.bg }}>
          <View style={{ backgroundColor:C.card, paddingTop:(StatusBar.currentHeight||0)+12, paddingBottom:12, paddingHorizontal:16, flexDirection:'row', alignItems:'center', justifyContent:'space-between', borderBottomWidth:1, borderBottomColor:C.border }}>
            <Text style={{ color:C.text, fontWeight:'700', fontSize:16 }}>{tabs.length} Tab{tabs.length!==1?'s':''}</Text>
            <TouchableOpacity onPress={() => { addTab(); setShowTabSwitcher(false); }}
              style={{ backgroundColor:C.green, borderRadius:20, width:32, height:32, alignItems:'center', justifyContent:'center' }}>
              <Text style={{ color:'#000', fontWeight:'700', fontSize:20 }}>+</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowTabSwitcher(false)}
              style={{ backgroundColor:C.card, borderRadius:8, paddingHorizontal:14, paddingVertical:6 }}>
              <Text style={{ color:C.green, fontWeight:'700', fontSize:14 }}>Done</Text>
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding:12 }}>
            <View style={{ flexDirection:'row', flexWrap:'wrap', gap:12 }}>
              {tabs.map(tab => {
                const isActive = tab.id === activeTabId;
                const tHost = (() => { try { return new URL(tab.url).hostname; } catch { return tab.url; } })();
                return (
                  <TouchableOpacity key={tab.id}
                    onPress={() => { switchTab(tab); setShowTabSwitcher(false); }}
                    style={{ width:'47%', backgroundColor:C.card, borderRadius:16, overflow:'hidden', borderWidth:isActive?2:0, borderColor:C.green }}>
                    <View style={{ backgroundColor:C.bg, height:120, alignItems:'center', justifyContent:'center', padding:12 }}>
                      <Image source={{ uri:'https://www.google.com/s2/favicons?domain='+tHost+'&sz=64' }}
                        style={{ width:40, height:40, borderRadius:10, marginBottom:8 }} />
                      <Text style={{ color:C.text, fontSize:12, fontWeight:'600', textAlign:'center' }} numberOfLines={2}>{tab.title||tHost}</Text>
                    </View>
                    <View style={{ paddingHorizontal:10, paddingVertical:8, flexDirection:'row', alignItems:'center', justifyContent:'space-between' }}>
                      <Text style={{ color:C.muted, fontSize:11, flex:1 }} numberOfLines={1}>{tHost}</Text>
                      <TouchableOpacity onPress={() => closeTab(tab.id)} style={{ padding:4 }}>
                        <Text style={{ color:C.muted, fontSize:16 }}>✕</Text>
                      </TouchableOpacity>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>
          <View style={{ flexDirection:'row', justifyContent:'center', padding:16, borderTopWidth:1, borderTopColor:C.border }}>
            <TouchableOpacity onPress={() => { tabs.forEach(t => closeTab(t.id)); setShowTabSwitcher(false); }}
              style={{ paddingHorizontal:20, paddingVertical:10 }}>
              <Text style={{ color:C.red, fontWeight:'600' }}>Close All</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

    </View>
  );
}

const StudioLaunchCard = ({ card, wallet, deriveWallet, setMsgs, C, s }: any) => {
  const data = card.data || {};
  const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
  const [studioImg, setStudioImg] = React.useState<{uri:string,type:string,base64:string}|null>(null);
  const [studioStatus, setStudioStatus] = React.useState<string>('idle');
  const [studioMint, setStudioMint] = React.useState<string>('');
  const [studioErr, setStudioErr] = React.useState<string>('');

  const pickImage = async () => {
    const ImagePicker = require('expo-image-picker');
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert('Permission needed','Allow photo access to upload token image'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing:true, aspect:[1,1], quality:0.8, base64:true });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      setStudioImg({ uri: asset.uri, type: asset.mimeType || 'image/jpeg', base64: asset.base64 || '' });
    }
  };

  const launchToken = async () => {
    if (!studioImg) { Alert.alert('Missing image','Please pick a token image first'); return; }
    setStudioStatus('loading'); setStudioErr('');
    try {
      const { name, symbol, description, creator } = data;
      // Step 1: get tx + presigned URLs via proxy
      const createRes = await fetch('https://chatfi.pro/api/jupiter', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          url:'https://api.jup.ag/studio/v1/dbc-pool/create-tx',
          method:'POST',
          body: {
            buildCurveByMarketCapParam: {
              quoteMint: USDC, initialMarketCap: 16000, migrationMarketCap: 69000, tokenQuoteDecimal: 6,
              lockedVestingParam: { totalLockedVestingAmount:0, cliffUnlockAmount:0, numberOfVestingPeriod:0, totalVestingDuration:0, cliffDurationFromMigrationTime:0 },
            },
            antiSniping: false, fee:{ feeBps:100 }, isLpLocked: true,
            tokenName: name, tokenSymbol: (symbol||'').toUpperCase(),
            tokenImageContentType: studioImg.type, creator,
          }
        })
      });
      const createData = await createRes.json();
      if (createData.error) throw new Error(JSON.stringify(createData.error));
      if (!createData.transaction) throw new Error('No transaction from Studio API');
      const { transaction: txB64, imagePresignedUrl, metadataPresignedUrl, imageUrl, mint } = createData;

      // Step 2: upload image directly (presigned URL, no auth needed)
      const imgBytes = Uint8Array.from(atob(studioImg.base64), (c:string) => c.charCodeAt(0));
      await fetch(imagePresignedUrl, { method:'PUT', headers:{'Content-Type': studioImg.type}, body: imgBytes });

      // Step 3: upload metadata
      await fetch(metadataPresignedUrl, { method:'PUT', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ name, symbol:(symbol||'').toUpperCase(), description: description||'', image: imageUrl }) });

      // Step 4: sign tx
      const { VersionedTransaction, Keypair } = require('@solana/web3.js');
      const { secretKey: sk2 } = getKeypair(wallet);
      const keypair = Keypair.fromSecretKey(sk2);
      const tx = VersionedTransaction.deserialize(Buffer.from(txB64,'base64'));
      tx.sign([keypair]);
      const signedB64 = Buffer.from(tx.serialize()).toString('base64');

      // Step 5: submit via studio-submit proxy (multipart)
      const formData = new FormData();
      formData.append('transaction', signedB64);
      formData.append('owner', creator);
      formData.append('content', description||'');
      const submitRes = await fetch('https://chatfi.pro/api/studio-submit', {
        method:'POST', body: formData
      });
      const submitText = await submitRes.text();
      let submitData:any = {};
      try { submitData = JSON.parse(submitText); } catch { /* Jupiter may return empty body on success */ }
      if (submitData.error) throw new Error(JSON.stringify(submitData.error));
      if (!submitRes.ok && !submitData.mint) throw new Error(submitText.slice(0,200));

      setStudioMint(mint);
      setStudioStatus('done');
      setMsgs((p:any) => [...p, { id: Date.now(), from:'bot', text: `✅ Token ${name} (${(symbol||'').toUpperCase()}) created!\nMint: ${mint.slice(0,8)}...\nhttps://jup.ag/studio/${mint}` }]);
    } catch(e:any) { setStudioErr(e.message); setStudioStatus('error'); }
  };

  return (
    <View style={{backgroundColor:C.card,borderRadius:16,padding:16,marginBottom:8,borderWidth:1,borderColor:C.border}}>
      <View style={s.botTag}><View style={s.botDot}/><Text style={s.botTagTxt}>ChatFi AI</Text></View>
      <Text style={{color:C.text,fontWeight:'700',fontSize:16,marginBottom:4}}>🎨 Launch Token on Jupiter</Text>
      <Text style={{color:C.muted,fontSize:12,marginBottom:12}}>Dynamic Bonding Curve (DBC)</Text>
      <View style={{backgroundColor:C.bg,borderRadius:10,padding:10,marginBottom:12}}>
        <Text style={{color:C.text,fontWeight:'600'}}>{data.name} ({(data.symbol||'').toUpperCase()})</Text>
        <Text style={{color:C.muted,fontSize:12}}>Supply: {parseInt(data.supply||'1000000000').toLocaleString()}</Text>
        {data.description ? <Text style={{color:C.muted,fontSize:12}}>{data.description}</Text> : null}
      </View>
      <TouchableOpacity onPress={pickImage}
        style={{borderWidth:1,borderColor:studioImg?C.green:C.border,borderStyle:'dashed',borderRadius:10,padding:16,alignItems:'center',marginBottom:12}}>
        {studioImg
          ? <Image source={{uri:studioImg.uri}} style={{width:60,height:60,borderRadius:10}}/>
          : <Text style={{color:C.muted}}>📷 Tap to pick token image</Text>}
      </TouchableOpacity>
      {studioStatus === 'idle' && (
        <TouchableOpacity onPress={launchToken} style={{backgroundColor:C.green,borderRadius:10,padding:12,alignItems:'center'}}>
          <Text style={{color:'#0d1117',fontWeight:'700'}}>🚀 Launch Token</Text>
        </TouchableOpacity>
      )}
      {studioStatus === 'loading' && <ActivityIndicator color={C.green}/>}
      {studioStatus === 'done' && (
        <TouchableOpacity onPress={()=>Linking.openURL(`https://jup.ag/studio/${studioMint}`)}
          style={{backgroundColor:C.green,borderRadius:10,padding:12,alignItems:'center'}}>
          <Text style={{color:'#0d1117',fontWeight:'700'}}>View on Jupiter Studio →</Text>
        </TouchableOpacity>
      )}
      {studioStatus === 'error' && <Text style={{color:'#ef4444',fontSize:12,marginTop:8}}>❌ {studioErr}</Text>}
    </View>
  );
};



export default DappBrowser;
