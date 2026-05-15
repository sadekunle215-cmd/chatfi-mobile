import React, { useState, useEffect, useCallback, useRef } from 'react';
import { WebView } from 'react-native-webview';
import { CameraView, useCameraPermissions } from 'expo-camera';
import Svg, { Line as SvgLine, Rect as SvgRect } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { Image, View, Text, TouchableOpacity, StyleSheet, ScrollView, TextInput, StatusBar, SafeAreaView, Modal, Alert, ActivityIndicator, Clipboard, RefreshControl, KeyboardAvoidingView, Platform, Animated, AppState, Linking } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as LocalAuthentication from 'expo-local-authentication';
import { generateWallet, getPublicKey, getPrivateKey, importWallet as deriveWallet, signAndSendTransaction, rpcFetch } from './wallet';
import nacl from 'tweetnacl';
import { askAI, getJupiterQuote, executeSwap as executeSwapTx, getTokenPrice, createTriggerOrder, createRecurringOrder } from './sendMsg';
import { TOKENS, DECIMALS, getWalletBalances, getTokenPrices } from './wallet';
const TOKEN_LOGOS: Record<string, string> = {
  SOL: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png',
  USDC: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png',
  USDT: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB/logo.png',
  JUP: 'https://img.jup.ag/tokens/JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN',
  BONK: 'https://img.jup.ag/tokens/DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
  WIF: 'https://img.jup.ag/tokens/EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm',
};

const C = {
  bg: '#0d1117', card: '#1C2936', card2: '#162030',
  border: '#2a3f52', green: '#C7F284', blue: '#79e0f2',
  text: '#e8f4e8', muted: '#7a9bb5', red: '#ff5555', orange: '#ffaa00',
  gradTop: '#1C2936', gradBot: '#0d1117',
};

const RPC = 'https://solana-mainnet.g.alchemy.com/v2/demo';

async function _sendSOL(pubkey:string,secretKey:Uint8Array,recipient:string,lamports:number):Promise<string>{
  const bs58=require('bs58');
  const bh=await rpcFetch('getLatestBlockhash',[{commitment:'confirmed'}]);
  const blockhash=bh.result.value.blockhash;
  const from=bs58.decode(pubkey);
  const to=bs58.decode(recipient);
  const bhb=bs58.decode(blockhash);
  const sys=new Uint8Array(32);
  const ix=new Uint8Array(12);
  new DataView(ix.buffer).setUint32(0,2,true);
  new DataView(ix.buffer).setBigUint64(4,BigInt(lamports),true);
  const msg=new Uint8Array([1,0,1,3,...from,...to,...sys,...bhb,1,2,2,0,1,12,...ix]);
  const sig=nacl.sign.detached(msg,secretKey);
  const tx=new Uint8Array([1,...sig,...msg]);
  const r=await rpcFetch('sendTransaction',[Buffer.from(tx).toString('base64'),{encoding:'base64',preflightCommitment:'confirmed'}]);
  if(r.error)throw new Error(r.error.message);
  return r.result;
}

async function _sendSPL(pubkey:string,secretKey:Uint8Array,recipient:string,amountRaw:number,mint:string):Promise<string>{
  const bs58=require('bs58');
  const TOKEN_PROG='TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
  const ASSOC_PROG='ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJe1bw';

  function findATA(wallet:string,mint:string):string{
    const {PublicKey}=require('@solana/web3.js');
    const [ata]=require('@solana/web3.js').PublicKey.findProgramAddressSync(
      [bs58.decode(wallet),bs58.decode(TOKEN_PROG),bs58.decode(mint)],
      bs58.decode(ASSOC_PROG)
    );
    return bs58.encode(ata);
  }

  const fromATA=findATA(pubkey,mint);
  const toATA=findATA(recipient,mint);

  // Check if toATA exists
  const toATAInfo=await rpcFetch('getAccountInfo',[toATA,{encoding:'base64'}]);
  const toATAExists=toATAInfo?.result?.value!==null;

  // Build transaction manually
  const from=bs58.decode(pubkey);
  const to=bs58.decode(recipient);
  const fromATAb=bs58.decode(fromATA);
  const toATAb=bs58.decode(toATA);
  const mintb=bs58.decode(mint);
  const tokenProgb=bs58.decode(TOKEN_PROG);
  const assocProgb=bs58.decode(ASSOC_PROG);
  const sysProgb=new Uint8Array(32);

  const bh=await rpcFetch('getLatestBlockhash',[{commitment:'confirmed'}]);
  const blockhash=bh.result.value.blockhash;
  const bhb=bs58.decode(blockhash);

  // Transfer instruction data
  const ixData=new Uint8Array(9);
  ixData[0]=3;
  new DataView(ixData.buffer).setBigUint64(1,BigInt(amountRaw),true);

  // Build accounts list
  const accounts=toATAExists
    ?[from,fromATAb,toATAb,tokenProgb]
    :[from,fromATAb,toATAb,to,mintb,sysProgb,tokenProgb,assocProgb];

  // Simple transfer ix
  const numAccounts=toATAExists?3:6;
  const header=new Uint8Array([1,0,numAccounts]);

  // Serialize message
  const msg=new Uint8Array([
    1,0,toATAExists?3:6,...from,...fromATAb,...toATAb,...(toATAExists?[]:[...to,...mintb,...sysProgb]),...tokenProgb,...bhb,
    1,0,toATAExists?1:4,toATAExists?2:4,...ixData
  ]);

  const sig=nacl.sign.detached(msg,secretKey);
  const txBytes=new Uint8Array([1,...sig,...msg]);
  const r=await rpcFetch('sendTransaction',[Buffer.from(txBytes).toString('base64'),{encoding:'base64',preflightCommitment:'confirmed'}]);
  if(r.error)throw new Error(r.error.message);
  return r.result;
}

