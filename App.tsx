import React, { useState, useEffect, useCallback, useRef } from 'react';
import { WebView } from 'react-native-webview';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import Svg, { Line as SvgLine, Rect as SvgRect } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { Image, View, Text, TouchableOpacity, StyleSheet, ScrollView, TextInput, StatusBar, SafeAreaView, Modal, Alert, ActivityIndicator, Clipboard, RefreshControl, KeyboardAvoidingView, Platform, Animated, AppState, Linking, FlatList } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as LocalAuthentication from 'expo-local-authentication';
import { generateWallet, getPublicKey, getPrivateKey, importWallet as deriveWallet, signAndSendTransaction, rpcFetch } from './wallet';
import nacl from 'tweetnacl';
import { askAI, getJupiterQuote, executeSwap as executeSwapTx, getTokenPrice, createTriggerOrder, createRecurringOrder, signAndSendTx, resolveToken } from './sendMsg';
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
  bg: '#0d1117', card: 'rgba(28,41,54,0.55)', card2: 'rgba(22,32,48,0.45)',
  border: 'rgba(120,180,220,0.18)', modal: '#1C2936', modal2: '#162030', green: '#C7F284', blue: '#79e0f2',
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
  const {PublicKey,Transaction,Keypair} = require('@solana/web3.js');
  const {getAssociatedTokenAddress,createAssociatedTokenAccountInstruction,createTransferInstruction,TOKEN_PROGRAM_ID,ASSOCIATED_TOKEN_PROGRAM_ID} = require('@solana/spl-token');
  const mintPk = new PublicKey(mint);
  const fromPk = new PublicKey(pubkey);
  const toPk = new PublicKey(recipient);
  const fromATA = await getAssociatedTokenAddress(mintPk, fromPk);
  const toATA = await getAssociatedTokenAddress(mintPk, toPk);
  const tx = new Transaction();
  const ataInfo = await rpcFetch('getAccountInfo',[toATA.toBase58(),{encoding:'base64'}]);
  if(!ataInfo?.result?.value){
    tx.add(createAssociatedTokenAccountInstruction(fromPk,toATA,toPk,mintPk,TOKEN_PROGRAM_ID,ASSOCIATED_TOKEN_PROGRAM_ID));
  }
  tx.add(createTransferInstruction(fromATA,toATA,fromPk,amountRaw,TOKEN_PROGRAM_ID));
  const bh = await rpcFetch('getLatestBlockhash',[{commitment:'confirmed'}]);
  tx.recentBlockhash=bh.result.value.blockhash;tx.feePayer=fromPk;
  const sig = nacl.sign.detached(tx.serializeMessage(), secretKey);
  tx.addSignature(fromPk, Buffer.from(sig));
  const r = await rpcFetch('sendTransaction',[Buffer.from(tx.serialize()).toString('base64'),{encoding:'base64',preflightCommitment:'confirmed'}]);
  if(r.error) throw new Error(r.error.message);
  return r.result;
}

const TABS = [
  { id: 'chat', label: 'Chat', icon: 'chatbubble-outline', iconActive: 'chatbubble' },
  { id: 'swap', label: 'Trade', icon: 'swap-horizontal-outline', iconActive: 'swap-horizontal' },
  { id: 'portfolio', label: 'Portfolio', icon: 'time-outline', iconActive: 'time' },
  { id: 'dapp', label: 'Explore', icon: 'compass-outline', iconActive: 'compass-sharp' },
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
  { name: 'ChatFi', url: 'https://chatfi.pro', domain: 'chatfi.pro', desc: 'Your AI DeFi co-pilot on Solana' },
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
    fetch(`https://api.dexscreener.com/latest/dex/tokens/${mint}`)
    .then(r=>r.json())
    .then(d=>{
      const pair = d?.pairs?.[0];
      if(pair) setCandles([pair]);
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
        <View style={{ backgroundColor:C.modal, borderTopLeftRadius:24, borderTopRightRadius:24, paddingHorizontal:16, paddingVertical:24, maxHeight:'85%', paddingBottom:72 }}>

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
                  style={{ flex:1, backgroundColor:C.modal }}
                  javaScriptEnabled={true}
                  domStorageEnabled={true}
                  startInLoadingState={true}
                  renderLoading={() => (
                    <View style={{ flex:1, alignItems:'center', justifyContent:'center', backgroundColor:C.modal }}>
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
                  style={{ flex:1, backgroundColor:C.modal }}
                  startInLoadingState={true}
                  renderLoading={() => (
                    <View style={{ flex:1, alignItems:'center', justifyContent:'center', backgroundColor:C.modal }}>
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
function AccountModal({ visible, onClose, pubkey, wallet, onRemoveWallet, userName, setUserName, accounts, setAccounts, activeAccIdx, switchAccount, addAccount }: any) {
  const [view, setView] = React.useState('main');
  const [nameInput, setNameInput] = React.useState(userName || '');
  React.useEffect(() => { setNameInput(userName || ''); }, [userName]);
  const short = pubkey ? pubkey.slice(0,6)+'...'+pubkey.slice(-4) : '';

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={{ flex:1, backgroundColor:'rgba(0,0,0,0.6)', justifyContent:'flex-end' }} pointerEvents="box-none">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ backgroundColor:C.modal, borderTopLeftRadius:24, borderTopRightRadius:24, maxHeight:'90%', paddingBottom:72 }}>

          {view === 'main' && (
            <ScrollView keyboardShouldPersistTaps='handled'>
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
                  <Text style={{ color:C.text, fontSize:13 }}  numberOfLines={1} adjustsFontSizeToFit>Profile</Text>
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
                <Text style={{ color:C.text, fontSize:18, fontWeight:'bold', flex:1, flexShrink:1, textAlign:'center' }}>Profile</Text>
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
                  onPress={async () => {
                      try {
                        setUserName(nameInput);
                        await AsyncStorage.setItem('user_name', nameInput);
                        const raw = await AsyncStorage.getItem('accounts');
                        if(raw){
                          const accs = JSON.parse(raw);
                          const idx = accs.findIndex((a:any) => a.publicKey === pubkey || a.address === pubkey);
                          const target = idx >= 0 ? idx : activeAccIdx;
                          if(accs[target]) accs[target].name = nameInput;
                          setAccounts([...accs]);
                          await AsyncStorage.setItem('accounts', JSON.stringify(accs));
                        }
                        Alert.alert('Saved!', 'Name saved!');
                        setView('main');
                      } catch(e:any) {
                        Alert.alert('Error', e?.message || 'Failed to save name');
                      }
                    }}
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

        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const SOLANA_WALLET_INJECTION = `
(function() {
  if (window.solana && window.solana.isChatFi) return;
  const callbacks = {};
  let callId = 0;
  const listeners = {};

  function sendToNative(method, params) {
    return new Promise((resolve, reject) => {
      const id = ++callId;
      callbacks[id] = { resolve, reject };
      window.ReactNativeWebView.postMessage(JSON.stringify({ id, method, params }));
      setTimeout(() => { if (callbacks[id]) { delete callbacks[id]; reject(new Error('Request timeout')); } }, 60000);
    });
  }

  document.addEventListener('message', function(e) {
    try {
      const data = JSON.parse(e.data);
      if (data.id && callbacks[data.id]) {
        if (data.error) callbacks[data.id].reject(new Error(data.error));
        else callbacks[data.id].resolve(data.result);
        delete callbacks[data.id];
      }
    } catch(err) {}
  });
  window.addEventListener('message', function(e) {
    try {
      const data = JSON.parse(e.data);
      if (data.id && callbacks[data.id]) {
        if (data.error) callbacks[data.id].reject(new Error(data.error));
        else callbacks[data.id].resolve(data.result);
        delete callbacks[data.id];
      }
    } catch(err) {}
  });

  const addr = '\${PUBLIC_KEY}';
  const publicKey = {
    toString: () => addr,
    toBase58: () => addr,
    toBytes: () => new Uint8Array(32),
    equals: (other) => other?.toBase58?.() === addr,
    toJSON: () => addr,
  };

  const wallet = {
    isPhantom: true,
    isChatFi: true,
    publicKey,
    isConnected: !!addr,
    connect: async (opts) => {
      if (!addr) throw new Error('No wallet connected');
      wallet.isConnected = true;
      wallet._emit('connect', publicKey);
      return { publicKey };
    },
    disconnect: async () => {
      wallet.isConnected = false;
      wallet._emit('disconnect');
    },
    signTransaction: async (tx) => {
      const bytes = tx.serialize({ requireAllSignatures: false, verifySignatures: false });
      const b64 = btoa(String.fromCharCode(...bytes));
      const result = await sendToNative('signTransaction', { tx: b64 });
      return tx;
    },
    signAllTransactions: async (txs) => {
      return Promise.all(txs.map(tx => wallet.signTransaction(tx)));
    },
    signMessage: async (message) => {
      const b64 = btoa(String.fromCharCode(...message));
      const result = await sendToNative('signMessage', { message: b64 });
      const sig = Uint8Array.from(atob(result), c => c.charCodeAt(0));
      return { signature: sig, publicKey };
    },
    signAndSendTransaction: async (tx, opts) => {
      const bytes = tx.serialize({ requireAllSignatures: false, verifySignatures: false });
      const b64 = btoa(String.fromCharCode(...bytes));
      const sig = await sendToNative('signAndSend', { tx: b64 });
      return { signature: sig };
    },
    on: (event, cb) => { if (!listeners[event]) listeners[event] = []; listeners[event].push(cb); },
    off: (event, cb) => { if (listeners[event]) listeners[event] = listeners[event].filter(l => l !== cb); },
    _emit: (event, ...args) => { (listeners[event] || []).forEach(cb => { try { cb(...args); } catch(e) {} }); },
    removeAllListeners: () => { Object.keys(listeners).forEach(k => delete listeners[k]); },
  };

  window.solana = wallet;
  window.phantom = { solana: wallet };

  // Wallet Standard API (used by newer dApps like Kamino, Drift, Jupiter)
  const walletStandard = {
    version: '1.0.0',
    name: 'ChatFi',
    icon: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzIiIGhlaWdodD0iMzIiIHZpZXdCb3g9IjAgMCAzMiAzMiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48Y2lyY2xlIGN4PSIxNiIgY3k9IjE2IiByPSIxNiIgZmlsbD0iI0M3RjI4NCIvPjwvc3ZnPg==',
    chains: ['solana:mainnet'],
    features: {
      'standard:connect': {
        version: '1.0.0',
        connect: async () => {
          wallet.isConnected = true;
          return { accounts: [{ address: addr, publicKey: publicKey.toBytes(), chains: ['solana:mainnet'], features: ['standard:connect', 'solana:signTransaction', 'solana:signMessage'] }] };
        },
      },
      'standard:disconnect': {
        version: '1.0.0',
        disconnect: async () => { wallet.isConnected = false; },
      },
      'standard:events': {
        version: '1.0.0',
        on: (event, cb) => wallet.on(event, cb),
      },
      'solana:signTransaction': {
        version: '1.0.0',
        signTransaction: async (...txs) => {
          return Promise.all(txs.map(async ({ transaction }) => {
            const b64 = btoa(String.fromCharCode(...transaction));
            const result = await sendToNative('signTransaction', { tx: b64 });
            return { signedTransaction: transaction };
          }));
        },
      },
      'solana:signMessage': {
        version: '1.0.0',
        signMessage: async ({ message, account }) => {
          const b64 = btoa(String.fromCharCode(...message));
          const result = await sendToNative('signMessage', { message: b64 });
          const sig = Uint8Array.from(atob(result), c => c.charCodeAt(0));
          return { signedMessage: message, signature: sig };
        },
      },
      'solana:signAndSendTransaction': {
        version: '1.0.0',
        signAndSendTransaction: async (...txs) => {
          return Promise.all(txs.map(async ({ transaction }) => {
            const b64 = btoa(String.fromCharCode(...transaction));
            const sig = await sendToNative('signAndSend', { tx: b64 });
            return { signature: Uint8Array.from(atob(sig), c => c.charCodeAt(0)) };
          }));
        },
      },
    },
    accounts: addr ? [{ address: addr, publicKey: new Uint8Array(32), chains: ['solana:mainnet'], features: ['standard:connect', 'solana:signTransaction', 'solana:signMessage'] }] : [],
  };

  // Register with Wallet Standard
  if (!window.navigator.wallets) {
    window.navigator.wallets = [];
  }
  window.navigator.wallets.push(walletStandard);

  // Dispatch wallet standard event
  window.dispatchEvent(new CustomEvent('wallet-standard:app-ready', { detail: { register: (w) => {} } }));
  if (window.__wallet_standard__) {
    try { window.__wallet_standard__.register(walletStandard); } catch(e) {}
  }

  window.dispatchEvent(new Event('load'));
  window.dispatchEvent(new CustomEvent('solana#initialized'));
  if (addr) {
    setTimeout(() => wallet._emit('connect', publicKey), 100);
  }
})();
`;

function DappBrowser({ walletAddress, secretKey, wallet }) {
  const [url, setUrl] = React.useState('https://chatfi.pro');
  const [activeUrl, setActiveUrl] = React.useState('https://chatfi.pro');
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

  const hostname = activeUrl ? (() => { try { return new URL(activeUrl).hostname; } catch { return activeUrl; } })() : '';
  const isHttps = activeUrl?.startsWith('https');
  const [editingUrl, setEditingUrl] = React.useState(false);
  const [showMenu, setShowMenu] = React.useState(false);

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
              { icon: 'home-outline', label: 'Home', color: C.text, action: () => { setActiveUrl('https://chatfi.pro'); setUrl('https://chatfi.pro'); setShowMenu(false); } },
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
            onShouldStartLoadWithRequest={(request) => {
              const url = request.url;
              // OAuth providers — open in external browser
              const oauthDomains = [
                'accounts.google.com',
                'oauth.google.com',
                'appleid.apple.com',
                'twitter.com/i/oauth',
                'x.com/i/oauth',
                'discord.com/oauth2',
                'github.com/login/oauth',
                'facebook.com/dialog',
              ];
              const isOAuth = oauthDomains.some(d => url.includes(d));
              if (isOAuth) {
                Linking.openURL(url).catch(() => {});
                return false;
              }
              return true;
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
                  const txBytes = Uint8Array.from(atob(params.tx), c => c.charCodeAt(0));
                  const sig = nacl.sign.detached(txBytes.slice(1 + txBytes[0] * 64), secretKey);
                  for (let i = 0; i < 64; i++) txBytes[1 + i] = sig[i];
                  if (method === 'signAndSend') {
                    const rpcRes = await fetch('https://api.mainnet-beta.solana.com', {
                      method: 'POST', headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'sendTransaction', params: [btoa(String.fromCharCode(...txBytes)), { encoding: 'base64' }] }),
                    });
                    const rpcData = await rpcRes.json();
                    if (rpcData.error) throw new Error(rpcData.error.message);
                    webRef.current?.postMessage(JSON.stringify({ id, result: rpcData.result }));
                  } else {
                    webRef.current?.postMessage(JSON.stringify({ id, result: btoa(String.fromCharCode(...txBytes)) }));
                  }
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
      const { secretKey: sk2 } = deriveWallet(wallet);
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


function SwapScreen({wallet,pubkey,tokenBalances,solBalance,fromToken2,setFromToken2,toToken2,setToToken2,showToast,C,s,nacl,deriveWallet,executeSwapTx,fetchPortfolio}:any) {
  const [swapSubTab, setSwapSubTab] = React.useState<'swap'|'trigger'>('swap');
  const [swapAmt, setSwapAmt] = React.useState('');
  const [swapLoading, setSwapLoading] = React.useState(false);
  const [quoteOut, setQuoteOut] = React.useState<string|null>(null);
  const [showTokenPicker, setShowTokenPicker] = React.useState<'from'|'to'|null>(null);
  const [tokenSearch, setTokenSearch] = React.useState('');
  const [tokenResults, setTokenResults] = React.useState<any[]>([]);
  const [tokenSearching, setTokenSearching] = React.useState(false);

  const searchTokens = async (q: string) => {
    if (!q || q.length < 1) {
      // Show popular tokens when search is empty
      setTokenResults([
        {symbol:'SOL',name:'Solana',address:'So11111111111111111111111111111111111111112',logoURI:'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/solana/info/logo.png',decimals:9},
        {symbol:'USDC',name:'USD Coin',address:'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',logoURI:'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48/logo.png',decimals:6},
        {symbol:'USDT',name:'Tether',address:'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',logoURI:'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xdAC17F958D2ee523a2206206994597C13D831ec7/logo.png',decimals:6},
        {symbol:'JUP',name:'Jupiter',address:'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN',logoURI:'https://static.jup.ag/jup/icon.png',decimals:6},
        {symbol:'BONK',name:'Bonk',address:'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',logoURI:'https://arweave.net/hQiPZOsRZXGXBJd_82PhVdlM_hACsT_q6wqwf5cSY7I',decimals:5},
        {symbol:'WIF',name:'dogwifhat',address:'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm',logoURI:'https://bafkreibk3covs5ltyqxa272uodhculbgn2b37k4wgg6sdxydwwphxkznm.ipfs.nftstorage.link',decimals:6},
        {symbol:'JitoSOL',name:'Jito Staked SOL',address:'J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn',logoURI:'https://storage.googleapis.com/token-metadata/JitoSOL-256.png',decimals:9},
        {symbol:'PYTH',name:'Pyth Network',address:'HZ1JovNiVvGrGs6Lqg6JmBzWBMFURQDMEbbTAe7hfGqN',logoURI:'https://pyth.network/token.svg',decimals:6},
      ]);
      return;
    }
    setTokenSearching(true);
    try {
      const r = await fetch(`https://lite-api.jup.ag/tokens/v2/search?query=${encodeURIComponent(q)}&limit=20`);
      const d = await r.json();
      setTokenResults(Array.isArray(d) ? d : []);
    } catch(e) { setTokenResults([]); }
    setTokenSearching(false);
  };

  const selectToken = (token: any) => {
    const t = { symbol: token.symbol, mint: token.id, decimals: token.decimals||6, logoURI: token.icon, isVerified: token.isVerified, usdPrice: token.usdPrice };
    if (showTokenPicker === 'from') setFromToken2(t);
    else setToToken2(t);
    setShowTokenPicker(null);
    setTokenSearch('');
    setTokenResults([]);
  };
  const [triggerAmt, setTriggerAmt] = React.useState('');
  const [triggerPrice, setTriggerPrice] = React.useState('');
  const [triggerLoading, setTriggerLoading] = React.useState(false);
  const [perpSide, setPerpSide] = React.useState<'long'|'short'>('long');
  const [perpAmt, setPerpAmt] = React.useState('');
  const [perpLeverage, setPerpLeverage] = React.useState('5');
  const [perpLoading, setPerpLoading] = React.useState(false);
  const [perpPositions, setPerpPositions] = React.useState<any[]>([]);

  const RPC_URL = 'https://api.mainnet-beta.solana.com';

  React.useEffect(() => {
    if (swapAmt && parseFloat(swapAmt) > 0) fetchQuote();
  }, [swapAmt, fromToken2, toToken2]);

  React.useEffect(() => {
    if (swapSubTab === 'perps' && pubkey) fetchPerpPositions();
  }, [swapSubTab]);

  const fetchQuote = async () => {
    try {
      const inMint = fromToken2.mint;
      const outMint = toToken2.mint;
      const inDec = fromToken2.decimals || 9;
      const amtRaw = Math.round(parseFloat(swapAmt) * Math.pow(10, inDec));
      const r = await fetch(`https://api.jup.ag/swap/v2/order?inputMint=${inMint}&outputMint=${outMint}&amount=${amtRaw}&taker=${pubkey||''}&slippageBps=50`);
      const d = await r.json();
      const outAmt = d.outAmount ? (parseInt(d.outAmount) / Math.pow(10, toToken2.decimals||6)).toFixed(4) : null;
      setQuoteOut(outAmt);
    } catch(e) { setQuoteOut(null); }
  };

  const doSwap = async () => {
    if (!wallet || !swapAmt) { showToast('Enter amount','error'); return; }
    setSwapLoading(true);
    try {
      const {publicKey:pk, secretKey} = deriveWallet(wallet);
      const txSig = await executeSwapTx(fromToken2.mint, toToken2.mint, parseFloat(swapAmt), fromToken2.decimals||9, pk, secretKey, RPC_URL);
      showToast('Swap done! Tx: '+txSig.slice(0,12)+'...','success');
      fetchPortfolio();
      setSwapAmt(''); setQuoteOut(null);
    } catch(e:any) { showToast('Swap failed: '+e.message,'error'); }
    setSwapLoading(false);
  };

  const doTrigger = async () => {
    if (!wallet||!triggerAmt||!triggerPrice) { showToast('Fill all fields','error'); return; }
    setTriggerLoading(true);
    try {
      const {publicKey:pk, secretKey} = deriveWallet(wallet);
      const inDec = fromToken2.decimals||9;
      const amtRaw = Math.round(parseFloat(triggerAmt)*Math.pow(10,inDec));
      const r = await fetch('https://api.jup.ag/trigger/v1/createOrder',{
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({inputMint:fromToken2.mint,outputMint:toToken2.mint,maker:pk,
          params:{makingAmount:String(amtRaw),takingAmount:String(Math.round(parseFloat(triggerPrice)*Math.pow(10,toToken2.decimals||6))),
          expiredAt:null,feeBps:'10'},computeUnitPrice:'auto'})
      });
      const d = await r.json();
      if (d.error) throw new Error(d.error);
      if (!d.transaction) throw new Error(d.error || "No transaction");
      const txSig = await signAndSendTx(d.transaction, secretKey);
      showToast("Trigger placed! Tx: "+txSig.slice(0,12)+"...","success");
      setTriggerAmt(''); setTriggerPrice('');
    } catch(e:any) { showToast('Trigger failed: '+e.message,'error'); }
    setTriggerLoading(false);
  };

  const fetchPerpPositions = async () => {
    if (!pubkey) return;
    try {
      const r = await fetch(`https://perps-api.jup.ag/v1/positions?walletAddress=${pubkey}`);
      const d = await r.json();
      setPerpPositions(Array.isArray(d?.dataList) ? d.dataList : []);
    } catch(e) {}
  };

  const doPerp = async () => {
    if (!wallet||!perpAmt) { showToast('Enter amount','error'); return; }
    showToast('Perps: Use jup.ag/perps for now — API coming soon','info');
  };

  const swapTabStyle = (t:string) => ({
    flex:1, paddingVertical:8, alignItems:'center' as const, borderRadius:10,
    backgroundColor: swapSubTab===t ? C.green : 'transparent',
  });
  const swapTabTxtStyle = (t:string) => ({
    fontSize:13, fontWeight:'600' as const,
    color: swapSubTab===t ? '#0d1117' : C.muted,
  });

  return (
    <ScrollView style={{flex:1}} contentContainerStyle={{padding:16,paddingBottom:100}}>
      {/* Token Picker Modal */}
      <Modal visible={!!showTokenPicker} animationType="slide" transparent onRequestClose={()=>setShowTokenPicker(null)}>
        <View style={{flex:1,backgroundColor:'rgba(0,0,0,0.7)',justifyContent:'flex-end'}}>
          <View style={{backgroundColor:'#161b22',borderTopLeftRadius:24,borderTopRightRadius:24,maxHeight:'80%',padding:16}}>
            <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginBottom:12}}>
              <Text style={{color:C.text,fontSize:18,fontWeight:'700'}}>Select Token</Text>
              <TouchableOpacity onPress={()=>setShowTokenPicker(null)}><Text style={{color:C.muted,fontSize:22}}>✕</Text></TouchableOpacity>
            </View>
            <TextInput
              value={tokenSearch}
              onChangeText={(t)=>{setTokenSearch(t);searchTokens(t);}}
              placeholder="Search by name or paste address..."
              placeholderTextColor={C.muted}
              autoFocus
              style={{backgroundColor:C.card2,borderRadius:12,padding:12,color:C.text,marginBottom:12,borderWidth:1,borderColor:C.border}}
            />
            {tokenSearching && <ActivityIndicator color={C.green} style={{marginTop:8}}/>}
            <FlatList
              data={tokenResults}
              keyExtractor={(item)=>item.id}
              renderItem={({item})=>(
                <TouchableOpacity onPress={()=>selectToken(item)} style={{flexDirection:'row',alignItems:'center',padding:12,borderBottomWidth:1,borderBottomColor:C.border,gap:12}}>
                  {item.icon ? <Image source={{uri:item.icon}} style={{width:40,height:40,borderRadius:20}}/> :
                  <View style={{width:40,height:40,borderRadius:20,backgroundColor:C.card2,alignItems:'center',justifyContent:'center'}}>
                    <Text style={{color:C.text,fontSize:12,fontWeight:'700'}}>{item.symbol?.slice(0,3)}</Text>
                  </View>}
                  <View style={{flex:1}}>
                    <View style={{flexDirection:'row',alignItems:'center',gap:4}}>
                      <Text style={{color:C.text,fontWeight:'700',fontSize:15}}>{item.symbol}</Text>
                      {item.isVerified && <Text style={{color:C.green,fontSize:11}}>✓</Text>}
                      {item.tags?.includes('strict') && <View style={{backgroundColor:'rgba(199,242,132,0.15)',paddingHorizontal:4,borderRadius:4}}><Text style={{color:C.green,fontSize:9}}>STRICT</Text></View>}
                    </View>
                    <Text style={{color:C.muted,fontSize:12}}>{item.name}</Text>
                  </View>
                  <Text style={{color:C.muted,fontSize:12}}>{item.usdPrice ? '$'+parseFloat(item.usdPrice).toFixed(4) : ''}</Text>
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>
      {/* Sub tabs */}
      <View style={{flexDirection:'row',backgroundColor:C.card2,borderRadius:12,padding:4,marginBottom:16,borderWidth:1,borderColor:C.border}}>
        {(['swap','trigger'] as const).map(t=>(
          <TouchableOpacity key={t} style={swapTabStyle(t)} onPress={()=>setSwapSubTab(t)}>
            <Text style={swapTabTxtStyle(t)}>{t.charAt(0).toUpperCase()+t.slice(1)}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {swapSubTab==='swap' && (
        <View>
          {/* From */}
          <View style={{backgroundColor:C.card,borderRadius:16,padding:16,marginBottom:6,borderWidth:1,borderColor:C.border}}>
            <Text style={{color:C.muted,fontSize:11,marginBottom:8,letterSpacing:1}}>YOU PAY</Text>
            <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between'}}>
              <View style={{flexDirection:'row',alignItems:'center',gap:8}}>
                <TouchableOpacity onPress={()=>{setShowTokenPicker('from');setTokenSearch('');searchToken('');}} style={{flexDirection:'row',alignItems:'center',gap:8}}>
                  {fromToken2.logoURI ? <Image source={{uri:fromToken2.logoURI}} style={{width:36,height:36,borderRadius:18}}/> :
                  <View style={{width:36,height:36,borderRadius:18,backgroundColor:C.card2,alignItems:'center',justifyContent:'center',borderWidth:1,borderColor:C.border}}>
                    <Text style={{color:C.green,fontSize:10,fontWeight:'700'}}>{fromToken2.symbol?.slice(0,3)}</Text>
                  </View>}
                  <Text style={{color:C.text,fontSize:16,fontWeight:'700'}}>{fromToken2.symbol}</Text>
                  {fromToken2.isVerified && <Text style={{color:C.green,fontSize:10}}>✓</Text>}
                  <Text style={{color:C.muted}}>▾</Text>
                </TouchableOpacity>
              </View>
              <TextInput value={swapAmt} onChangeText={setSwapAmt} placeholder="0.00" placeholderTextColor={C.muted}
                keyboardType="numeric" style={{color:C.text,fontSize:24,fontWeight:'700',textAlign:'right',minWidth:100}} />
            </View>
            <View style={{flexDirection:'row',gap:6,marginTop:12}}>
              {['25','50','75','100'].map(p=>(
                <TouchableOpacity key={p} onPress={()=>{
                  const bal = fromToken2.symbol==='SOL' ? solBalance : tokenBalances.find((t:any)=>t.symbol===fromToken2.symbol)?.amount||0;
                  setSwapAmt(((bal||0)*parseInt(p)/100).toFixed(4));
                }} style={{flex:1,paddingVertical:5,borderRadius:8,backgroundColor:C.card2,alignItems:'center',borderWidth:1,borderColor:C.border}}>
                  <Text style={{color:C.muted,fontSize:11}}>{p}%</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Arrow */}
          <View style={{alignItems:'center',marginVertical:4}}>
            <TouchableOpacity onPress={()=>{const tmp=fromToken2;setFromToken2(toToken2);setToToken2(tmp);}}
              style={{width:34,height:34,borderRadius:17,backgroundColor:C.card,borderWidth:1,borderColor:C.green,alignItems:'center',justifyContent:'center'}}>
              <Text style={{color:C.green,fontSize:16}}>⇅</Text>
            </TouchableOpacity>
          </View>

          {/* To */}
          <View style={{backgroundColor:C.card,borderRadius:16,padding:16,marginBottom:12,borderWidth:1,borderColor:C.border}}>
            <Text style={{color:C.muted,fontSize:11,marginBottom:8,letterSpacing:1}}>YOU RECEIVE</Text>
            <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between'}}>
              <View style={{flexDirection:'row',alignItems:'center',gap:8}}>
                <TouchableOpacity onPress={()=>{setShowTokenPicker('to');setTokenSearch('');searchToken('');}} style={{flexDirection:'row',alignItems:'center',gap:8}}>
                  {toToken2.logoURI ? <Image source={{uri:toToken2.logoURI}} style={{width:36,height:36,borderRadius:18}}/> :
                  <View style={{width:36,height:36,borderRadius:18,backgroundColor:C.card2,alignItems:'center',justifyContent:'center',borderWidth:1,borderColor:C.border}}>
                    <Text style={{color:C.blue,fontSize:10,fontWeight:'700'}}>{toToken2.symbol?.slice(0,3)}</Text>
                  </View>}
                  <Text style={{color:C.text,fontSize:16,fontWeight:'700'}}>{toToken2.symbol}</Text>
                  {toToken2.isVerified && <Text style={{color:C.green,fontSize:10}}>✓</Text>}
                  <Text style={{color:C.muted}}>▾</Text>
                </TouchableOpacity>
              </View>
              <Text style={{color:C.text,fontSize:24,fontWeight:'700'}}>{quoteOut||'—'}</Text>
            </View>
          </View>

          <TouchableOpacity onPress={doSwap} disabled={swapLoading}
            style={{backgroundColor:C.green,borderRadius:14,padding:16,alignItems:'center'}}>
            {swapLoading ? <ActivityIndicator color="#0d1117"/> : <Text style={{color:'#0d1117',fontWeight:'700',fontSize:15}}>Swap via Jupiter</Text>}
          </TouchableOpacity>
        </View>
      )}

      {swapSubTab==='trigger' && (
        <View>
          {/* Sell panel */}
          <View style={{backgroundColor:C.card,borderRadius:16,padding:16,marginBottom:4,borderWidth:1,borderColor:C.border}}>
            <Text style={{color:C.muted,fontSize:12,fontWeight:'600',marginBottom:10}}>Sell</Text>
            <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between'}}>
              <TouchableOpacity onPress={()=>{setShowTokenPicker('from');setTokenSearch('');searchToken('');}}
                style={{flexDirection:'row',alignItems:'center',gap:8,backgroundColor:C.card2,paddingHorizontal:12,paddingVertical:8,borderRadius:20,borderWidth:1,borderColor:C.border}}>
                {fromToken2.logoURI ? <Image source={{uri:fromToken2.logoURI}} style={{width:24,height:24,borderRadius:12}}/> :
                <View style={{width:24,height:24,borderRadius:12,backgroundColor:C.border,alignItems:'center',justifyContent:'center'}}>
                  <Text style={{color:C.green,fontSize:9,fontWeight:'700'}}>{fromToken2.symbol?.slice(0,3)}</Text>
                </View>}
                <Text style={{color:C.text,fontWeight:'700',fontSize:15}}>{fromToken2.symbol}</Text>
                <Text style={{color:C.muted,fontSize:10}}>▾</Text>
              </TouchableOpacity>
              <TextInput value={triggerAmt} onChangeText={setTriggerAmt} placeholder="0"
                placeholderTextColor={C.muted} keyboardType="numeric" textAlign="right"
                style={{flex:1,color:C.text,fontSize:24,fontWeight:'700',marginLeft:12}} />
            </View>
          </View>

          {/* Swap arrow */}
          <View style={{alignItems:'center',marginVertical:2}}>
            <TouchableOpacity onPress={()=>{const tmp=fromToken2;setFromToken2(toToken2);setToToken2(tmp);}}
              style={{backgroundColor:C.card2,borderRadius:20,padding:8,borderWidth:1,borderColor:C.border}}>
              <Text style={{color:C.green,fontSize:16}}>⇅</Text>
            </TouchableOpacity>
          </View>

          {/* Buy panel */}
          <View style={{backgroundColor:C.card,borderRadius:16,padding:16,marginBottom:4,borderWidth:1,borderColor:C.border}}>
            <Text style={{color:C.muted,fontSize:12,fontWeight:'600',marginBottom:10}}>Buy</Text>
            <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between'}}>
              <TouchableOpacity onPress={()=>{setShowTokenPicker('to');setTokenSearch('');searchToken('');}}
                style={{flexDirection:'row',alignItems:'center',gap:8,backgroundColor:C.card2,paddingHorizontal:12,paddingVertical:8,borderRadius:20,borderWidth:1,borderColor:C.border}}>
                {toToken2.logoURI ? <Image source={{uri:toToken2.logoURI}} style={{width:24,height:24,borderRadius:12}}/> :
                <View style={{width:24,height:24,borderRadius:12,backgroundColor:C.border,alignItems:'center',justifyContent:'center'}}>
                  <Text style={{color:C.blue,fontSize:9,fontWeight:'700'}}>{toToken2.symbol?.slice(0,3)}</Text>
                </View>}
                <Text style={{color:C.text,fontWeight:'700',fontSize:15}}>{toToken2.symbol}</Text>
                <Text style={{color:C.muted,fontSize:10}}>▾</Text>
              </TouchableOpacity>
              {!!(triggerAmt && triggerPrice) &&
                <Text style={{flex:1,color:C.muted,fontSize:18,fontWeight:'700',textAlign:'right'}}>
                  ≈{(parseFloat(triggerAmt||'0')*parseFloat(triggerPrice||'0')).toFixed(4)}
                </Text>}
            </View>
          </View>

          {/* Limit Price + Expiry */}
          <View style={{flexDirection:'row',gap:8,marginBottom:12,marginTop:4}}>
            <View style={{flex:1}}>
              <Text style={{color:C.muted,fontSize:11,marginBottom:4}}>Limit Price ⇄</Text>
              <TextInput value={triggerPrice} onChangeText={setTriggerPrice} placeholder="e.g. 150"
                placeholderTextColor={C.muted} keyboardType="numeric"
                style={{backgroundColor:C.card,borderRadius:12,padding:12,color:C.text,borderWidth:1,borderColor:C.border,fontSize:15}} />
            </View>
            <View style={{flex:1}}>
              <Text style={{color:C.muted,fontSize:11,marginBottom:4}}>Expiry</Text>
              <View style={{backgroundColor:C.card,borderRadius:12,padding:12,borderWidth:1,borderColor:C.border,flexDirection:'row',alignItems:'center',justifyContent:'space-between'}}>
                <Text style={{color:C.text,fontSize:15}}>Never</Text>
                <Text style={{color:C.muted}}>▾</Text>
              </View>
            </View>
          </View>

          <TouchableOpacity onPress={doTrigger} disabled={triggerLoading}
            style={{backgroundColor:C.green,borderRadius:14,padding:16,alignItems:'center'}}>
            {triggerLoading ? <ActivityIndicator color="#0d1117"/> : <Text style={{color:'#0d1117',fontWeight:'700',fontSize:15}}>Place Limit Order</Text>}
          </TouchableOpacity>
        </View>
      )}



        {/* SWAP */}
      {tab === 'swap' && (
        <SwapScreen
          wallet={wallet} pubkey={pubkey} tokenBalances={tokenBalances} solBalance={solBalance}
          fromToken2={fromToken2} setFromToken2={setFromToken2} toToken2={toToken2} setToToken2={setToToken2}
          showToast={showToast} C={C} s={s} nacl={nacl} deriveWallet={deriveWallet}
          executeSwapTx={executeSwapTx} fetchPortfolio={fetchPortfolio}
        />
      )}
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
          <DappBrowser walletAddress={pubkey} secretKey={wallet ? deriveWallet(wallet).secretKey : null} wallet={wallet} />
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
  userBubble: { alignSelf: 'flex-end', backgroundColor: C.card2, borderRadius: 16, borderBottomRightRadius: 4, padding: 12, borderWidth: 1, borderColor: C.border, maxWidth: '85%', flexShrink: 1 },
  botBubble: { alignSelf: 'flex-start', backgroundColor: C.card, borderRadius: 16, borderBottomLeftRadius: 4, padding: 12, borderWidth: 1, borderColor: C.border, maxWidth: '85%', flexShrink: 1 },
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
  stRowTxt:{ color:C.text, fontSize:15, flex:1, flexShrink:1, flexWrap:'wrap' },
  stRowVal:{ color:C.green, fontSize:15, textAlign:"right" },
  stProfileRow:{ flexDirection:'row', alignItems:'center', padding:16 },
  stAvatar:{ width:44, height:44, borderRadius:22, backgroundColor:C.border, alignItems:'center', justifyContent:'center' },
  stAvatarTxt:{ color:C.green, fontSize:20 },
  stProfileAddr:{ color:C.text, fontSize:15, fontWeight:'600' },
  stProfileSub:{ color:C.muted, fontSize:12, marginTop:2 },
});