const TABS = [
  { id: 'chat', label: 'Chat', icon: 'chatbubble-outline', iconActive: 'chatbubble' },
  { id: 'swap', label: 'Swap', icon: 'swap-horizontal-outline', iconActive: 'swap-horizontal' },
  { id: 'portfolio', label: 'Portfolio', icon: 'time-outline', iconActive: 'time' },
  { id: 'dapp', label: 'Dapp', icon: 'compass-outline', iconActive: 'compass-sharp' },
  { id: 'settings', label: 'Settings', icon: 'settings-outline', iconActive: 'settings' },
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



function NativeChart({ mint }: { mint: string }) {
  const [candles, setCandles] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [interval, setIntervalType] = React.useState('15m');
  const W = 340; const H = 200; const PAD = 8;

  React.useEffect(() => {
    setLoading(true);
    setCandles([]);
    const limit = 40;
    const resolution = interval === '1m'?1:interval==='5m'?5:interval==='15m'?15:interval==='1h'?60:interval==='4h'?240:1440;
    fetch('https://chatfi.pro/api/jupiter', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({url:`https://public-api.birdeye.so/defi/ohlcv?address=${mint}&type=${interval}&limit=${limit}`, method:'GET'})
    })
    .then(r=>r.json())
    .then(d=>{
      const items = d?.data?.items || [];
      setCandles(items);
    })
    .catch(()=>{})
    .finally(()=>setLoading(false));
  }, [mint, interval]);

  const intervals = ['5m','15m','1h','4h','1D'];

  if (loading) return (
    <View style={{height:240,alignItems:'center',justifyContent:'center',backgroundColor:C.card,borderRadius:14,marginBottom:16}}>
      <ActivityIndicator color={C.green}/>
      <Text style={{color:C.muted,fontSize:12,marginTop:8}}>Loading chart...</Text>
    </View>
  );

  if (!candles.length) return (
    <View style={{height:240,alignItems:'center',justifyContent:'center',backgroundColor:C.card,borderRadius:14,marginBottom:16}}>
      <Text style={{color:C.muted,fontSize:13}}>No chart data available</Text>
    </View>
  );

  const highs = candles.map(c=>c.h||c.high||0);
  const lows = candles.map(c=>c.l||c.low||0);
  const maxP = Math.max(...highs);
  const minP = Math.min(...lows);
  const range = maxP - minP || 1;
  const chartW = W - PAD*2;
  const chartH = H - PAD*2;
  const cw = chartW / candles.length;

  const toY = (p:number) => PAD + (1-(p-minP)/range)*chartH;

  return (
    <View style={{backgroundColor:C.card,borderRadius:14,padding:8,marginBottom:16}}>
      {/* Interval selector */}
      <View style={{flexDirection:'row',gap:6,marginBottom:8,justifyContent:'center'}}>
        {intervals.map(iv=>(
          <TouchableOpacity key={iv} onPress={()=>setIntervalType(iv)}
            style={{paddingHorizontal:10,paddingVertical:4,borderRadius:8,backgroundColor:interval===iv?C.green:C.card2}}>
            <Text style={{color:interval===iv?'#0d1117':C.muted,fontSize:11,fontWeight:'600'}}>{iv}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <Svg width={W} height={H}>
        {candles.map((c,i)=>{
          const o = c.o||c.open||0; const cl = c.c||c.close||0;
          const h = c.h||c.high||0; const l = c.l||c.low||0;
          const x = PAD + i*cw + cw*0.1;
          const bw = cw*0.8;
          const isGreen = cl >= o;
          const color = isGreen ? '#39ff14' : '#ff5555';
          const bodyTop = toY(Math.max(o,cl));
          const bodyBot = toY(Math.min(o,cl));
          const bodyH = Math.max(1, bodyBot-bodyTop);
          return (
            <React.Fragment key={i}>
              <SvgLine x1={x+bw/2} y1={toY(h)} x2={x+bw/2} y2={toY(l)} stroke={color} strokeWidth={1}/>
              <SvgRect x={x} y={bodyTop} width={bw} height={bodyH} fill={color} />
            </React.Fragment>
          );
        })}
      </Svg>
      <View style={{flexDirection:'row',justifyContent:'space-between',paddingHorizontal:4}}>
        <Text style={{color:C.muted,fontSize:10}}>${minP.toFixed(4)}</Text>
        <Text style={{color:C.muted,fontSize:10}}>${maxP.toFixed(4)}</Text>
      </View>
    </View>
  );
}

function TokenModal({ token, pubkey, onClose, onSend }) {
  const [view, setView] = React.useState('main');
  const [importSeedInput, setImportSeedInput] = React.useState('');
  const [showImportModal, setShowImportModal] = useState(false);
  const [sendAddr, setSendAddr] = React.useState('');
  const [sendAmt, setSendAmt] = React.useState('');
  const [sending, setSending] = React.useState(false);
  if (!token) return null;

  return (
    <Modal visible={!!token} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS==='ios'?'padding':'height'} style={{flex:1}} keyboardVerticalOffset={0}>
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
            <ScrollView showsVerticalScrollIndicator={false}>
              {/* USD Value */}
              <View style={{ alignItems:'center', marginBottom:20 }}>
                <Text style={{ color:C.text, fontSize:32, fontWeight:'bold' }}>
                  ${((token.amount||0)*(token.price||0)).toFixed(2)}
                </Text>
                <Text style={{ color:C.muted, fontSize:13, marginTop:2 }}>
                  {(token.amount||0).toFixed(6)} {token.symbol}
                </Text>
              </View>

              {/* Stats Row */}
              <View style={{ flexDirection:'row', gap:10, marginBottom:16 }}>
                <View style={{ flex:1, backgroundColor:C.card, borderRadius:14, padding:14, alignItems:'center' }}>
                  <Text style={{ color:C.muted, fontSize:11, marginBottom:4, flexShrink:1 }}>Price</Text>
                  <Text style={{ color:C.text, fontWeight:'bold', fontSize:15 }}>
                    {token.price ? '$'+Number(token.price).toFixed(4) : '—'}
                  </Text>
                </View>
                <View style={{ flex:1, backgroundColor:C.card, borderRadius:14, padding:14, alignItems:'center' }}>
                  <Text style={{ color:C.muted, fontSize:11, marginBottom:4 }}>Holdings</Text>
                  <Text style={{ color:C.green, fontWeight:'bold', fontSize:15 }}>
                    ${((token.amount||0)*(token.price||0)).toFixed(2)}
                  </Text>
                </View>
                <View style={{ flex:1, backgroundColor:C.card, borderRadius:14, padding:14, alignItems:'center' }}>
                  <Text style={{ color:C.muted, fontSize:11, marginBottom:4 }}>Status</Text>
                  <View style={{ flexDirection:'row', alignItems:'center', gap:3 }}>
                    {token.isVerified
                      ? <><Ionicons name="checkmark-circle" size={14} color={C.green}/><Text style={{ color:C.green, fontWeight:'bold', fontSize:13 }}>Verified</Text></>
                      : <Text style={{ color:'#ff9900', fontWeight:'bold', fontSize:13 }}>Unverified</Text>}
                  </View>
                </View>
              </View>

              {/* Mint Address */}
              <View style={{ backgroundColor:C.card, borderRadius:14, padding:14, marginBottom:16 }}>
                <Text style={{ color:C.muted, fontSize:11, marginBottom:6 }}>Contract Address</Text>
                <TouchableOpacity onPress={() => Alert.alert('Mint Address', token.mint)}>
                  <Text style={{ color:C.text, fontSize:12, fontFamily:'monospace' }} numberOfLines={1}>
                    {token.mint ? token.mint.slice(0,16)+'...'+token.mint.slice(-8) : '—'}
                  </Text>
                  <Text style={{ color:C.green, fontSize:11, marginTop:4 }}>Tap to view full address</Text>
                </TouchableOpacity>
              </View>


              {/* Native Chart */}
              {/* DexScreener Chart */}
              <View style={{ borderRadius:14, overflow:'hidden', marginBottom:16, height:380 }}>
                <WebView
                  source={{ uri: 'https://dexscreener.com/solana/'+token.mint+'?embed=1&theme=dark&trades=0&info=0' }}
                  style={{ flex:1, backgroundColor:'#161b22' }}
                  javaScriptEnabled={true}
                  domStorageEnabled={true}
                  startInLoadingState={true}
                  renderLoading={() => (
                    <View style={{ flex:1, alignItems:'center', justifyContent:'center', backgroundColor:'#161b22' }}>
                      <ActivityIndicator color={'#39ff14'} />
                      <Text style={{ color:'#888', fontSize:12, marginTop:8 }}>Loading chart...</Text>
                    </View>
                  )}
                />
              </View>

              {/* DexScreener Chart - HIDDEN
              <View style={{ borderRadius:14, overflow:'hidden', marginBottom:16, height:380 }}>
                <WebView
                  source={{ uri: 'https://dexscreener.com/solana/'+token.mint+'?embed=1&theme=dark&trades=0&info=0' }}
                  style={{ flex:1, backgroundColor:'#161b22' }}
                  startInLoadingState={true}
                  renderLoading={() => (
                    <View style={{ flex:1, alignItems:'center', justifyContent:'center', backgroundColor:'#161b22' }}>
                      <ActivityIndicator color={'#39ff14'} />
                      <Text style={{ color:'#888', fontSize:12, marginTop:8 }}>Loading chart...</Text>
                    </View>
                  )}
                />
              </View>
              */}

              {/* Action Buttons */}
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
            </ScrollView>
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
              <TouchableOpacity style={{ backgroundColor:C.green, borderRadius:14, padding:16, alignItems:'center', opacity: sending ? 0.6 : 1 }}
                disabled={sending}
                onPress={async () => {
                  if (!sendAddr.trim()) { Alert.alert('Error','Enter recipient address'); return; }
                  if (!sendAmt || isNaN(parseFloat(sendAmt))) { Alert.alert('Error','Enter a valid amount'); return; }
                  setSending(true);
                  try {
                    await onSend(token.mint, sendAddr.trim(), sendAmt, token.symbol, token.decimals ?? 6);
                    setSendAddr(''); setSendAmt(''); setView('main');
                  } catch(e) { Alert.alert('Send failed', e.message || 'Unknown error'); }
                  finally { setSending(false); }
                }}>
                {sending
                  ? <ActivityIndicator color="#0d1117" />
                  : <Text style={{ color:'#0d1117', fontWeight:'bold', fontSize:16 }}>Send {token.symbol}</Text>}
              </TouchableOpacity>
            </ScrollView>
          )}

        </View>
      </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}


function TokLogo({uri, symbol, style, fallback, mint}: {uri:string, symbol:string, style:any, fallback?:string, mint?:string}) {
  const [tries, setTries] = React.useState(0);
  const sources = [
    uri,
    fallback || '',
    mint ? 'https://img.birdeye.so/icon/v1/?address='+mint : '',
    mint ? 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/'+mint+'/logo.png' : '',
  ].filter(Boolean);
  if(tries >= sources.length) return <View style={[style,{alignItems:'center',justifyContent:'center',backgroundColor:'#1a2a1a'}]}><Text style={{color:'#39ff14',fontSize:11,fontWeight:'bold'}}>{symbol?symbol.slice(0,3):''}</Text></View>;
  return <Image source={{uri:sources[tries]}} style={style} onError={()=>setTries(t=>t+1)} />;
}
function AccountModal({ visible, onClose, pubkey, wallet, onRemoveWallet, userName, setUserName, accounts, activeAccIdx, switchAccount, addAccount }: any) {
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
              </View>

              {/* Wallet balance */}
              <View style={{ margin:16, backgroundColor:'#1c2128', borderRadius:14, padding:20 }}>
                <Text style={{ color:C.muted, fontSize:13 }}>Wallet Address</Text>
                <Text style={{ color:C.green, fontSize:12, marginTop:4, fontFamily:'monospace' }}>{pubkey || 'Not connected'}</Text>
              </View>

              {/* Accounts */}
              <Text style={{ color:C.muted, fontSize:11, fontWeight:'600', paddingHorizontal:16, marginBottom:8, letterSpacing:1, paddingRight: 2, paddingRight: 2 }}>YOUR ACCOUNTS</Text>
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
                  <Text style={{ color:'#0d1117', fontSize:12, marginTop:4 }}>Generate a new wallet</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setView('importAccount')}
                  style={{ backgroundColor:'#1c2128', borderRadius:14, padding:18, alignItems:'center', borderWidth:1, borderColor:'#30363d' }}>
                  <Ionicons name="download-outline" size={24} color={C.green} />
                  <Text style={{ color:C.text, fontWeight:'bold', fontSize:16 }}>Import Account</Text>
                  <Text style={{ color:C.muted, fontSize:12, marginTop:4 }}>Import with seed phrase</Text>
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
                <TouchableOpacity onPress={() => setView('addAccount')}>
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
                    const authed = await requireAuth(); if(!authed) return; const words = importSeedInput.trim().split(/\s+/);
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
                <Text style={{ color:C.text, fontSize:18, fontWeight:'bold', flex:1, flexShrink:1 }}>Profile</Text>
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
                  onPress={async () => { setUserName(nameInput); await AsyncStorage.setItem('user_name', nameInput); Alert.alert('Saved!', 'Name saved!'); setView('main'); }}
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
              <TouchableOpacity onPress={()=>{ requireAuth().then(ok=>{ if(ok) Alert.alert('Remove Wallet','Are you sure?',[{text:'Cancel'},{text:'Remove',style:'destructive',onPress:onRemoveWallet}]); }); }}
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
    <View style={{ flex: 1, backgroundColor: C.bg, paddingTop: StatusBar.currentHeight }}>
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
          <Text style={{ color: C.muted, fontSize: 11, fontWeight: '600', letterSpacing: 1, paddingRight: 2, marginBottom: 12 }}>POPULAR DAPPS</Text>
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
            injectedJavaScript={`
              (function() {
                const walletAddress = "${walletAddress || ''}";
                if (!walletAddress) return;
                const solanaWallet = {
                  isPhantom: true,
                  isChatFi: true,
                  publicKey: { toString: () => walletAddress, toBase58: () => walletAddress },
                  isConnected: true,
                  connect: async () => ({ publicKey: { toString: () => walletAddress, toBase58: () => walletAddress } }),
                  disconnect: async () => {},
                  signTransaction: async (tx) => tx,
                  signAllTransactions: async (txs) => txs,
                  signMessage: async (msg) => ({ signature: new Uint8Array(64) }),
                  on: (event, cb) => {},
                  off: (event, cb) => {},
                };
                window.solana = solanaWallet;
                window.phantom = { solana: solanaWallet };
                window.dispatchEvent(new Event('load'));
              })();
              true;
            `}
            onMessage={() => {}}
            javaScriptEnabled={true}
            style={{ flex: 1 }}
          />
        </View>
      )}
    </View>
  );
}

export default function App() {
  const [tab, setTab] = useState('portfolio');
  const [splashDone, setSplashDone] = useState(false);
  const [onboardStep, setOnboardStep] = useState<'passcode'|'fingerprint'|'wordcount'|'seedphrase'|'username'|null>(null);
  const [passcode, setPasscode] = useState('');
  const [wordCount, setWordCount] = useState<12|24>(12);
  const [newSeedPhrase, setNewSeedPhrase] = useState('');
  const [newPubkey, setNewPubkey] = useState('');
  const [onboardName, setOnboardName] = useState('');
  const [subtitleText, setSubtitleText] = useState('');
  const letterAnims = React.useRef('CHATFI'.split('').map(() => new Animated.Value(0))).current;
  const [wallet, setWallet] = useState<string | null>(null);
  const [pubkey, setPubkey] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<{id:number,name:string,mnemonic:string,pubkey:string}[]>([]);
  const [activeAccIdx, setActiveAccIdx] = useState(0);
  const [showWalletModal, setShowWalletModal] = useState(false);
  const [showSeedModal, setShowSeedModal] = useState(false);
  const [securityEnabled, setSecurityEnabled] = useState(false);
  const [fingerprintEnabled, setFingerprintEnabled] = useState(false);
  const [showLockScreen, setShowLockScreen] = useState(false);
  const [lockInput, setLockInput] = useState('');
  const [showSecurityModal, setShowSecurityModal] = useState(false);
  const [changingPasscode, setChangingPasscode] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authInput, setAuthInput] = useState('');
  const authResolveRef = useRef<((v:boolean)=>void)|null>(null);
  const [showPrivKeyModal, setShowPrivKeyModal] = useState(false);
  const [privKey, setPrivKey] = useState('');
  const [showSendModal, setShowSendModal] = useState(false);
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [selectedToken, setSelectedToken] = useState<any>(null);
  const [userName, setUserName] = useState('');
  const [showNameEdit, setShowNameEdit] = useState(false);
  const [accountView, setAccountView] = useState('main');
  const [showReceiveModal, setShowReceiveModal] = useState(false);
  const [showScanModal, setShowScanModal] = useState(false);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [privacyMode, setPrivacyMode] = useState(false);
  const [scanResult, setScanResult] = useState('');
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

  const [txHistory, setTxHistory] = useState<any[]>([]);
  const [txLoading, setTxLoading] = useState(false);
  const [showTxModal, setShowTxModal] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmData, setConfirmData] = useState<any>(null);

  // Toast system
  const [toast, setToast] = useState<{msg:string,type:'success'|'error'|'info'}|null>(null);
  const toastTimer = useRef<any>(null);
  const showToast = (msg:string, type:'success'|'error'|'info'='info') => {
    if(toastTimer.current) clearTimeout(toastTimer.current);
    setToast({msg,type});
    toastTimer.current = setTimeout(()=>setToast(null), 3000);
  };

  // Portfolio state
  const [solBalance, setSolBalance] = useState<number | null>(null);
  const [solPrice, setSolPrice] = useState<number>(0);
  const [tokenBalances, setTokenBalances] = useState<Array<{symbol: string, mint: string, amount: number, logoURI: string, price: number, isVerified?: boolean}>>([]);
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
      const full = 'DeFi, but conversational...';
      let idx = 0;
      const typer = setInterval(() => {
        idx++;
        setSubtitleText(full.slice(0, idx));
        if(idx >= full.length){
          clearInterval(typer);
          setTimeout(async () => {
            const stored = await AsyncStorage.getItem('accounts');
            if (!stored) setOnboardStep('passcode');
            const pc = await AsyncStorage.getItem('passcode');
            if (pc) setShowLockScreen(true);
            setSplashDone(true);
          }, 800);
        }
      }, 50);
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
        const secOn = await AsyncStorage.getItem('security_enabled');
        const fpOn = await AsyncStorage.getItem('fingerprint_enabled');
        if(secOn==='true'){ setSecurityEnabled(true); setShowLockScreen(true); }
        if(fpOn==='true'){ setFingerprintEnabled(true); }
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
    if (pubkey && tab === 'portfolio') { fetchPortfolio(); fetchTxHistory(); }
  }, [pubkey, tab]);

  const addAccount = async () => {
    const w = generateWallet();
    const newAcc = {id:accounts.length+1,name:'Account '+(accounts.length+1),mnemonic:w.mnemonic,pubkey:w.publicKey};
    const updated = [...accounts, newAcc];
    const newIdx = updated.length - 1;
    setAccounts(updated);
    setActiveAccIdx(newIdx);
    setWallet(w.mnemonic);
    setPubkey(w.publicKey);
    await AsyncStorage.setItem('accounts', JSON.stringify(updated));
    await AsyncStorage.setItem('active_acc', String(newIdx));
    showToast('Account '+(accounts.length+1)+' added!','success');
  };
  // Lock app when it goes to background
  React.useEffect(() => {
    const sub = AppState.addEventListener('change', async (state) => {
      if (state === 'background' || state === 'inactive') {
        const stored = await AsyncStorage.getItem('passcode');
        const lockEnabled = await AsyncStorage.getItem('appLockEnabled');
        if (stored && lockEnabled === 'true') {
          setLockInput('');
          setShowLockScreen(true);
        }
      }
    });
    return () => sub.remove();
  }, []);

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
      let verifiedMints = new Set<string>();
      try {
        const vr = await fetch('https://tokens.jup.ag/tokens?tags=verified');
        const vd = await vr.json();
        verifiedMints = new Set(
          Array.isArray(vd) ? vd.map((x: any) => typeof x === 'string' ? x : (x.address || x.mint)).filter(Boolean) : []
        );
      } catch(e) {}
      const res = await fetch('https://chatfi.pro/api/portfolio?wallet=' + pubkey);
      const data = await res.json();
      if (data.tokens) {
        const tokens = data.tokens.map((t: any) => ({
          symbol: t.symbol,
          name: t.name || t.symbol,
          mint: t.mint,
          amount: t.amount,
          logoURI: t.logoURI || 'https://img.jup.ag/tokens/'+t.mint,
          price: t.price || 0,
          isVerified: t.isVerified || verifiedMints.has(t.mint) || false,
        }));
        const sol = tokens.find((t:any) => t.symbol === 'SOL');
        setSolBalance(sol?.amount || 0);
        setSolPrice(sol?.price || 0);
        setTokenBalances(tokens);
        // Fetch logos for tokens missing them
        const missingLogo = tokens.filter((t:any) => !t.logoURI || t.logoURI.includes('img.jup.ag/tokens/'+t.mint));
        if (missingLogo.length > 0) {
          missingLogo.forEach(async (t:any) => {
            try {
              const r = await fetch('https://api.jup.ag/tokens/v1/token/'+t.mint);
              const d = await r.json();
              if (d.logoURI) {
                setTokenBalances(prev => prev.map(tok => tok.mint === t.mint ? {...tok, logoURI: d.logoURI} : tok));
              }
            } catch(e) {}
          });
        }
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
      showToast('Failed to generate wallet: '+(e?.message||String(e)),'error');
    }
  };

  const confirmSeed = async () => {
    if (onboardStep) {
      // During onboarding - just move to next step, account created at username step
      setNewSeedPhrase(seedPhrase);
      setNewPubkey(getPublicKey(seedPhrase));
      setShowSeedModal(false);
      setOnboardStep('username');
    } else {
      // From settings - add as new account
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
      showToast('Wallet created! Keep seed phrase safe.','success');
    }
  };

  const requireAuth = (): Promise<boolean> => {
    if (!securityEnabled) return Promise.resolve(true);
    return new Promise(async (resolve) => {
      if (fingerprintEnabled) {
        try {
          const res = await LocalAuthentication.authenticateAsync({ promptMessage: 'Authenticate to continue', cancelLabel: 'Cancel' });
          if (res.success) { resolve(true); return; }
        } catch(e) {}
      }
      authResolveRef.current = resolve;
      setAuthInput('');
      setShowAuthModal(true);
    });
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
      setActiveAccIdx(existing2.length);
      await AsyncStorage.setItem('accounts', JSON.stringify(updated2));
      await AsyncStorage.setItem('active_acc', String(existing2.length));
      setWallet(importSeed.trim()); setPubkey(pk);
      setShowWalletModal(false); setImportSeed('');
      showToast('Wallet imported!','success');
    } catch { Alert.alert('Error', 'Invalid seed phrase'); }
  };

  const sendMsg = async (overrideText?: string) => {
    const q = (overrideText || input).trim();
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
      const RPC_URL = 'https://solana-mainnet.g.alchemy.com/v2/demo';

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
    if (!amt || isNaN(parseFloat(amt))) { showToast('Invalid amount','error'); return; }
    if (fromToken === toToken) { showToast('Select different tokens','error'); return; }
    setQuoteLoading(true);
    setQuote(null);
    try {
      const fromMint = TOKENS[fromToken];
      const toMint = TOKENS[toToken];
      if (!fromMint || !toMint) { showToast('Token address not found','error'); setQuoteLoading(false); return; }
      const q = await getJupiterQuote(fromMint, toMint, parseFloat(amt), DECIMALS[fromToken]??6, DECIMALS[toToken]??6);
      setQuote(q);
    } catch { showToast('Failed to fetch quote','error'); }
    setQuoteLoading(false);
  };

  const executeSwap = async () => {
    if (!wallet) { showToast('Create or connect a wallet first','error'); return; }
    if (!quote) { showToast('Get a quote first before swapping','error'); return; }
    const outAmt = quote ? (parseInt(quote.outAmount) / Math.pow(10, DECIMALS[toToken]||6)).toFixed(4) : '?';
    const priceImpact = quote?.priceImpactPct ? (parseFloat(quote.priceImpactPct)*100).toFixed(2) : '0.00';
    setConfirmData({
      type: 'swap',
      title: 'Confirm Swap',
      summary: `Swap ${amt} ${fromToken} → ${outAmt} ${toToken}`,
      details: [
        {label:'You pay', value:`${amt} ${fromToken}`},
        {label:'You receive', value:`~${outAmt} ${toToken}`},
        {label:'Price impact', value:`${priceImpact}%`},
        {label:'Network fee', value:'~0.000005 SOL'},
      ],
      onConfirm: async () => {
        setShowConfirmModal(false);
        const authed = await requireAuth();
        if (!authed) return;
        try {
          const { publicKey: pk, secretKey } = deriveWallet(wallet);
          showToast(`Swapping ${fromToken} → ${toToken}...`,'info');
          const txSig = await executeSwapTx(
            TOKENS[fromToken], TOKENS[toToken],
            parseFloat(amt), DECIMALS[fromToken] || 6,
            pk, secretKey, 'https://solana-mainnet.g.alchemy.com/v2/demo'
          );
          showToast('Swap complete! ✓','success');
          fetchPortfolio();
        } catch (e:any) {
          showToast('Swap failed: '+(e.message||'Unknown error'),'error');
        }
      }
    });
    setShowConfirmModal(true);
  };

  const parseTx = (tx:any, sig:any, myPk:string) => {
    if (!tx) return null;
    const time = sig.blockTime ? new Date(sig.blockTime*1000).toLocaleString() : "—";
    const keys:string[] = (tx.transaction?.message?.accountKeys||[]).map((k:any)=>typeof k==="string"?k:k.pubkey);
    const isSwap = keys.includes("JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4");
    let type="UNKNOWN",amount="",token="SOL";
    if (isSwap) {
      type="SWAP";
      const pre=tx.meta?.preTokenBalances||[], post=tx.meta?.postTokenBalances||[];
      for (const pb of post) { if(pb.owner===myPk){const prev=pre.find((p:any)=>p.accountIndex===pb.accountIndex); const d=parseFloat(pb.uiTokenAmount.uiAmountString||"0")-(prev?parseFloat(prev.uiTokenAmount.uiAmountString||"0"):0); if(d>0){amount="+"+d.toFixed(4);token=pb.mint.slice(0,6)+"..";break;} } }
    } else {
      const idx=keys.indexOf(myPk);
      if(idx>=0&&tx.meta){const d=((tx.meta.postBalances?.[idx]||0)-(tx.meta.preBalances?.[idx]||0))/1e9; if(Math.abs(d)>0.000001){type=d>0?"RECEIVE":"SEND";amount=(d>0?"+":"")+d.toFixed(5)+" SOL";}}
      const pre=tx.meta?.preTokenBalances||[], post=tx.meta?.postTokenBalances||[];
      for (const pb of post) { if(pb.owner===myPk){const prev=pre.find((p:any)=>p.accountIndex===pb.accountIndex); const d=parseFloat(pb.uiTokenAmount.uiAmountString||"0")-(prev?parseFloat(prev.uiTokenAmount.uiAmountString||"0"):0); if(Math.abs(d)>0){type=d>0?"RECEIVE":"SEND";amount=(d>0?"+":"")+d.toFixed(4);token=pb.mint.slice(0,6)+"..";}}
      }
    }
    return {sig:sig.signature,time,failed:!!sig.err,type,amount,token};
  };

  const fetchTxHistory = async () => {
    if (!pubkey) return;
    setTxLoading(true);
    try {
      const sr = await rpcFetch("getSignaturesForAddress",[pubkey,{limit:20}]);
      const sigs = Array.isArray(sr.result) ? sr.result : (sr.result?.value || []);
      const results = await Promise.allSettled(sigs.map(async(sig:any)=>{
        const r=await rpcFetch("getTransaction",[sig.signature,{encoding:"jsonParsed",maxSupportedTransactionVersion:0}]);
        const tx = r.result || r.result?.value || null;
        return parseTx(tx,sig,pubkey);
      }));
      setTxHistory(results.filter((r:any)=>r.status==="fulfilled"&&r.value).map((r:any)=>r.value));
    } catch(e){console.error(e);} finally{setTxLoading(false);}
  };

  const searchJupTokens = async (query: string, setResults: any) => {
    if (!query || query.length < 1) { setResults([]); return; }
    try {
      const res = await fetch('https://chatfi.pro/api/jupiter', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({url: 'https://api.jup.ag/tokens/v2/search?query=' + encodeURIComponent(query) + '&limit=6', method: 'GET'})
      });
      const data = await res.json();
      const tokens = (Array.isArray(data) ? data : (data.tokens || [])).map((t:any) => ({...t, address: t.id || t.address, logoURI: t.logoURI || t.icon || ''}));
      setResults(tokens);
      // Force fetch logos for tokens missing them
      tokens.forEach(async (t:any) => {
        if (!t.logoURI && (t.address || t.id)) {
          try {
            const lr = await fetch('https://lite-api.jup.ag/tokens/v1/token/' + (t.address || t.id));
            const ld = await lr.json();
            if (ld.logoURI) {
              setResults((prev:any) => prev.map((p:any) => (p.address||p.id) === (t.address||t.id) ? {...p, logoURI: ld.logoURI} : p));
            }
          } catch(e) {}
        }
      });
    } catch { setResults([]); }
  };

  const sendTokens = async () => {
    if (!sendTo || !sendTo.trim()) { showToast('Enter a recipient address','error'); return; }
    if (!sendAmt || isNaN(parseFloat(sendAmt))) { showToast('Enter a valid amount','error'); return; }
    const authed = await requireAuth();
    if (!authed) return;
    setSendLoading(true);
    try {
      const { secretKey, publicKey: pk } = deriveWallet(wallet);
      const tokenInfo = tokenBalances.find(t => t.symbol === sendToken);
      const mint = tokenInfo?.mint || TOKENS[sendToken] || TOKENS['SOL'];
      const decimals = DECIMALS[sendToken] ?? tokenInfo?.decimals ?? 9;
      const amountNum = Math.round(parseFloat(sendAmt) * Math.pow(10, decimals));
      let txSig: string;
      if (sendToken === "SOL") {
        txSig = await _sendSOL(pk, secretKey, sendTo.trim(), amountNum);
      } else {
        txSig = await _sendSPL(pk, secretKey, sendTo.trim(), amountNum, mint);
      }
      showToast(`Sent ${sendAmt} ${sendToken} ✓`,'success');
      setShowSendModal(false); setSendAmt(''); setSendTo('');
    } catch (e) {
      showToast('Send failed: '+(e.message||'Unknown error'),'error');
    } finally { setSendLoading(false); }
  };

  const copyAddress = () => {
    if (pubkey) {
      Clipboard.setString(pubkey);
      showToast('Address copied!','success');
    }
  };

  const shortKey = pubkey ? pubkey.slice(0, 4) + '...' + pubkey.slice(-4) : null;

  // SPLASH
  if (!splashDone) {
    return (
      <View style={{ flex: 1, backgroundColor: '#0a0a0a', alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 8 }}>
          {'CHATFI'.split('').map((letter, i) => (
            <Animated.Text key={i} style={{
              fontSize: 48, fontWeight: 'bold', color: '#C7F284',
              opacity: letterAnims[i],
              transform: [{ translateY: letterAnims[i].interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }],
            }}>{letter}</Animated.Text>
          ))}
        </View>
        <Text style={{ color: '#888', fontSize: 14, marginTop: 12, textAlign: 'center', paddingHorizontal: 32, flexWrap: 'wrap', width: '100%' }}>{subtitleText}</Text>
      </View>
    );
  }


  if (onboardStep) {
    const GradBg = ({children}:{children:any}) => (
      <View style={{flex:1,backgroundColor:C.bg}}>
        <View style={{position:'absolute',top:0,left:0,right:0,height:'60%',backgroundColor:'transparent',opacity:0}}/>
        <SafeAreaView style={{flex:1}}>{children}</SafeAreaView>
      </View>
    );
    if (showLockScreen) {
      const tryFp = async () => {
        try {
          const res = await LocalAuthentication.authenticateAsync({ promptMessage: 'Unlock ChatFi', cancelLabel: 'Use Passcode' });
          if (res.success) { setShowLockScreen(false); setLockInput(''); }
        } catch(e) {}
      };
      const handleKey = async (k: string) => {
        if(k==='x'){setLockInput('');return;}
        if(k==='<'){setLockInput(p=>p.slice(0,-1));return;}
        if(lockInput.length<6){
          const np=lockInput+k; setLockInput(np);
          if(np.length===6){
            const stored=await AsyncStorage.getItem('passcode');
            if(np===stored){setShowLockScreen(false);setLockInput('');}
            else{setLockInput('');showToast('Wrong passcode','error');}
          }
        }
      };
      return (
        <View style={{flex:1,backgroundColor:C.bg,alignItems:'center',justifyContent:'center',padding:32}}>
          <StatusBar barStyle="light-content" backgroundColor={C.bg}/>
          <Text style={{color:C.green,fontSize:36,fontWeight:'bold',marginBottom:6}}>ChatFi</Text>
          <Text style={{color:C.muted,fontSize:14,marginBottom:48}}>Enter passcode to unlock</Text>
          <View style={{flexDirection:'row',gap:16,marginBottom:48}}>
            {[0,1,2,3,4,5].map(i=>(
              <View key={i} style={{width:16,height:16,borderRadius:8,backgroundColor:lockInput.length>i?C.green:C.border}}/>
            ))}
          </View>
          {[[1,2,3],[4,5,6],[7,8,9],['x',0,'<']].map((row,ri)=>(
            <View key={ri} style={{flexDirection:'row',gap:16,marginBottom:16}}>
              {row.map(k=>(
                <TouchableOpacity key={String(k)} onPress={()=>handleKey(String(k))} style={{width:72,height:72,borderRadius:36,backgroundColor:C.card,alignItems:'center',justifyContent:'center'}}>
                  <Text style={{color:C.text,fontSize:String(k)==='<'||String(k)==='x'?20:24,fontWeight:'500'}}>{String(k)==='<'?'⌫':String(k)==='x'?'✕':k}</Text>
                </TouchableOpacity>
              ))}
            </View>
          ))}
          {fingerprintEnabled && (
            <TouchableOpacity onPress={tryFp} style={{marginTop:16,padding:16}}>
              <Ionicons name="finger-print-outline" size={40} color={C.green}/>
            </TouchableOpacity>
          )}
        </View>
      );
    }



    if (onboardStep === 'passcode') return (
      <GradBg>
        <View style={{flex:1,alignItems:'center',justifyContent:'center',paddingHorizontal:24}}>
          <Text style={{color:C.text,fontSize:28,fontWeight:'bold',marginBottom:8}}>Set app passcode</Text>
          <Text style={{color:C.muted,fontSize:14,marginBottom:40,textAlign:'center',flexWrap:'wrap'}}>Enter a 6-digit passcode to secure your app.</Text>
          <View style={{flexDirection:'row',gap:16,marginBottom:48}}>
            {[0,1,2,3,4,5].map(i=>(
              <View key={i} style={{width:16,height:16,borderRadius:8,backgroundColor:passcode.length>i?C.green:C.border}}/>
            ))}
          </View>
          {[[1,2,3],[4,5,6],[7,8,9],['x',0,'<']].map((row,ri)=>(
            <View key={ri} style={{flexDirection:'row',gap:20,marginBottom:16}}>
              {row.map((k,ki)=>(
                <TouchableOpacity key={ki} onPress={()=>{
                  if(k==='x'){setPasscode('');return;}
                  if(k==='<'){setPasscode(p=>p.slice(0,-1));return;}
                  if(passcode.length<6){const np=passcode+k;setPasscode(np);if(np.length===6){AsyncStorage.setItem('passcode',np);AsyncStorage.setItem('security_enabled','true');setSecurityEnabled(true);if(changingPasscode){setChangingPasscode(false);setPasscode('');showToast('Passcode updated!','success');}else{setTimeout(()=>setOnboardStep('fingerprint'),300);}}}
                }} style={{width:80,height:80,borderRadius:40,backgroundColor:C.card,borderWidth:1,borderColor:C.border,alignItems:'center',justifyContent:'center'}}>
                  <Text style={{color:k==='x'?C.muted:C.green,fontSize:k==='<'?20:24,fontWeight:'600'}}>{k==='x'?'x':String(k)}</Text>
                </TouchableOpacity>
              ))}
            </View>
          ))}

        </View>
      </GradBg>
    );
    if (onboardStep === 'fingerprint') return (
      <GradBg>
        <View style={{flex:1,alignItems:'center',justifyContent:'center',paddingHorizontal:24}}>
          <Ionicons name="finger-print" size={80} color={C.green} style={{marginBottom:24}}/>
          <Text style={{color:C.text,fontSize:28,fontWeight:'bold',marginBottom:12}}>Fingerprint Unlock</Text>
          <Text style={{color:C.muted,fontSize:14,textAlign:'center',marginBottom:60,flexWrap:'wrap'}}>Use your fingerprint to secure your wallet. You can skip this for now.</Text>
          <TouchableOpacity onPress={()=>setOnboardStep('wordcount')} style={{paddingVertical:16,borderRadius:30,backgroundColor:C.card,borderWidth:1,borderColor:C.border,width:'100%',alignItems:'center',marginBottom:12}}>
            <Text style={{color:C.muted,fontSize:16}}>I will do it later</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={()=>setOnboardStep('passcode')} style={{paddingVertical:16,borderRadius:30,borderWidth:1,borderColor:C.border,width:'100%',alignItems:'center'}}>
            <Text style={{color:C.text,fontSize:16}}>Back</Text>
          </TouchableOpacity>
        </View>
      </GradBg>
    );
    if (onboardStep === 'wordcount') return (
      <GradBg>
        <View style={{flex:1,paddingHorizontal:24,paddingTop:80}}>
          <Text style={{color:C.text,fontSize:28,fontWeight:'bold',marginBottom:12}}>Secret recovery phrase</Text>
          <Text style={{color:C.muted,fontSize:14,marginBottom:40,lineHeight:22}}>Choose how many words your backup phrase will use.</Text>
          <View style={{flexDirection:'row',gap:16,marginBottom:60}}>
            {([12,24] as const).map(n=>(
              <TouchableOpacity key={n} onPress={()=>setWordCount(n)} style={{flex:1,paddingVertical:16,borderRadius:30,backgroundColor:wordCount===n?C.green:C.card,borderWidth:1,borderColor:wordCount===n?C.green:C.border,alignItems:'center'}}>
                <Text style={{color:wordCount===n?'#060d06':C.text,fontWeight:'700',fontSize:16}}>{n} words</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={{position:'absolute',bottom:90,left:24,right:24,gap:12}}>
            <TouchableOpacity onPress={async()=>{const w=generateWallet(wordCount);setNewSeedPhrase(w.mnemonic);setNewPubkey(w.publicKey);setOnboardStep('seedphrase');}} style={{paddingVertical:16,borderRadius:30,backgroundColor:C.green,alignItems:'center'}}>
              <Text style={{color:'#060d06',fontWeight:'700',fontSize:16}}>Continue</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={()=>setOnboardStep('fingerprint')} style={{paddingVertical:16,borderRadius:30,borderWidth:1,borderColor:C.border,alignItems:'center'}}>
              <Text style={{color:C.text,fontSize:16}}>Back</Text>
            </TouchableOpacity>
          </View>
        </View>
      </GradBg>
    );
    if (onboardStep === 'seedphrase') {
      const words = newSeedPhrase.split(' ');
      return (
        <GradBg>
          <View style={{flex:1,paddingHorizontal:24,paddingTop:60}}>
            <Text style={{color:C.text,fontSize:26,fontWeight:'bold',marginBottom:8}}>Secret Recovery Phrase</Text>
            <Text style={{color:C.muted,fontSize:13,marginBottom:28,lineHeight:20}}>Store this somewhere safe. It is the only way to recover your wallet.</Text>
            <View style={{flexDirection:'row',flexWrap:'wrap',gap:10,marginBottom:24}}>
              {words.map((w,i)=>(
                <View key={i} style={{flexDirection:'row',alignItems:'center',backgroundColor:C.card,borderRadius:20,paddingVertical:8,paddingHorizontal:12,borderWidth:1,borderColor:C.border,width:'30%'}}>
                  <Text style={{color:C.muted,fontSize:11,marginRight:4}}>{i+1}</Text>
                  <Text style={{color:C.text,fontSize:13,fontWeight:'500'}}>{w}</Text>
                </View>
              ))}
            </View>
            <TouchableOpacity onPress={()=>{Clipboard.setString(newSeedPhrase);showToast('Copied!','success');}} style={{flexDirection:'row',alignItems:'center',gap:8,alignSelf:'center',backgroundColor:C.card,paddingVertical:12,paddingHorizontal:24,borderRadius:20,borderWidth:1,borderColor:C.border,marginBottom:32}}>
              <Ionicons name="copy-outline" size={18} color={C.green}/>
              <Text style={{color:C.text,fontSize:15}}>Copy</Text>
            </TouchableOpacity>
            <View style={{position:'absolute',bottom:90,left:24,right:24,gap:12}}>
              <TouchableOpacity onPress={()=>setOnboardStep('username')} style={{paddingVertical:16,borderRadius:30,backgroundColor:C.green,alignItems:'center'}}>
                <Text style={{color:'#060d06',fontWeight:'700',fontSize:16}}>OK, I saved it somewhere</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={()=>setOnboardStep('wordcount')} style={{paddingVertical:16,borderRadius:30,borderWidth:1,borderColor:C.border,alignItems:'center'}}>
                <Text style={{color:C.text,fontSize:16}}>Back</Text>
              </TouchableOpacity>
            </View>
          </View>
        </GradBg>
      );
    }
    if (onboardStep === 'username') return (
      <GradBg>
        <View style={{flex:1,alignItems:'center',paddingHorizontal:24,paddingTop:80}}>
          <View style={{width:80,height:80,borderRadius:40,backgroundColor:C.card,borderWidth:2,borderColor:C.green,alignItems:'center',justifyContent:'center',marginBottom:24}}>
            <Text style={{color:C.green,fontSize:32,fontWeight:'bold'}}>C</Text>
          </View>
          <Text style={{color:C.text,fontSize:28,fontWeight:'bold',marginBottom:32}}>Choose a username</Text>
          <View style={{flexDirection:'row',alignItems:'center',backgroundColor:C.card,borderRadius:30,borderWidth:1,borderColor:C.green,paddingHorizontal:16,paddingVertical:4,width:'100%',marginBottom:8}}>
            <Text style={{color:C.muted,fontSize:16,marginRight:8}}>@</Text>
            <TextInput key="username-input" value={onboardName} onChangeText={setOnboardName} placeholder="wallet01" placeholderTextColor={C.muted} style={{flex:1,color:C.text,fontSize:16,paddingVertical:12}} autoCapitalize="none" blurOnSubmit={false} autoFocus={true}/>
          </View>
          <Text style={{color:C.muted,fontSize:12,marginBottom:40}}>{onboardName.length}/8 letters, numbers, or underscores</Text>
          <View style={{position:'absolute',bottom:90,left:24,right:24,gap:12}}>
            <TouchableOpacity onPress={async()=>{
              const name=onboardName||'wallet01';
              const existingRaw = await AsyncStorage.getItem('accounts');
              const existing = existingRaw ? JSON.parse(existingRaw) : [];
              const newAcc = {id:existing.length+1,name:'Account '+(existing.length+1),mnemonic:newSeedPhrase,pubkey:newPubkey};
              const acc = [...existing, newAcc];
              const newIdx = acc.length-1;
              setAccounts(acc);setWallet(newSeedPhrase);setPubkey(newPubkey);setUserName(name);
              await AsyncStorage.setItem('accounts',JSON.stringify(acc));
              await AsyncStorage.setItem('active_acc',String(newIdx));
              await AsyncStorage.setItem('user_name',name);
              setOnboardStep(null);
            }} style={{paddingVertical:16,borderRadius:30,backgroundColor:onboardName.length>=3?C.green:C.card,alignItems:'center'}}>
              <Text style={{color:onboardName.length>=3?'#060d06':C.muted,fontWeight:'700',fontSize:16}}>Continue</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={()=>setOnboardStep('seedphrase')} style={{paddingVertical:16,borderRadius:30,borderWidth:1,borderColor:C.border,alignItems:'center'}}>
              <Text style={{color:C.text,fontSize:16}}>Back</Text>
            </TouchableOpacity>
          </View>
        </View>
      </GradBg>
    );
    return null;
  }

  return (
    <SafeAreaView style={s.root}>
      <Modal visible={showTxModal} animationType="slide" transparent onRequestClose={()=>setShowTxModal(false)}>
        <View style={{flex:1,backgroundColor:"rgba(0,0,0,0.7)",justifyContent:"flex-end"}}>
          <View style={{backgroundColor:"#161b22",borderTopLeftRadius:20,borderTopRightRadius:20,maxHeight:"80%",paddingBottom:30}}>
            <View style={{flexDirection:"row",alignItems:"center",justifyContent:"space-between",padding:20,borderBottomWidth:1,borderBottomColor:C.border}}>
              <Text style={{color:C.text,fontSize:18,fontWeight:"700"}}>Transaction History</Text>
              <TouchableOpacity onPress={()=>setShowTxModal(false)}>
                <Ionicons name="close" size={24} color={C.muted} />
              </TouchableOpacity>
            </View>
            {txLoading && <ActivityIndicator color={C.green} style={{marginTop:20}} />}
            <ScrollView contentContainerStyle={{paddingHorizontal:20,paddingTop:8}}>
              {!txLoading && txHistory.length===0 && (
                <Text style={{color:C.muted,textAlign:"center",marginTop:20}}>No transactions yet</Text>
              )}
              {txHistory.map((tx,i)=>(
                <TouchableOpacity key={i} onPress={()=>{Linking.openURL("https://solscan.io/tx/"+tx.sig);}}
                  style={{flexDirection:"row",alignItems:"center",paddingVertical:14,borderBottomWidth:1,borderBottomColor:C.border}}>
                  <View style={{width:42,height:42,borderRadius:21,backgroundColor:tx.failed?"#3a1a1a":tx.type==="RECEIVE"?"#1a2a1a":"#1a1a2a",alignItems:"center",justifyContent:"center",marginRight:12}}>
                    <Text style={{fontSize:20}}>{tx.failed?"❌":tx.type==="RECEIVE"?"↓":tx.type==="SWAP"?"⇄":"↑"}</Text>
                  </View>
                  <View style={{flex:1}}>
                    <Text style={{color:C.text,fontWeight:"600",fontSize:14}}>{tx.failed?"Failed":tx.type} {tx.token}</Text>
                    <Text style={{color:C.muted,fontSize:12}}>{tx.time}</Text>
                  </View>
                  <View style={{alignItems:"flex-end"}}>
                    <Text style={{color:tx.failed?"#ff4444":tx.type==="RECEIVE"?C.green:C.text,fontWeight:"600"}}>{tx.amount}</Text>
                    <Text style={{color:C.green,fontSize:11}}>Solscan ›</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Transaction Confirm Modal */}
      <Modal visible={showConfirmModal} animationType="slide" transparent onRequestClose={()=>setShowConfirmModal(false)}>
        <View style={{flex:1,backgroundColor:"rgba(0,0,0,0.7)",justifyContent:"flex-end"}}>
          <View style={{backgroundColor:"#161b22",borderTopLeftRadius:20,borderTopRightRadius:20,padding:24,paddingBottom:36}}>
            <Text style={{color:C.text,fontSize:18,fontWeight:"700",marginBottom:4}}>{confirmData?.title}</Text>
            <Text style={{color:C.muted,fontSize:14,marginBottom:20}}>{confirmData?.summary}</Text>
            {(confirmData?.details||[]).map((d:any,i:number)=>(
              <View key={i} style={{flexDirection:"row",justifyContent:"space-between",paddingVertical:8,borderBottomWidth:1,borderBottomColor:C.border}}>
                <Text style={{color:C.muted,fontSize:14}}>{d.label}</Text>
                <Text style={{color:C.text,fontSize:14,fontWeight:"600"}}>{d.value}</Text>
              </View>
            ))}
            <TouchableOpacity onPress={confirmData?.onConfirm} style={{backgroundColor:C.green,borderRadius:12,padding:16,alignItems:"center",marginTop:20}}>
              <Text style={{color:"#0d1117",fontWeight:"700",fontSize:16}}>Confirm</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={()=>setShowConfirmModal(false)} style={{borderRadius:12,padding:14,alignItems:"center",marginTop:8}}>
              <Text style={{color:C.muted,fontSize:15}}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      <TokenModal token={selectedToken} pubkey={pubkey} onClose={() => setSelectedToken(null)}
  onSend={async (mint, recipient, amount, symbol, decimals) => {
    const { secretKey, publicKey: pk } = deriveWallet(wallet);
    const amountNum = Math.round(parseFloat(amount) * Math.pow(10, decimals));
    if (symbol === 'SOL') {
      await _sendSOL(pk, secretKey, recipient, amountNum);
    } else {
      await _sendSPL(pk, secretKey, recipient, amountNum, mint);
    }
    showToast('Sent ' + amount + ' ' + symbol + ' ✓', 'success');
    setSelectedToken(null);
    fetchPortfolio();
  }}
/>
      <AccountModal
        visible={showAccountModal}
        onClose={() => setShowAccountModal(false)}
        pubkey={pubkey}
        wallet={wallet}
        accounts={accounts}
        activeAccIdx={activeAccIdx}
        switchAccount={switchAccount}
        addAccount={addAccount}
        userName={userName}
        setUserName={setUserName}
        onRemoveWallet={async () => {
          const updated = accounts.filter((_:any, i:number) => i !== activeAccIdx);
          if (updated.length === 0) {
            // No accounts left - full reset
            await AsyncStorage.removeItem('accounts');
            await AsyncStorage.removeItem('active_acc');
            await AsyncStorage.removeItem('user_name');
            setAccounts([]);
            setWallet(null);
            setPubkey(null);
            setUserName('');
          } else {
            // Switch to first remaining account
            const newIdx = Math.max(0, activeAccIdx - 1);
            const newAcc = updated[newIdx];
            // Re-index accounts
            const reindexed = updated.map((a:any, i:number) => ({...a, id:i+1, name:'Account '+(i+1)}));
            await AsyncStorage.setItem('accounts', JSON.stringify(reindexed));
            await AsyncStorage.setItem('active_acc', String(newIdx));
            setAccounts(reindexed);
            setActiveAccIdx(newIdx);
            setWallet(newAcc.mnemonic);
            setPubkey(newAcc.pubkey);
          }
          setShowAccountModal(false);
        }}
      />
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />

      {tab !== 'dapp' && <View style={s.header}>
        <View style={s.logoRow}>
          
          <TouchableOpacity onPress={() => setShowAccountModal(true)} style={{flexDirection:'row',alignItems:'center',gap:8}}><View style={{width:36,height:36,borderRadius:18,backgroundColor:C.green}} />{userName ? <Text style={{color:C.text,fontWeight:'600',fontSize:15}}>{userName}</Text> : null}</TouchableOpacity>
        </View>
        <TouchableOpacity style={[s.walletBtn, wallet ? s.walletBtnOn : null]} onPress={() => { if(pubkey){ Clipboard.setString(pubkey); showToast('Address copied!','success'); } }}>
          <Text style={[s.walletBtnTxt, wallet ? { color: C.green } : null]}>{wallet ? shortKey : 'Connect Wallet'}</Text>
        </TouchableOpacity>
      </View>}

      <KeyboardAvoidingView style={s.content} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={0}>

        {/* CHAT */}
        {tab === 'chat' && (
          <View style={s.flex}>
                <View style={{position:'absolute',top:0,left:0,right:0,bottom:0,flexDirection:'row',flexWrap:'wrap',opacity:0.12}}>
                  {Array.from({length:600}).map((_,i)=>(
                    <View key={i} style={{width:'5%',height:24,alignItems:'center',justifyContent:'center'}}>
                      <View style={{width:2,height:2,borderRadius:1,backgroundColor:'#C7F284'}}/>
                    </View>
                  ))}
                </View>
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
              <TouchableOpacity style={[s.sendBtn, aiLoading && { opacity: 0.5 }]} onPress={() => sendMsg(input)} disabled={aiLoading}>
                <Ionicons name="send" size={20} color="#0d1117" />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* SWAP */}
              {tab === 'swap' && (
        <ScrollView style={s.pad} keyboardShouldPersistTaps="handled">
          <View style={s.swapCard}>
            <View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center'}}>
              <Text style={s.swapCardLabel}>You Pay</Text>
              <Text style={{color:C.muted,fontSize:12}}>Balance: {tokenBalances.find(t=>t.symbol===fromToken)?.amount?.toFixed(4) ?? (fromToken==='SOL'?(solBalance||0).toFixed(4):'0')} {fromToken}</Text>
            </View>
            <View style={s.swapCardRow}>
              <TextInput style={s.swapAmtInput} value={amt} onChangeText={setAmt} placeholder="0" placeholderTextColor={C.border} keyboardType="numeric" />
              <TouchableOpacity style={s.tokenSelBtn} onPress={()=>{setShowFromSearch(!showFromSearch);setShowToSearch(false);}}>
                <TokLogo uri={TOKEN_LOGOS[fromToken]||'https://img.jup.ag/tokens/'+(TOKENS[fromToken]||'')} fallback={'https://img.jup.ag/tokens/'+(TOKENS[fromToken]||'')} symbol={fromToken} style={s.tokenLogo} mint={TOKENS[fromToken]||''} />
                <Text style={s.tokenSelTxt}>{fromToken}</Text>
                <Text style={{color:C.muted,marginLeft:4,fontSize:12}}>▾</Text>
              </TouchableOpacity>
            </View>
            {showFromSearch&&(
              <View style={s.tokenDropdown}>
                <TextInput style={s.tokenSearchIn} placeholder="Search token..." placeholderTextColor={C.muted} autoFocus onChangeText={async(q)=>{if(q.length>1) await searchJupTokens(q,setFromResults); else setFromResults([]);}} />
                {fromResults.slice(0,5).map(t=>(
                  <TouchableOpacity key={t.address} style={s.tokenResultRow} onPress={()=>{setFromToken(t.symbol);TOKENS[t.symbol]=t.address;if(t.decimals!=null)DECIMALS[t.symbol]=t.decimals;if(t.logoURI)TOKEN_LOGOS[t.symbol]=t.logoURI;setShowFromSearch(false);setQuote(null);}}>
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
            <View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center'}}>
              <Text style={s.swapCardLabel}>You Receive</Text>
              <Text style={{color:C.muted,fontSize:12}}>Balance: {tokenBalances.find(t=>t.symbol===toToken)?.amount?.toFixed(4) ?? (toToken==='SOL'?(solBalance||0).toFixed(4):'0')} {toToken}</Text>
            </View>
            <View style={s.swapCardRow}>
              <Text style={s.swapAmtOut}>{quote?Number(quote.outAmount).toFixed(6):'—'}</Text>
              <TouchableOpacity style={s.tokenSelBtn} onPress={()=>{setShowToSearch(!showToSearch);setShowFromSearch(false);}}>
                <TokLogo uri={TOKEN_LOGOS[toToken]||'https://img.jup.ag/tokens/'+(TOKENS[toToken]||'')} fallback={'https://img.jup.ag/tokens/'+(TOKENS[toToken]||'')} symbol={toToken} style={s.tokenLogo} mint={TOKENS[toToken]||''} />
                <Text style={s.tokenSelTxt}>{toToken}</Text>
                <Text style={{color:C.muted,marginLeft:4,fontSize:12}}>▾</Text>
              </TouchableOpacity>
            </View>
            {showToSearch&&(
              <View style={s.tokenDropdown}>
                <TextInput style={s.tokenSearchIn} placeholder="Search token..." placeholderTextColor={C.muted} autoFocus onChangeText={async(q)=>{if(q.length>1) await searchJupTokens(q,setToResults); else setToResults([]);}} />
                {toResults.slice(0,5).map(t=>(
                  <TouchableOpacity key={t.address} style={s.tokenResultRow} onPress={()=>{setToToken(t.symbol);TOKENS[t.symbol]=t.address;if(t.decimals!=null)DECIMALS[t.symbol]=t.decimals;if(t.logoURI)TOKEN_LOGOS[t.symbol]=t.logoURI;setShowToSearch(false);setQuote(null);}}>
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
        <ScrollView style={s.pad} contentContainerStyle={{paddingBottom:100}} refreshControl={<RefreshControl refreshing={portfolioRefreshing} onRefresh={()=>{setPortfolioRefreshing(true);fetchPortfolio();}} tintColor={C.green} />}>
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
              {/* Balance */}
              <View style={{alignItems:'center',paddingTop:16,paddingBottom:8}}>
                <TouchableOpacity onPress={()=>setPrivacyMode(p=>!p)}>
                <Text style={s.pfBalanceAmt}>
                  {portfolioLoading ? '...' : privacyMode ? '****' : '$'+((tokenBalances.filter(t=>t.mint!=='So11111111111111111111111111111111111111112').reduce((sum,t) => sum + (t.amount||0)*(t.price||0), 0)) + (solBalance||0)*(solPrice||0)).toFixed(2)}
                </Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={copyAddress} style={{flexDirection:'row',alignItems:'center',gap:6,marginTop:4}}>
                  <Text style={s.pfAddressTxt}>{pubkey ? pubkey.slice(0,4)+'....'+pubkey.slice(-4) : ''}</Text>
                </TouchableOpacity>
              </View>
              {/* Action Buttons */}
              <View style={{flexDirection:'row',justifyContent:'space-around',paddingVertical:16}}>
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
                <TouchableOpacity style={s.pfActionBtn} onPress={async()=>{if(!cameraPermission?.granted){await requestCameraPermission();}setShowScanModal(true);}}>
                  <View style={s.pfActionIcon}><Text style={s.pfActionIconTxt}>⊡</Text></View>
                  <Text style={s.pfActionLbl}>Scan</Text>
                </TouchableOpacity>
              </View>

              {/* Token List */}
              <View style={{flexDirection:"row",alignItems:"center",justifyContent:"space-between",marginBottom:4,marginTop:4}}>
                <Text style={s.pfSectionLbl}>Tokens</Text>
                <TouchableOpacity onPress={()=>{fetchTxHistory();setShowTxModal(true);}} style={{padding:4}}>
                  <Ionicons name="time-outline" size={24} color={C.text} />
                </TouchableOpacity>
              </View>
              {tokenBalances.length===0&&!portfolioLoading&&(
                <Text style={{color:C.muted,textAlign:'center',marginTop:16}}>No tokens found</Text>
              )}
              {portfolioLoading&&<ActivityIndicator color={C.green} style={{marginTop:20}} />}
              {/* SOL Row */}
              {solBalance !== null && solBalance > 0 && (
                <TouchableOpacity style={s.pfTokenRow} onPress={()=>setSelectedToken({symbol:'SOL',mint:'So11111111111111111111111111111111111111112',amount:solBalance||0,logoURI:'https://img.jup.ag/tokens/So11111111111111111111111111111111111111112',price:solPrice||0,isVerified:true})}>
                  <TokLogo uri={'https://img.jup.ag/tokens/So11111111111111111111111111111111111111112'} fallback={'https://cdn.jsdelivr.net/gh/solana-labs/token-list@main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png'} symbol={'SOL'} style={s.pfTokenLogo} />
                  <View style={{flex:1,marginLeft:12}}>
                    <Text style={s.pfTokenName}>SOL</Text>
                    <Text style={s.pfTokenAmt}>{privacyMode ? "****" : (solBalance||0).toFixed(4)} SOL</Text>
                  </View>
                  <Text style={s.pfTokenVal}>{privacyMode ? '****' : solPrice ? '$'+((solBalance||0)*(solPrice||0)).toFixed(2) : '—'}</Text>
                </TouchableOpacity>
              )}
              {tokenBalances.filter(t=>t.mint!=='So11111111111111111111111111111111111111112').map((t,i)=>(
                <TouchableOpacity key={i} style={s.pfTokenRow} onPress={() => setSelectedToken(t)}>
                  <TokLogo uri={t.logoURI || 'https://img.jup.ag/tokens/'+t.mint} fallback={'https://cdn.jsdelivr.net/gh/solana-labs/token-list@main/assets/mainnet/'+t.mint+'/logo.png'} symbol={t.symbol} style={s.pfTokenLogo} mint={t.mint} />
                  <View style={{flex:1,marginLeft:12}}>
                    <View style={{flexDirection:'row',alignItems:'center',gap:4}}>
                      <Text style={s.pfTokenName}>{t.symbol}</Text>
                      {t.isVerified && <Ionicons name="checkmark-circle" size={14} color="#39ff14" />}
                    </View>
                    <Text style={s.pfTokenAmt}>{privacyMode ? "****" : (Number(t.amount)||0).toFixed(4)} {t.symbol}</Text>
                  </View>
                  <Text style={s.pfTokenVal}>{privacyMode ? '****' : t.price ? '$'+((t.amount||0)*(t.price||0)).toFixed(2) : '—'}</Text>
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
        <ScrollView style={s.pad} contentContainerStyle={{paddingBottom:100}}>
          {/* Wallet profile row */}
          {wallet && (
            <View style={s.stGroup}>
              <Text style={{color:C.muted,fontSize:11,fontWeight:'600',paddingHorizontal:16,paddingTop:12,paddingBottom:6,letterSpacing:1,paddingRight:2}}>ACCOUNTS</Text>
              {accounts.map((acc,idx)=>(
                <TouchableOpacity key={acc.id} onPress={()=>switchAccount(idx)} style={{flexDirection:'row',alignItems:'center',paddingHorizontal:16,paddingVertical:12,borderBottomWidth:idx<accounts.length-1?1:0,borderBottomColor:C.border}}>
                  <View style={{width:36,height:36,borderRadius:18,backgroundColor:idx===activeAccIdx?C.green:C.card,alignItems:'center',justifyContent:'center',marginRight:12}}>
                    <Text style={{color:idx===activeAccIdx?'#0d1117':C.muted,fontWeight:'bold',fontSize:14}}>{idx+1}</Text>
                  </View>
                  <View style={{flex:1}}>
                    <Text style={{color:C.text,fontWeight:'600',fontSize:14}}>{acc.name}{idx===activeAccIdx?' ✓':''}</Text>
                    <Text style={{color:C.muted,fontSize:12}}>{acc.pubkey?acc.pubkey.slice(0,6)+'...'+acc.pubkey.slice(-4):''}</Text>
                  </View>
                  {idx===activeAccIdx&&<TouchableOpacity onPress={copyAddress}><Text style={{color:C.green,fontSize:12}}>Copy</Text></TouchableOpacity>}
                </TouchableOpacity>
              ))}
            </View>
          )}
              <View style={[s.stGroup,{marginTop:12}]}>
                <TouchableOpacity style={s.stRow} onPress={()=>setShowWalletModal(true)}>
                  <View style={{flex:1}}>
                    <Text style={s.stRowTxt}>Import Wallet</Text>
                    <Text style={{color:C.muted,fontSize:12,marginTop:2}}>Import using seed phrase</Text>
                  </View>
                  <Text style={{color:C.muted,fontSize:18}}>›</Text>
                </TouchableOpacity>
              </View>



          {/* Security */}
          <View style={[s.stGroup,{marginTop:12}]}>
            <TouchableOpacity style={s.stRow} onPress={()=>setShowSecurityModal(true)}>
              <View style={{flex:1}}>
                <Text style={s.stRowTxt}>Security</Text>
                <Text style={{color:C.muted,fontSize:12,marginTop:2}}>{securityEnabled?'App lock on':'App lock off'}</Text>
              </View>
              <Text style={{color:C.muted,fontSize:18}}>›</Text>
            </TouchableOpacity>
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
              <TouchableOpacity style={s.dangerBtn} onPress={async()=>{ const ok=await requireAuth(); if(!ok)return; const acc=accounts[activeAccIdx]; if(acc){ setSeedPhrase(acc.mnemonic); setShowSeedModal(true); } }}>
                <Text style={s.dangerBtnTxt}>Show Seed Phrase</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.dangerBtn} onPress={async()=>{ const ok=await requireAuth(); if(!ok)return; const acc=accounts[activeAccIdx]; if(acc){ setPrivKey(getPrivateKey(acc.mnemonic)); setShowPrivKeyModal(true); } }}>
                <Text style={s.dangerBtnTxt}>Show Private Key</Text>
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
              <Ionicons name={active ? (t.iconActive || t.icon) : t.icon} size={22} color={active ? '#C7F284' : 'rgba(255,255,255,0.4)'} />
              <Text style={[s.tabLabel, active && s.tabLabelActive]}>{label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* WALLET MODAL */}
      <Modal visible={showWalletModal} animationType="slide" transparent>
        <KeyboardAvoidingView behavior={Platform.OS==='ios'?'padding':'height'} style={{flex:1}} keyboardVerticalOffset={0}>
        <View style={s.modalOverlay}>
          <View style={s.modalCard}>
            <Text style={s.modalTitle}>Wallet</Text>
            <TouchableOpacity style={s.greenBtn} onPress={() => { setShowWalletModal(false); setOnboardStep('passcode'); }}>
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
        </KeyboardAvoidingView>
      </Modal>

      {/* SEED MODAL */}
      <Modal visible={showSeedModal} animationType="slide" transparent>
        <KeyboardAvoidingView behavior={Platform.OS==='ios'?'padding':'height'} style={{flex:1}} keyboardVerticalOffset={0}>
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
            <TouchableOpacity style={s.greenBtn} onPress={onboardStep ? confirmSeed : () => setShowSeedModal(false)}>
              <Text style={s.greenBtnTxt}>I've Written It Down</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.closeBtn} onPress={() => setShowSeedModal(false)}>
              <Text style={s.closeBtnTxt}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* PRIVATE KEY MODAL */}
      <Modal visible={showPrivKeyModal} animationType="slide" transparent>
        <KeyboardAvoidingView behavior={Platform.OS==='ios'?'padding':'height'} style={{flex:1}} keyboardVerticalOffset={0}>
        <View style={s.modalOverlay}>
          <View style={s.modalCard}>
            <Text style={s.modalTitle}>Private Key</Text>
            <Text style={{color:C.red,fontSize:13,textAlign:'center',marginBottom:16}}>⚠️ Never share your private key! Anyone with it has full access to your wallet.</Text>
            <View style={{backgroundColor:C.card,borderRadius:12,padding:16,marginBottom:16}}>
              <Text selectable style={{color:C.green,fontSize:11,fontFamily:'monospace',lineHeight:18}}>{privKey}</Text>
            </View>
            <TouchableOpacity style={s.greenBtn} onPress={()=>{ Clipboard.setString(privKey); showToast('Private key copied!','success'); }}>
              <Text style={s.greenBtnTxt}>Copy Private Key</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.closeBtn} onPress={()=>{ setShowPrivKeyModal(false); setPrivKey(''); }}>
              <Text style={s.closeBtnTxt}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* SECURITY MODAL */}
      <Modal visible={showSecurityModal} animationType="slide" transparent>
        <View style={s.modalOverlay}>
          <View style={s.modalCard}>
            <Text style={s.modalTitle}>Security</Text>
            <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingVertical:14,borderBottomWidth:securityEnabled?1:0,borderBottomColor:C.border}}>
              <View style={{flex:1}}>
                <Text style={{color:C.text,fontSize:15,fontWeight:'600'}}>App Lock</Text>
                <Text style={{color:C.muted,fontSize:12,marginTop:2}}>Require passcode on open</Text>
              </View>
              <TouchableOpacity onPress={async()=>{
                const next=!securityEnabled; setSecurityEnabled(next);
                await AsyncStorage.setItem('security_enabled',String(next));
                if(!next){setFingerprintEnabled(false);await AsyncStorage.setItem('fingerprint_enabled','false');}
              }} style={{width:50,height:28,borderRadius:14,backgroundColor:securityEnabled?C.green:C.border,justifyContent:'center',paddingHorizontal:3}}>
                <View style={{width:22,height:22,borderRadius:11,backgroundColor:'#fff',alignSelf:securityEnabled?'flex-end':'flex-start'}}/>
              </TouchableOpacity>
            </View>
            {securityEnabled && (<>
              <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingVertical:14,borderBottomWidth:1,borderBottomColor:C.border}}>
                <View style={{flex:1}}>
                  <Text style={{color:C.text,fontSize:15,fontWeight:'600'}}>Fingerprint Unlock</Text>
                  <Text style={{color:C.muted,fontSize:12,marginTop:2}}>Use biometrics to unlock</Text>
                </View>
                <TouchableOpacity onPress={async()=>{
                  const next=!fingerprintEnabled; setFingerprintEnabled(next);
                  await AsyncStorage.setItem('fingerprint_enabled',String(next));
                }} style={{width:50,height:28,borderRadius:14,backgroundColor:fingerprintEnabled?C.green:C.border,justifyContent:'center',paddingHorizontal:3}}>
                  <View style={{width:22,height:22,borderRadius:11,backgroundColor:'#fff',alignSelf:fingerprintEnabled?'flex-end':'flex-start'}}/>
                </TouchableOpacity>
              </View>
              <TouchableOpacity onPress={()=>{setPasscode('');setChangingPasscode(true);}} style={{paddingVertical:14,borderBottomWidth:1,borderBottomColor:C.border}}>
                <Text style={{color:C.green,fontSize:15}}></Text>
              </TouchableOpacity>
            </>)}
            {changingPasscode && (
              <View style={{alignItems:'center',paddingTop:16}}>
                <Text style={{color:C.text,fontSize:18,fontWeight:'bold',marginBottom:8}}>Enter new passcode</Text>
                <View style={{flexDirection:'row',gap:12,marginBottom:24}}>
                  {[0,1,2,3,4,5].map(i=>(
                    <View key={i} style={{width:14,height:14,borderRadius:7,backgroundColor:passcode.length>i?C.green:C.border}}/>
                  ))}
                </View>
                {[[1,2,3],[4,5,6],[7,8,9],['cancel',0,'<']].map((row,ri)=>(
                  <View key={ri} style={{flexDirection:'row',gap:12,marginBottom:12}}>
                    {row.map(k=>(
                      <TouchableOpacity key={String(k)} onPress={async()=>{
                        const kk=String(k);
                        if(kk==='cancel'){setChangingPasscode(false);setPasscode('');return;}
                        if(kk==='<'){setPasscode(p=>p.slice(0,-1));return;}
                        if(passcode.length<6){const np=passcode+kk;setPasscode(np);if(np.length===6){await AsyncStorage.setItem('passcode',np);setChangingPasscode(false);setPasscode('');showToast('Passcode updated!','success');}}
                      }} style={{width:64,height:64,borderRadius:32,backgroundColor:C.card2,alignItems:'center',justifyContent:'center'}}>
                        <Text style={{color:C.text,fontSize:kk==='cancel'?11:kk==='<'?18:22,fontWeight:'500'}}>{kk==='<'?'⌫':kk==='cancel'?'Cancel':k}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                ))}
              </View>
            )}
            <TouchableOpacity style={[s.closeBtn,{marginTop:20}]} onPress={()=>{setShowSecurityModal(false);setChangingPasscode(false);setPasscode('');}}>
              <Text style={s.closeBtnTxt}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* AUTH MODAL */}
      <Modal visible={showAuthModal} animationType="fade" transparent>
        <View style={s.modalOverlay}>
          <View style={[s.modalCard,{paddingBottom:24}]}>
            <Text style={s.modalTitle}>Confirm Identity</Text>
            <View style={{flexDirection:'row',gap:16,marginBottom:32,justifyContent:'center'}}>
              {[0,1,2,3,4,5].map(i=>(
                <View key={i} style={{width:14,height:14,borderRadius:7,backgroundColor:authInput.length>i?C.green:C.border}}/>
              ))}
            </View>
            {[[1,2,3],[4,5,6],[7,8,9],['x',0,'<']].map((row,ri)=>(
              <View key={ri} style={{flexDirection:'row',gap:12,marginBottom:12,justifyContent:'center'}}>
                {row.map(k=>(
                  <TouchableOpacity key={String(k)} onPress={async()=>{
                    const kk=String(k);
                    if(kk==='x'){authResolveRef.current?.(false);authResolveRef.current=null;setShowAuthModal(false);setAuthInput('');return;}
                    if(kk==='<'){setAuthInput(p=>p.slice(0,-1));return;}
                    if(authInput.length<6){
                      const np=authInput+kk; setAuthInput(np);
                      if(np.length===6){
                        const stored=await AsyncStorage.getItem('passcode');
                        if(np===stored){authResolveRef.current?.(true);authResolveRef.current=null;setShowAuthModal(false);setAuthInput('');}
                        else{setAuthInput('');showToast('Wrong passcode','error');}
                      }
                    }
                  }} style={{width:64,height:64,borderRadius:32,backgroundColor:C.card,alignItems:'center',justifyContent:'center'}}>
                    <Text style={{color:C.text,fontSize:String(k)==='<'||String(k)==='x'?18:22,fontWeight:'500'}}>{String(k)==='<'?'⌫':String(k)==='x'?'✕':k}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            ))}
          </View>
        </View>
      </Modal>

      {/* SEND MODAL */}
      <Modal visible={showSendModal} animationType="slide" transparent>
        <KeyboardAvoidingView behavior={Platform.OS==='ios'?'padding':'height'} style={{flex:1}} keyboardVerticalOffset={0}>
        <View style={s.modalOverlay}>
          <View style={s.modalCard}>
            <Text style={s.modalTitle}>Send {sendToken}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginBottom:12}}>
              <View style={{flexDirection:'row',gap:8,paddingVertical:4}}>
                {tokenBalances.map(t=>(
                  <TouchableOpacity key={t.mint} onPress={()=>{setSendToken(t.symbol);}}
                    style={{paddingHorizontal:14,paddingVertical:8,borderRadius:20,
                      backgroundColor:sendToken===t.symbol?C.green:C.card,
                      borderWidth:1,borderColor:sendToken===t.symbol?C.green:C.border}}>
                    <Text style={{color:sendToken===t.symbol?'#0d1117':C.text,fontWeight:'600',fontSize:13}}>{t.symbol}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
            <Text style={s.cardLabel}>Recipient Address</Text>
            <TextInput style={s.seedInput} value={sendTo} onChangeText={setSendTo} placeholder="Solana wallet address..." placeholderTextColor={C.muted} autoCapitalize="none" />
            <Text style={[s.cardLabel, { marginTop: 12 }]}>Amount ({sendToken})</Text>
            <TextInput style={[s.seedInput, { minHeight: 0, height: 48 }]} value={sendAmt} onChangeText={setSendAmt} placeholder="0.00" placeholderTextColor={C.muted} keyboardType="numeric" />
            <TouchableOpacity style={[s.greenBtn, { marginTop: 16 }]} onPress={sendTokens} disabled={sendLoading}>
              {sendLoading ? <ActivityIndicator color={C.bg} /> : <Text style={s.greenBtnTxt}>Send</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={s.closeBtn} onPress={() => setShowSendModal(false)}>
              <Text style={s.closeBtnTxt}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* RECEIVE MODAL */}
      <Modal visible={showScanModal} animationType="slide" transparent={false}>
        <View style={{flex:1,backgroundColor:'#000'}}>
          <CameraView
            style={{flex:1}}
            facing="back"
            onBarcodeScanned={({data})=>{
              setScanResult(data);
              setShowScanModal(false);
              if(data.startsWith('solana:') || data.length===44){
                setSendTo(data.replace('solana:','').split('?')[0]);
                setShowSendModal(true);
              } else {
                Alert.alert('QR Scanned', data, [{text:'Copy',onPress:()=>Clipboard.setString(data)},{text:'OK'}]);
              }
            }}
          />
          <TouchableOpacity onPress={()=>setShowScanModal(false)}
            style={{position:'absolute',top:50,right:20,backgroundColor:'rgba(0,0,0,0.6)',borderRadius:20,padding:10}}>
            <Text style={{color:'#fff',fontSize:18}}>✕</Text>
          </TouchableOpacity>
          <Text style={{position:'absolute',bottom:60,alignSelf:'center',color:'#fff',fontSize:14,opacity:0.8}}>Point at a Solana wallet QR code</Text>
        </View>
      </Modal>
      <Modal visible={showReceiveModal} animationType="slide" transparent>
        <KeyboardAvoidingView behavior={Platform.OS==='ios'?'padding':'height'} style={{flex:1}} keyboardVerticalOffset={0}>
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
        </KeyboardAvoidingView>
      </Modal>

      {toast && (
        <View style={{position:'absolute',bottom:90,left:20,right:20,backgroundColor:toast.type==='success'?'#1a3a1a':toast.type==='error'?'#3a1a1a':'#1a1a3a',borderLeftWidth:4,borderLeftColor:toast.type==='success'?'#39ff14':toast.type==='error'?'#ff4444':'#4488ff',borderRadius:10,padding:14,flexDirection:'row',alignItems:'center',gap:10,zIndex:9999,elevation:20}}>
          <Ionicons name={toast.type==='success'?'checkmark-circle':toast.type==='error'?'close-circle':'information-circle'} size={20} color={toast.type==='success'?'#39ff14':toast.type==='error'?'#ff4444':'#4488ff'} />
          <Text style={{color:'#fff',flex:1,fontSize:14}}>{toast.msg}</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  txHistWrap:{marginTop:24,paddingTop:20,borderTopWidth:1,borderTopColor:"#1e293b"},
  txRow:{flexDirection:"row",alignItems:"center",paddingVertical:10,borderBottomWidth:1,borderBottomColor:"#0f172a"},
  txBadge:{paddingHorizontal:7,paddingVertical:3,borderRadius:6,minWidth:64,alignItems:"center"},
  txBadgeTxt:{color:"#fff",fontSize:10,fontWeight:"700"},
  root: { flex: 1, backgroundColor: C.bg },
  flex: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, paddingTop: 44, borderBottomWidth: 0, borderBottomColor: 'transparent', backgroundColor: 'transparent' },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  logoDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: C.green },
  logoText: { color: C.text, fontSize: 20, fontWeight: 'bold' },
  walletBtn: { borderWidth: 1, borderColor: C.border, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7 },
  walletBtnOn: { borderColor: C.green },
  walletBtnTxt: { color: C.muted, fontSize: 12, fontWeight: '600' },
  content: { flex: 1 },
  pad: { padding: 16, backgroundColor: C.bg, flex: 1 },
  msgs: { flex: 1, paddingHorizontal: 16, paddingTop: 16 },
  bubble: { marginBottom: 12, maxWidth: '85%' },
  userBubble: { alignSelf: 'flex-end', backgroundColor: C.card2, borderRadius: 16, borderBottomRightRadius: 4, padding: 12, borderWidth: 1, borderColor: C.border, maxWidth: '80%' },
  botBubble: { alignSelf: 'flex-start', backgroundColor: C.card, borderRadius: 16, borderBottomLeftRadius: 4, padding: 12, borderWidth: 1, borderColor: C.border, maxWidth: '80%' },
  botTag: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 6 },
  botDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.green },
  botTagTxt: { color: C.green, fontSize: 11, fontWeight: '600' },
  bubbleTxt: { color: C.text, fontSize: 14, lineHeight: 21, flexShrink: 1, flexWrap: 'wrap' },
  inputRow: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 12, gap: 10 },
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
  sectionLabel: { color: C.muted, fontSize: 11, fontWeight: '600', marginBottom: 8, letterSpacing: 1, paddingRight: 2, paddingRight: 2 },
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
  modalTitle: { color: C.text, fontSize: 20, fontWeight: 'bold', marginBottom: 16, textAlign: 'center', width: '100%' },
  orText: { color: C.muted, fontSize: 13, textAlign: 'center', marginVertical: 12 },
  seedInput: { backgroundColor: C.bg, color: C.text, borderRadius: 12, padding: 14, fontSize: 14, borderWidth: 1, borderColor: C.border, minHeight: 80, textAlignVertical: 'top' },
  closeBtn: { padding: 14, alignItems: 'center', marginTop: 8, minWidth: 80 },
  closeBtnTxt: { color: C.muted, fontSize: 14, textAlign: 'center', width: '100%' },
  seedWarning: { color: C.orange, fontSize: 13, textAlign: 'center', marginBottom: 16, lineHeight: 20 },
  seedGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  seedWord: { width: '30%', flexDirection: 'row', alignItems: 'center', backgroundColor: C.bg, borderRadius: 8, padding: 8, borderWidth: 1, borderColor: C.border, gap: 6 },
  seedNum: { color: C.muted, fontSize: 11, width: 16 },
  seedWordTxt: { color: C.text, fontSize: 13, fontWeight: '600' },
  addressBox: { backgroundColor: C.bg, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: C.border, marginBottom: 16 },
  addressTxt: { color: C.text, fontSize: 13, lineHeight: 20 },
  tabBar: { flexDirection: 'row', backgroundColor: '#080c0a', borderTopWidth: 0, borderTopColor: 'transparent', paddingTop: 10, paddingBottom: 24, paddingHorizontal: 4 },
  tabItem: { flex: 1, alignItems: 'center', gap: 4, paddingHorizontal: 2 },
  tabIcon: { fontSize: 22, color: 'rgba(255,255,255,0.4)' },
  tabIconActive: { color: '#39FF82', textShadowColor: '#39FF82', textShadowOffset: {width:0,height:0}, textShadowRadius: 8 },
  tabLabel: { color: 'rgba(255,255,255,0.4)', fontSize: 10, marginTop: 2 },
  tabLabelActive: { color: '#C7F284', fontWeight: '600' },
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
  pfHeroCard:{ overflow:'hidden', borderRadius:20, backgroundColor:'#1C2936', marginBottom:16, borderWidth:1, borderColor:'rgba(199,242,132,0.15)' },
  pfBalanceSection:{ alignItems:'center', paddingVertical:36, overflow:'hidden', borderRadius:20, backgroundColor:'#0f1e0f', marginBottom:16, borderWidth:1, borderColor:'rgba(199,242,132,0.15)' },
  pfBalanceAmt:{ color:C.text, fontSize:40, fontWeight:'700', letterSpacing:-1, zIndex:1 },
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
  stRowTxt:{ color:C.text, fontSize:15, flex:1 },
  stRowVal:{ color:C.green, fontSize:15, textAlign:"right" },
  stProfileRow:{ flexDirection:'row', alignItems:'center', padding:16 },
  stAvatar:{ width:44, height:44, borderRadius:22, backgroundColor:C.border, alignItems:'center', justifyContent:'center' },
  stAvatarTxt:{ color:C.green, fontSize:20 },
  stProfileAddr:{ color:C.text, fontSize:15, fontWeight:'600' },
  stProfileSub:{ color:C.muted, fontSize:12, marginTop:2 },
});
