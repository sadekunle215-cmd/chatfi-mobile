import React, { useState, useEffect, useCallback, useRef } from 'react';
import { WebView } from 'react-native-webview';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import Svg, { Line as SvgLine, Rect as SvgRect } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import * as ExpoLinking from 'expo-linking';
import { Image, View, Text, TouchableOpacity, StyleSheet, ScrollView, TextInput, StatusBar, SafeAreaView, Modal, Alert, ActivityIndicator, Clipboard, RefreshControl, KeyboardAvoidingView, Platform, Animated, AppState, Linking } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as LocalAuthentication from 'expo-local-authentication';
import { generateWallet, getPublicKey, getPrivateKey, importWallet as deriveWallet, deriveWalletAtIndex, signAndSendTransaction, rpcFetch } from './wallet';
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
  bg: '#0d1117', card: '#1C2936', card2: '#162030',
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

const CURRENCY_SYMBOLS: Record<string,string> = {
  USD:'$', EUR:'€', GBP:'£', NGN:'₦', JPY:'¥', CNY:'¥', KRW:'₩', INR:'₹',
  BRL:'R$', CAD:'C$', AUD:'A$', CHF:'Fr', MXN:'MX$', ZAR:'R', TRY:'₺',
  AED:'د.إ', SGD:'S$', HKD:'HK$', SEK:'kr', NOK:'kr'
};

const TABS = [
  { id: 'swap', label: 'Trade', icon: 'swap-horizontal-outline', iconActive: 'swap-horizontal' },
  { id: 'portfolio', label: 'Assets', icon: 'wallet-outline', iconActive: 'wallet' },
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
  const [view, setView] = React.useState('overview');
  const [sendAddr, setSendAddr] = React.useState('');
  const [sendAmt, setSendAmt] = React.useState('');
  const [sending, setSending] = React.useState(false);
  const [pairData, setPairData] = React.useState<any>(null);
  const [timeframe, setTimeframe] = React.useState('1D');
  const [insights, setInsights] = React.useState('');
  const [activeTab, setActiveTab] = React.useState('Overview');
  const [isFavorite, setIsFavorite] = React.useState(false);
  const [topHolders, setTopHolders] = React.useState<any[]>([]);
  const [trades, setTrades] = React.useState<any[]>([]);
  const [holdersLoading, setHoldersLoading] = React.useState(false);
  const [tradesLoading, setTradesLoading] = React.useState(false);
  const [showShareCard, setShowShareCard] = React.useState(false);
  const [holderCount, setHolderCount] = React.useState<number|null>(null);

  React.useEffect(() => {
    if (!token) return;
    setActiveTab('Overview');
    setTopHolders([]); setTrades([]); setHolderCount(null);
    fetch('https://api.dexscreener.com/latest/dex/tokens/' + token.mint)
      .then(r => r.json())
      .then(d => { const pair = d?.pairs?.[0]; if (pair) setPairData(pair); })
      .catch(() => {});
    fetch('https://tokens.jup.ag/token/' + token.mint)
      .then(r => r.json())
      .then(d => { if (d?.extensions?.description) setInsights(d.extensions.description); })
      .catch(() => {});
    fetch('https://chatfi.pro/api/jupiter', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ url:`https://api.helius.xyz/v0/token-metadata?api-key=demo`, method:'POST', body:{mintAccounts:[token.mint]} })
    }).then(r=>r.json()).then(d=>{ if(d?.[0]?.onChainAccountInfo?.accountInfo?.data?.parsed?.info?.supply) {} }).catch(()=>{});
  }, [token?.mint]);

  const fetchHolders = async () => {
    if (!token?.mint || holdersLoading) return;
    setHoldersLoading(true);
    try {
      const r = await fetch('https://chatfi.pro/api/jupiter', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ url:`https://mainnet.helius-rpc.com/?api-key=demo`, method:'POST',
          body:{ jsonrpc:'2.0', id:1, method:'getTokenLargestAccounts', params:[token.mint] } })
      });
      const d = await r.json();
      const accounts = d?.result?.value || [];
      setTopHolders(accounts.slice(0,20));
      setHolderCount(accounts.length);
    } catch(e) {}
    setHoldersLoading(false);
  };

  const fetchTrades = async () => {
    if (!token?.mint || tradesLoading) return;
    setTradesLoading(true);
    try {
      const r = await fetch('https://api.dexscreener.com/latest/dex/tokens/' + token.mint);
      const d = await r.json();
      const pair = d?.pairs?.[0];
      if (pair?.pairAddress) {
        const r2 = await fetch('https://api.dexscreener.com/latest/dex/pairs/solana/' + pair.pairAddress);
        const d2 = await r2.json();
        setTrades(d2?.pairs?.[0]?.txns ? [
          { type:'Buy', vol: d2.pairs[0].volume?.h1||0, count: d2.pairs[0].txns?.h1?.buys||0, time:'1h' },
          { type:'Sell', vol: d2.pairs[0].volume?.h1||0, count: d2.pairs[0].txns?.h1?.sells||0, time:'1h' },
        ] : []);
      }
    } catch(e) {}
    setTradesLoading(false);
  };

  if (!token) return null;

  const price = pairData?.priceUsd || (token.price ? String(token.price) : null);
  const priceChange = pairData?.priceChange?.h24;
  const mktCap = pairData?.marketCap;
  const liquidity = pairData?.liquidity?.usd;
  const holders = holderCount ?? pairData?.info?.holders ?? null;
  const orgScore = pairData?.info?.openGraph?.score ?? pairData?.fdv ? Math.min(10, Math.round((pairData?.liquidity?.usd||0)/10000)) : 0;
  const twitter = pairData?.info?.socials?.find((s:any)=>s.type==='twitter')?.url;
  const website = pairData?.info?.websites?.[0]?.url;
  const positionVal = token.amount * (token.price || 0);
  const positionChange = positionVal - (token.amount * (token.avgBuy || token.price || 0));
  const fmt = (n:number) => n >= 1e6 ? '$'+(n/1e6).toFixed(2)+'M' : n >= 1e3 ? '$'+(n/1e3).toFixed(2)+'K' : '$'+n?.toFixed(2);
  const tfMap: Record<string,string> = {'1H':'15','1D':'60','1W':'240','1M':'1D','YTD':'1W'};
  const chartUrl = pairData?.pairAddress ? `https://www.geckoterminal.com/solana/pools/${pairData.pairAddress}?embed=1&info=0&swaps=0&grayscale=0&light_chart=0` : '';

  return (
    <Modal visible={!!token} animationType="slide" transparent={false} onRequestClose={onClose}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg}/>
      <SafeAreaView style={{flex:1, backgroundColor:C.bg}}>
        {view === 'overview' && (
          <View style={{flex:1}}>
            <View style={{flexDirection:'row',alignItems:'center',paddingHorizontal:16,paddingVertical:12,paddingTop:(StatusBar.currentHeight||0)+12}}>
              <TouchableOpacity onPress={onClose} style={{marginRight:12}}>
                <Ionicons name="arrow-back" size={24} color={C.text}/>
              </TouchableOpacity>
              <TokLogo uri={token.logoURI||'https://img.jup.ag/tokens/'+token.mint} fallback={''} symbol={token.symbol} style={{width:36,height:36,borderRadius:18,marginRight:10}} mint={token.mint}/>
              <View style={{flex:1}}>
                <View style={{flexDirection:'row',alignItems:'center',gap:6}}>
                  <Text style={{color:C.text,fontWeight:'bold',fontSize:17}}>{token.symbol}</Text>
                  {token.isVerified && <Ionicons name="checkmark-circle" size={16} color={C.green}/>}
                </View>
                <Text style={{color:C.muted,fontSize:11}}>{token.mint?token.mint.slice(0,8)+'...'+token.mint.slice(-4):''}</Text>
              </View>
              <TouchableOpacity style={{padding:8}} onPress={()=>setIsFavorite(f=>!f)}>
                <Ionicons name={isFavorite?'star':'star-outline'} size={22} color={isFavorite?C.green:C.text}/>
              </TouchableOpacity>
              <TouchableOpacity style={{padding:8}}>
                <Ionicons name="ellipsis-horizontal" size={22} color={C.text}/>
              </TouchableOpacity>
            </View>
            <View style={{paddingHorizontal:16,paddingBottom:8}}>
              <Text style={{color:C.text,fontWeight:'bold',fontSize:32}}>{price?'$'+Number(price).toFixed(Number(price)<0.001?8:Number(price)<0.01?6:4):'$0.00'}</Text>
              {priceChange != null && (
                <Text style={{color:priceChange>=0?C.green:'#ff4444',fontSize:14,marginTop:2}}>
                  {priceChange>=0?'+':''}{priceChange?.toFixed(2)}% (24h)
                </Text>
              )}
            </View>
            <View style={{flexDirection:'row',paddingHorizontal:16,paddingBottom:12,gap:12}}>
              <View style={{alignItems:'center'}}>
                <Text style={{color:C.muted,fontSize:10,letterSpacing:0.5}}>MKT CAP</Text>
                <Text style={{color:C.text,fontSize:12,fontWeight:'700'}}>{mktCap?fmt(mktCap):'—'}</Text>
              </View>
              <View style={{width:1,backgroundColor:C.border}}/>
              <View style={{alignItems:'center'}}>
                <Text style={{color:C.muted,fontSize:10,letterSpacing:0.5}}>LIQUIDITY</Text>
                <Text style={{color:C.text,fontSize:12,fontWeight:'700'}}>{liquidity?fmt(liquidity):'—'}</Text>
              </View>
              <View style={{width:1,backgroundColor:C.border}}/>
              <View style={{alignItems:'center'}}>
                <Text style={{color:C.muted,fontSize:10,letterSpacing:0.5}}>HOLDERS</Text>
                <Text style={{color:C.text,fontSize:12,fontWeight:'700'}}>{holders||'—'}</Text>
              </View>
              <View style={{width:1,backgroundColor:C.border}}/>
              <View style={{alignItems:'center'}}>
                <Text style={{color:C.muted,fontSize:10,letterSpacing:0.5}}>ORG SCORE</Text>
                <Text style={{color:orgScore>0?C.green:'#ff4444',fontSize:12,fontWeight:'700'}}>{orgScore}</Text>
              </View>
            </View>
            <View style={{flexDirection:'row',paddingHorizontal:16,marginBottom:4,gap:4}}>
              {['1H','1D','1W','1M','YTD'].map(tf=>(
                <TouchableOpacity key={tf} onPress={()=>setTimeframe(tf)}
                  style={{paddingHorizontal:12,paddingVertical:6,borderRadius:8,backgroundColor:timeframe===tf?C.green:'transparent'}}>
                  <Text style={{color:timeframe===tf?'#0d1117':C.muted,fontSize:13,fontWeight:'600'}}>{tf}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={{height:220}}>
              {chartUrl ? (
              <WebView
                source={{uri: chartUrl}}
                style={{flex:1,backgroundColor:C.bg}}
                javaScriptEnabled={true}
                domStorageEnabled={true}
                startInLoadingState={true}
                renderLoading={()=>(
                  <View style={{flex:1,alignItems:'center',justifyContent:'center',backgroundColor:C.bg}}>
                    <ActivityIndicator color={C.green}/>
                    <Text style={{color:C.muted,fontSize:12,marginTop:8}}>Loading chart...</Text>
                  </View>
                )}
              />
              ) : (
              <View style={{flex:1,alignItems:'center',justifyContent:'center',backgroundColor:C.bg}}>
                <ActivityIndicator color={C.green}/>
                <Text style={{color:C.muted,fontSize:12,marginTop:8}}>Fetching pair data...</Text>
              </View>
              )}
            </View>
            <View style={{flexDirection:'row',borderBottomWidth:1,borderBottomColor:C.border}}>
              {['Overview','Terminal','Live Feed'].map(tab=>(
                <TouchableOpacity key={tab} onPress={()=>{setActiveTab(tab);if(tab==='Terminal')fetchHolders();if(tab==='Live Feed')fetchTrades();}} style={{flex:1,paddingVertical:12,alignItems:'center',borderBottomWidth:2,borderBottomColor:tab===activeTab?C.green:'transparent'}}>
                  <Text style={{color:tab===activeTab?C.green:C.muted,fontSize:14,fontWeight:'600'}}>{tab}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <ScrollView style={{flex:1}} showsVerticalScrollIndicator={false}>
              {token.amount > 0 && (
                <View style={{margin:16,backgroundColor:C.card,borderRadius:16,padding:16}}>
                  <View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
                    <View style={{flexDirection:'row',alignItems:'center',gap:6}}>
                      <Ionicons name="bar-chart-outline" size={16} color={C.green}/>
                      <Text style={{color:C.green,fontWeight:'700',fontSize:14}}>Position</Text>
                    </View>
                    <TouchableOpacity onPress={()=>setShowShareCard(true)} style={{flexDirection:'row',alignItems:'center',gap:4}}>
                      <Ionicons name="share-outline" size={14} color={C.muted}/>
                      <Text style={{color:C.muted,fontSize:13}}>Share</Text>
                    </TouchableOpacity>
                  </View>
                  <Text style={{color:C.text,fontWeight:'bold',fontSize:22}}>{fmt(positionVal)}</Text>
                  <Text style={{color:C.muted,fontSize:13}}>{token.amount.toFixed(4)} {token.symbol}</Text>
                  <Text style={{color:positionChange>=0?C.green:'#ff4444',fontSize:14,marginTop:4}}>
                    {positionChange>=0?'+':''}{fmt(Math.abs(positionChange))}
                  </Text>
                </View>
              )}
              {(twitter || website) && (
                <View style={{flexDirection:'row',paddingHorizontal:16,gap:8,marginBottom:16,flexWrap:'wrap'}}>
                  {twitter && (
                    <TouchableOpacity onPress={()=>Linking.openURL(twitter)}
                      style={{flexDirection:'row',alignItems:'center',gap:6,backgroundColor:C.card,borderRadius:20,paddingHorizontal:14,paddingVertical:8}}>
                      <Ionicons name="logo-twitter" size={14} color={C.text}/>
                      <Text style={{color:C.text,fontSize:13}}>Twitter</Text>
                    </TouchableOpacity>
                  )}
                  {website && (
                    <TouchableOpacity onPress={()=>Linking.openURL(website)}
                      style={{flexDirection:'row',alignItems:'center',gap:6,backgroundColor:C.card,borderRadius:20,paddingHorizontal:14,paddingVertical:8}}>
                      <Ionicons name="globe-outline" size={14} color={C.text}/>
                      <Text style={{color:C.text,fontSize:13}}>Website</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
              {insights ? (
                <View style={{paddingHorizontal:16,marginBottom:24}}>
                  <Text style={{color:C.text,fontWeight:'bold',fontSize:16,marginBottom:8}}>Token Insights</Text>
                  <Text style={{color:C.muted,fontSize:14,lineHeight:22}}>{insights}</Text>
                </View>
              ) : null}
              {/* Terminal Tab */}
              {activeTab === 'Terminal' && (
                <View style={{padding:16}}>
                  <Text style={{color:C.text,fontWeight:'700',fontSize:16,marginBottom:12}}>Top Holders</Text>
                  {holdersLoading && <ActivityIndicator color={C.green} style={{marginTop:20}}/>}
                  {!holdersLoading && topHolders.length === 0 && (
                    <Text style={{color:C.muted,textAlign:'center',marginTop:20}}>No holder data available</Text>
                  )}
                  {topHolders.map((h:any,i:number)=>(
                    <View key={i} style={{flexDirection:'row',alignItems:'center',paddingVertical:10,borderBottomWidth:1,borderBottomColor:C.border}}>
                      <Text style={{color:C.muted,fontSize:13,width:28}}>#{i+1}</Text>
                      <Text style={{color:C.green,fontSize:13,flex:1,fontFamily:'monospace'}} numberOfLines={1}>
                        {h.address ? h.address.slice(0,8)+'...'+h.address.slice(-4) : '—'}
                      </Text>
                      <Text style={{color:C.text,fontSize:13,fontWeight:'600'}}>
                        {h.uiAmount ? Number(h.uiAmount).toLocaleString(undefined,{maximumFractionDigits:0}) : '—'}
                      </Text>
                    </View>
                  ))}
                </View>
              )}

              {/* Live Feed Tab */}
              {activeTab === 'Live Feed' && (
                <View style={{padding:16}}>
                  <Text style={{color:C.text,fontWeight:'700',fontSize:16,marginBottom:12}}>Trading Activity</Text>
                  {tradesLoading && <ActivityIndicator color={C.green} style={{marginTop:20}}/>}
                  {!tradesLoading && trades.length === 0 && (
                    <Text style={{color:C.muted,textAlign:'center',marginTop:20}}>No trading data available</Text>
                  )}
                  {pairData && (
                    <View style={{gap:10}}>
                      {[{label:'5m Buys',val:pairData.txns?.m5?.buys,color:C.green},{label:'5m Sells',val:pairData.txns?.m5?.sells,color:'#ff4444'},
                        {label:'1h Buys',val:pairData.txns?.h1?.buys,color:C.green},{label:'1h Sells',val:pairData.txns?.h1?.sells,color:'#ff4444'},
                        {label:'24h Buys',val:pairData.txns?.h24?.buys,color:C.green},{label:'24h Sells',val:pairData.txns?.h24?.sells,color:'#ff4444'},
                        {label:'24h Vol',val:pairData.volume?.h24,color:C.text,prefix:'$'},{label:'6h Vol',val:pairData.volume?.h6,color:C.text,prefix:'$'},
                      ].map((item:any,i:number)=>(
                        <View key={i} style={{flexDirection:'row',justifyContent:'space-between',backgroundColor:C.card,borderRadius:10,padding:12}}>
                          <Text style={{color:C.muted,fontSize:14}}>{item.label}</Text>
                          <Text style={{color:item.color,fontSize:14,fontWeight:'700'}}>{item.prefix||''}{item.val!=null?Number(item.val).toLocaleString():'—'}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              )}
            </ScrollView>
            <View style={{flexDirection:'row',gap:10,padding:16,borderTopWidth:1,borderTopColor:C.border}}>
              <TouchableOpacity onPress={()=>setView('receive')}
                style={{flex:1,backgroundColor:C.card,borderRadius:14,padding:14,alignItems:'center',flexDirection:'row',justifyContent:'center',gap:6}}>
                <Ionicons name="arrow-down-outline" size={18} color={C.text}/>
                <Text style={{color:C.text,fontWeight:'600'}}>Receive</Text>
              </TouchableOpacity>
              <TouchableOpacity style={{flex:1,backgroundColor:'#ff4444',borderRadius:14,padding:14,alignItems:'center',justifyContent:'center'}}>
                <Text style={{color:'#fff',fontWeight:'bold'}}>Sell</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={()=>setView('send')}
                style={{flex:1,backgroundColor:C.green,borderRadius:14,padding:14,alignItems:'center',justifyContent:'center'}}>
                <Text style={{color:'#0d1117',fontWeight:'bold'}}>Send</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
        {/* Share Card Modal */}
        {showShareCard && (
          <Modal visible={showShareCard} transparent animationType="fade">
            <View style={{flex:1,backgroundColor:'rgba(0,0,0,0.85)',alignItems:'center',justifyContent:'center',padding:24}}>
              <View style={{backgroundColor:'#0d1a0d',borderRadius:24,padding:24,width:'100%',borderWidth:1,borderColor:C.green}}>
                <View style={{flexDirection:'row',alignItems:'center',gap:12,marginBottom:20}}>
                  <TokLogo uri={token.logoURI||''} symbol={token.symbol} style={{width:44,height:44,borderRadius:22}} mint={token.mint}/>
                  <View style={{flex:1}}>
                    <Text style={{color:C.text,fontWeight:'bold',fontSize:18}}>{token.symbol}</Text>
                    <Text style={{color:C.muted,fontSize:12}}>{token.mint?.slice(0,8)}...{token.mint?.slice(-4)}</Text>
                  </View>
                  <Text style={{color:C.muted,fontSize:12}}>via ChatFi</Text>
                </View>
                <Text style={{color:positionChange>=0?C.green:'#ff4444',fontSize:40,fontWeight:'bold'}}>
                  {positionChange>=0?'+':''}{fmt(Math.abs(positionChange))}
                </Text>
                <Text style={{color:C.muted,fontSize:16,marginTop:4}}>{positionChange>=0?'+':''}{((positionChange/((positionVal-positionChange)||1))*100).toFixed(2)}%</Text>
                <View style={{flexDirection:'row',gap:20,marginTop:16,marginBottom:20}}>
                  <View><Text style={{color:C.muted,fontSize:12}}>Holdings</Text><Text style={{color:C.text,fontWeight:'700'}}>{fmt(positionVal)}</Text></View>
                  <View><Text style={{color:C.muted,fontSize:12}}>Price</Text><Text style={{color:C.text,fontWeight:'700'}}>${Number(price||0).toFixed(6)}</Text></View>
                  <View><Text style={{color:C.muted,fontSize:12}}>Amount</Text><Text style={{color:C.text,fontWeight:'700'}}>{token.amount?.toFixed(2)}</Text></View>
                </View>
                <View style={{backgroundColor:'#0a120a',borderRadius:12,padding:12,alignItems:'center',marginBottom:16}}>
                  <Text style={{color:C.green,fontWeight:'bold',fontSize:14}}>chatfi.pro</Text>
                  <Text style={{color:C.muted,fontSize:11}}>Your AI DeFi co-pilot on Solana</Text>
                </View>
                <View style={{flexDirection:'row',gap:10}}>
                  <TouchableOpacity onPress={()=>setShowShareCard(false)}
                    style={{flex:1,backgroundColor:C.card,borderRadius:12,padding:14,alignItems:'center'}}>
                    <Text style={{color:C.text,fontWeight:'600'}}>Close</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={()=>Alert.alert('Share','Share feature coming soon!')}
                    style={{flex:2,backgroundColor:C.green,borderRadius:12,padding:14,alignItems:'center'}}>
                    <Text style={{color:'#0d1117',fontWeight:'bold'}}>Share Card</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>
        )}
        {view === 'receive' && (
          <ScrollView contentContainerStyle={{padding:16,paddingTop:(StatusBar.currentHeight||0)+16}}>
            <TouchableOpacity onPress={()=>setView('overview')} style={{marginBottom:16}}>
              <Text style={{color:C.text,fontSize:16}}>‹ Back</Text>
            </TouchableOpacity>
            <Text style={{color:C.text,fontWeight:'bold',fontSize:16,marginBottom:16,textAlign:'center'}}>Receive {token.symbol}</Text>
            <View style={{backgroundColor:C.card,borderRadius:16,padding:20,alignItems:'center',marginBottom:16}}>
              <Image source={{uri:'https://api.qrserver.com/v1/create-qr-code/?size=200x200&data='+(pubkey||'')}} style={{width:200,height:200,borderRadius:8}}/>
            </View>
            <Text style={{color:C.muted,fontSize:12,textAlign:'center',marginBottom:8}}>Your wallet address</Text>
            <TouchableOpacity onPress={()=>Alert.alert('Copied',pubkey||'')} style={{backgroundColor:C.card,borderRadius:12,padding:14}}>
              <Text style={{color:C.green,fontSize:12,fontFamily:'monospace',textAlign:'center'}}>{pubkey}</Text>
            </TouchableOpacity>
          </ScrollView>
        )}
        {view === 'send' && (
          <ScrollView contentContainerStyle={{padding:16,paddingTop:(StatusBar.currentHeight||0)+16}}>
            <TouchableOpacity onPress={()=>setView('overview')} style={{marginBottom:16}}>
              <Text style={{color:C.text,fontSize:16}}>‹ Back</Text>
            </TouchableOpacity>
            <Text style={{color:C.text,fontWeight:'bold',fontSize:16,marginBottom:16}}>Send {token.symbol}</Text>
            <Text style={{color:C.muted,fontSize:13,marginBottom:6}}>Recipient Address</Text>
            <TextInput value={sendAddr} onChangeText={setSendAddr}
              placeholder="Enter Solana address..." placeholderTextColor={C.muted}
              style={{backgroundColor:C.card,color:C.text,borderRadius:12,padding:14,fontSize:13,marginBottom:16}}
              autoCapitalize="none"/>
            <Text style={{color:C.muted,fontSize:13,marginBottom:6}}>Amount ({token.symbol})</Text>
            <TextInput value={sendAmt} onChangeText={setSendAmt}
              placeholder="0.00" placeholderTextColor={C.muted} keyboardType="numeric"
              style={{backgroundColor:C.card,color:C.text,borderRadius:12,padding:14,fontSize:20,fontWeight:'bold',marginBottom:24}}/>
            <TouchableOpacity style={{backgroundColor:C.green,borderRadius:14,padding:16,alignItems:'center',opacity:sending?0.6:1}}
              disabled={sending}
              onPress={async()=>{
                if(!sendAddr.trim()){Alert.alert('Error','Enter recipient address');return;}
                if(!sendAmt||isNaN(parseFloat(sendAmt))){Alert.alert('Error','Enter a valid amount');return;}
                setSending(true);
                try{
                  await onSend(token.mint,sendAddr.trim(),sendAmt,token.symbol,token.decimals??6);
                  setSendAddr('');setSendAmt('');setView('overview');
                }catch(e:any){Alert.alert('Send failed',e.message||'Unknown error');}
                finally{setSending(false);}
              }}>
              {sending?<ActivityIndicator color="#0d1117"/>:<Text style={{color:'#0d1117',fontWeight:'bold',fontSize:16}}>Send {token.symbol}</Text>}
            </TouchableOpacity>
          </ScrollView>
        )}
      </SafeAreaView>
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
function AccountModal({ visible, onClose, pubkey, wallet, onRemoveWallet, userName, setUserName, accounts, setAccounts, activeAccIdx, switchAccount, addAccount, setChangingPasscode }: any) {
  const [view, setView] = React.useState('main');
  const [nameInput, setNameInput] = React.useState(userName || '');
  React.useEffect(() => { setNameInput(userName || ''); }, [userName]);
  const [notifEnabled, setNotifEnabled] = React.useState(false);
  const [notifSettings, setNotifSettings] = React.useState<any>({ receivedTokens:true, receivedCollectibles:true, sentTokens:false, sentCollectibles:false, priceAlerts:true });
  const [newAccName, setNewAccName] = React.useState('Account ' + ((accounts||[]).length + 1));
  const [privKeyInput, setPrivKeyInput] = React.useState('');
  const [privKeyName, setPrivKeyName] = React.useState('');
  const [watchAddr, setWatchAddr] = React.useState('');
  const [watchName, setWatchName] = React.useState('');
  const [importSeedInput, setImportSeedInput] = React.useState('');
  const [discoveredAccounts, setDiscoveredAccounts] = React.useState<any[]>([]);
  const [selectedAccIdxs, setSelectedAccIdxs] = React.useState<number[]>([]);
  const [discovering, setDiscovering] = React.useState(false);
  const [menuAccIdx, setMenuAccIdx] = React.useState<number|null>(null);
  const [managingAcc, setManagingAcc] = React.useState<any>(null);
  const [managingAccIdx, setManagingAccIdx] = React.useState<number>(-1);
  const [editName, setEditName] = React.useState('');
  const [showWarning, setShowWarning] = React.useState<'seed'|'key'|null>(null);
  const [revealed, setRevealed] = React.useState(false);
  const [revealData, setRevealData] = React.useState('');
  const [revealType, setRevealType] = React.useState('');
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
                  {(accounts||[])[activeAccIdx]?.avatar
                    ? <Text style={{fontSize:22}}>{(accounts||[])[activeAccIdx].avatar}</Text>
                    : <Text style={{ color:'#0d1117', fontWeight:'bold', fontSize:18 }}>{userName ? userName[0].toUpperCase() : 'CF'}</Text>
                  }
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
              <Text style={{ color:C.muted, fontSize:11, fontWeight:'600', paddingHorizontal:16, marginBottom:8, letterSpacing:1, paddingRight: 2 }}>YOUR ACCOUNTS</Text>
              <View style={{ marginHorizontal:16, backgroundColor:'#1c2128', borderRadius:14, marginBottom:16, overflow:'hidden' }}>
                {(accounts||[]).map((acc:any, idx:number) => (
                  <TouchableOpacity key={idx} onPress={() => { switchAccount(idx); onClose(); }}
                    style={{ flexDirection:'row', alignItems:'center', padding:16, borderBottomWidth: idx < (accounts||[]).length-1 ? 1 : 0, borderBottomColor:'#30363d' }}>
                    <View style={{ width:40, height:40, borderRadius:20, backgroundColor:C.green, alignItems:'center', justifyContent:'center', marginRight:12 }}>
                      {acc.avatar
                        ? <Text style={{fontSize:22}}>{acc.avatar}</Text>
                        : <Text style={{ color:'#0d1117', fontWeight:'bold' }}>{acc.name?.[0]||'A'}</Text>
                      }
                    </View>
                    <View style={{ flex:1 }}>
                      <Text style={{ color:C.text, fontWeight:'600' }}>{acc.name}</Text>
                      <Text style={{ color:C.muted, fontSize:12 }}>{(acc.pubkey||'').slice(0,6)+'...'+(acc.pubkey||'').slice(-4)}</Text>
                    </View>
                    {idx === activeAccIdx && <Text style={{ color:C.green, fontSize:16 }}>✓</Text>}
                  </TouchableOpacity>
                ))}
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


          {view === 'manageAccounts' && (
            <ScrollView>
              <View style={{ flexDirection:'row', alignItems:'center', padding:20, borderBottomWidth:1, borderBottomColor:'#30363d' }}>
                <TouchableOpacity onPress={() => setView('main')} style={{ marginRight:12 }}>
                  <Text style={{ color:C.text, fontSize:20 }}>‹</Text>
                </TouchableOpacity>
                <Text style={{ color:C.text, fontSize:18, fontWeight:'bold', flex:1 }}>Manage Accounts</Text>
                <TouchableOpacity onPress={() => setView('addAccount')}
                  style={{ width:32, height:32, borderRadius:16, backgroundColor:'#1c2128', alignItems:'center', justifyContent:'center' }}>
                  <Text style={{ color:C.green, fontSize:22, lineHeight:28 }}>+</Text>
                </TouchableOpacity>
              </View>
              <View style={{ margin:16, backgroundColor:'#1c2128', borderRadius:14, overflow:'hidden' }}>
                <TextInput placeholder="Search accounts..." placeholderTextColor={C.muted}
                  style={{ backgroundColor:'#0d1117', color:C.text, borderRadius:10, margin:10, padding:10, fontSize:14 }}
                  autoCapitalize="none" />
                {(accounts||[]).map((acc:any, idx:number) => (
                  <TouchableOpacity key={acc.id} onPress={() => switchAccount(idx)}
                    style={{ flexDirection:'row', alignItems:'center', padding:16, borderBottomWidth:1, borderBottomColor:'#30363d' }}>
                    <View style={{ width:36, height:36, borderRadius:18, backgroundColor:C.green, alignItems:'center', justifyContent:'center', marginRight:12 }}>
                      {acc.avatar
                        ? <Text style={{fontSize:20}}>{acc.avatar}</Text>
                        : <Text style={{ color:'#0d1117', fontWeight:'bold', fontSize:14 }}>{acc.name?acc.name[0]:'A'}</Text>
                      }
                    </View>
                    <View style={{ flex:1 }}>
                      <Text style={{ color:C.text, fontSize:15, fontWeight:'600' }}>{acc.name}</Text>
                      <Text style={{ color:C.muted, fontSize:12 }}>{(acc.pubkey||acc.publicKey||'').slice(0,6)+'...'+(acc.pubkey||acc.publicKey||'').slice(-4)}</Text>
                    </View>
                    {idx === activeAccIdx && <Text style={{ color:C.green, fontSize:18 }}>✓</Text>}
                  </TouchableOpacity>
                ))}
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
                {[
                  { label:'Create New Account', sub:'Add a new account', icon:'add-circle-outline', onPress: () => setView('createAccount') },
                  { label:'Import Recovery Phrase', sub:'Restore from 12 or 24 word phrase', icon:'document-text-outline', onPress: () => setView('importPhrase') },
                  { label:'Import Private Key', sub:'Import a single account', icon:'download-outline', onPress: () => setView('importPrivKey') },
                  { label:'Watch Address', sub:'Track any public wallet address', icon:'eye-outline', onPress: () => setView('watchAddress') },
                ].map((item, i) => (
                  <TouchableOpacity key={i} onPress={item.onPress}
                    style={{ flexDirection:'row', alignItems:'center', backgroundColor:'#1c2128', borderRadius:14, padding:18, borderWidth:1, borderColor:'#30363d' }}>
                    <View style={{ width:40, height:40, borderRadius:20, backgroundColor:'#0d1117', alignItems:'center', justifyContent:'center', marginRight:14 }}>
                      <Ionicons name={item.icon as any} size={20} color={C.green} />
                    </View>
                    <View style={{ flex:1 }}>
                      <Text style={{ color:C.text, fontWeight:'bold', fontSize:15 }}>{item.label}</Text>
                      <Text style={{ color:C.muted, fontSize:12, marginTop:2 }}>{item.sub}</Text>
                    </View>
                    <Text style={{ color:C.muted, fontSize:18 }}>›</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          )}

          {view === 'createAccount' && (
            <ScrollView>
              <View style={{ flexDirection:'row', alignItems:'center', padding:20, borderBottomWidth:1, borderBottomColor:'#30363d' }}>
                <TouchableOpacity onPress={() => setView('addAccount')} style={{ marginRight:12 }}>
                  <Text style={{ color:C.text, fontSize:20 }}>‹</Text>
                </TouchableOpacity>
                <Text style={{ color:C.text, fontSize:18, fontWeight:'bold', flex:1 }}>Create Account</Text>
                <TouchableOpacity onPress={onClose}>
                  <Text style={{ color:C.muted, fontSize:22 }}>✕</Text>
                </TouchableOpacity>
              </View>
              <View style={{ padding:20 }}>
                <TextInput
                  value={newAccName}
                  onChangeText={setNewAccName}
                  style={{ backgroundColor:'#1c2128', color:C.text, borderRadius:12, padding:14, fontSize:15, marginBottom:24 }}
                  placeholderTextColor={C.muted}
                />
                <TouchableOpacity onPress={async () => {
                  const raw = await AsyncStorage.getItem('accounts');
                  const existing = raw ? JSON.parse(raw) : [];
                  addAccount();
                  const updated = await AsyncStorage.getItem('accounts');
                  const final = updated ? JSON.parse(updated) : existing;
                  if(final.length > 0 && newAccName.trim()) {
                    final[final.length-1].name = newAccName.trim();
                    await AsyncStorage.setItem('accounts', JSON.stringify(final));
                  }
                  switchAccount(final.length-1);
                  onClose();
                }}
                  style={{ backgroundColor:C.green, borderRadius:14, padding:16, alignItems:'center' }}>
                  <Text style={{ color:'#0d1117', fontWeight:'bold', fontSize:16 }}>Create</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          )}

          {view === 'importPhrase' && (
            <ScrollView>
              <View style={{ flexDirection:'row', alignItems:'center', padding:20, borderBottomWidth:1, borderBottomColor:'#30363d' }}>
                <TouchableOpacity onPress={() => setView('addAccount')} style={{ marginRight:12 }}>
                  <Text style={{ color:C.text, fontSize:20 }}>‹</Text>
                </TouchableOpacity>
                <Text style={{ color:C.text, fontSize:18, fontWeight:'bold', flex:1 }}>Import Recovery Phrase</Text>
                <TouchableOpacity onPress={onClose}>
                  <Text style={{ color:C.muted, fontSize:22 }}>✕</Text>
                </TouchableOpacity>
              </View>
              <View style={{ padding:20 }}>
                <Text style={{ color:C.muted, fontSize:13, marginBottom:12, lineHeight:20 }}>
                  Restore an existing wallet with your 12 or 24-word recovery phrase
                </Text>
                <TextInput
                  value={importSeedInput}
                  onChangeText={setImportSeedInput}
                  placeholder="Recovery Phrase"
                  placeholderTextColor={C.muted}
                  multiline numberOfLines={4}
                  autoCapitalize="none"
                  style={{ backgroundColor:'#1c2128', color:C.text, borderRadius:12, padding:14, fontSize:14, minHeight:100, marginBottom:16 }}
                />
                <TouchableOpacity onPress={async () => {
                  const words = importSeedInput.trim().split(/\s+/);
                  if(words.length !== 12 && words.length !== 24){
                    Alert.alert('Invalid','Enter a valid 12 or 24 word seed phrase'); return;
                  }
                  try {
                    const { publicKey: pk } = deriveWallet(importSeedInput.trim());
                    const raw = await AsyncStorage.getItem('accounts');
                    const existing = raw ? JSON.parse(raw) : [];
                    const newAcc = { id: existing.length+1 as number, name:'Account '+(existing.length+1), mnemonic: importSeedInput.trim(), pubkey: pk };
                    const updated = [...existing, newAcc];
                    await AsyncStorage.setItem('accounts', JSON.stringify(updated));
                    await AsyncStorage.setItem('active_acc', String(existing.length));
                    switchAccount(updated.length-1);
                    setImportSeedInput('');
                    onClose();
                  } catch { Alert.alert('Error','Invalid seed phrase'); }
                }}
                  style={{ backgroundColor:C.green, borderRadius:14, padding:16, alignItems:'center' }}>
                  <Text style={{ color:'#0d1117', fontWeight:'bold', fontSize:16 }}>Import</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          )}

          {view === 'importPrivKey' && (
            <ScrollView>
              <View style={{ flexDirection:'row', alignItems:'center', padding:20, borderBottomWidth:1, borderBottomColor:'#30363d' }}>
                <TouchableOpacity onPress={() => setView('addAccount')} style={{ marginRight:12 }}>
                  <Text style={{ color:C.text, fontSize:20 }}>‹</Text>
                </TouchableOpacity>
                <Text style={{ color:C.text, fontSize:18, fontWeight:'bold', flex:1 }}>Import Private Key</Text>
                <TouchableOpacity onPress={onClose}>
                  <Text style={{ color:C.muted, fontSize:22 }}>✕</Text>
                </TouchableOpacity>
              </View>
              <View style={{ padding:20, gap:12 }}>
                <View style={{ backgroundColor:'#1c2128', borderRadius:12, padding:14, flexDirection:'row', alignItems:'center', justifyContent:'space-between' }}>
                  <Text style={{ color:C.text, fontSize:15, fontWeight:'600' }}>Network</Text>
                  <Text style={{ color:C.muted, fontSize:14 }}>Solana ›</Text>
                </View>
                <TextInput value={privKeyName} onChangeText={setPrivKeyName}
                  placeholder="Name" placeholderTextColor={C.muted}
                  style={{ backgroundColor:'#1c2128', color:C.text, borderRadius:12, padding:14, fontSize:14 }} />
                <View style={{ backgroundColor:'#1c2128', borderRadius:12, padding:14, flexDirection:'row', alignItems:'center' }}>
                  <TextInput value={privKeyInput} onChangeText={setPrivKeyInput}
                    placeholder="Private key" placeholderTextColor={C.muted}
                    autoCapitalize="none" secureTextEntry
                    style={{ flex:1, color:C.text, fontSize:14 }} />
                  <TouchableOpacity onPress={async () => {
                    const txt = await Clipboard.getString();
                    setPrivKeyInput(txt);
                  }}>
                    <Text style={{ color:C.green, fontWeight:'bold', fontSize:14 }}>Paste</Text>
                  </TouchableOpacity>
                </View>
                <TouchableOpacity onPress={async () => {
                  if(!privKeyInput.trim()){ Alert.alert('Error','Enter a private key'); return; }
                  try {
                    const keyBytes = Uint8Array.from(JSON.parse(privKeyInput.trim()));
                    const kp = nacl.sign.keyPair.fromSecretKey(keyBytes);
                    const bs58 = (bytes: Uint8Array) => {
                      const ALPHABET='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
                      let d=[],carry=0;
                      for(let i=0;i<bytes.length;i++){carry=bytes[i];for(let j=0;j<d.length;j++){carry+=d[j]<<8;d[j]=carry%58;carry=Math.floor(carry/58);}while(carry>0){d.push(carry%58);carry=Math.floor(carry/58);}}
                      return bytes.slice(0,bytes.findIndex(x=>x!==0)).map(()=>'1').join('')+d.reverse().map(x=>ALPHABET[x]).join('');
                    };
                    const pk = bs58(kp.publicKey);
                    const raw = await AsyncStorage.getItem('accounts');
                    const existing = raw ? JSON.parse(raw) : [];
                    const name = privKeyName.trim() || 'Account '+(existing.length+1);
                    const newAcc = { id: existing.length+1, name, privkey: privKeyInput.trim(), pubkey: pk };
                    const updated = [...existing, newAcc];
                    await AsyncStorage.setItem('accounts', JSON.stringify(updated));
                    await AsyncStorage.setItem('active_acc', String(existing.length));
                    switchAccount(updated.length-1);
                    setPrivKeyInput(''); setPrivKeyName('');
                    onClose();
                  } catch { Alert.alert('Error','Invalid private key'); }
                }}
                  style={{ backgroundColor:C.green, borderRadius:14, padding:16, alignItems:'center', marginTop:8 }}>
                  <Text style={{ color:'#0d1117', fontWeight:'bold', fontSize:16 }}>Import</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          )}

          {view === 'watchAddress' && (
            <ScrollView>
              <View style={{ flexDirection:'row', alignItems:'center', padding:20, borderBottomWidth:1, borderBottomColor:'#30363d' }}>
                <TouchableOpacity onPress={() => setView('addAccount')} style={{ marginRight:12 }}>
                  <Text style={{ color:C.text, fontSize:20 }}>‹</Text>
                </TouchableOpacity>
                <Text style={{ color:C.text, fontSize:18, fontWeight:'bold', flex:1 }}>Watch Address</Text>
                <TouchableOpacity onPress={onClose}>
                  <Text style={{ color:C.muted, fontSize:22 }}>✕</Text>
                </TouchableOpacity>
              </View>
              <View style={{ padding:20, gap:12 }}>
                <Text style={{ color:C.muted, fontSize:13, lineHeight:20 }}>
                  Add an address or domain name you would like to watch. You'll have view-only access and won't be able to sign transactions or messages.
                </Text>
                <View style={{ backgroundColor:'#1c2128', borderRadius:12, padding:14, flexDirection:'row', alignItems:'center', justifyContent:'space-between' }}>
                  <Text style={{ color:C.text, fontSize:15, fontWeight:'600' }}>Network</Text>
                  <Text style={{ color:C.muted, fontSize:14 }}>Solana ›</Text>
                </View>
                <TextInput value={watchName} onChangeText={setWatchName}
                  placeholder="Name" placeholderTextColor={C.muted}
                  style={{ backgroundColor:'#1c2128', color:C.text, borderRadius:12, padding:14, fontSize:14 }} />
                <View style={{ backgroundColor:'#1c2128', borderRadius:12, padding:14, flexDirection:'row', alignItems:'center' }}>
                  <TextInput value={watchAddr} onChangeText={setWatchAddr}
                    placeholder="Address or Domain" placeholderTextColor={C.muted}
                    autoCapitalize="none"
                    style={{ flex:1, color:C.text, fontSize:14 }} />
                  <TouchableOpacity onPress={async () => {
                    const txt = await Clipboard.getString();
                    setWatchAddr(txt);
                  }}>
                    <Text style={{ color:C.green, fontWeight:'bold', fontSize:14 }}>Paste</Text>
                  </TouchableOpacity>
                </View>
                <TouchableOpacity onPress={async () => {
                  if(!watchAddr.trim()){ Alert.alert('Error','Enter an address'); return; }
                  const raw = await AsyncStorage.getItem('accounts');
                  const existing = raw ? JSON.parse(raw) : [];
                  const name = watchName.trim() || 'Watch '+(existing.length+1);
                  const newAcc = { id: existing.length+1, name, pubkey: watchAddr.trim(), watchOnly: true };
                  const updated = [...existing, newAcc];
                  await AsyncStorage.setItem('accounts', JSON.stringify(updated));
                  await AsyncStorage.setItem('active_acc', String(existing.length));
                  switchAccount(updated.length-1);
                  setWatchAddr(''); setWatchName('');
                  onClose();
                }}
                  style={{ backgroundColor:C.green, borderRadius:14, padding:16, alignItems:'center', marginTop:8 }}>
                  <Text style={{ color:'#0d1117', fontWeight:'bold', fontSize:16 }}>Import</Text>
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

  function handleMessage(e) {
    try {
      const data = JSON.parse(typeof e.data === 'string' ? e.data : JSON.stringify(e.data));
      if (data.id && callbacks[data.id]) {
        if (data.error) callbacks[data.id].reject(new Error(data.error));
        else callbacks[data.id].resolve(data.result);
        delete callbacks[data.id];
      }
    } catch(err) {}
  }
  document.addEventListener('message', handleMessage);
  window.addEventListener('message', handleMessage);

  const addr = '\${PUBLIC_KEY}';
  const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  function bs58Decode(s) {
    const bytes = [0];
    for (let i = 0; i < s.length; i++) {
      let carry = ALPHABET.indexOf(s[i]);
      for (let j = 0; j < bytes.length; j++) { carry += bytes[j] * 58; bytes[j] = carry & 0xff; carry >>= 8; }
      while (carry > 0) { bytes.push(carry & 0xff); carry >>= 8; }
    }
    for (let i = 0; i < s.length && s[i] === '1'; i++) bytes.push(0);
    return new Uint8Array(bytes.reverse());
  }
  const addrBytes = addr ? bs58Decode(addr) : new Uint8Array(32);
  const publicKey = {
    toString: () => addr,
    toBase58: () => addr,
    toBytes: () => addrBytes,
    equals: (other) => other?.toBase58?.() === addr,
    toJSON: () => addr,
  };

  const wallet = {
    isPhantom: false,
    isChatFi: true,
    isSolflare: false,
    isTrust: false,
    isBackpack: false,
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
      let b64;
      try {
        const bytes = tx.serialize({ requireAllSignatures: false, verifySignatures: false });
        b64 = btoa(String.fromCharCode(...new Uint8Array(bytes)));
      } catch {
        try { b64 = btoa(String.fromCharCode(...new Uint8Array(tx.serialize()))); }
        catch { b64 = btoa(String.fromCharCode(...new Uint8Array(tx.message?.serialize ? tx.message.serialize() : []))); }
      }
      const signedB64 = await sendToNative('signTransaction', { tx: b64 });
      // Return signed tx bytes so dapp can use them
      try {
        const signedBytes = Uint8Array.from(atob(signedB64), c => c.charCodeAt(0));
        if (tx.signatures !== undefined) {
          // Legacy transaction - populate signature
          const sig = signedBytes.slice(1, 65);
          if (tx.signatures[0]) tx.signatures[0].signature = Buffer.from(sig);
        }
      } catch(e) {}
      return tx;
    },
    signAllTransactions: async (txs) => Promise.all(txs.map(tx => wallet.signTransaction(tx))),
    signMessage: async (message) => {
      const b64 = btoa(String.fromCharCode(...message));
      const result = await sendToNative('signMessage', { message: b64 });
      const sig = Uint8Array.from(atob(result), c => c.charCodeAt(0));
      return { signature: sig, publicKey };
    },
    signAndSendTransaction: async (tx, opts) => {
      let b64;
      try {
        const bytes = tx.serialize({ requireAllSignatures: false, verifySignatures: false });
        b64 = btoa(String.fromCharCode(...new Uint8Array(bytes)));
      } catch {
        try { b64 = btoa(String.fromCharCode(...new Uint8Array(tx.serialize()))); }
        catch { b64 = Buffer.from(tx).toString('base64'); }
      }
      const sig = await sendToNative('signAndSend', { tx: b64 });
      return { signature: sig };
    },
    request: async ({ method, params }) => {
      if (method === 'connect') return wallet.connect(params);
      if (method === 'disconnect') return wallet.disconnect();
      if (method === 'signTransaction') return wallet.signTransaction(params?.transaction);
      if (method === 'signMessage') return wallet.signMessage(params?.message);
      throw new Error('Method not supported: ' + method);
    },
    on: (event, cb) => { if (!listeners[event]) listeners[event] = []; listeners[event].push(cb); return wallet; },
    off: (event, cb) => { if (listeners[event]) listeners[event] = listeners[event].filter(l => l !== cb); return wallet; },
    _emit: (event, ...args) => { (listeners[event] || []).forEach(cb => { try { cb(...args); } catch(e) {} }); },
    removeAllListeners: () => { Object.keys(listeners).forEach(k => delete listeners[k]); },
  };

  window.solana = wallet;
  window.phantom = { solana: wallet };
  window.backpack = { solana: wallet };
  window.solflare = wallet;

  // Wallet Standard registration
  const SOLANA_MAINNET_CHAIN = 'solana:mainnet';
  const standardWallet = {
    version: '1.0.0',
    name: 'ChatFi Wallet',
    icon: 'data:image/png;base64,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',
    chains: [SOLANA_MAINNET_CHAIN],
    features: {
      'standard:connect': {
        version: '1.0.0',
        connect: async ({ silent } = {}) => {
          await wallet.connect();
          return { accounts: [{ address: addr, publicKey: publicKey.toBytes(), chains: [SOLANA_MAINNET_CHAIN], features: Object.keys(standardWallet.features) }] };
        },
      },
      'standard:disconnect': {
        version: '1.0.0',
        disconnect: async () => { await wallet.disconnect(); },
      },
      'standard:events': {
        version: '1.0.0',
        on: (event, cb) => { wallet.on(event, cb); return () => wallet.off(event, cb); },
      },
      'solana:signTransaction': {
        version: '1.0.0',
        supportedTransactionVersions: ['legacy', 0],
        signTransaction: async (...inputs) => {
          return Promise.all(inputs.map(async ({ transaction }) => {
            const signed = await wallet.signTransaction({ serialize: () => transaction });
            return { signedTransaction: transaction };
          }));
        },
      },
      'solana:signAndSendTransaction': {
        version: '1.0.0',
        supportedTransactionVersions: ['legacy', 0],
        signAndSendTransaction: async (...inputs) => {
          return Promise.all(inputs.map(async ({ transaction, options }) => {
            const b64 = btoa(String.fromCharCode(...transaction));
            const sig = await sendToNative('signAndSend', { tx: b64 });
            const sigBytes = Uint8Array.from(atob(sig.length > 50 ? sig : btoa(sig)), c => c.charCodeAt(0));
            return { signature: typeof sig === 'string' && sig.length < 100 ? Uint8Array.from(sig.split('').map(c=>c.charCodeAt(0))) : sigBytes };
          }));
        },
      },
      'solana:signMessage': {
        version: '1.0.0',
        signMessage: async (...inputs) => {
          return Promise.all(inputs.map(async ({ message, account }) => {
            const result = await wallet.signMessage(message);
            return { signedMessage: message, signature: result.signature };
          }));
        },
      },
    },
    accounts: addr ? [{ address: addr, publicKey: new Uint8Array(32), chains: [SOLANA_MAINNET_CHAIN], features: ['standard:connect','standard:disconnect','standard:events','solana:signTransaction','solana:signAndSendTransaction','solana:signMessage'] }] : [],
  };

  // Register with Wallet Standard
  const registerWallet = (callback) => callback({ register: (w) => { window.__chatfi_wallet = w; } });
  if (window.__wallet_standard_app_ready__) {
    window.__wallet_standard_app_ready__(standardWallet);
  }
  if (typeof window.addEventListener === 'function') {
    window.addEventListener('wallet-standard:app-ready', ({ detail: app }) => {
      try { app.register(standardWallet); } catch(e) {}
    });
  }
  // Also try the global registration pattern
  const event = new CustomEvent('wallet-standard:register-wallet', { detail: { register: (w) => {} }, bubbles: true });
  try {
    (window.__wallet_standard_register_wallet__ || (() => {}))(standardWallet);
  } catch(e) {}
  try {
    window.dispatchEvent(new CustomEvent('wallet-standard:register-wallet', {
      bubbles: true,
      detail: { register: (callback) => callback(standardWallet) }
    }));
  } catch(e) {}

  window.dispatchEvent(new Event('load'));
  window.dispatchEvent(new CustomEvent('solana#initialized'));
  if (addr) setTimeout(() => wallet._emit('connect', publicKey), 100);
})();
`
function DappBrowser({ walletAddress, secretKey, wallet, mwaInitUrl, onMwaHandled }) {
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


function SwapScreen({wallet,pubkey,tokenBalances,solBalance,fromToken2,setFromToken2,toToken2,setToToken2,showToast,C,s,nacl,deriveWallet,executeSwapTx,fetchPortfolio,requireAuth,createTriggerOrder,createRecurringOrder}:any) {
  const [mode, setMode] = React.useState('Market');
  const [amount, setAmount] = React.useState('');
  const [showNumpad, setShowNumpad] = React.useState(false);
  const [showPicker, setShowPicker] = React.useState<'from'|'to'|null>(null);
  const [pickerSearch, setPickerSearch] = React.useState('');
  const [pickerResults, setPickerResults] = React.useState<any[]>([]);
  const [pickerLoading, setPickerLoading] = React.useState(false);
  const [quoteOut, setQuoteOut] = React.useState<string|null>(null);
  const [quoting, setQuoting] = React.useState(false);
  const [swapLoading, setSwapLoading] = React.useState(false);
  const [limitPrice, setLimitPrice] = React.useState('');
  const [limitLoading, setLimitLoading] = React.useState(false);
  const [recurEvery, setRecurEvery] = React.useState('1');
  const [recurUnit, setRecurUnit] = React.useState('day');
  const [recurOrders, setRecurOrders] = React.useState('7');
  const [minPrice, setMinPrice] = React.useState('');
  const [maxPrice, setMaxPrice] = React.useState('');
  const [recurLoading, setRecurLoading] = React.useState(false);
  const [quote, setQuote] = React.useState<any>(null);
  const [tradeHistory, setTradeHistory] = React.useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = React.useState(false);

  React.useEffect(() => {
    if (!fromToken2 && tokenBalances?.length > 0) {
      const sol = tokenBalances.find((t:any) => t.symbol === 'SOL');
      if (sol) setFromToken2({ symbol:sol.symbol, mint:sol.mint, logoURI:sol.logoURI, decimals:sol.decimals||9, amount:sol.amount });
    }
    if (!toToken2) setToToken2({ symbol:'USDC', mint:'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', logoURI:'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48/logo.png', decimals:6 });
  }, [tokenBalances]);

  React.useEffect(() => {
    if (!fromToken2?.mint || !toToken2?.mint || !amount || parseFloat(amount) <= 0) { setQuoteOut(null); setQuote(null); return; }
    const t = setTimeout(fetchQuote, 600);
    return () => clearTimeout(t);
  }, [fromToken2?.mint, toToken2?.mint, amount]);

  const fetchQuote = async () => {
    setQuoting(true);
    try {
      const lam = Math.floor(parseFloat(amount) * Math.pow(10, fromToken2?.decimals||9));
      const res = await fetch(`https://api.jup.ag/swap/v1/quote?inputMint=${fromToken2.mint}&outputMint=${toToken2.mint}&amount=${lam}&slippageBps=50`);
      const data = await res.json();
      if (data.outAmount) {
        setQuoteOut((parseFloat(data.outAmount)/Math.pow(10,toToken2?.decimals||6)).toFixed(6));
        setQuote(data);
      }
    } catch(e) { setQuoteOut(null); setQuote(null); }
    setQuoting(false);
  };

  const fetchTradeHistory = async () => {
    if (!pubkey) return;
    setHistoryLoading(true);
    try {
      const sigsRes = await rpcFetch('getSignaturesForAddress', [pubkey, { limit: 20, commitment: 'confirmed' }]);
      const sigs = sigsRes?.result || [];
      const txs = [];
      for (const sig of sigs.slice(0, 10)) {
        try {
          const txRes = await rpcFetch('getTransaction', [sig.signature, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0, commitment: 'confirmed' }]);
          const tx = txRes?.result;
          if (!tx) continue;
          const instructions = tx?.transaction?.message?.instructions || [];
          const isJupiter = instructions.some((ix: any) =>
            ix?.programId === 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4' ||
            (ix?.parsed?.type && ['swap','route'].includes(ix.parsed.type))
          );
          const preBalances = tx?.meta?.preTokenBalances || [];
          const postBalances = tx?.meta?.postTokenBalances || [];
          let fromSym = '?', toSym = '?', fromAmt = 0, toAmt = 0, fromMint = '', toMint = '';
          for (const post of postBalances) {
            if (post.owner === pubkey) {
              const pre = preBalances.find((p: any) => p.accountIndex === post.accountIndex);
              const diff = (post.uiTokenAmount?.uiAmount || 0) - (pre?.uiTokenAmount?.uiAmount || 0);
              if (diff > 0) { toSym = post.mint?.slice(0,6) || '?'; toAmt = diff; toMint = post.mint; }
              if (diff < 0) { fromSym = post.mint?.slice(0,6) || '?'; fromAmt = Math.abs(diff); fromMint = post.mint; }
            }
          }
          txs.push({
            signature: sig.signature,
            timestamp: tx.blockTime || 0,
            isJupiter,
            fromSym, toSym, fromAmt, toAmt,
            fromMint, toMint,
            err: tx?.meta?.err,
          });
        } catch(e) {}
      }
      setTradeHistory(txs);
    } catch(e) { setTradeHistory([]); }
    setHistoryLoading(false);
  };

  React.useEffect(() => { if (pubkey) fetchTradeHistory(); }, [pubkey]);

  const searchTokens = async (q:string) => {
    setPickerSearch(q);
    if (!q) {
      setPickerResults([
        {symbol:'SOL',name:'Solana',address:'So11111111111111111111111111111111111111112',logoURI:'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/solana/info/logo.png',decimals:9},
        {symbol:'USDC',name:'USD Coin',address:'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',logoURI:'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48/logo.png',decimals:6},
        {symbol:'JUP',name:'Jupiter',address:'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN',logoURI:'https://static.jup.ag/jup/icon.png',decimals:6},
        {symbol:'BONK',name:'Bonk',address:'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',logoURI:'https://arweave.net/hQiPZOsRZXGXBJd_82PhVdlM_hACsT_q6wqwf5cSY7I',decimals:5},
        {symbol:'WIF',name:'dogwifhat',address:'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm',logoURI:'',decimals:6},
      ]); return;
    }
    setPickerLoading(true);
    try {
      const res = await fetch('https://lite-api.jup.ag/tokens/v2/search?query='+encodeURIComponent(q)+'&limit=8');
      const data = await res.json();
      setPickerResults((Array.isArray(data)?data:(data.tokens||[])).map((t:any)=>({...t,address:t.id||t.address,logoURI:t.logoURI||t.icon||''})));
    } catch(e) { setPickerResults([]); }
    setPickerLoading(false);
  };

  const selectToken = (t:any) => {
    const tok = { symbol:t.symbol, mint:t.address||t.mint, logoURI:t.logoURI||'', decimals:t.decimals||6 };
    if (showPicker==='from') setFromToken2(tok); else setToToken2(tok);
    setShowPicker(null); setPickerSearch(''); setPickerResults([]);
    setAmount(''); setQuote(null); setQuoteOut(null);
  };

  const flipTokens = () => {
    const tmp = fromToken2; setFromToken2(toToken2); setToToken2(tmp);
    setAmount(''); setQuote(null); setQuoteOut(null);
  };

  const handleNumpad = (k:string) => {
    const bal = tokenBalances?.find((t:any)=>t.mint===fromToken2?.mint)?.amount || 0;
    if (k==='MAX') setAmount(String(bal));
    else if (k==='75%') setAmount((bal*0.75).toFixed(6));
    else if (k==='50%') setAmount((bal*0.5).toFixed(6));
    else if (k==='CLEAR') setAmount('');
    else if (k==='⌫') setAmount((p:string)=>p.slice(0,-1));
    else if (k==='.' && amount.includes('.')) return;
    else setAmount((p:string)=>p+k);
  };

  const doSwap = async () => {
    if (!quote||!wallet||swapLoading) return;
    setSwapLoading(true);
    try {
      const txSig = await executeSwapTx(quote, fromToken2, toToken2, parseFloat(amount));
      setAmount(''); setQuote(null); setQuoteOut(null); setShowNumpad(false);
      showToast?.('✅ Swapped ' + amount + ' ' + (fromToken2?.symbol||'') + ' → ' + (toToken2?.symbol||''), 'success');
      setTimeout(fetchPortfolio,3000); setTimeout(fetchTradeHistory,5000);
    } catch(e:any) { showToast?.('❌ Swap failed: '+e.message, 'error'); }
    setSwapLoading(false);
  };

  const doLimit = async () => {
    if (!wallet||!amount||!limitPrice) { showToast?.('Enter amount and limit price','error'); return; }
    const fromBal2 = fromToken2?.symbol==='SOL' ? solBalance : tokenBalances?.find((t:any)=>t.mint===fromToken2?.mint)?.amount||0;
    if (parseFloat(amount) > (fromBal2||0)) { showToast?.('❌ Insufficient '+fromToken2?.symbol+' balance','error'); return; }
    const authed = await requireAuth?.();
    if (authed === false) return;
    setLimitLoading(true);
    try {
      const {publicKey:pk,secretKey} = deriveWallet(wallet);
      const inDec = fromToken2?.decimals||6;
      const outDec = toToken2?.decimals||6;
      const amtRaw = Math.round(parseFloat(amount)*Math.pow(10,inDec));
      const priceRaw = Math.round(parseFloat(limitPrice)*Math.pow(10,outDec));
      const txSig = await createTriggerOrder(fromToken2?.mint,toToken2?.mint,inDec,outDec,parseFloat(amount),parseFloat(limitPrice),'below',pk,secretKey);
      showToast?.('✅ Limit order placed!','success');
      setAmount(''); setLimitPrice('');
    } catch(e:any) { showToast?.('❌ Limit failed: '+e.message,'error'); }
    setLimitLoading(false);
  };

  const doRecurring = async () => {
    if (!wallet||!amount) { showToast?.('Enter amount','error'); return; }
    const fromBal3 = fromToken2?.symbol==='SOL' ? solBalance : tokenBalances?.find((t:any)=>t.mint===fromToken2?.mint)?.amount||0;
    const totalNeeded = parseFloat(amount) * parseInt(recurOrders||'7');
    if (parseFloat(amount) > (fromBal3||0)) { showToast?.('❌ Insufficient '+fromToken2?.symbol+' balance for first order','error'); return; }
    const authed = await requireAuth?.();
    if (authed === false) return;
    setRecurLoading(true);
    try {
      const {publicKey:pk,secretKey} = deriveWallet(wallet);
      const unitSecs = recurUnit==='minute'?60:recurUnit==='hour'?3600:recurUnit==='week'?604800:86400;
      const interval = parseInt(recurEvery||'1')*unitSecs;
      const orders = parseInt(recurOrders||'7');
      const txSig = await createRecurringOrder(fromToken2?.mint,toToken2?.mint,fromToken2?.decimals||6,parseFloat(amount),interval,orders,pk,secretKey);
      showToast?.('✅ DCA order created!','success');
      setAmount('');
    } catch(e:any) { showToast?.('❌ DCA failed: '+e.message,'error'); }
    setRecurLoading(false);
  };

  const fromBal = fromToken2?.symbol==='SOL' ? (solBalance||0) : (tokenBalances?.find((t:any)=>t.mint===fromToken2?.mint)?.amount ?? 0);
  const toBal = toToken2?.symbol==='SOL' ? (solBalance||0) : (tokenBalances?.find((t:any)=>t.mint===toToken2?.mint)?.amount ?? 0);
  const rate = quote&&amount&&quoteOut ? `1 ${fromToken2?.symbol} ≈ ${(parseFloat(quoteOut)/parseFloat(amount)).toFixed(6)} ${toToken2?.symbol}` : null;

  const grouped = tradeHistory.reduce((g:any,tx:any)=>{
    const d = new Date((tx.timestamp||0)*1000);
    const lbl = d.toDateString()===new Date().toDateString()?'Today':d.toDateString()===new Date(Date.now()-86400000).toDateString()?'Yesterday':d.toLocaleDateString();
    g[lbl]=[...(g[lbl]||[]),tx]; return g;
  },{});

  return (
    <View style={{ flex:1, backgroundColor:C.bg }}>
      <ScrollView contentContainerStyle={{ paddingBottom:200 }} showsVerticalScrollIndicator={false}>
        <View style={{ padding:16 }}>
          <View style={{ flexDirection:'row', backgroundColor:C.card, borderRadius:12, padding:4, marginBottom:16 }}>
            {['Market','Limit','Recurring'].map(m=>(
              <TouchableOpacity key={m} onPress={()=>setMode(m)} style={{ flex:1, paddingVertical:8, borderRadius:10, alignItems:'center', backgroundColor:mode===m?C.bg:'transparent' }}>
                <Text style={{ color:mode===m?C.text:C.muted, fontWeight:mode===m?'700':'400', fontSize:14 }}>{m}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={{ backgroundColor:C.card, borderRadius:20, padding:16, marginBottom:2 }}>
            <View style={{ flexDirection:'row', justifyContent:'space-between', marginBottom:10 }}>
              <Text style={{ color:C.muted, fontWeight:'600', fontSize:13 }}>Sell</Text>
              <View style={{flexDirection:'row',alignItems:'center',gap:4}}><Ionicons name='wallet-outline' size={14} color={C.muted}/><Text style={{color:C.muted,fontSize:13}}>{Number(fromBal).toFixed(4)} {fromToken2?.symbol}</Text></View>
            </View>
            <View style={{ flexDirection:'row', alignItems:'center', justifyContent:'space-between' }}>
              <TouchableOpacity onPress={()=>{ setShowPicker('from'); searchTokens(''); }}
                style={{ flexDirection:'row', alignItems:'center', backgroundColor:C.bg, borderRadius:24, paddingHorizontal:14, paddingVertical:10, gap:8 }}>
                {fromToken2?.logoURI?<Image source={{uri:fromToken2.logoURI}} style={{width:26,height:26,borderRadius:13}}/>:null}
                <Text style={{ color:C.text, fontWeight:'700', fontSize:16 }}>{fromToken2?.symbol||'Select'}</Text>
                <Text style={{ color:C.muted }}>▾</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={()=>setShowNumpad(true)}>
                <Text style={{ color:amount?C.text:C.muted, fontSize:30, fontWeight:'700' }}>{amount||'0'}</Text>
              </TouchableOpacity>
            </View>
            {amount&&<Text style={{ color:C.muted, fontSize:12, textAlign:'right', marginTop:4 }}>${((parseFloat(amount)||0)*(tokenBalances?.find((t:any)=>t.mint===fromToken2?.mint)?.price||0)).toFixed(2)}</Text>}
          </View>

          <View style={{ alignItems:'center', zIndex:10, marginVertical:-10 }}>
            <TouchableOpacity onPress={flipTokens} style={{ backgroundColor:C.green, width:38, height:38, borderRadius:19, alignItems:'center', justifyContent:'center', borderWidth:3, borderColor:C.bg, elevation:4 }}>
              <Text style={{ color:'#000', fontSize:16, fontWeight:'900' }}>⇅</Text>
            </TouchableOpacity>
          </View>

          <View style={{ backgroundColor:C.card, borderRadius:20, padding:16, marginTop:2, marginBottom:16 }}>
            <View style={{ flexDirection:'row', justifyContent:'space-between', marginBottom:10 }}>
              <Text style={{ color:C.muted, fontWeight:'600', fontSize:13 }}>Buy</Text>
              <View style={{flexDirection:'row',alignItems:'center',gap:4}}><Ionicons name='wallet-outline' size={14} color={C.muted}/><Text style={{color:C.muted,fontSize:13}}>{Number(toBal).toFixed(4)} {toToken2?.symbol}</Text></View>
            </View>
            <View style={{ flexDirection:'row', alignItems:'center', justifyContent:'space-between' }}>
              <TouchableOpacity onPress={()=>{ setShowPicker('to'); searchTokens(''); }}
                style={{ flexDirection:'row', alignItems:'center', backgroundColor:C.bg, borderRadius:24, paddingHorizontal:14, paddingVertical:10, gap:8 }}>
                {toToken2?.logoURI?<Image source={{uri:toToken2.logoURI}} style={{width:26,height:26,borderRadius:13}}/>:null}
                <Text style={{ color:C.text, fontWeight:'700', fontSize:16 }}>{toToken2?.symbol||'Select'}</Text>
                <Text style={{ color:C.muted }}>▾</Text>
              </TouchableOpacity>
              <Text style={{ color:quoteOut?C.text:C.muted, fontSize:30, fontWeight:'700' }}>{quoting?'...':quoteOut||'0'}</Text>
            </View>
            {rate&&<Text style={{ color:C.muted, fontSize:12, marginTop:8 }}>{rate}</Text>}
          </View>

          {mode==='Limit'&&(
            <View style={{marginBottom:16}}>
              <View style={{flexDirection:'row',gap:8,marginBottom:8}}>
                <View style={{flex:1}}>
                  <Text style={{color:C.muted,fontSize:12,marginBottom:6}}>Limit Price</Text>
                  <TextInput value={limitPrice} onChangeText={setLimitPrice} placeholder="e.g. 150"
                    placeholderTextColor={C.muted} keyboardType="numeric"
                    style={{backgroundColor:C.card,borderRadius:12,padding:12,color:C.text,borderWidth:1,borderColor:C.border,fontSize:15}}/>
                </View>
                <View style={{flex:1}}>
                  <Text style={{color:C.muted,fontSize:12,marginBottom:6}}>Expiry</Text>
                  <View style={{backgroundColor:C.card,borderRadius:12,padding:12,borderWidth:1,borderColor:C.border,height:46,justifyContent:'center'}}>
                    <Text style={{color:C.text,fontSize:15}}>Never</Text>
                  </View>
                </View>
              </View>
              {!!(amount&&limitPrice)&&<Text style={{color:C.muted,fontSize:12}}>
                You receive ≈ {(parseFloat(amount||'0')*parseFloat(limitPrice||'0')).toFixed(4)} {toToken2?.symbol}
              </Text>}
            </View>
          )}
          {mode==='Recurring'&&(
            <View style={{marginBottom:16}}>
              <View style={{flexDirection:'row',gap:8,marginBottom:8}}>
                <View style={{flex:1}}>
                  <Text style={{color:C.muted,fontSize:12,marginBottom:6}}>Every</Text>
                  <View style={{backgroundColor:C.card,borderRadius:12,borderWidth:1,borderColor:C.border,flexDirection:'row',alignItems:'center'}}>
                    <TextInput value={recurEvery} onChangeText={setRecurEvery} keyboardType="numeric"
                      placeholder="1" placeholderTextColor={C.muted}
                      style={{color:C.text,padding:12,fontSize:15,width:50}}/>
                    <TouchableOpacity onPress={()=>setRecurUnit((u:string)=>u==='minute'?'hour':u==='hour'?'day':u==='day'?'week':'minute')}
                      style={{flex:1,padding:12,flexDirection:'row',justifyContent:'space-between'}}>
                      <Text style={{color:C.text,fontSize:13,flexShrink:1}} numberOfLines={1}>{recurUnit}</Text>
                      <Ionicons name="chevron-down" size={14} color={C.muted}/>
                    </TouchableOpacity>
                  </View>
                </View>
                <View style={{flex:1}}>
                  <Text style={{color:C.muted,fontSize:12,marginBottom:6}}>Over</Text>
                  <View style={{backgroundColor:C.card,borderRadius:12,borderWidth:1,borderColor:C.border,flexDirection:'row',alignItems:'center'}}>
                    <TextInput value={recurOrders} onChangeText={setRecurOrders} keyboardType="numeric"
                      placeholder="7" placeholderTextColor={C.muted}
                      style={{color:C.text,padding:12,fontSize:15,width:50}}/>
                    <Text style={{color:C.muted,padding:12,fontSize:15}}>orders</Text>
                  </View>
                </View>
              </View>
              <View style={{flexDirection:'row',gap:8,marginBottom:4}}>
                <TextInput value={minPrice} onChangeText={setMinPrice} placeholder="Min Price"
                  placeholderTextColor={C.muted} keyboardType="numeric"
                  style={{flex:1,backgroundColor:C.card,borderRadius:12,padding:12,color:C.text,borderWidth:1,borderColor:C.border}}/>
                <TextInput value={maxPrice} onChangeText={setMaxPrice} placeholder="Max Price"
                  placeholderTextColor={C.muted} keyboardType="numeric"
                  style={{flex:1,backgroundColor:C.card,borderRadius:12,padding:12,color:C.text,borderWidth:1,borderColor:C.border}}/>
              </View>
              <Text style={{color:C.muted,fontSize:11,textAlign:'center',marginBottom:4}}>Price Range (Optional)</Text>
            </View>
          )}
          <TouchableOpacity
            onPress={mode==='Market'?(amount&&quote?doSwap:()=>setShowNumpad(true)):mode==='Limit'?doLimit:doRecurring}
            style={{backgroundColor:amount?C.green:C.card,borderRadius:18,padding:18,alignItems:'center',marginBottom:24}}
            disabled={swapLoading||limitLoading||recurLoading}>
            {(swapLoading||limitLoading||recurLoading)?<ActivityIndicator color="#000"/>
              :<Text style={{color:amount?'#000':C.muted,fontWeight:'700',fontSize:17}}>
                {mode==='Market'?(amount&&quote?`Swap ${fromToken2?.symbol} → ${toToken2?.symbol}`:'Enter Amount')
                :mode==='Limit'?(amount&&limitPrice?'Place Limit Order':'Enter Amount & Price')
                :(amount?'Start DCA':'Enter Amount')}
              </Text>}
          </TouchableOpacity>

          <View style={{ flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
            <Text style={{ color:C.text, fontWeight:'700', fontSize:16 }}>History</Text>
            <TouchableOpacity onPress={fetchTradeHistory} style={{ padding:4 }}>
              <Ionicons name="refresh-outline" size={18} color={C.green}/>
            </TouchableOpacity>
          </View>
          {historyLoading&&<ActivityIndicator color={C.green} style={{marginTop:8}}/>}
          {!historyLoading&&tradeHistory.length===0&&<Text style={{ color:C.muted, textAlign:'center', marginTop:16 }}>No swap history yet</Text>}
          {Object.entries(grouped).map(([date,txs]:any)=>(
            <View key={date}>
              <Text style={{ color:C.muted, fontSize:13, fontWeight:'600', marginBottom:8, marginTop:4 }}>{date}</Text>
              {txs.map((tx:any,i:number)=>{
                return (
                  <TouchableOpacity key={i} onPress={()=>Linking.openURL('https://solscan.io/tx/'+tx.signature)}
                    style={{ backgroundColor:C.card, borderRadius:16, padding:14, marginBottom:8, flexDirection:'row', alignItems:'center' }}>
                    <View style={{ flexDirection:'row', alignItems:'center', marginRight:12 }}>
                      <TokLogo uri={'https://img.jup.ag/tokens/'+(tx.fromMint||'')} fallback={''} symbol={tx.fromSym||'?'} style={{width:28,height:28,borderRadius:14}} mint={tx.fromMint}/>
                      <Text style={{color:C.muted,fontSize:12,marginHorizontal:4}}>→</Text>
                      <TokLogo uri={'https://img.jup.ag/tokens/'+(tx.toMint||'')} fallback={''} symbol={tx.toSym||'?'} style={{width:28,height:28,borderRadius:14}} mint={tx.toMint}/>
                    </View>
                    <View style={{ flex:1 }}>
                      <Text style={{ color:C.text, fontWeight:'600', fontSize:14 }}>{tx.fromSym||'?'} → {tx.toSym||'?'}</Text>
                      <Text style={{ color:C.muted, fontSize:11 }}>{new Date((tx.timestamp||0)*1000).toLocaleTimeString()}</Text>
                      <Text style={{ color:C.muted, fontSize:10 }} numberOfLines={1}>{tx.signature?.slice(0,16)}...</Text>
                    </View>
                    <View style={{ alignItems:'flex-end' }}>
                      {tx.toAmt>0&&<Text style={{ color:C.green, fontWeight:'600', fontSize:13 }}>+{Number(tx.toAmt).toFixed(4)}</Text>}
                      {tx.fromAmt>0&&<Text style={{ color:'#ff4444', fontSize:12 }}>-{Number(tx.fromAmt).toFixed(4)}</Text>}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}
        </View>
      </ScrollView>

      {showNumpad&&(
        <View style={{ position:'absolute', bottom:0, left:0, right:0, backgroundColor:C.card, borderTopLeftRadius:24, borderTopRightRadius:24, paddingHorizontal:16, paddingTop:16, paddingBottom:32, elevation:20 }}>
          <View style={{ flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
            <Text style={{ color:C.muted, fontSize:13 }}>Amount</Text>
            <Text style={{ color:C.text, fontSize:22, fontWeight:'700', flex:1, textAlign:'center' }}>{amount||'0'} {fromToken2?.symbol}</Text>
            <TouchableOpacity onPress={()=>setShowNumpad(false)} style={{ padding:8 }}>
              <Ionicons name="chevron-down" size={22} color={C.muted}/>
            </TouchableOpacity>
          </View>
          {[['MAX','1','2','3'],['75%','4','5','6'],['50%','7','8','9'],['CLEAR','.','0','⌫']].map((row,ri)=>(
            <View key={ri} style={{ flexDirection:'row', gap:10, marginBottom:10 }}>
              {row.map(k=>(
                <TouchableOpacity key={k} onPress={()=>handleNumpad(k)}
                  style={{ flex:1, backgroundColor:['MAX','75%','50%','CLEAR'].includes(k)?'#1a2a1a':C.bg, borderRadius:14, paddingVertical:16, alignItems:'center' }}>
                  <Text style={{ color:k==='CLEAR'?C.red:['MAX','75%','50%'].includes(k)?C.green:C.text, fontWeight:'700', fontSize:17 }}>{k}</Text>
                </TouchableOpacity>
              ))}
            </View>
          ))}
        </View>
      )}

      {showPicker&&(
        <Modal visible animationType="slide" transparent onRequestClose={()=>setShowPicker(null)}>
          <View style={{ flex:1, backgroundColor:'rgba(0,0,0,0.6)', justifyContent:'flex-end' }}>
            <View style={{ backgroundColor:C.card, borderTopLeftRadius:24, borderTopRightRadius:24, padding:20, maxHeight:'80%' }}>
              <Text style={{ color:C.text, fontWeight:'700', fontSize:18, marginBottom:14 }}>Select Token</Text>
              <TextInput value={pickerSearch} onChangeText={searchTokens}
                placeholder="Search or paste address..." placeholderTextColor={C.muted}
                style={{ backgroundColor:C.bg, color:C.text, borderRadius:12, padding:12, fontSize:14, marginBottom:12 }}
                autoFocus autoCapitalize="none"/>
              {pickerLoading&&<ActivityIndicator color={C.green}/>}
              <ScrollView>
                {!pickerSearch&&(tokenBalances||[]).map((t:any,i:number)=>(
                  <TouchableOpacity key={'b'+i} onPress={()=>selectToken({...t,address:t.mint})}
                    style={{ flexDirection:'row', alignItems:'center', padding:12, borderBottomWidth:1, borderBottomColor:C.border }}>
                    <Image source={{uri:t.logoURI||`https://img.jup.ag/tokens/${t.mint}`}} style={{width:36,height:36,borderRadius:18,backgroundColor:C.bg,marginRight:12}}/>
                    <View style={{flex:1}}>
                      <Text style={{color:C.text,fontWeight:'600'}}>{t.symbol}</Text>
                      <Text style={{color:C.muted,fontSize:12}}>{t.name||t.symbol}</Text>
                    </View>
                    <Text style={{color:C.muted,fontSize:13}}>{t.amount?.toFixed(4)}</Text>
                  </TouchableOpacity>
                ))}
                {(pickerSearch?pickerResults:pickerResults).map((t:any,i:number)=>(
                  <TouchableOpacity key={'r'+i} onPress={()=>selectToken(t)}
                    style={{ flexDirection:'row', alignItems:'center', padding:12, borderBottomWidth:1, borderBottomColor:C.border }}>
                    <Image source={{uri:t.logoURI||`https://img.jup.ag/tokens/${t.address}`}} style={{width:36,height:36,borderRadius:18,backgroundColor:C.bg,marginRight:12}}/>
                    <View style={{flex:1}}>
                      <Text style={{color:C.text,fontWeight:'600'}}>{t.symbol}</Text>
                      <Text style={{color:C.muted,fontSize:12}}>{t.name}</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}

function SettingsTab({ accounts, activeAccIdx, switchAccount, addAccount, setAccounts, wallet, pubkey, requireAuth, setSeedPhrase, setShowSeedModal, setPrivKey, setShowPrivKeyModal, setWallet, setPubkey, setSolBalance, securityEnabled, setChangingPasscode, deriveWallet, getPrivateKey, nacl, C, s, appLanguage, setAppLanguage, appCurrency, setAppCurrency, appNetwork, setAppNetwork, exchangeRates, currencySymbol, setCurrencySymbol }: any) {
  const [settingsView, setSettingsView] = React.useState('main');
  const [notifEnabled, setNotifEnabled] = React.useState(false);
  const [notifSettings, setNotifSettings] = React.useState<any>({ receivedTokens:true, receivedCollectibles:true, sentTokens:false, sentCollectibles:false, priceAlerts:true });
  const [newAccName, setNewAccName] = React.useState('Account ' + ((accounts||[]).length + 1));
  const [privKeyInput, setPrivKeyInput] = React.useState('');
  const [privKeyName, setPrivKeyName] = React.useState('');
  const [watchAddr, setWatchAddr] = React.useState('');
  const [watchName, setWatchName] = React.useState('');
  const [importSeedInput, setImportSeedInput] = React.useState('');
  const [discoveredAccounts, setDiscoveredAccounts] = React.useState<any[]>([]);
  const [selectedAccIdxs, setSelectedAccIdxs] = React.useState<number[]>([]);
  const [discovering, setDiscovering] = React.useState(false);
  const [menuAccIdx, setMenuAccIdx] = React.useState<number|null>(null);
  const [managingAcc, setManagingAcc] = React.useState<any>(null);
  const [managingAccIdx, setManagingAccIdx] = React.useState<number>(-1);
  const [editName, setEditName] = React.useState('');
  const [showWarning, setShowWarning] = React.useState<'seed'|'key'|null>(null);
  const [revealed, setRevealed] = React.useState(false);
  const [revealData, setRevealData] = React.useState('');
  const [revealType, setRevealType] = React.useState('');

  const Header = ({ title, back }: any) => (
    <View style={{ flexDirection:'row', alignItems:'center', padding:20, borderBottomWidth:1, borderBottomColor:'#30363d' }}>
      <TouchableOpacity onPress={() => setSettingsView(back)} style={{ marginRight:12, padding:8, borderRadius:20, backgroundColor:'#1c2128' }}>
        <Ionicons name="arrow-back" size={22} color={C.text} />
      </TouchableOpacity>
      <Text style={{ color:C.text, fontSize:18, fontWeight:'bold', flex:1 }}>{title}</Text>
    </View>
  );

  if (settingsView === 'main') return (
    <ScrollView style={s.pad} contentContainerStyle={{ paddingBottom:100 }}>
      <View style={{ flexDirection:'row', alignItems:'center', padding:20, paddingTop:(StatusBar.currentHeight||0)+16, borderBottomWidth:1, borderBottomColor:'#30363d', marginBottom:8 }}>
        <Text style={{ color:C.text, fontSize:22, fontWeight:'bold', flex:1 }}>Settings</Text>
        <Ionicons name="settings-outline" size={22} color={C.green} />
      </View>
      {[
        { label:'General', sub:'Language, currency, network', icon:'settings-outline', onPress: () => setSettingsView('general') },
        { label:'Manage Accounts', sub:'Add, import or watch accounts', icon:'people-outline', onPress: () => setSettingsView('manageAccounts') },
        { label:'Notifications', sub:'Alerts and updates', icon:'notifications-outline', onPress: () => setSettingsView('notifications') },
        { label:'Security & Privacy', sub:'Passcode, terms, privacy', icon:'shield-outline', onPress: () => setSettingsView('security') },
        { label:'Support', sub:'Contact our support', icon:'help-circle-outline', onPress: () => {} },
      ].map((item, i, arr) => (
        <TouchableOpacity key={i} onPress={item.onPress}
          style={{ flexDirection:'row', alignItems:'center', paddingHorizontal:16, paddingVertical:16,
            borderBottomWidth: i < arr.length-1 ? 1 : 0, borderBottomColor:'#30363d',
            backgroundColor:'#1c2128', marginBottom: i === arr.length-1 ? 0 : 1 }}>
          <View style={{ width:36, height:36, borderRadius:18, backgroundColor:'#0d1117', alignItems:'center', justifyContent:'center', marginRight:14 }}>
            <Ionicons name={item.icon as any} size={18} color={C.green} />
          </View>
          <View style={{ flex:1 }}>
            <Text style={{ color:C.text, fontSize:15 }}>{item.label}</Text>
            <Text style={{ color:C.muted, fontSize:12, marginTop:2 }}>{item.sub}</Text>
          </View>
          <Text style={{ color:C.muted, fontSize:18 }}>›</Text>
        </TouchableOpacity>
      ))}
      <Text style={{ color:C.muted, fontSize:11, textAlign:'center', marginTop:24 }}>Version 1.0.0</Text>
    </ScrollView>
  );

  const LANGUAGES = ['English','Spanish','French','Portuguese','Chinese','Arabic','Hindi','Russian','Japanese','Korean','German','Italian','Turkish','Dutch','Polish','Swedish','Indonesian','Thai','Vietnamese','Swahili'];
  const CURRENCIES = ['USD','EUR','GBP','NGN','JPY','CNY','KRW','INR','BRL','CAD','AUD','CHF','MXN','ZAR','TRY','AED','SGD','HKD','SEK','NOK'];
  const NETWORKS = [{id:'mainnet',label:'Mainnet Beta',sub:'Main Solana network'},{id:'devnet',label:'Devnet',sub:'For testing only'}];

  if (settingsView === 'general') return (
    <ScrollView contentContainerStyle={{ paddingBottom:100 }}>
      <Header title="General" back="main" />
      <View style={{ margin:16, backgroundColor:'#1c2128', borderRadius:14, overflow:'hidden' }}>
        <TouchableOpacity onPress={() => setSettingsView('selectLanguage')}
          style={{ flexDirection:'row', alignItems:'center', padding:16, borderBottomWidth:1, borderBottomColor:'#30363d' }}>
          <View style={{ flex:1 }}>
            <Text style={{ color:C.text, fontSize:15 }}>Language</Text>
            <Text style={{ color:C.muted, fontSize:12, marginTop:2 }}>{appLanguage}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={C.muted} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setSettingsView('selectCurrency')}
          style={{ flexDirection:'row', alignItems:'center', padding:16, borderBottomWidth:1, borderBottomColor:'#30363d' }}>
          <View style={{ flex:1 }}>
            <Text style={{ color:C.text, fontSize:15 }}>Currency</Text>
            <Text style={{ color:C.muted, fontSize:12, marginTop:2 }}>{appCurrency}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={C.muted} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setSettingsView('selectNetwork')}
          style={{ flexDirection:'row', alignItems:'center', padding:16 }}>
          <View style={{ flex:1 }}>
            <Text style={{ color:C.text, fontSize:15 }}>Network</Text>
            <Text style={{ color:C.muted, fontSize:12, marginTop:2 }}>{appNetwork === 'mainnet' ? 'Mainnet Beta' : 'Devnet'}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={C.muted} />
        </TouchableOpacity>
      </View>
    </ScrollView>
  );

  if (settingsView === 'selectLanguage') return (
    <ScrollView contentContainerStyle={{ paddingBottom:100 }}>
      <Header title="Language" back="general" />
      <View style={{ margin:16, backgroundColor:'#1c2128', borderRadius:14, overflow:'hidden' }}>
        {LANGUAGES.map((lang, i) => (
          <TouchableOpacity key={i} onPress={async () => {
            setAppLanguage(lang);
            await AsyncStorage.setItem('app_language', lang);
            setSettingsView('general');
          }} style={{ flexDirection:'row', alignItems:'center', padding:16, borderBottomWidth: i < LANGUAGES.length-1 ? 1 : 0, borderBottomColor:'#30363d' }}>
            <Text style={{ color:C.text, fontSize:15, flex:1 }}>{lang}</Text>
            {appLanguage === lang && <Ionicons name="checkmark" size={20} color={C.green} />}
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );

  if (settingsView === 'selectCurrency') return (
    <ScrollView contentContainerStyle={{ paddingBottom:100 }}>
      <Header title="Currency" back="general" />
      <View style={{ margin:16, backgroundColor:'#1c2128', borderRadius:14, overflow:'hidden' }}>
        {CURRENCIES.map((cur, i) => (
          <TouchableOpacity key={i} onPress={async () => {
            setAppCurrency(cur);
            setCurrencySymbol(CURRENCY_SYMBOLS[cur]||cur+' ');
            await AsyncStorage.setItem('app_currency', cur);
            setSettingsView('general');
          }} style={{ flexDirection:'row', alignItems:'center', padding:16, borderBottomWidth: i < CURRENCIES.length-1 ? 1 : 0, borderBottomColor:'#30363d' }}>
            <Text style={{ color:C.muted, fontSize:14, width:50 }}>{CURRENCY_SYMBOLS[cur]||cur}</Text>
            <Text style={{ color:C.text, fontSize:15, flex:1 }}>{cur}</Text>
            {appCurrency === cur && <Ionicons name="checkmark" size={20} color={C.green} />}
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );

  if (settingsView === 'selectNetwork') return (
    <ScrollView contentContainerStyle={{ paddingBottom:100 }}>
      <Header title="Network" back="general" />
      <View style={{ margin:16, backgroundColor:'#1c2128', borderRadius:14, overflow:'hidden' }}>
        {NETWORKS.map((net, i) => (
          <TouchableOpacity key={i} onPress={async () => {
            setAppNetwork(net.id);
            await AsyncStorage.setItem('app_network', net.id);
            setSettingsView('general');
          }} style={{ flexDirection:'row', alignItems:'center', padding:16, borderBottomWidth: i < NETWORKS.length-1 ? 1 : 0, borderBottomColor:'#30363d' }}>
            <View style={{ flex:1 }}>
              <Text style={{ color:C.text, fontSize:15 }}>{net.label}</Text>
              <Text style={{ color:C.muted, fontSize:12, marginTop:2 }}>{net.sub}</Text>
            </View>
            {appNetwork === net.id && <Ionicons name="checkmark" size={20} color={C.green} />}
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );

  if (settingsView === 'notifications') return (
    <ScrollView contentContainerStyle={{ paddingBottom:100 }}>
      <Header title="Notifications" back="main" />
      {!notifEnabled ? (
        <View style={{ alignItems:'center', padding:48 }}>
          <Ionicons name="notifications-outline" size={80} color={C.muted} />
          <Text style={{ color:C.text, fontSize:18, fontWeight:'bold', marginTop:24 }}>{"Don't miss out"}</Text>
          <Text style={{ color:C.muted, fontSize:13, textAlign:'center', marginTop:8, lineHeight:20 }}>
            Get instant alerts for received funds, important news, price changes and rewards.
          </Text>
          <TouchableOpacity onPress={() => setNotifEnabled(true)}
            style={{ backgroundColor:'#f0c800', borderRadius:30, paddingVertical:16, paddingHorizontal:40, marginTop:32 }}>
            <Text style={{ color:'#000', fontWeight:'bold', fontSize:15 }}>Enable Notifications</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={{ paddingBottom:20 }}>
          {[
            { key:'receivedTokens', label:'Received tokens', sub:'Notify me when I receive tokens' },
            { key:'receivedCollectibles', label:'Received collectibles', sub:'Notify me when I receive collectibles' },
            { key:'sentTokens', label:'Sent tokens', sub:'Notify me when I send tokens' },
            { key:'sentCollectibles', label:'Sent collectibles', sub:'Notify me when I send collectibles' },
            { key:'priceAlerts', label:'Price alerts', sub:'Notify me when token prices move' },
          ].map((item) => (
            <View key={item.key} style={{ flexDirection:'row', alignItems:'center', paddingHorizontal:20, paddingVertical:14, borderBottomWidth:1, borderBottomColor:'#30363d' }}>
              <View style={{ flex:1 }}>
                <Text style={{ color:C.text, fontSize:15 }}>{item.label}</Text>
                <Text style={{ color:C.muted, fontSize:12, marginTop:2 }}>{item.sub}</Text>
              </View>
              <TouchableOpacity onPress={() => setNotifSettings((p:any) => ({ ...p, [item.key]: !p[item.key] }))}
                style={{ width:50, height:28, borderRadius:14, backgroundColor: notifSettings[item.key] ? '#f0c800' : '#30363d', justifyContent:'center', paddingHorizontal:3 }}>
                <View style={{ width:22, height:22, borderRadius:11, backgroundColor:'#fff', alignSelf: notifSettings[item.key] ? 'flex-end' : 'flex-start' }} />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );

  if (settingsView === 'security') return (
    <ScrollView contentContainerStyle={{ paddingBottom:100 }}>
      <Header title="Security & Privacy" back="main" />
      {[
        { label:'Change Passcode', sub:'Update your account security', onPress: () => setChangingPasscode(true) },
        { label:'Request Authentication', sub:'24 hours', onPress: () => {} },
      ].map((item, i) => (
        <TouchableOpacity key={i} onPress={item.onPress}
          style={{ flexDirection:'row', alignItems:'center', paddingHorizontal:20, paddingVertical:16, borderBottomWidth:1, borderBottomColor:'#30363d' }}>
          <View style={{ flex:1 }}>
            <Text style={{ color:C.text, fontSize:15 }}>{item.label}</Text>
            <Text style={{ color:C.muted, fontSize:12, marginTop:2 }}>{item.sub}</Text>
          </View>
          <Text style={{ color:C.muted, fontSize:18 }}>›</Text>
        </TouchableOpacity>
      ))}
      <TouchableOpacity onPress={() => Linking.openURL('https://chatfi.pro/terms')}
        style={{ flexDirection:'row', alignItems:'center', paddingHorizontal:20, paddingVertical:16, borderBottomWidth:1, borderBottomColor:'#30363d' }}>
        <View style={{ flex:1 }}>
          <Text style={{ color:C.text, fontSize:15 }}>Terms of Service</Text>
          <Text style={{ color:C.muted, fontSize:12, marginTop:2 }}>Review rules and policies</Text>
        </View>
        <Ionicons name="open-outline" size={18} color={C.muted} />
      </TouchableOpacity>
      <TouchableOpacity onPress={() => Linking.openURL('https://chatfi.pro/privacy')}
        style={{ flexDirection:'row', alignItems:'center', paddingHorizontal:20, paddingVertical:16, borderBottomWidth:1, borderBottomColor:'#30363d' }}>
        <View style={{ flex:1 }}>
          <Text style={{ color:C.text, fontSize:15 }}>Privacy Policy</Text>
          <Text style={{ color:C.muted, fontSize:12, marginTop:2 }}>Learn how we use and protect data</Text>
        </View>
        <Ionicons name="open-outline" size={18} color={C.muted} />
      </TouchableOpacity>
      <TouchableOpacity onPress={() => {
        Alert.alert('Log Out', 'Remove this account? Other accounts will not be affected.', [
          { text:'Cancel', style:'cancel' },
          { text:'Log Out', style:'destructive', onPress: async () => {
            const raw = await AsyncStorage.getItem('accounts');
            const accs = raw ? JSON.parse(raw) : [];
            const updated = accs.filter((_:any, i:number) => i !== activeAccIdx);
            await AsyncStorage.setItem('accounts', JSON.stringify(updated));
            if(updated.length > 0){ await AsyncStorage.setItem('active_acc', '0'); switchAccount(0); }
            else { setWallet(null); setPubkey(null); setSolBalance(null); }
          }}
        ]);
      }}
        style={{ flexDirection:'row', alignItems:'center', paddingHorizontal:20, paddingVertical:16 }}>
        <View style={{ flex:1 }}>
          <Text style={{ color:C.red, fontSize:15 }}>Log Out</Text>
          <Text style={{ color:C.muted, fontSize:12, marginTop:2 }}>Remove this account</Text>
        </View>
        <Ionicons name="log-out-outline" size={18} color={C.red} />
      </TouchableOpacity>
    </ScrollView>
  );

  if (settingsView === 'manageAccounts') return (
    <ScrollView contentContainerStyle={{ paddingBottom:100 }}>
      <View style={{ flexDirection:'row', alignItems:'center', padding:20, borderBottomWidth:1, borderBottomColor:'#30363d' }}>
        <TouchableOpacity onPress={() => setSettingsView('main')} style={{ marginRight:12, padding:8, borderRadius:20, backgroundColor:'#1c2128' }}>
          <Ionicons name="arrow-back" size={22} color={C.text} />
        </TouchableOpacity>
        <Text style={{ color:C.text, fontSize:18, fontWeight:'bold', flex:1 }}>Manage Accounts</Text>
        <TouchableOpacity onPress={() => setSettingsView('addAccount')}
          style={{ width:32, height:32, borderRadius:16, backgroundColor:'#1c2128', alignItems:'center', justifyContent:'center' }}>
          <Text style={{ color:C.green, fontSize:22, lineHeight:28 }}>+</Text>
        </TouchableOpacity>
      </View>
      <View style={{ margin:16, backgroundColor:'#1c2128', borderRadius:14, overflow:'hidden' }}>
        <TextInput placeholder="Search accounts..." placeholderTextColor={C.muted}
          style={{ backgroundColor:'#0d1117', color:C.text, borderRadius:10, margin:10, padding:10, fontSize:14 }}
          autoCapitalize="none" />
        {(accounts||[]).map((acc:any, idx:number) => (
          <View key={acc.id}>
            <TouchableOpacity onPress={() => switchAccount(idx)}
              style={{ flexDirection:'row', alignItems:'center', padding:16, borderBottomWidth:1, borderBottomColor:'#30363d' }}>
              <View style={{ width:36, height:36, borderRadius:18, backgroundColor:C.green, alignItems:'center', justifyContent:'center', marginRight:12 }}>
                <Text style={{ color:'#0d1117', fontWeight:'bold', fontSize:14 }}>{acc.avatar||acc.name?.[0]||'A'}</Text>
              </View>
              <View style={{ flex:1 }}>
                <Text style={{ color:C.text, fontSize:15, fontWeight:'600' }}>{acc.name}</Text>
                <Text style={{ color:C.muted, fontSize:12 }}>{(acc.pubkey||'').slice(0,6)+'...'+(acc.pubkey||'').slice(-4)}</Text>
              </View>
              {idx === activeAccIdx && <Text style={{ color:C.green, fontSize:18, marginRight:8 }}>✓</Text>}
              <TouchableOpacity onPress={() => setMenuAccIdx(menuAccIdx === idx ? null : idx)}
                style={{ padding:8 }}>
                <Ionicons name="ellipsis-vertical" size={18} color={C.muted} />
              </TouchableOpacity>
            </TouchableOpacity>
            {menuAccIdx === idx && (
              <View style={{ backgroundColor:'#1c2128', marginHorizontal:16, marginBottom:8, borderRadius:12, overflow:'hidden', borderWidth:1, borderColor:'#30363d' }}>
                <TouchableOpacity onPress={() => { setMenuAccIdx(null); setManagingAcc(acc); setManagingAccIdx(idx); setEditName(acc.name||''); setSettingsView('manageWallet'); }}
                  style={{ flexDirection:'row', alignItems:'center', padding:14, gap:10, borderBottomWidth:1, borderBottomColor:'#30363d' }}>
                  <Ionicons name="person-outline" size={16} color={C.text} />
                  <Text style={{ color:C.text, fontSize:14 }}>Manage Wallet</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => { setMenuAccIdx(null); Clipboard.setString(acc.pubkey||''); Alert.alert('Copied','Address copied'); }}
                  style={{ flexDirection:'row', alignItems:'center', padding:14, gap:10 }}>
                  <Ionicons name="copy-outline" size={16} color={C.text} />
                  <Text style={{ color:C.text, fontSize:14 }}>Copy Address</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        ))}
      </View>
    </ScrollView>
  );

  const AVATARS = ['😀','😎','🦊','🐸','🦁','🐯','🐻','🦄','🐙','🎭','🤖','👾','🔥','⚡','🌙','💎','🚀','🎯','🧠','🎪'];

  if (settingsView === 'manageWallet' && managingAcc) return (
    <ScrollView contentContainerStyle={{ paddingBottom:100 }}>
      <Header title="Manage Account" back="manageAccounts" />
      <View style={{ alignItems:'center', padding:24 }}>
        <TouchableOpacity style={{ position:'relative', marginBottom:16 }}>
          <View style={{ width:80, height:80, borderRadius:40, backgroundColor:C.green, alignItems:'center', justifyContent:'center' }}>
            <Text style={{ fontSize:36 }}>{managingAcc.avatar||managingAcc.name?.[0]||'A'}</Text>
          </View>
          <View style={{ position:'absolute', bottom:0, right:0, width:24, height:24, borderRadius:12, backgroundColor:'#1c2128', alignItems:'center', justifyContent:'center', borderWidth:1, borderColor:C.green }}>
            <Ionicons name="pencil" size={12} color={C.green} />
          </View>
        </TouchableOpacity>
        <View style={{ flexDirection:'row', alignItems:'center', gap:8, marginBottom:4 }}>
          <TextInput value={editName} onChangeText={setEditName}
            style={{ color:C.text, fontSize:18, fontWeight:'bold', textAlign:'center', borderBottomWidth:1, borderBottomColor:C.green, minWidth:120, paddingBottom:4 }}
            onBlur={() => {
              const updated = (accounts||[]).map((a:any, i:number) => i === managingAccIdx ? {...a, name: editName} : a);
              setAccounts(updated);
              setManagingAcc({...managingAcc, name: editName});
              AsyncStorage.setItem('accounts', JSON.stringify(updated));
            }} />
          <Ionicons name="pencil" size={14} color={C.green} />
        </View>
        <Text style={{ color:C.muted, fontSize:12 }}>{(managingAcc.pubkey||'').slice(0,6)+'...'+(managingAcc.pubkey||'').slice(-6)}</Text>
      </View>
      <View style={{ flexDirection:'row', flexWrap:'wrap', paddingHorizontal:16, gap:8, marginBottom:24, justifyContent:'center' }}>
        {AVATARS.map((emoji, i) => (
          <TouchableOpacity key={i} onPress={() => {
            const updated = (accounts||[]).map((a:any, idx:number) => idx === managingAccIdx ? {...a, avatar: emoji} : a);
            setAccounts(updated);
            setManagingAcc({...managingAcc, avatar: emoji});
            AsyncStorage.setItem('accounts', JSON.stringify(updated));
          }} style={{ width:44, height:44, borderRadius:22, backgroundColor: managingAcc.avatar===emoji ? C.green+'33' : '#1c2128', alignItems:'center', justifyContent:'center', borderWidth:1, borderColor: managingAcc.avatar===emoji ? C.green : '#30363d' }}>
            <Text style={{ fontSize:22 }}>{emoji}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={{ marginHorizontal:16, backgroundColor:'#1c2128', borderRadius:14, overflow:'hidden', marginBottom:16 }}>
        <TouchableOpacity onPress={() => { setShowWarning('key'); }}
          style={{ flexDirection:'row', alignItems:'center', justifyContent:'space-between', padding:16, borderBottomWidth:1, borderBottomColor:'#30363d' }}>
          <Text style={{ color:C.text, fontSize:15, fontWeight:'500' }}>Show Private Key</Text>
          <Ionicons name="chevron-forward" size={18} color={C.muted} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => { setShowWarning('seed'); }}
          style={{ flexDirection:'row', alignItems:'center', justifyContent:'space-between', padding:16 }}>
          <Text style={{ color:C.text, fontSize:15, fontWeight:'500' }}>Show Recovery Phrase</Text>
          <Ionicons name="chevron-forward" size={18} color={C.muted} />
        </TouchableOpacity>
      </View>
      <TouchableOpacity onPress={() => {
        Alert.alert('Remove Account', 'Remove this account? This cannot be undone.', [
          { text:'Cancel', style:'cancel' },
          { text:'Remove', style:'destructive', onPress: async () => {
            const updated = (accounts||[]).filter((_:any, i:number) => i !== managingAccIdx);
            setAccounts(updated);
            await AsyncStorage.setItem('accounts', JSON.stringify(updated));
            if(managingAccIdx >= updated.length) switchAccount(Math.max(0, updated.length-1));
            setSettingsView('manageAccounts');
          }}
        ]);
      }} style={{ marginHorizontal:16, borderRadius:14, borderWidth:1, borderColor:'#ff4444', padding:16, alignItems:'center' }}>
        <Text style={{ color:'#ff4444', fontWeight:'600' }}>Remove Account</Text>
      </TouchableOpacity>
      {showWarning && (
        <Modal transparent animationType="slide" visible={true}>
          <View style={{ flex:1, justifyContent:'flex-end', backgroundColor:'rgba(0,0,0,0.5)' }}>
            <View style={{ backgroundColor:'#1c2128', borderTopLeftRadius:24, borderTopRightRadius:24, padding:24 }}>
              <View style={{ alignItems:'center', marginBottom:16 }}>
                <View style={{ width:48, height:48, borderRadius:24, backgroundColor:'#30363d', alignItems:'center', justifyContent:'center', marginBottom:12 }}>
                  <Ionicons name="warning-outline" size={24} color={C.text} />
                </View>
                <Text style={{ color:C.text, fontSize:20, fontWeight:'bold', marginBottom:8 }}>Warning</Text>
                <Text style={{ color:C.muted, fontSize:14, textAlign:'center', marginBottom:16 }}>Please read the following carefully before viewing your recovery phrase or private key</Text>
              </View>
              {[
                { icon:'wallet-outline', text:'Your recovery phrase or private key is the only way to recover your account' },
                { icon:'eye-off-outline', text:'View this in a private area and do not let anyone see it' },
                { icon:'close-circle-outline', text:'Do not share this with anyone' },
              ].map((item, i) => (
                <View key={i} style={{ flexDirection:'row', alignItems:'center', gap:12, marginBottom:14 }}>
                  <View style={{ width:36, height:36, borderRadius:18, backgroundColor:'#30363d', alignItems:'center', justifyContent:'center' }}>
                    <Ionicons name={item.icon as any} size={18} color={C.text} />
                  </View>
                  <Text style={{ color:C.text, fontSize:13, flex:1 }}>{item.text}</Text>
                </View>
              ))}
              <TouchableOpacity onPress={async () => {
                try {
                  if (showWarning === 'key') {
                    const pk = await getPrivateKey(managingAcc.mnemonic);
                    setRevealData(pk||''); setRevealType('key');
                  } else {
                    setRevealData(managingAcc.mnemonic||''); setRevealType('seed');
                  }
                  setRevealed(false); setShowWarning(null); setSettingsView('revealSecret');
                } catch(e) { Alert.alert('Error','Could not retrieve secret'); }
              }} style={{ backgroundColor:C.green, borderRadius:14, padding:16, alignItems:'center', marginTop:8 }}>
                <Text style={{ color:'#0d1117', fontWeight:'bold', fontSize:16 }}>
                  {showWarning === 'key' ? 'Show Private Key' : 'Show Recovery Phrase'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setShowWarning(null)} style={{ padding:16, alignItems:'center' }}>
                <Text style={{ color:C.muted }}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}
    </ScrollView>
  );

  if (settingsView === 'revealSecret') return (
    <ScrollView contentContainerStyle={{ paddingBottom:100 }}>
      <Header title="" back="manageWallet" />
      <View style={{ padding:20 }}>
        <View style={{ backgroundColor:'#2d1f00', borderRadius:12, padding:14, flexDirection:'row', alignItems:'flex-start', gap:10, marginBottom:20 }}>
          <Ionicons name="warning-outline" size={16} color="#f0a500" />
          <Text style={{ color:'#f0a500', fontSize:13, flex:1 }}>Keep this information secure. We will never request your secret phrase, which is securely stored on your device.</Text>
        </View>
        <Text style={{ color:C.text, fontSize:24, fontWeight:'bold', marginBottom:6 }}>
          {revealType === 'key' ? 'Your private key' : 'Your seed phrase'}
        </Text>
        <Text style={{ color:C.muted, fontSize:13, marginBottom:20 }}>
          {revealType === 'key' ? 'Please keep this private key safe and do not share with anyone.' : 'Please write down the following words in correct order. Keep it safe and do not share with anyone.'}
        </Text>
        <TouchableOpacity onPress={() => setRevealed(r => !r)}
          style={{ backgroundColor:'#1c2128', borderRadius:16, padding:20, minHeight:120, alignItems:'center', justifyContent:'center', marginBottom:12 }}>
          {!revealed ? (
            <View style={{ alignItems:'center', gap:8 }}>
              <View style={{ position:'absolute', top:0, left:0, right:0, bottom:0, borderRadius:16, backgroundColor:'rgba(13,17,23,0.7)' }} />
              <Ionicons name="eye-off-outline" size={28} color={C.text} />
              <Text style={{ color:C.text, fontWeight:'600' }}>Tap to view the {revealType === 'key' ? 'private key' : 'seed phrase'}</Text>
              <Text style={{ color:C.muted, fontSize:12 }}>Make sure no one is looking at your screen.</Text>
            </View>
          ) : revealType === 'seed' ? (
            <View style={{ flexDirection:'row', gap:12 }}>
              <View style={{ flex:1, gap:8 }}>
                {revealData.split(' ').slice(0, Math.ceil(revealData.split(' ').length/2)).map((w:string, i:number) => (
                  <View key={i} style={{ flexDirection:'row', gap:6, alignItems:'center' }}>
                    <Text style={{ color:C.muted, fontSize:11, width:18 }}>{i+1}.</Text>
                    <Text style={{ color:C.text, fontSize:13 }}>{w}</Text>
                  </View>
                ))}
              </View>
              <View style={{ flex:1, gap:8 }}>
                {revealData.split(' ').slice(Math.ceil(revealData.split(' ').length/2)).map((w:string, i:number) => (
                  <View key={i} style={{ flexDirection:'row', gap:6, alignItems:'center' }}>
                    <Text style={{ color:C.muted, fontSize:11, width:18 }}>{Math.ceil(revealData.split(' ').length/2)+i+1}.</Text>
                    <Text style={{ color:C.text, fontSize:13 }}>{w}</Text>
                  </View>
                ))}
              </View>
            </View>
          ) : (
            <Text style={{ color:C.text, fontSize:12, fontFamily:'monospace', textAlign:'center', lineHeight:20 }}>{revealData}</Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity onPress={() => { Clipboard.setString(revealData); Alert.alert('Copied','Copied to clipboard'); }}
          style={{ backgroundColor:'#1c2128', borderRadius:14, padding:14, alignItems:'center', flexDirection:'row', justifyContent:'center', gap:8, marginBottom:16 }}>
          <Ionicons name="copy-outline" size={16} color={C.text} />
          <Text style={{ color:C.text, fontWeight:'500' }}>Copy</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setSettingsView('manageWallet')}
          style={{ backgroundColor:C.green, borderRadius:14, padding:16, alignItems:'center' }}>
          <Text style={{ color:'#0d1117', fontWeight:'bold', fontSize:16 }}>Done</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );

  if (settingsView === 'addAccount') return (
    <ScrollView contentContainerStyle={{ paddingBottom:100 }}>
      <Header title="Add Account" back="manageAccounts" />
      <View style={{ padding:20, gap:12 }}>
        {[
          { label:'Create New Account', sub:'Add a new account', icon:'add-circle-outline', next:'createAccount' },
          { label:'Import Recovery Phrase', sub:'Restore from 12 or 24 word phrase', icon:'document-text-outline', next:'importPhrase' },
          { label:'Import Private Key', sub:'Import a single account', icon:'download-outline', next:'importPrivKey' },
          { label:'Watch Address', sub:'Track any public wallet address', icon:'eye-outline', next:'watchAddress' },
        ].map((item, i) => (
          <TouchableOpacity key={i} onPress={() => setSettingsView(item.next)}
            style={{ flexDirection:'row', alignItems:'center', backgroundColor:'#1c2128', borderRadius:14, padding:18, borderWidth:1, borderColor:'#30363d' }}>
            <View style={{ width:40, height:40, borderRadius:20, backgroundColor:'#0d1117', alignItems:'center', justifyContent:'center', marginRight:14 }}>
              <Ionicons name={item.icon as any} size={20} color={C.green} />
            </View>
            <View style={{ flex:1 }}>
              <Text style={{ color:C.text, fontWeight:'bold', fontSize:15 }}>{item.label}</Text>
              <Text style={{ color:C.muted, fontSize:12, marginTop:2 }}>{item.sub}</Text>
            </View>
            <Text style={{ color:C.muted, fontSize:18 }}>›</Text>
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );

  if (settingsView === 'createAccount') return (
    <ScrollView contentContainerStyle={{ paddingBottom:100 }}>
      <Header title="Create Account" back="addAccount" />
      <View style={{ padding:20 }}>
        <TextInput value={newAccName} onChangeText={setNewAccName}
          style={{ backgroundColor:'#1c2128', color:C.text, borderRadius:12, padding:14, fontSize:15, marginBottom:24 }}
          placeholderTextColor={C.muted} />
        <TouchableOpacity onPress={async () => {
          addAccount();
          await new Promise(r => setTimeout(r, 100));
          const updated = await AsyncStorage.getItem('accounts');
          const final = updated ? JSON.parse(updated) : [];
          if(final.length > 0 && newAccName.trim()) {
            final[final.length-1].name = newAccName.trim();
            await AsyncStorage.setItem('accounts', JSON.stringify(final));
          }
          switchAccount(final.length-1);
          setSettingsView('main');
        }} style={{ backgroundColor:C.green, borderRadius:14, padding:16, alignItems:'center' }}>
          <Text style={{ color:'#0d1117', fontWeight:'bold', fontSize:16 }}>Create</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );

  if (settingsView === 'selectImportAccounts') return (
    <ScrollView contentContainerStyle={{ paddingBottom:100 }}>
      <Header title="Select accounts to import" back="importPhrase" />
      <View style={{ padding:20 }}>
        <View style={{ alignItems:'center', marginBottom:24 }}>
          <View style={{ width:64, height:64, borderRadius:32, backgroundColor:'#1c2128', alignItems:'center', justifyContent:'center', marginBottom:12 }}>
            <Ionicons name="wallet-outline" size={28} color={C.text} />
          </View>
          <Text style={{ color:C.text, fontSize:18, fontWeight:'bold', marginBottom:4 }}>
            We've found {discoveredAccounts.filter((a:any)=>!a.imported).length} wallets with activity
          </Text>
          <Text style={{ color:C.muted, fontSize:13, textAlign:'center' }}>Select which accounts to import</Text>
        </View>
        <TouchableOpacity onPress={() => {
          const nonImported = discoveredAccounts.filter((a:any)=>!a.imported).map((a:any)=>a.index);
          setSelectedAccIdxs(selectedAccIdxs.length === nonImported.length ? [] : nonImported);
        }} style={{ alignSelf:'flex-end', marginBottom:8 }}>
          <Text style={{ color:C.green, fontWeight:'600' }}>
            {selectedAccIdxs.length === discoveredAccounts.filter((a:any)=>!a.imported).length ? 'Deselect All' : 'Select All'}
          </Text>
        </TouchableOpacity>
        <View style={{ backgroundColor:'#1c2128', borderRadius:16, overflow:'hidden' }}>
          {discoveredAccounts.map((acc:any) => (
            <TouchableOpacity key={acc.index} onPress={() => {
              if(acc.imported) return;
              setSelectedAccIdxs(prev => prev.includes(acc.index) ? prev.filter(i=>i!==acc.index) : [...prev, acc.index]);
            }} style={{ flexDirection:'row', alignItems:'center', padding:16, borderBottomWidth:1, borderBottomColor:'#30363d' }}>
              <View style={{ width:40, height:40, borderRadius:20, backgroundColor:'#30363d', alignItems:'center', justifyContent:'center', marginRight:12 }}>
                <Ionicons name="wallet-outline" size={18} color={C.text} />
              </View>
              <View style={{ flex:1 }}>
                <Text style={{ color:C.text, fontWeight:'600', fontSize:14 }}>{acc.name}</Text>
                <Text style={{ color:C.muted, fontSize:11 }}>{acc.imported ? 'Imported' : acc.balance > 0 ? '$'+acc.balance.toFixed(3) : '$0.00'}</Text>
              </View>
              {acc.imported
                ? <Text style={{ color:C.green, fontSize:12, minWidth:80, textAlign:'right' }}>✓ {acc.balance > 0 ? '$'+acc.balance.toFixed(3) : '$0.00'}</Text>
                : <View style={{ width:22, height:22, borderRadius:6, borderWidth:2, borderColor: selectedAccIdxs.includes(acc.index) ? C.green : '#30363d', backgroundColor: selectedAccIdxs.includes(acc.index) ? C.green : 'transparent', alignItems:'center', justifyContent:'center' }}>
                    {selectedAccIdxs.includes(acc.index) && <Ionicons name="checkmark" size={14} color="#0d1117" />}
                  </View>
              }
            </TouchableOpacity>
          ))}
        </View>
      </View>
      <View style={{ paddingHorizontal:20 }}>
        <TouchableOpacity onPress={async () => {
          if(selectedAccIdxs.length === 0){ Alert.alert('Select at least one account'); return; }
          try {
            const raw = await AsyncStorage.getItem('accounts');
            const existing = raw ? JSON.parse(raw) : [];
            let updated = [...existing];
            for(const idx of selectedAccIdxs) {
              const acc = discoveredAccounts.find((a:any)=>a.index===idx);
              if(!acc) continue;
              const { publicKey: pk } = deriveWalletAtIndex(importSeedInput.trim(), idx);
              updated.push({ id: updated.length+1, name: acc.name, mnemonic: importSeedInput.trim(), pubkey: pk, derivationIndex: idx });
            }
            await AsyncStorage.setItem('accounts', JSON.stringify(updated));
            await AsyncStorage.setItem('active_acc', String(updated.length-1));
            switchAccount(updated.length-1);
            setImportSeedInput('');
            setSettingsView('main');
            Alert.alert('Imported', selectedAccIdxs.length + ' account(s) imported');
          } catch(e) { Alert.alert('Error','Import failed'); }
        }} style={{ backgroundColor:C.green, borderRadius:14, padding:16, alignItems:'center', marginTop:16 }}>
          <Text style={{ color:'#0d1117', fontWeight:'bold', fontSize:16 }}>Import</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );

  if (settingsView === 'importPhrase') return (
    <ScrollView contentContainerStyle={{ paddingBottom:100 }}>
      <Header title="Import Recovery Phrase" back="addAccount" />
      <View style={{ padding:20 }}>
        <Text style={{ color:C.muted, fontSize:13, marginBottom:12, lineHeight:20 }}>
          Restore an existing wallet with your 12 or 24-word recovery phrase
        </Text>
        <TextInput value={importSeedInput} onChangeText={setImportSeedInput}
          placeholder="Recovery Phrase" placeholderTextColor={C.muted}
          multiline numberOfLines={4} autoCapitalize="none"
          style={{ backgroundColor:'#1c2128', color:C.text, borderRadius:12, padding:14, fontSize:14, minHeight:100, marginBottom:16 }} />
        <TouchableOpacity onPress={async () => {
          const words = importSeedInput.trim().split(/\s+/);
          if(words.length !== 12 && words.length !== 24){ Alert.alert('Invalid','Enter a valid 12 or 24 word seed phrase'); return; }
          try {
            setDiscovering(true);
            const raw = await AsyncStorage.getItem('accounts');
            const existing = raw ? JSON.parse(raw) : [];
            const found: any[] = [];
            let emptyStreak = 0;
            for(let i = 0; i < 20; i++) {
              try {
                const { publicKey: pk } = deriveWalletAtIndex(importSeedInput.trim(), i);
                const alreadyImported = existing.find((a:any) => a.pubkey === pk);
                const [balRes, txRes] = await Promise.all([
                  rpcFetch('getBalance', [pk, {commitment:'confirmed'}]).catch(()=>null),
                  rpcFetch('getSignaturesForAddress', [pk, {limit:1}]).catch(()=>null),
                ]);
                const balance = (balRes?.value||0) / 1e9;
                const hasTx = Array.isArray(txRes) && txRes.length > 0;
                const active = balance > 0 || hasTx || !!alreadyImported;
                if(active) {
                  found.push({ index: i, pubkey: pk, balance, name: alreadyImported?.name||('Account '+(i+1)), imported: !!alreadyImported });
                  emptyStreak = 0;
                } else {
                  emptyStreak++;
                  if(emptyStreak >= 2) break;
                }
              } catch(e) { break; }
            }
            setDiscoveredAccounts(found);
            setSelectedAccIdxs(found.filter((a:any) => !a.imported && a.balance > 0).map((a:any) => a.index));
            setDiscovering(false);
            setSettingsView('selectImportAccounts');
          } catch { setDiscovering(false); Alert.alert('Error','Invalid seed phrase'); }
        }} style={{ backgroundColor:C.green, borderRadius:14, padding:16, alignItems:'center', opacity: discovering ? 0.6 : 1 }} disabled={discovering}>
          {discovering ? <ActivityIndicator color="#0d1117" /> : <Text style={{ color:'#0d1117', fontWeight:'bold', fontSize:16 }}>Import</Text>}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );

  if (settingsView === 'importPrivKey') return (
    <ScrollView contentContainerStyle={{ paddingBottom:100 }}>
      <Header title="Import Private Key" back="addAccount" />
      <View style={{ padding:20, gap:12 }}>
        <View style={{ backgroundColor:'#1c2128', borderRadius:12, padding:14, flexDirection:'row', alignItems:'center', justifyContent:'space-between' }}>
          <Text style={{ color:C.text, fontSize:15, fontWeight:'600' }}>Network</Text>
          <Text style={{ color:C.muted, fontSize:14 }}>Solana ›</Text>
        </View>
        <TextInput value={privKeyName} onChangeText={setPrivKeyName}
          placeholder="Name" placeholderTextColor={C.muted}
          style={{ backgroundColor:'#1c2128', color:C.text, borderRadius:12, padding:14, fontSize:14 }} />
        <View style={{ backgroundColor:'#1c2128', borderRadius:12, padding:14, flexDirection:'row', alignItems:'center' }}>
          <TextInput value={privKeyInput} onChangeText={setPrivKeyInput}
            placeholder="Private key" placeholderTextColor={C.muted}
            autoCapitalize="none" secureTextEntry style={{ flex:1, color:C.text, fontSize:14 }} />
          <TouchableOpacity onPress={async () => { const txt = await Clipboard.getString(); setPrivKeyInput(txt); }}>
            <Text style={{ color:C.green, fontWeight:'bold', fontSize:14 }}>Paste</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity onPress={async () => {
          if(!privKeyInput.trim()){ Alert.alert('Error','Enter a private key'); return; }
          try {
            const ALPHA='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
            const bs58=(b:Uint8Array)=>{const d:number[]=[],carry=0;let c=carry;for(let i=0;i<b.length;i++){c=b[i];for(let j=0;j<d.length;j++){c+=d[j]<<8;d[j]=c%58;c=Math.floor(c/58);}while(c>0){d.push(c%58);c=Math.floor(c/58);}}return b.slice(0,b.findIndex((x:number)=>x!==0)).map(()=>'1').join('')+d.reverse().map((x:number)=>ALPHA[x]).join('');};
            const decodeBase58=(s:string)=>{const d=new Uint8Array(64);let i,j,c;let carry=0;const out=[];for(i=0;i<s.length;i++){c=ALPHA.indexOf(s[i]);if(c<0)throw new Error('bad char');carry=c;for(j=out.length-1;j>=0;j--){carry+=58*out[j];out[j]=carry&0xff;carry>>=8;}while(carry>0){out.unshift(carry&0xff);carry>>=8;}}for(i=0;i<s.length&&s[i]==='1';i++)out.unshift(0);return new Uint8Array(out);};
            let keyBytes: Uint8Array;
            const raw = privKeyInput.trim();
            if(raw.startsWith('[')){
              keyBytes = Uint8Array.from(JSON.parse(raw));
            } else {
              // base58 encoded private key
              const decoded = decodeBase58(raw);
              keyBytes = decoded.length === 64 ? decoded : decoded.slice(0, 64);
            }
            const kp = nacl.sign.keyPair.fromSecretKey(keyBytes);
            const pk = bs58(kp.publicKey);
            const accRaw = await AsyncStorage.getItem('accounts');
            const existing = accRaw ? JSON.parse(accRaw) : [];
            const dupIdx = existing.findIndex((a:any) => a.pubkey === pk || a.privkey === privKeyInput.trim());
            if(dupIdx !== -1){ switchAccount(dupIdx); setPrivKeyInput(''); setPrivKeyName(''); setSettingsView('main'); Alert.alert('Already exists','Switched to existing account'); return; }
            const name = privKeyName.trim() || 'Account '+(existing.length+1);
            const updated = [...existing, { id:existing.length+1, name, privkey:privKeyInput.trim(), pubkey:pk }];
            await AsyncStorage.setItem('accounts', JSON.stringify(updated));
            await AsyncStorage.setItem('active_acc', String(existing.length));
            switchAccount(updated.length-1);
            setPrivKeyInput(''); setPrivKeyName('');
            setSettingsView('main');
          } catch { Alert.alert('Error','Invalid private key'); }
        }} style={{ backgroundColor:C.green, borderRadius:14, padding:16, alignItems:'center', marginTop:8 }}>
          <Text style={{ color:'#0d1117', fontWeight:'bold', fontSize:16 }}>Import</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );

  if (settingsView === 'watchAddress') return (
    <ScrollView contentContainerStyle={{ paddingBottom:100 }}>
      <Header title="Watch Address" back="addAccount" />
      <View style={{ padding:20, gap:12 }}>
        <Text style={{ color:C.muted, fontSize:13, lineHeight:20 }}>
          Add an address you would like to watch. You will have view-only access and cannot sign transactions.
        </Text>
        <View style={{ backgroundColor:'#1c2128', borderRadius:12, padding:14, flexDirection:'row', alignItems:'center', justifyContent:'space-between' }}>
          <Text style={{ color:C.text, fontSize:15, fontWeight:'600' }}>Network</Text>
          <Text style={{ color:C.muted, fontSize:14 }}>Solana ›</Text>
        </View>
        <TextInput value={watchName} onChangeText={setWatchName}
          placeholder="Name" placeholderTextColor={C.muted}
          style={{ backgroundColor:'#1c2128', color:C.text, borderRadius:12, padding:14, fontSize:14 }} />
        <View style={{ backgroundColor:'#1c2128', borderRadius:12, padding:14, flexDirection:'row', alignItems:'center' }}>
          <TextInput value={watchAddr} onChangeText={setWatchAddr}
            placeholder="Address or Domain" placeholderTextColor={C.muted} autoCapitalize="none"
            style={{ flex:1, color:C.text, fontSize:14 }} />
          <TouchableOpacity onPress={async () => { const txt = await Clipboard.getString(); setWatchAddr(txt); }}>
            <Text style={{ color:C.green, fontWeight:'bold', fontSize:14 }}>Paste</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity onPress={async () => {
          if(!watchAddr.trim()){ Alert.alert('Error','Enter an address'); return; }
          const raw = await AsyncStorage.getItem('accounts');
          const existing = raw ? JSON.parse(raw) : [];
          const name = watchName.trim() || 'Watch '+(existing.length+1);
          const updated = [...existing, { id:existing.length+1, name, pubkey:watchAddr.trim(), watchOnly:true }];
          await AsyncStorage.setItem('accounts', JSON.stringify(updated));
          await AsyncStorage.setItem('active_acc', String(existing.length));
          switchAccount(updated.length-1);
          setWatchAddr(''); setWatchName('');
          setSettingsView('main');
        }} style={{ backgroundColor:C.green, borderRadius:14, padding:16, alignItems:'center', marginTop:8 }}>
          <Text style={{ color:'#0d1117', fontWeight:'bold', fontSize:16 }}>Import</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );

  return null;
}

export default function App() {
  const [mwaInitUrl, setMwaInitUrl] = React.useState<string|null>(null);
  React.useEffect(() => {
    const handle = ({ url }: { url: string }) => {
      if (!url) return;
      if (url.startsWith('solana-wallet://') || url.startsWith('chatfi://')) {
        setTab('dapp');
        try {
          const parsed = new URL(url);
          const dapp = parsed.searchParams.get('dapp_uri') || parsed.searchParams.get('ref');
          if (dapp) setMwaInitUrl(dapp);
        } catch(_) {}
      }
    };
    ExpoLinking.getInitialURL().then(url => { if (url) handle({ url }); });
    const sub = ExpoLinking.addEventListener('url', handle);
    return () => sub.remove();
  }, []);
  const [tab, setTab] = useState('portfolio');
  const [showChat, setShowChat] = useState(false);
  React.useEffect(()=>{AsyncStorage.getItem('active_tab').then(t=>{if(t && t !== 'chat')setTab(t);});},[]);
  const setTabPersist = React.useCallback((t:string)=>{setTab(t);AsyncStorage.setItem('active_tab',t);},[]);
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

  // Sync header name+avatar when active account changes
  React.useEffect(() => {
    const acc = (accounts||[])[activeAccIdx];
    if(acc?.name) setUserName(acc.name);
  }, [accounts, activeAccIdx]);

  React.useEffect(() => {
    // Load saved settings
    (async () => {
      const lang = await AsyncStorage.getItem('app_language'); if(lang) setAppLanguage(lang);
      const cur = await AsyncStorage.getItem('app_currency'); if(cur) { setAppCurrency(cur); setCurrencySymbol(CURRENCY_SYMBOLS[cur]||cur); }
      const net = await AsyncStorage.getItem('app_network'); if(net) setAppNetwork(net);
    })();
    // Fetch exchange rates
    fetch('https://open.er-api.com/v6/latest/USD')
      .then(r=>r.json())
      .then(d=>{ if(d?.rates) setExchangeRates(d.rates); })
      .catch(()=>{});
  }, []);
  const [showAccDropdown, setShowAccDropdown] = useState(false);
  const [selectedToken, setSelectedToken] = useState<any>(null);
  const [userName, setUserName] = useState('');
  const [appLanguage, setAppLanguage] = React.useState('English');
  const [appCurrency, setAppCurrency] = React.useState('USD');
  const [appNetwork, setAppNetwork] = React.useState('mainnet');
  const [exchangeRates, setExchangeRates] = React.useState<any>({USD:1});
  const [currencySymbol, setCurrencySymbol] = React.useState('$');
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
  const [fromToken2, setFromToken2] = useState<{symbol:string,mint:string,logoURI?:string}>({symbol:'SOL',mint:'So11111111111111111111111111111111111111112',logoURI:'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/solana/info/logo.png',decimals:9});
  const [toToken2, setToToken2] = useState<{symbol:string,mint:string,logoURI?:string}>({symbol:'USDC',mint:'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',logoURI:'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48/logo.png',decimals:6});

  const [txHistory, setTxHistory] = useState<any[]>([]);
  const [txLoading, setTxLoading] = useState(false);
  const [showTxModal, setShowTxModal] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmData, setConfirmData] = useState<any>(null);

  // Toast system
  const [toast, setToast] = useState<{msg:string,type:'success'|'error'|'info'}|null>(null);
  const toastTimer = useRef<any>(null);
  const lastFetch = useRef<number>(0);
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
    if (pubkey && tab === 'portfolio') { if (!lastFetch.current || Date.now() - lastFetch.current > 120000) { fetchPortfolio(); fetchTxHistory(); } }
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
    if(acc.name) setUserName(acc.name);
    setActiveAccIdx(idx);
    setWallet(acc.mnemonic || acc.privkey || null);
    setPubkey(acc.pubkey);
    await AsyncStorage.setItem('active_acc', String(idx));
    if(acc.mnemonic) await AsyncStorage.setItem('wallet_mnemonic', acc.mnemonic);
  };
  const fetchPortfolio = async (silent = false) => {
    lastFetch.current = Date.now();
    if (!pubkey) return;
    const cacheKey = 'portfolio_cache_' + pubkey;
    if (!silent) {
      try {
        const cached = await AsyncStorage.getItem(cacheKey);
        if (cached) {
          const { tokens: ct, ts } = JSON.parse(cached);
          if (ct && Date.now() - ts < 600000) {
            const sol = ct.find((t:any) => t.symbol === 'SOL');
            setSolBalance(sol?.amount || 0);
            setSolPrice(sol?.price || 0);
            setTokenBalances(ct);
            setPortfolioLoading(false);
          }
        }
      } catch(e) {}
    }
    if(tokenBalances.length === 0) setPortfolioLoading(true);
    try {
      let verifiedMints = new Set<string>();
      try {
        const cachedV = await AsyncStorage.getItem('verified_mints_cache');
        if (cachedV) {
          const { mints, ts } = JSON.parse(cachedV);
          if (Date.now() - ts < 3600000) {
            verifiedMints = new Set(mints);
          }
        }
        if (verifiedMints.size === 0) {
          const vr = await fetch('https://tokens.jup.ag/tokens?tags=verified');
          const vd = await vr.json();
          const mints = Array.isArray(vd) ? vd.map((x: any) => typeof x === 'string' ? x : (x.address || x.mint)).filter(Boolean) : [];
          verifiedMints = new Set(mints);
          AsyncStorage.setItem('verified_mints_cache', JSON.stringify({ mints, ts: Date.now() }));
        }
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
        const pr=await fetch('https://lite-api.jup.ag/price/v3?ids='+mints);
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




  const updateCard = (msgId: number, updates: any) => {
    setMsgs(p => p.map(m => m.id === msgId ? {...m, card: {...m.card, ...updates}} : m));
  };




  const EarnActionCard = ({card,isDeposit,pubkey,wallet,deriveWallet,requireAuth,rpcFetch,showToast,fetchPortfolio,C,s}:any) => {
    const vault = card?.data?.preVault;
    const [amount, setAmount] = React.useState("");
    const [loading, setLoading] = React.useState(false);
    if (!vault) return <View style={{backgroundColor:C.card,borderRadius:16,padding:16,marginBottom:8}}><Text style={{color:C.muted}}>No vault selected.</Text></View>;
    const execute = async () => {
      if (!amount||parseFloat(amount)<=0){Alert.alert("Enter amount");return;}
      const authed=await requireAuth(); if(!authed)return;
      setLoading(true);
      try {
        const dec=vault.dec||6;
        const amtRaw=Math.floor(parseFloat(amount)*Math.pow(10,dec)).toString();
        const ep=isDeposit?"deposit":"withdraw";
        const res=await fetch("https://chatfi.pro/api/jupiter",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({url:"https://api.jup.ag/lend/v1/earn/"+ep,method:"POST",body:{asset:vault.mint,signer:pubkey,amount:amtRaw}})});
        const txData=await res.json();
        if(txData.error)throw new Error(typeof txData.error==="string"?txData.error:JSON.stringify(txData.error));
        const txB64=txData.transaction||txData.tx||txData.data;
        if(!txB64)throw new Error("No transaction returned");
        const {secretKey:sk}=deriveWallet(wallet);
        const {VersionedTransaction,Keypair}=require("@solana/web3.js");
        const tx=VersionedTransaction.deserialize(Buffer.from(txB64,"base64"));
        tx.sign([Keypair.fromSecretKey(sk)]);
        const signed=Buffer.from(tx.serialize()).toString("base64");
        const sr=await rpcFetch("sendTransaction",[signed,{encoding:"base64",skipPreflight:false,preflightCommitment:"confirmed"}]);
        if(sr.error)throw new Error(sr.error.message);
        showToast("✅ "+(isDeposit?"Deposited":"Withdrawn")+" "+amount+" "+vault.sym,"success");
        fetchPortfolio();
      } catch(e:any){Alert.alert(isDeposit?"Deposit failed":"Withdraw failed",e.message);}
      finally{setLoading(false);}
    };
    return (
      <View style={{backgroundColor:C.card,borderRadius:16,padding:16,marginBottom:8,borderWidth:1,borderColor:C.border}}>
        <View style={s.botTag}><View style={s.botDot}/><Text style={s.botTagTxt}>ChatFi AI</Text></View>
        <Text style={{color:C.text,fontWeight:"700",fontSize:16,marginBottom:2}}>{isDeposit?"⬇ Deposit to Earn":"↑ Withdraw from Earn"}</Text>
        <View style={{flexDirection:"row",justifyContent:"space-between",alignItems:"center",padding:12,backgroundColor:C.bg,borderRadius:8,marginBottom:12}}>
          <Text style={{color:C.text,fontWeight:"700"}}>{vault.sym} Earn Vault</Text>
          <Text style={{color:C.green,fontWeight:"700"}}>{vault.apyStr}% APY</Text>
        </View>
        <TextInput style={{backgroundColor:C.bg,borderRadius:10,padding:12,color:C.text,fontSize:16,marginBottom:12,borderWidth:1,borderColor:C.border}} value={amount} onChangeText={setAmount} placeholder={"Amount of "+vault.sym} placeholderTextColor={C.muted} keyboardType="numeric"/>
        <TouchableOpacity style={{backgroundColor:loading?C.border:C.green,borderRadius:10,padding:12,alignItems:"center"}} disabled={loading} onPress={execute}>
          {loading?<ActivityIndicator color="#0d1117"/>:<Text style={{color:"#0d1117",fontWeight:"700"}}>{isDeposit?"⬇ Deposit "+vault.sym:"↑ Withdraw "+vault.sym}</Text>}
        </TouchableOpacity>
      </View>
    );
  };

  const MigrateEarnCard = ({card,pubkey,wallet,deriveWallet,requireAuth,rpcFetch,showToast,fetchPortfolio,setMsgs,C,s}:any) => {
    const {migrations=[],allVaults=[]}=card.data||{};
    const [idx,setIdx]=React.useState(0);
    const [loading,setLoading]=React.useState(false);
    const [done,setDone]=React.useState(false);
    const m=migrations[idx];
    if(!m)return null;
    const pr=(v:any)=>{const n=parseFloat(v||0);return(!n||n<=0)?0:n>100?n/100:n;};
    const execute=async()=>{
      const authed=await requireAuth(); if(!authed)return;
      setLoading(true);
      try{
        const {secretKey:sk,publicKey:pk}=deriveWallet(wallet);
        const {VersionedTransaction,Keypair}=require("@solana/web3.js");
        // Step 1: Withdraw from current vault
        showToast("⬆ Withdrawing "+m.humanAmt+" "+m.pos.sym+"...","info");
        const wRes=await fetch("https://lite-api.jup.ag/lend/v1/earn/withdraw",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({asset:m.pos.mint,signer:pk,amount:m.pos.underlyingBalance})});
        const wData=await wRes.json();
        if(wData.error)throw new Error(typeof wData.error==="string"?wData.error:JSON.stringify(wData.error));
        const wTx=VersionedTransaction.deserialize(Buffer.from(wData.transaction||wData.tx,"base64"));
        wTx.sign([Keypair.fromSecretKey(sk)]);
        const wSigned=Buffer.from(wTx.serialize()).toString("base64");
        const wSend=await rpcFetch("sendTransaction",[wSigned,{encoding:"base64",skipPreflight:false,preflightCommitment:"confirmed"}]);
        if(wSend.error)throw new Error(wSend.error.message);
        showToast("✅ Withdrawn! Depositing to "+m.best.sym+"...","info");
        await new Promise(r=>setTimeout(r,3000));
        // Step 2: Deposit to best vault (same asset amount)
        const dRes=await fetch("https://lite-api.jup.ag/lend/v1/earn/deposit",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({asset:m.best.mint,signer:pk,amount:m.pos.underlyingBalance})});
        const dData=await dRes.json();
        if(dData.error)throw new Error(typeof dData.error==="string"?dData.error:JSON.stringify(dData.error));
        const dTx=VersionedTransaction.deserialize(Buffer.from(dData.transaction||dData.tx,"base64"));
        dTx.sign([Keypair.fromSecretKey(sk)]);
        const dSigned=Buffer.from(dTx.serialize()).toString("base64");
        const dSend=await rpcFetch("sendTransaction",[dSigned,{encoding:"base64",skipPreflight:false,preflightCommitment:"confirmed"}]);
        if(dSend.error)throw new Error(dSend.error.message);
        setDone(true);
        showToast("✅ Migrated to "+m.best.sym+" ("+m.best.apyStr+"% APY)","success");
        fetchPortfolio();
      }catch(e:any){showToast("Migration failed: "+e.message,"error");}
      finally{setLoading(false);}
    };
    return(
      <View style={{backgroundColor:C.card,borderRadius:16,padding:16,marginBottom:8,borderWidth:1,borderColor:C.border}}>
        <View style={s.botTag}><View style={s.botDot}/><Text style={s.botTagTxt}>ChatFi AI</Text></View>
        <Text style={{color:C.text,fontWeight:"700",fontSize:16,marginBottom:4}}>⚡ Yield Migration</Text>
        <Text style={{color:C.muted,fontSize:12,marginBottom:12}}>{migrations.length} position{migrations.length>1?"s":""} can earn more</Text>
        {migrations.length>1&&(
          <View style={{flexDirection:"row",marginBottom:12,gap:6}}>
            {migrations.map((_:any,i:number)=>(
              <TouchableOpacity key={i} onPress={()=>setIdx(i)} style={{paddingHorizontal:10,paddingVertical:4,borderRadius:12,backgroundColor:idx===i?C.green:C.bg,borderWidth:1,borderColor:idx===i?C.green:C.border}}>
                <Text style={{color:idx===i?"#0d1117":C.text,fontSize:12}}>{migrations[i].pos.sym}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
        <View style={{flexDirection:"row",alignItems:"center",backgroundColor:C.bg,borderRadius:10,padding:12,marginBottom:12}}>
          <View style={{flex:1,alignItems:"center"}}>
            <Text style={{color:C.muted,fontSize:11}}>CURRENT</Text>
            <Text style={{color:C.text,fontWeight:"700",fontSize:16}}>{m.pos.sym}</Text>
            <Text style={{color:"#ef4444",fontWeight:"600"}}>{m.pos.apyStr}% APY</Text>
            <Text style={{color:C.muted,fontSize:11}}>{m.humanAmt} tokens</Text>
          </View>
          <Text style={{color:C.green,fontSize:24,marginHorizontal:8}}>→</Text>
          <View style={{flex:1,alignItems:"center"}}>
            <Text style={{color:C.muted,fontSize:11}}>BEST</Text>
            <Text style={{color:C.text,fontWeight:"700",fontSize:16}}>{m.best.sym}</Text>
            <Text style={{color:C.green,fontWeight:"700"}}>{m.best.apyStr}% APY</Text>
            <Text style={{color:C.green,fontSize:11}}>+{m.gain}% gain</Text>
          </View>
        </View>
        {done?(
          <Text style={{color:C.green,fontWeight:"700",textAlign:"center"}}>✅ Migration complete!</Text>
        ):loading?(
          <View style={{alignItems:"center",paddingVertical:8}}>
            <ActivityIndicator color={C.green}/>
            <Text style={{color:C.muted,fontSize:12,marginTop:6}}>Executing 2 transactions...</Text>
          </View>
        ):(
          <TouchableOpacity style={{backgroundColor:C.green,borderRadius:10,padding:12,alignItems:"center"}} onPress={execute}>
            <Text style={{color:"#0d1117",fontWeight:"700"}}>Migrate {m.pos.sym} → {m.best.sym}</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  const renderCard = (card: any) => {
    const { type, data, onConfirm, onCancel, status } = card;

    if (type === 'swap') {
      return (
        <View style={{backgroundColor:C.card,borderRadius:16,padding:16,marginBottom:8,borderWidth:1,borderColor:C.border}}>
          <View style={s.botTag}><View style={s.botDot}/><Text style={s.botTagTxt}>ChatFi AI</Text></View>
          <Text style={{color:C.text,fontWeight:'700',fontSize:16,marginBottom:12}}>Confirm Swap</Text>
          <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
            <View style={{alignItems:'center',flex:1}}>
              <Text style={{color:C.muted,fontSize:11}}>FROM</Text>
              <Text style={{color:C.text,fontWeight:'700',fontSize:18}}>{data.amount} {data.from}</Text>
            </View>
            <Text style={{color:C.green,fontSize:20}}>→</Text>
            <View style={{alignItems:'center',flex:1}}>
              <Text style={{color:C.muted,fontSize:11}}>TO</Text>
              <Text style={{color:C.text,fontWeight:'700',fontSize:18}}>{data.outAmount && !isNaN(parseFloat(data.outAmount)) ? `~${parseFloat(data.outAmount).toFixed(4)}` : '...'} {data.to}</Text>
            </View>
          </View>
          {data.priceImpact && <Text style={{color:C.muted,fontSize:12,textAlign:'center',marginBottom:4}}>Price impact: {data.priceImpact}%</Text>}
          <Text style={{color:C.muted,fontSize:12,textAlign:'center',marginBottom:12}}>Network fee: ~0.000005 SOL</Text>
          {status === 'loading' && <ActivityIndicator color={C.green} />}
          {status === 'success' && <Text style={{color:C.green,textAlign:'center',fontWeight:'700'}}>✅ Swap Complete!</Text>}
          {status === 'error' && <Text style={{color:C.red,textAlign:'center'}}>{card.error}</Text>}
          {!status && (
            <View style={{flexDirection:'row',gap:8}}>
              <TouchableOpacity onPress={onCancel} style={{flex:1,padding:12,borderRadius:10,borderWidth:1,borderColor:C.border,alignItems:'center',minWidth:80}}>
                <Text style={{color:C.muted}} numberOfLines={1}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={onConfirm} style={{flex:2,padding:12,borderRadius:10,backgroundColor:C.green,alignItems:'center'}}>
                <Text style={{color:'#0d1117',fontWeight:'700'}}>Confirm Swap</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      );
    }

    if (type === 'trigger') {
      return (
        <View style={{backgroundColor:C.card,borderRadius:16,padding:16,marginBottom:8,borderWidth:1,borderColor:C.border}}>
          <View style={s.botTag}><View style={s.botDot}/><Text style={s.botTagTxt}>ChatFi AI</Text></View>
          <Text style={{color:C.text,fontWeight:'700',fontSize:16,marginBottom:12}}>Confirm Limit Order</Text>
          <View style={{marginBottom:8}}>
            <View style={{flexDirection:'row',justifyContent:'space-between',paddingVertical:6,borderBottomWidth:1,borderBottomColor:C.border}}>
              <Text style={{color:C.muted}}>Action</Text>
              <Text style={{color:C.text,fontWeight:'600'}}>{data.direction==='below'?'Buy':'Sell'} {data.from}</Text>
            </View>
            <View style={{flexDirection:'row',justifyContent:'space-between',paddingVertical:6,borderBottomWidth:1,borderBottomColor:C.border}}>
              <Text style={{color:C.muted}}>Amount</Text>
              <Text style={{color:C.text,fontWeight:'600'}}>{data.amount} {data.from}</Text>
            </View>
            <View style={{flexDirection:'row',justifyContent:'space-between',paddingVertical:6,borderBottomWidth:1,borderBottomColor:C.border}}>
              <Text style={{color:C.muted}}>Trigger Price</Text>
              <Text style={{color:C.green,fontWeight:'600'}}>${data.targetPrice}</Text>
            </View>
            <View style={{flexDirection:'row',justifyContent:'space-between',paddingVertical:6}}>
              <Text style={{color:C.muted}}>Condition</Text>
              <Text style={{color:C.text,fontWeight:'600'}}>{data.direction==='below'?'When price drops below':'When price rises above'}</Text>
            </View>
          </View>
          {status === 'loading' && <ActivityIndicator color={C.green} />}
          {status === 'success' && <Text style={{color:C.green,textAlign:'center',fontWeight:'700'}}>✅ Limit Order Placed!</Text>}
          {status === 'error' && <Text style={{color:C.red,textAlign:'center'}}>{card.error}</Text>}
          {!status && (
            <View style={{flexDirection:'row',gap:8}}>
              <TouchableOpacity onPress={onCancel} style={{flex:1,padding:12,borderRadius:10,borderWidth:1,borderColor:C.border,alignItems:'center',minWidth:80}}>
                <Text style={{color:C.muted}} numberOfLines={1}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={onConfirm} style={{flex:2,padding:12,borderRadius:10,backgroundColor:C.green,alignItems:'center'}}>
                <Text style={{color:'#0d1117',fontWeight:'700'}}>Place Order</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      );
    }

    if (type === 'recurring') {
      const intervalLabel = data.intervalSecs===86400?'daily':data.intervalSecs===604800?'weekly':data.intervalSecs===3600?'hourly':`every ${data.intervalSecs}s`;
      return (
        <View style={{backgroundColor:C.card,borderRadius:16,padding:16,marginBottom:8,borderWidth:1,borderColor:C.border}}>
          <View style={s.botTag}><View style={s.botDot}/><Text style={s.botTagTxt}>ChatFi AI</Text></View>
          <Text style={{color:C.text,fontWeight:'700',fontSize:16,marginBottom:12}}>Confirm DCA Order</Text>
          <View style={{marginBottom:8}}>
            <View style={{flexDirection:'row',justifyContent:'space-between',paddingVertical:6,borderBottomWidth:1,borderBottomColor:C.border}}>
              <Text style={{color:C.muted}}>Pair</Text>
              <Text style={{color:C.text,fontWeight:'600'}}>{data.from} → {data.to}</Text>
            </View>
            <View style={{flexDirection:'row',justifyContent:'space-between',paddingVertical:6,borderBottomWidth:1,borderBottomColor:C.border}}>
              <Text style={{color:C.muted}}>Amount per cycle</Text>
              <Text style={{color:C.text,fontWeight:'600'}}>{data.amountPerCycle} {data.from}</Text>
            </View>
            <View style={{flexDirection:'row',justifyContent:'space-between',paddingVertical:6,borderBottomWidth:1,borderBottomColor:C.border}}>
              <Text style={{color:C.muted}}>Frequency</Text>
              <Text style={{color:C.green,fontWeight:'600'}}>{intervalLabel}</Text>
            </View>
            <View style={{flexDirection:'row',justifyContent:'space-between',paddingVertical:6}}>
              <Text style={{color:C.muted}}>Orders</Text>
              <Text style={{color:C.text,fontWeight:'600'}}>{data.numberOfOrders}</Text>
            </View>
          </View>
          {status === 'loading' && <ActivityIndicator color={C.green} />}
          {status === 'success' && <Text style={{color:C.green,textAlign:'center',fontWeight:'700'}}>✅ DCA Order Created!</Text>}
          {status === 'error' && <Text style={{color:C.red,textAlign:'center'}}>{card.error}</Text>}
          {!status && (
            <View style={{flexDirection:'row',gap:8}}>
              <TouchableOpacity onPress={onCancel} style={{flex:1,padding:12,borderRadius:10,borderWidth:1,borderColor:C.border,alignItems:'center',minWidth:80}}>
                <Text style={{color:C.muted}} numberOfLines={1}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={onConfirm} style={{flex:2,padding:12,borderRadius:10,backgroundColor:C.green,alignItems:'center'}}>
                <Text style={{color:'#0d1117',fontWeight:'700'}}>Start DCA</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      );
    }

    if (type === 'price') {
      return (
        <View style={{backgroundColor:C.card,borderRadius:16,padding:16,marginBottom:8,borderWidth:1,borderColor:C.border}}>
          <View style={s.botTag}><View style={s.botDot}/><Text style={s.botTagTxt}>ChatFi AI</Text></View>
          <Text style={{color:C.muted,fontSize:12,marginBottom:4}}>{data.token} Price</Text>
          <Text style={{color:C.green,fontSize:32,fontWeight:'700'}}>${data.price}</Text>
          {data.change24h && <Text style={{color:parseFloat(data.change24h)>=0?C.green:C.red,fontSize:13,marginTop:4}}>{parseFloat(data.change24h)>=0?'▲':'▼'} {Math.abs(parseFloat(data.change24h)).toFixed(2)}% (24h)</Text>}
        </View>
      );
    }

    if (type === 'token_info') {
      const fmt = (n:number|null, prefix='$') => {
        if (!n) return 'N/A';
        if (n >= 1_000_000_000) return `${prefix}${(n/1_000_000_000).toFixed(2)}B`;
        if (n >= 1_000_000) return `${prefix}${(n/1_000_000).toFixed(2)}M`;
        if (n >= 1_000) return `${prefix}${(n/1_000).toFixed(2)}K`;
        return `${prefix}${n.toFixed(4)}`;
      };
      const fmtNum = (n:number|null) => fmt(n,'');
      const pc1h = data.priceChange24h; const pc5m = data.priceChange5m; const pc6h = data.priceChange6h;
      const pct = (v:any) => { if(v==null) return null; const n=parseFloat(v); return {val:Math.abs(n).toFixed(2),up:n>=0}; };
      return (
        <View style={{backgroundColor:C.card,borderRadius:16,padding:16,marginBottom:8,borderWidth:1,borderColor:C.border}}>
          <View style={s.botTag}><View style={s.botDot}/><Text style={s.botTagTxt}>ChatFi AI</Text></View>
          {/* Header */}
          <View style={{flexDirection:'row',alignItems:'center',marginBottom:10}}>
            {data.logo ? <Image source={{uri:data.logo}} style={{width:44,height:44,borderRadius:22,marginRight:10}}/> : <View style={{width:44,height:44,borderRadius:22,backgroundColor:C.border,marginRight:10}}/>}
            <View style={{flex:1}}>
              <View style={{flexDirection:'row',alignItems:'center',gap:6,flexWrap:'wrap'}}>
                <Text style={{color:C.text,fontWeight:'700',fontSize:18}}>{data.symbol}</Text>
                {data.isVerified && <Text style={{color:C.green,fontSize:10,borderWidth:1,borderColor:C.green,borderRadius:4,paddingHorizontal:4}}>✓ Verified</Text>}
              </View>
              <Text style={{color:C.muted,fontSize:12}}>{data.name}</Text>
              <View style={{flexDirection:'row',gap:8,marginTop:2}}>
                {data.twitter && <TouchableOpacity onPress={()=>Linking.openURL(data.twitter)}><Text style={{color:C.blue,fontSize:11}}>Twitter</Text></TouchableOpacity>}
                {data.website && <TouchableOpacity onPress={()=>Linking.openURL(data.website)}><Text style={{color:C.blue,fontSize:11}}>Website</Text></TouchableOpacity>}
              </View>
            </View>
          </View>
          {/* Price */}
          <Text style={{color:C.green,fontSize:32,fontWeight:'700',marginBottom:2}}>
            {data.price ? `$${data.price < 0.001 ? data.price.toFixed(8) : data.price < 1 ? data.price.toFixed(4) : data.price.toFixed(2)}` : 'N/A'}
          </Text>
          {/* Price changes row */}
          <View style={{flexDirection:'row',gap:10,marginBottom:12}}>
            {[{label:'5m',v:pct(pc5m)},{label:'1h',v:pct(pc1h)},{label:'6h',v:pct(pc6h)}].map((x,i)=>x.v?(
              <Text key={i} style={{color:x.v.up?C.green:C.red,fontSize:12}}>{x.label}: {x.v.up?'▲':'▼'}{x.v.val}%</Text>
            ):null)}
          </View>
          {/* Stats grid */}
          <View style={{flexDirection:'row',flexWrap:'wrap',gap:6,marginBottom:12}}>
            {[
              {label:'Market Cap', val:fmt(data.mcap)},
              {label:'FDV', val:fmt(data.fdv)},
              {label:'Liquidity', val:fmt(data.liquidity)},
              {label:'Vol 1h', val:fmt(data.volume1h)},
              {label:'Holders', val:fmtNum(data.holders)},
              {label:'Circ Supply', val:fmtNum(data.circSupply)},
            ].map((item,i)=>(
              <View key={i} style={{width:'30%',backgroundColor:C.bg,borderRadius:8,padding:8}}>
                <Text style={{color:C.muted,fontSize:10}}>{item.label}</Text>
                <Text style={{color:C.text,fontWeight:'600',fontSize:12}}>{item.val}</Text>
              </View>
            ))}
          </View>
          {/* Mint */}
          <TouchableOpacity onPress={()=>Linking.openURL(`https://solscan.io/token/${data.mint}`)} style={{marginBottom:12}}>
            <Text style={{color:C.muted,fontSize:10}}>Mint: <Text style={{color:C.blue}}>{data.mint?.slice(0,16)}...</Text></Text>
          </TouchableOpacity>
          <View style={{flexDirection:'row',gap:8}}>
            <TouchableOpacity
              style={{flex:1,backgroundColor:C.green,borderRadius:10,padding:10,alignItems:'center'}}
              onPress={()=>dispatchAction('SHOW_SWAP',{from:'USDC',to:data.symbol,amount:''})}
            >
              <Text style={{color:'#0d1117',fontWeight:'700'}}>Buy {data.symbol}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={{flex:1,borderRadius:10,padding:10,alignItems:'center',borderWidth:1,borderColor:C.green}}
              onPress={()=>dispatchAction('SHOW_SWAP',{from:data.symbol,to:'USDC',amount:''})}
            >
              <Text style={{color:C.green,fontWeight:'700'}}>Sell {data.symbol}</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    }

    if (type === 'portfolio_full') {
      const tokens = data.tokens || [];
      const earns = data.earnPositions || [];
      const locks = data.lockAccounts || [];
      const trigs = data.trigOrders || [];
      const totalUSD = tokens.reduce((s:number,t:any)=>s+((t.amount||0)*(t.price||0)),0);
      return (
        <View style={{backgroundColor:C.card,borderRadius:16,padding:16,marginBottom:8,borderWidth:1,borderColor:C.border}}>
          <View style={s.botTag}><View style={s.botDot}/><Text style={s.botTagTxt}>ChatFi AI</Text></View>
          <View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
            <Text style={{color:C.text,fontWeight:'700',fontSize:16}}>📊 Your Portfolio</Text>
            <Text style={{color:C.green,fontWeight:'700',fontSize:16}}>${totalUSD.toFixed(2)}</Text>
          </View>
          {/* Token balances */}
          <Text style={{color:C.muted,fontSize:11,fontWeight:'700',marginBottom:6,letterSpacing:1}}>TOKENS</Text>
          {tokens.map((t:any,i:number)=>(
            <View key={i} style={{flexDirection:'row',justifyContent:'space-between',paddingVertical:5,borderBottomWidth:i<tokens.length-1?1:0,borderBottomColor:C.border}}>
              <Text style={{color:C.text,fontWeight:'600'}}>{t.symbol}</Text>
              <View style={{alignItems:'flex-end'}}>
                <Text style={{color:C.text,fontSize:13}}>{typeof t.amount==='number'?t.amount.toFixed(4):t.amount}</Text>
                <Text style={{color:C.muted,fontSize:11}}>${((t.amount||0)*(t.price||0)).toFixed(2)}</Text>
              </View>
            </View>
          ))}
          {/* Earn positions */}
          {earns.length > 0 && <>
            <Text style={{color:C.muted,fontSize:11,fontWeight:'700',marginTop:12,marginBottom:6,letterSpacing:1}}>EARN POSITIONS</Text>
            {earns.map((pos:any,i:number)=>{
              const sym = pos.token?.asset?.symbol || pos.token?.uiSymbol || '?';
              const dec = pos.token?.asset?.decimals ?? 6;
              const bal = (parseFloat(pos.underlyingAssets||pos.underlyingBalance||'0')/Math.pow(10,dec)).toFixed(4);
              const apy = (parseInt(pos.token?.totalRate||'0')/100).toFixed(2);
              const price = parseFloat(pos.token?.asset?.price||'0');
              const usd = price ? (parseFloat(bal)*price).toFixed(2) : '?';
              return (
                <View key={i} style={{flexDirection:'row',justifyContent:'space-between',paddingVertical:5,borderBottomWidth:i<earns.length-1?1:0,borderBottomColor:C.border}}>
                  <View>
                    <Text style={{color:C.text,fontWeight:'600'}}>{sym} Earn</Text>
                    <Text style={{color:C.green,fontSize:11}}>{apy}% APY</Text>
                  </View>
                  <View style={{alignItems:'flex-end'}}>
                    <Text style={{color:C.text,fontSize:13}}>{bal} {sym}</Text>
                    <Text style={{color:C.muted,fontSize:11}}>${usd}</Text>
                  </View>
                </View>
              );
            })}
          </>}
          {/* Locked tokens */}
          {locks.length > 0 && <>
            <Text style={{color:C.muted,fontSize:11,fontWeight:'700',marginTop:12,marginBottom:6,letterSpacing:1}}>LOCKED TOKENS</Text>
            {locks.map((lock:any,i:number)=>{
              const unlockDate = new Date(lock.cliffEnd*1000).toLocaleDateString();
              return (
                <View key={i} style={{flexDirection:'row',justifyContent:'space-between',paddingVertical:5,borderBottomWidth:i<locks.length-1?1:0,borderBottomColor:C.border}}>
                  <View>
                    <Text style={{color:C.text,fontWeight:'600'}}>{lock.mint?.slice(0,6)}... Lock</Text>
                    <Text style={{color:lock.claimable?C.green:C.muted,fontSize:11}}>{lock.claimable?'✅ Claimable':'🔒 Unlocks '+unlockDate}</Text>
                  </View>
                  <Text style={{color:C.text,fontSize:13}}>{(lock.totalRaw/1e6).toFixed(2)}</Text>
                </View>
              );
            })}
          </>}
          {/* Limit orders */}
          {trigs.length > 0 && <>
            <Text style={{color:C.muted,fontSize:11,fontWeight:'700',marginTop:12,marginBottom:6,letterSpacing:1}}>LIMIT ORDERS</Text>
            {trigs.map((o:any,i:number)=>{
              const inSym = o.inputMint?.slice(0,6)||'?';
              const outSym = o.outputMint?.slice(0,6)||'?';
              return (
                <View key={i} style={{flexDirection:'row',justifyContent:'space-between',paddingVertical:5}}>
                  <Text style={{color:C.text,fontSize:12}}>{inSym}→{outSym}</Text>
                  <Text style={{color:C.green,fontSize:12}}>{o.makingAmount||o.inputAmount||'?'}</Text>
                </View>
              );
            })}
          </>}
          <TouchableOpacity onPress={()=>setTab('portfolio')} style={{marginTop:12,padding:10,borderRadius:10,borderWidth:1,borderColor:C.green,alignItems:'center'}}>
            <Text style={{color:C.green,fontWeight:'600'}}>View Full Portfolio →</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (type === 'copy_trade') {
      const { wallet: waddr, trades, holdings } = data;
      return (
        <View style={{backgroundColor:C.card,borderRadius:16,padding:16,marginBottom:8,borderWidth:1,borderColor:C.border}}>
          <View style={s.botTag}><View style={s.botDot}/><Text style={s.botTagTxt}>ChatFi AI</Text></View>
          <Text style={{color:C.text,fontWeight:'700',fontSize:16,marginBottom:2}}>🐋 Whale Analysis</Text>
          <TouchableOpacity onPress={()=>Linking.openURL(`https://solscan.io/account/${waddr}`)}>
            <Text style={{color:C.green,fontSize:12,marginBottom:12}}>{waddr?.slice(0,16)}...{waddr?.slice(-8)} ↗</Text>
          </TouchableOpacity>
          {/* Holdings */}
          {holdings?.length > 0 && <>
            <Text style={{color:C.muted,fontSize:11,fontWeight:'700',marginBottom:6,letterSpacing:1}}>CURRENT HOLDINGS</Text>
            {holdings.slice(0,6).map((h:any,i:number)=>(
              <View key={i} style={{flexDirection:'row',justifyContent:'space-between',paddingVertical:4,borderBottomWidth:i<Math.min(holdings.length,6)-1?1:0,borderBottomColor:C.border}}>
                <Text style={{color:C.text,fontWeight:'600'}}>{h.sym}</Text>
                <TouchableOpacity onPress={()=>dispatchAction('SHOW_SWAP',{from:'USDC',to:h.sym,amount:'10'})}>
                  <Text style={{color:C.green,fontSize:12}}>{h.amount?.toFixed(4)} · Mirror →</Text>
                </TouchableOpacity>
              </View>
            ))}
          </>}
          {/* Recent transactions */}
          <Text style={{color:C.muted,fontSize:11,fontWeight:'700',marginTop:12,marginBottom:6,letterSpacing:1}}>RECENT TRANSACTIONS</Text>
          {(trades||[]).slice(0,10).map((t:any,i:number)=>(
            <View key={i} style={{paddingVertical:5,borderBottomWidth:i<Math.min(trades.length,10)-1?1:0,borderBottomColor:C.border}}>
              <View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center'}}>
                <Text style={{color:t.err?'#ef4444':C.text,fontSize:12,flex:1}} numberOfLines={1}>
                  {t.err?'❌':'✅'} {t.sig?.slice(0,20)}...
                </Text>
                <Text style={{color:C.muted,fontSize:11,marginLeft:8}}>{t.date}</Text>
              </View>
              <View style={{flexDirection:'row',gap:8,marginTop:3}}>
                <TouchableOpacity onPress={()=>Linking.openURL(`https://solscan.io/tx/${t.sig}`)}>
                  <Text style={{color:C.green,fontSize:11}}>View ↗</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={()=>{if(Clipboard?.setString){Clipboard.setString(t.sig);showToast('Copied!','success');}}}>
                  <Text style={{color:C.muted,fontSize:11}}>Copy sig</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
          <TouchableOpacity
            style={{marginTop:12,backgroundColor:C.green,borderRadius:10,padding:10,alignItems:'center'}}
            onPress={()=>Linking.openURL(`https://solscan.io/account/${waddr}`)}
          >
            <Text style={{color:'#0d1117',fontWeight:'700'}}>View Full Activity on Solscan</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (type === 'portfolio') {
      return (
        <View style={{backgroundColor:C.card,borderRadius:16,padding:16,marginBottom:8,borderWidth:1,borderColor:C.border}}>
          <View style={s.botTag}><View style={s.botDot}/><Text style={s.botTagTxt}>ChatFi AI</Text></View>
          <Text style={{color:C.text,fontWeight:'700',fontSize:16,marginBottom:12}}>Your Portfolio</Text>
          {(data.tokens||[]).slice(0,5).map((t:any,i:number)=>(
            <View key={i} style={{flexDirection:'row',justifyContent:'space-between',paddingVertical:6,borderBottomWidth:i<4?1:0,borderBottomColor:C.border}}>
              <Text style={{color:C.text,fontWeight:'600'}}>{t.symbol}</Text>
              <View style={{alignItems:'flex-end'}}>
                <Text style={{color:C.text}}>{t.amount?.toFixed(4)}</Text>
                <Text style={{color:C.muted,fontSize:11}}>${((t.amount||0)*(t.price||0)).toFixed(2)}</Text>
              </View>
            </View>
          ))}
          <TouchableOpacity onPress={()=>setTab('portfolio')} style={{marginTop:12,padding:10,borderRadius:10,borderWidth:1,borderColor:C.green,alignItems:'center'}}>
            <Text style={{color:C.green,fontWeight:'600'}}>View Full Portfolio →</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (type === 'earn') {
      return (
        <View style={{backgroundColor:C.card,borderRadius:16,padding:16,marginBottom:8,borderWidth:1,borderColor:C.border}}>
          <View style={s.botTag}><View style={s.botDot}/><Text style={s.botTagTxt}>ChatFi AI</Text></View>
          <Text style={{color:C.text,fontWeight:'700',fontSize:16,marginBottom:12}}>Jupiter Earn Markets</Text>
          {(data.markets||[]).slice(0,5).map((m:any,i:number)=>(
            <View key={i} style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center',paddingVertical:8,borderBottomWidth:i<4?1:0,borderBottomColor:C.border}}>
              <Text style={{color:C.text,fontWeight:'600'}}>{m.symbol||'?'}</Text>
              <View style={{alignItems:'flex-end'}}>
                <Text style={{color:C.green,fontWeight:'700'}}>{((m.supplyApy||m.apy||0)*100).toFixed(2)}% APY</Text>
                {m.tvl&&<Text style={{color:C.muted,fontSize:11}}>${(m.tvl/1e6).toFixed(1)}M TVL</Text>}
              </View>
            </View>
          ))}
        </View>
      );
    }

    if (type === 'earn_markets') {
      const vaults = (data.tokens||[]).map((t:any)=>{
        const sym=t.asset?.symbol||t.uiSymbol||t.symbol||'?';
        const logo=t.asset?.logoUrl||t.asset?.logoURI||'';
        const mint=t.asset?.address||t.assetAddress||t.mint||'';
        const dec=t.asset?.decimals??t.decimals??6;
        const pr=(v:any)=>{const n=parseFloat(v||0);return(!n||n<=0)?0:n>100?n/100:n;};
        const total=pr(t.totalRate),supply=pr(t.supplyRate),rewards=pr(t.rewardsRate);
        const apy=total||supply;
        const apyStr=apy>=10?apy.toFixed(1):apy.toFixed(2);
        const assets=parseInt(t.totalAssets||'0'),borrows=parseInt(t.totalBorrows||'0');
        const tvl=assets/Math.pow(10,dec);
        const tvlStr=tvl>=1e6?'$'+(tvl/1e6).toFixed(1)+'M':tvl>=1e3?'$'+(tvl/1e3).toFixed(1)+'K':'$'+tvl.toFixed(0);
        const util=assets>0?Math.min(100,Math.round(borrows/assets*100)):null;
        return {sym,logo,mint,dec,apy,apyStr,supply,rewards,tvlStr,util,raw:t};
      }).sort((a:any,b:any)=>b.apy-a.apy);
      return (
        <View style={{backgroundColor:C.card,borderRadius:16,padding:16,marginBottom:8,borderWidth:1,borderColor:C.border}}>
          <View style={s.botTag}><View style={s.botDot}/><Text style={s.botTagTxt}>ChatFi AI</Text></View>
          <Text style={{color:C.text,fontWeight:'700',fontSize:16,marginBottom:2}}>🏦 Jupiter Earn Vaults</Text>
          <Text style={{color:C.muted,fontSize:12,marginBottom:12}}>Sorted by APY — tap Deposit on any vault</Text>
          {(data.userPositions||[]).length>0&&(
            <View style={{marginBottom:12}}>
              <Text style={{color:C.text,fontWeight:'700',fontSize:13,marginBottom:8}}>📊 Your Active Positions</Text>
              {(data.userPositions||[]).map((pos:any,i:number)=>{
                const vault = vaults.find((v:any)=>v.sym===pos.sym)||vaults[0];
                return (
                  <View key={i} style={{borderWidth:1,borderColor:C.green,borderRadius:10,padding:12,marginBottom:8,backgroundColor:C.bg}}>
                    <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between'}}>
                      <View>
                        <Text style={{color:C.text,fontWeight:'700',fontSize:14}}>{pos.sym} Position</Text>
                        <Text style={{color:C.green,fontWeight:'700',fontSize:18,marginTop:2}}>{pos.amt.toFixed(pos.amt<1?4:2)} {pos.sym}</Text>
                        {pos.apy>0&&<Text style={{color:C.muted,fontSize:11,marginTop:2}}>{pos.apy.toFixed(2)}% APY</Text>}
                      </View>
                      <View style={{alignItems:'flex-end',gap:6}}>
                        <TouchableOpacity
                          style={{backgroundColor:C.green,borderRadius:6,paddingHorizontal:14,paddingVertical:6}}
                          onPress={()=>setMsgs(p=>[...p,{id:Date.now(),from:'bot',text:'',card:{type:'earn_deposit',data:{tokens:data.tokens,preVault:{sym:pos.sym,mint:vault?.mint,dec:vault?.dec,apyStr:vault?.apyStr}}}}])}>
                          <Text style={{color:'#0d1117',fontWeight:'600',fontSize:12}}>Deposit More</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={{borderWidth:1,borderColor:'#ff4444',borderRadius:6,paddingHorizontal:14,paddingVertical:5}}
                          onPress={()=>setMsgs(p=>[...p,{id:Date.now(),from:'bot',text:'',card:{type:'earn_withdraw',data:{tokens:data.tokens,preVault:{sym:pos.sym,mint:vault?.mint,dec:vault?.dec,apyStr:vault?.apyStr}}}}])}>
                          <Text style={{color:'#ff4444',fontSize:12,fontWeight:'600'}}>Withdraw</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                );
              })}
              <View style={{height:1,backgroundColor:C.border,marginBottom:12}}/>
              <Text style={{color:C.text,fontWeight:'700',fontSize:13,marginBottom:8}}>🏦 All Vaults</Text>
            </View>
          )}
          {vaults.map((v:any,i:number)=>(
            <View key={i} style={{borderWidth:1,borderColor:C.border,borderRadius:10,padding:12,marginBottom:8,backgroundColor:C.bg}}>
              <View style={{flexDirection:'row',alignItems:'flex-start'}}>
                <View style={{flex:1}}>
                  <View style={{flexDirection:'row',alignItems:'center',marginBottom:2}}>
                    {v.logo?<Image source={{uri:v.logo}} style={{width:20,height:20,borderRadius:10,marginRight:6}}/>:null}
                    <Text style={{color:C.text,fontWeight:'700',fontSize:14}}>{v.sym} Earn</Text>
                  </View>
                  <Text style={{color:C.muted,fontSize:11}}>TVL: {v.tvlStr}{v.util!=null?' · Util: '+v.util+'%':''}</Text>
                  <View style={{flexDirection:'row',gap:4,marginTop:4,flexWrap:'wrap'}}>
                    {v.supply>0&&<View style={{backgroundColor:'#16a34a22',borderRadius:4,paddingHorizontal:6,paddingVertical:2}}><Text style={{color:C.green,fontSize:10}}>Supply {v.supply>=10?v.supply.toFixed(1):v.supply.toFixed(2)}%</Text></View>}
                    {v.rewards>0&&<View style={{backgroundColor:'#78350f',borderRadius:4,paddingHorizontal:6,paddingVertical:2}}><Text style={{color:'#f59e0b',fontSize:10}}>Rewards {v.rewards>=10?v.rewards.toFixed(1):v.rewards.toFixed(2)}%</Text></View>}
                  </View>
                </View>
                <View style={{alignItems:'flex-end',marginLeft:8}}>
                  <Text style={{color:C.green,fontWeight:'800',fontSize:22,lineHeight:26}}>{v.apyStr}%</Text>
                  <Text style={{color:C.muted,fontSize:10,marginBottom:6}}>Total APY</Text>
                  <TouchableOpacity
                    style={{backgroundColor:C.green,borderRadius:6,paddingHorizontal:14,paddingVertical:5,marginBottom:4}}
                    onPress={()=>setMsgs(p=>[...p,{id:Date.now(),from:'bot',text:'',card:{type:'earn_deposit',data:{tokens:data.tokens,preVault:{sym:v.sym,mint:v.mint,dec:v.dec,apyStr:v.apyStr}}}}])}>
                    <Text style={{color:'#0d1117',fontWeight:'600',fontSize:12}}>Deposit</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={{borderWidth:1,borderColor:C.border,borderRadius:6,paddingHorizontal:12,paddingVertical:4}}
                    onPress={()=>setMsgs(p=>[...p,{id:Date.now(),from:'bot',text:'',card:{type:'earn_withdraw',data:{tokens:data.tokens,preVault:{sym:v.sym,mint:v.mint,dec:v.dec,apyStr:v.apyStr}}}}])}>
                    <Text style={{color:C.muted,fontSize:11}}>Withdraw</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          ))}
        </View>
      );
    }


    if (type === 'earn_deposit' || type === 'earn_withdraw') {
      return <EarnActionCard card={card} isDeposit={type==='earn_deposit'} pubkey={pubkey} wallet={wallet} deriveWallet={deriveWallet} requireAuth={requireAuth} rpcFetch={rpcFetch} showToast={showToast} fetchPortfolio={fetchPortfolio} C={C} s={s} />;
    }
    if (type === 'invite_send') {
      const link = card.inviteLink;
      return (
        <View style={{backgroundColor:C.card,borderRadius:16,padding:16,marginBottom:8,borderWidth:1,borderColor:C.border}}>
          <View style={s.botTag}><View style={s.botDot}/><Text style={s.botTagTxt}>ChatFi AI</Text></View>
          <Text style={{color:C.text,fontWeight:'700',fontSize:16,marginBottom:4}}>📨 Send via Invite Link</Text>
          <Text style={{color:C.muted,fontSize:12,marginBottom:12}}>Recipient claims {data.amount} {data.token} via Jupiter — no wallet needed upfront</Text>
          {status==='loading'&&<ActivityIndicator color={C.green} style={{marginVertical:12}}/>}
          {status==='success'&&link&&(
            <View>
              <Text style={{color:C.green,fontWeight:'700',marginBottom:6}}>✅ Tokens locked!</Text>
              <View style={{backgroundColor:C.bg,borderRadius:8,padding:10,marginBottom:8}}>
                <Text style={{color:C.text,fontSize:12,marginBottom:6}} selectable>{link}</Text>
                <TouchableOpacity onPress={()=>{Clipboard.setString(link);showToast('Link copied!','success');}} style={{backgroundColor:C.green,borderRadius:6,padding:8,alignItems:'center'}}>
                  <Text style={{color:'#0d1117',fontWeight:'700'}}>Copy Invite Link</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
          {status==='error'&&<Text style={{color:'#ef4444',marginBottom:8}}>{card.error}</Text>}
          {!status&&(
            <View style={{flexDirection:'row',gap:8}}>
              <TouchableOpacity onPress={onCancel} style={{flex:1,padding:12,borderRadius:10,borderWidth:1,borderColor:C.border,alignItems:'center'}}>
                <Text style={{color:C.muted}}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={onConfirm} style={{flex:2,padding:12,borderRadius:10,backgroundColor:C.green,alignItems:'center'}}>
                <Text style={{color:'#0d1117',fontWeight:'700'}}>Generate Invite Link</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      );
    }

    if (type === 'migrate_earn') {
      return <MigrateEarnCard card={card} pubkey={pubkey} wallet={wallet} deriveWallet={deriveWallet} requireAuth={requireAuth} rpcFetch={rpcFetch} showToast={showToast} fetchPortfolio={fetchPortfolio} setMsgs={setMsgs} C={C} s={s} />;
    }

    if (type === 'studio_launch') { return <StudioLaunchCard card={card} wallet={wallet} deriveWallet={deriveWallet} setMsgs={setMsgs} C={C} s={s} />; }

    if (type === 'lock') {
      return (
        <View style={{backgroundColor:C.card,borderRadius:16,padding:16,marginBottom:8,borderWidth:1,borderColor:C.border}}>
          <View style={s.botTag}><View style={s.botDot}/><Text style={s.botTagTxt}>ChatFi AI</Text></View>
          <Text style={{color:C.text,fontWeight:'700',fontSize:16,marginBottom:12}}>Confirm Token Lock</Text>
          <View style={{marginBottom:12}}>
            <View style={{flexDirection:'row',justifyContent:'space-between',paddingVertical:6,borderBottomWidth:1,borderBottomColor:C.border}}>
              <Text style={{color:C.muted}}>Token</Text>
              <Text style={{color:C.text,fontWeight:'600'}}>{data.amount} {data.token}</Text>
            </View>
            <View style={{flexDirection:'row',justifyContent:'space-between',paddingVertical:6}}>
              <Text style={{color:C.muted}}>Lock Duration</Text>
              <Text style={{color:C.green,fontWeight:'600'}}>{
                parseFloat(data.days) < 1/24
                  ? `${Math.round(parseFloat(data.days) * 1440)} minutes`
                  : parseFloat(data.days) < 1
                  ? `${Math.round(parseFloat(data.days) * 24)} hours`
                  : `${data.days} days`
              }</Text>
            </View>
          </View>
          {status === 'loading' && <ActivityIndicator color={C.green} />}
          {status === 'success' && <Text style={{color:C.green,textAlign:'center',fontWeight:'700'}}>✅ Tokens Locked!</Text>}
          {status === 'error' && <Text style={{color:C.red,textAlign:'center'}}>{card.error}</Text>}
          {!status && (
            <View style={{flexDirection:'row',gap:8}}>
              <TouchableOpacity onPress={onCancel} style={{flex:1,padding:12,borderRadius:10,borderWidth:1,borderColor:C.border,alignItems:'center',minWidth:80}}>
                <Text style={{color:C.muted}} numberOfLines={1}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={onConfirm} style={{flex:2,padding:12,borderRadius:10,backgroundColor:C.green,alignItems:'center'}}>
                <Text style={{color:'#0d1117',fontWeight:'700'}}>Lock Tokens</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      );
    }

    if (type === 'predictions') {
      const events = data.events || [];
      return (
        <View style={{backgroundColor:C.card,borderRadius:16,padding:16,marginBottom:8,borderWidth:1,borderColor:C.border}}>
          <View style={s.botTag}><View style={s.botDot}/><Text style={s.botTagTxt}>ChatFi AI</Text></View>
          <Text style={{color:C.text,fontWeight:'700',fontSize:16,marginBottom:4}}>🎯 Prediction Markets</Text>
          <Text style={{color:C.muted,fontSize:12,marginBottom:12}}>{events.length} markets · Min $5 USDC</Text>
          {events.map((event:any,i:number)=>{
            const title = event.metadata?.title || event.title || 'Unknown Event';
            const cat = event.metadata?.category || event.category || '';
            const vol = event.metadata?.volume || event.volume || 0;
            const markets = event.markets || [];
            const openMks = markets.filter((mk:any) => !mk.status || mk.status === 'open').slice(0,3);
            return (
              <View key={i} style={{marginBottom:14,paddingBottom:14,borderBottomWidth:i<events.length-1?1:0,borderBottomColor:C.border}}>
                <Text style={{color:C.text,fontWeight:'700',fontSize:13,marginBottom:2}}>{title}</Text>
                <Text style={{color:C.muted,fontSize:11,marginBottom:6}}>
                  {cat}{cat&&vol?' · ':''}{vol>0?`$${(vol/1e6).toFixed(1)}M vol`:''}
                </Text>
                {openMks.map((mk:any,j:number)=>{
                  const mkTitle = mk.metadata?.title || mk.title || mk.question || '';
                  const yesPriceRaw = mk.pricing?.buyYesPriceUsd;
                  const noPriceRaw = mk.pricing?.buyNoPriceUsd;
                  const yesProb = yesPriceRaw != null ? Math.round(Math.min(99, Math.max(1, yesPriceRaw/1e4))) : null;
                  const noProb = noPriceRaw != null ? Math.round(Math.min(99, Math.max(1, noPriceRaw/1e4))) : null;
                  const mkId = mk.marketId || mk.id;
                  return (
                    <View key={j} style={{marginBottom:8}}>
                      <Text style={{color:C.muted,fontSize:12,marginBottom:4}} numberOfLines={2}>{mkTitle}</Text>
                      <View style={{flexDirection:'row',gap:6}}>
                        <TouchableOpacity
                          style={{flex:1,backgroundColor:'rgba(173,250,29,0.15)',borderRadius:8,padding:8,alignItems:'center',borderWidth:1,borderColor:C.green}}
                          onPress={()=>dispatchAction('PLACE_PREDICTION',{searchQuery:title,outcome:mkTitle,side:'yes',amount:'10'})}
                        >
                          <Text style={{color:C.green,fontWeight:'700',fontSize:12}}>YES {yesProb!=null?`${yesProb}%`:''}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={{flex:1,backgroundColor:'rgba(239,68,68,0.1)',borderRadius:8,padding:8,alignItems:'center',borderWidth:1,borderColor:'#ef4444'}}
                          onPress={()=>dispatchAction('PLACE_PREDICTION',{searchQuery:title,outcome:mkTitle,side:'no',amount:'10'})}
                        >
                          <Text style={{color:'#ef4444',fontWeight:'700',fontSize:12}}>NO {noProb!=null?`${noProb}%`:''}</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })}
              </View>
            );
          })}
        </View>
      );
    }

    if (type === 'trending') {
      return (
        <View style={{backgroundColor:C.card,borderRadius:16,padding:16,marginBottom:8,borderWidth:1,borderColor:C.border}}>
          <View style={s.botTag}><View style={s.botDot}/><Text style={s.botTagTxt}>ChatFi AI</Text></View>
          <View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
            <Text style={{color:C.text,fontWeight:'700',fontSize:16}}>{data.label}</Text>
            <Text style={{color:C.muted,fontSize:12}}>{data.interval}</Text>
          </View>
          {(data.tokens||[]).slice(0,15).map((t:any,i:number)=>(
            <TouchableOpacity key={i} onPress={()=>{setFromToken('SOL');setToToken(t.symbol||t.ticker||'SOL');setTab('swap');}}
              style={{flexDirection:'row',alignItems:'center',paddingVertical:8,borderBottomWidth:i<14?1:0,borderBottomColor:C.border}}>
              <Text style={{color:C.muted,fontSize:12,width:24}}>#{i+1}</Text>
              <TokLogo uri={t.logoURI||t.icon||''} fallback={''} symbol={t.symbol||t.ticker||'?'} style={{width:28,height:28,borderRadius:14,backgroundColor:C.border}} mint={t.address||t.id||''} />
              <View style={{flex:1,marginLeft:8}}>
                <Text style={{color:C.text,fontWeight:'600',fontSize:13}}>{t.symbol||t.ticker||'?'}</Text>
                <Text style={{color:C.muted,fontSize:11}} numberOfLines={1}>{t.name||''}</Text>
              </View>
              {t.price&&<Text style={{color:C.text,fontSize:12}}>${parseFloat(t.price).toFixed(4)}</Text>}
              <Text style={{color:C.green,fontSize:11,marginLeft:8}}>Swap →</Text>
            </TouchableOpacity>
          ))}
        </View>
      );
    }

    return null;
  };


  const sendMsg = async (overrideText?: string) => {
    const q = (overrideText || inputRef.current || input).trim();
    if (!q || aiLoading) return;
    setMsgs(p => [...p, { id: Date.now(), text: q, from: 'user' }]);
    const msgText = q;
    setInput('');
    inputRef.current = '';
    setAiLoading(true);
    try {
      const history = msgs.slice(-10).map(m => ({
        role: m.from === 'user' ? 'user' : 'assistant',
        content: m.text
      }));
      const response = await askAI(q, pubkey, history, appLanguage);
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
      const RPC_URL = process.env.EXPO_PUBLIC_SOLANA_RPC || 'https://api.mainnet-beta.solana.com';

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
          try {
            const sym = (data.token || '').toUpperCase();
            setMsgs(p => [...p, { id: Date.now(), from: 'bot', text: `🔍 Fetching ${sym} details...` }]);
            // Step 1: resolve token via Jupiter Token V2
            const resolved = await resolveToken(sym);
            if (!resolved) {
              setMsgs(p => [...p, { id: Date.now(), from: 'bot', text: `❌ Unknown token: ${sym}` }]);
              break;
            }
            const mint = resolved.mint;
            // Step 2: get full token info from v1 detail API + price v3
            const [detailRes, priceRes] = await Promise.all([
              fetch(`https://api.jup.ag/tokens/v1/token/${mint}`),
              fetch(`https://api.jup.ag/price/v3?ids=${mint}`)
            ]);
            const tokenInfo = await detailRes.json();
            const priceData = await priceRes.json();
            const price = priceData.data?.[mint]?.usdPrice ?? priceData.data?.[mint]?.price ?? tokenInfo?.usdPrice ?? null;
            const cardId = Date.now() + 1;
            setMsgs(p => [...p, {
              id: cardId, from: 'bot', text: '',
              card: {
                type: 'token_info',
                data: {
                  symbol: tokenInfo?.symbol || sym,
                  name: tokenInfo?.name || sym,
                  logo: tokenInfo?.icon || tokenInfo?.logoURI || resolved.logoURI || '',
                  price: price ? parseFloat(price) : null,
                  mcap: tokenInfo?.mcap || tokenInfo?.market_cap || null,
                  fdv: tokenInfo?.fdv || null,
                  liquidity: tokenInfo?.liquidity || null,
                  volume24h: tokenInfo?.stats24h ? (tokenInfo.stats24h.buyVolume||0)+(tokenInfo.stats24h.sellVolume||0) : null,
                  priceChange24h: tokenInfo?.stats24h?.priceChange ?? null,
                  isVerified: tokenInfo?.isVerified || false,
                  mint,
                }
              }
            }]);
          } catch(e:any) {
            setMsgs(p => [...p, { id: Date.now(), from: 'bot', text: `❌ Could not fetch token info: ${e.message}` }]);
          }
          break;
        }
        case 'FETCH_PORTFOLIO': {
          fetchPortfolio();
          setMsgs(p => [...p, { id: Date.now(), from:'bot', text:'📊 Fetching your full portfolio...' }]);
          try {
            // Fetch token balances, earn positions, locks in parallel
            const [earnRes, lockRes, trigRes] = await Promise.allSettled([
              fetch('https://chatfi.pro/api/jupiter', {
                method:'POST', headers:{'Content-Type':'application/json'},
                body: JSON.stringify({url:`https://api.jup.ag/lend/v1/earn/positions?users=${pk}`,method:'GET'})
              }).then(r=>r.json()),
              fetch(`https://chatfi.pro/api/lock?wallet=${pk}`).then(r=>r.json()),
              fetch('https://chatfi.pro/api/jupiter', {
                method:'POST', headers:{'Content-Type':'application/json'},
                body: JSON.stringify({url:`https://api.jup.ag/trigger/v1/orders?wallet=${pk}&status=active`,method:'GET'})
              }).then(r=>r.json()),
            ]);
            const earnPositions = earnRes.status==='fulfilled' ? (Array.isArray(earnRes.value)?earnRes.value:[]) : [];
            const lockAccounts  = lockRes.status==='fulfilled'  ? (lockRes.value?.accounts||[]) : [];
            const trigOrders    = trigRes.status==='fulfilled'  ? (trigRes.value?.orders||trigRes.value?.data||[]) : [];
            const activeEarns   = earnPositions.filter((p:any)=>parseFloat(p.shares||'0')>0);
            const activeLocks   = lockAccounts.filter((a:any)=>a.claimable||a.totalRaw>0);
            const activeTrig    = Array.isArray(trigOrders) ? trigOrders.slice(0,5) : [];
            const cardId = Date.now() + 1;
            const tokens = [
              ...(solBalance ? [{ symbol: 'SOL', amount: solBalance, price: solPrice }] : []),
              ...tokenBalances.slice(0, 6)
            ];
            setMsgs(p => p.filter(m => m.text !== '📊 Fetching your full portfolio...'));
            setMsgs(p => [...p, {
              id: cardId, from: 'bot', text: '',
              card: { type: 'portfolio_full', data: { tokens, earnPositions: activeEarns, lockAccounts: activeLocks, trigOrders: activeTrig } }
            }]);
          } catch(e:any) {
            const cardId = Date.now() + 1;
            const tokens = [
              ...(solBalance ? [{ symbol: 'SOL', amount: solBalance, price: solPrice }] : []),
              ...tokenBalances.slice(0, 4)
            ];
            setMsgs(p => [...p, { id: cardId, from: 'bot', text: '', card: { type: 'portfolio', data: { tokens } } }]);
          }
          break;
        }
        case 'SHOW_SWAP': {
          const from = (data.from || 'SOL').toUpperCase();
          const to = (data.to || 'USDC').toUpperCase();
          const amount = data.amount || data.amountUSD || '';
          if (!amount || isNaN(parseFloat(amount))) {
            setMsgs(p => [...p, { id: Date.now(), text: `How much ${from} would you like to swap to ${to}?`, from: 'bot' }]);
            break;
          }
          let outAmount = '...';
          let priceImpact = '0';
          try {
            const toDecimals = DECIMALS[to] || 9;
            const q = await getJupiterQuote(TOKENS[from]||from, TOKENS[to]||to, parseFloat(amount), DECIMALS[from]||9, toDecimals);
            if (q && q.outAmount != null && !isNaN(q.outAmount)) {
              outAmount = q.outAmount.toFixed(4);
              priceImpact = q.priceImpact;
            }
          } catch {}
          const cardId = Date.now() + 1;
          const cardData = { from, to, amount, outAmount, priceImpact };
          setMsgs(p => [...p, {
            id: cardId, from: 'bot', text: '',
            card: {
              type: 'swap', data: cardData,
              onCancel: () => updateCard(cardId, { status: 'cancelled' }),
              onConfirm: async () => {
                updateCard(cardId, { status: 'loading' });
                try {
                  const { publicKey: pk2, secretKey: sk2 } = deriveWallet(wallet!);
                  const txSig = await executeSwapTx(TOKENS[from]||from, TOKENS[to]||to, parseFloat(amount), DECIMALS[from]||6, pk2, sk2, 'https://api.mainnet-beta.solana.com');
                  updateCard(cardId, { status: 'success' });
                  setMsgs(p => [...p, { id: Date.now(), from: 'bot', text: `✅ Swap done! https://solscan.io/tx/${txSig}` }]);
                  fetchPortfolio();
                } catch(e:any) { updateCard(cardId, { status: 'error', error: e.message }); }
              }
            }
          }]);
          break;
        }
        case 'SHOW_TRIGGER': {
          const { from, to, amount, targetPrice, direction } = data;
          if (!from || !to || !amount || !targetPrice) {
            setMsgs(p => [...p, { id: Date.now(), text: 'Please specify token, amount and target price for the limit order.', from: 'bot' }]);
            break;
          }
          setMsgs(p => [...p, { id: Date.now(), text: `⏳ Placing limit order: ${direction === 'below' ? 'Buy' : 'Sell'} ${amount} ${from} when ${to} hits $${targetPrice}...`, from: 'bot' }]);
          try {
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
          } catch(e:any) {
            setMsgs(p => [...p, { id: Date.now(), text: `❌ Limit order failed: ${e.message}`, from: 'bot' }]);
          }
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
          try {
            const txSig = await createRecurringOrder(
              TOKENS[from], TOKENS[to],
              DECIMALS[from] || 6,
              parseFloat(amountPerCycle),
              interval, orders,
              pk, secretKey
            );
            setMsgs(p => [...p, { id: Date.now(), text: `✅ DCA order created!\n${amountPerCycle} ${from} → ${to} ${intervalLabel} × ${orders}\nTx: ${txSig.slice(0,20)}...\nhttps://solscan.io/tx/${txSig}`, from: 'bot' }]);
          } catch(e:any) {
            setMsgs(p => [...p, { id: Date.now(), text: `❌ DCA setup failed: ${e.message}`, from: 'bot' }]);
          }
          break;
        }
        case 'SHOW_SEND': {
          const sendToken = (data.token||'SOL').toUpperCase();
          const sendAmt = data.amount||'';
          if (!sendAmt || parseFloat(sendAmt)<=0) {
            setMsgs(p=>[...p,{id:Date.now(),from:'bot',text:`How much ${sendToken} would you like to send via invite link?`}]);
            break;
          }
          const cid = Date.now()+1;
          setMsgs(p=>[...p,{id:cid,from:'bot',text:'',card:{
            type:'invite_send', data:{token:sendToken,amount:sendAmt},
            onCancel:()=>updateCard(cid,{status:'cancelled'}),
            onConfirm: async()=>{
              updateCard(cid,{status:'loading'});
              try {
                const {publicKey:pk2,secretKey:sk2}=deriveWallet(wallet!);
                const mint2=TOKENS[sendToken]||(await resolveToken(sendToken))?.mint;
                if(!mint2)throw new Error('Unknown token: '+sendToken);
                const dec2=DECIMALS[sendToken]||(await resolveToken(sendToken))?.decimals||6;
                const amtRaw=Math.floor(parseFloat(sendAmt)*Math.pow(10,dec2)).toString();
                const BASE58='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
                const toBase58=(buf:Uint8Array)=>{const r=[];for(const b of buf){let c=b;for(let j=0;j<r.length;j++){const x=(BASE58.indexOf(r[j])<<8)+c;r[j]=BASE58[x%58];c=(x/58)|0;}while(c){r.push(BASE58[c%58]);c=(c/58)|0;}}r.reverse();return r.join('');};
                let inviteCode=''; while(inviteCode.length<12){inviteCode=toBase58(nacl.randomBytes(13)).substring(0,12);}
                const sr=await fetch('https://chatfi.pro/api/send',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sender:pk2,amount:amtRaw,mint:mint2,inviteCode})});
                const sd=await sr.json();
                if(sd.error)throw new Error(sd.error);
                if(!sd.partiallySignedTx)throw new Error('No transaction from server');
                const {VersionedTransaction:VT2}=require('@solana/web3.js');
                const txBytes=Uint8Array.from(Buffer.from(sd.partiallySignedTx,'base64'));
                const tx=VT2.deserialize(txBytes);
                const msgB=tx.message.serialize();
                const senderSig=nacl.sign.detached(msgB,sk2);
                const senderIdx=tx.message.staticAccountKeys.findIndex((k:any)=>k.toString()===pk2);
                if(senderIdx>=0)tx.signatures[senderIdx]=senderSig;
                const rpcRes=await rpcFetch('sendTransaction',[Buffer.from(tx.serialize()).toString('base64'),{encoding:'base64',skipPreflight:true}]); 
                const rpcData=await rpcRes.json();
                if(rpcData.error)throw new Error(rpcData.error.message||rpcData.error.toString());
                const sig=rpcData.result||'';
                const inviteLink='https://jup.ag/send?code='+inviteCode;
                updateCard(cid,{status:'success',inviteLink});
                setMsgs(p=>[...p,{id:Date.now(),from:'bot',text:'✅ '+sendAmt+' '+sendToken+' locked!\n\nYour invite link:\nhttps://jup.ag/send?code='+inviteCode+'\n\nShare this with the recipient — they can claim via Jupiter Mobile. Tokens return to you if unclaimed.'+(sig?'\n\nTx: '+sig.slice(0,20)+'...':'')}]);
                fetchPortfolio();
              }catch(e:any){updateCard(cid,{status:'error',error:e.message||'Transaction failed'});}
            }
          }}]);
          break;
        }
        case 'SHOW_LOCK': {
          const { token, amount, days } = data;
          if (!token || !amount || !days) {
            setMsgs(p => [...p, { id: Date.now(), text: 'Please specify token, amount and days. Example: lock 100 JUP for 30 days', from: 'bot' }]);
            break;
          }
          const resolvedLock = await resolveToken(token);
          if (!resolvedLock) { setMsgs(p => [...p, { id: Date.now(), text: `Unknown token: ${token}`, from: 'bot' }]); break; }
          const mint = resolvedLock.mint;
          const cardId = Date.now() + 1;
          setMsgs(p => [...p, {
            id: cardId, from: 'bot', text: '',
            card: {
              type: 'lock', data: { token, amount, days },
              onCancel: () => updateCard(cardId, { status: 'cancelled' }),
              onConfirm: async () => {
                updateCard(cardId, { status: 'loading' });
                try {
                  const { publicKey: pk2, secretKey: sk2 } = deriveWallet(wallet!);
                  const cliffSecs = parseInt(days) * 86400;
                  const amtRaw = Math.floor(parseFloat(amount) * Math.pow(10, resolvedLock.decimals || 6));
                  const lockRes = await fetch('https://chatfi.pro/api/lock', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'create', funder: pk2, mint, amount: amtRaw, cliffSecs, vestingSecs: cliffSecs })
                  });
                  const lockData = await lockRes.json();
                  if (lockData.error) throw new Error(lockData.error);
                  const txSig = await signAndSendTx(lockData.transaction, sk2);
                  updateCard(cardId, { status: 'success' });
                  setMsgs(p => [...p, { id: Date.now(), from: 'bot', text: 'Locked! https://solscan.io/tx/' + txSig }]);
                } catch(e) { updateCard(cardId, { status: 'error', error: e.message }); }
              }
            }
          }]);
          break;
        }
        case 'SHOW_EARN':
        case 'FETCH_EARN': {
          try {
            const [mktRes, posRes] = await Promise.all([
              fetch('https://lite-api.jup.ag/lend/v1/earn/tokens'),
              pk ? fetch('https://chatfi.pro/api/jupiter', {
                method: 'POST', headers: {'Content-Type':'application/json'},
                body: JSON.stringify({url:`https://api.jup.ag/lend/v1/earn/positions?users=${pk}`, method:'GET'})
              }) : Promise.resolve(null)
            ]);
            const mktData = await mktRes.json();
            const posData = posRes ? await posRes.json() : [];
            const tokens = Array.isArray(mktData) ? mktData : [];
            const allPositions = Array.isArray(posData) ? posData : posData?.positions || [];
            const userPositions = allPositions
              .filter((p:any) => parseFloat(p.shares||'0') > 0)
              .map((p:any) => ({
                sym: p.token?.asset?.symbol || p.token?.uiSymbol || '?',
                bal: (parseFloat(p.underlyingAssets||p.underlyingBalance||'0') / Math.pow(10, p.token?.asset?.decimals ?? 6)).toFixed(4),
                apy: (parseInt(p.token?.totalRate||'0')/100).toFixed(2),
                price: parseFloat(p.token?.asset?.price||'0'),
              }));
            if (!tokens.length) {
              setMsgs(p => [...p, { id: Date.now(), text: 'No earn markets available right now.', from: 'bot' }]);
              break;
            }
            const cardId = Date.now() + 1;
            setMsgs(p => [...p, { id: cardId, from: 'bot', text: '', card: { type: 'earn_markets', data: { tokens, userPositions } } }]);
          } catch(e:any) { setMsgs(p => [...p, { id: Date.now(), text: `Failed to fetch earn markets: ${e.message}`, from: 'bot' }]); }
          break;
        }
        case 'EARN_DEPOSIT':
        case 'EARN_WITHDRAW': {
          try {
            const mktRes = await fetch('https://lite-api.jup.ag/lend/v1/earn/tokens');
            const mktData = await mktRes.json();
            const tokens = Array.isArray(mktData) ? mktData : [];
            const cardType = action === 'EARN_DEPOSIT' ? 'earn_deposit' : 'earn_withdraw';
            const sym = (data.sym||'').toUpperCase();
            setMsgs(p => [...p, { id: Date.now()+1, from: 'bot', text: '', card: { type: cardType, data: { tokens, preselect: sym } } }]);
          } catch(e:any) { setMsgs(p => [...p, { id: Date.now(), text: `❌ Failed: ${e.message}`, from: 'bot' }]); }
          break;
        }
        case 'SHOW_STUDIO': {
          const { name, symbol, supply, decimals: dec, description } = data;
          if (!name || !symbol || !supply) {
            let prompt = '🎨 Jupiter Studio — Create a Token\n\n';
            if (name) prompt += `Name: ${name}\n`; else prompt += '• What is the token name?\n';
            if (symbol) prompt += `Symbol: ${symbol}\n`; else prompt += '• What is the token symbol? (e.g. MTK)\n';
            if (supply) prompt += `Supply: ${supply}\n`; else prompt += '• What is the total supply? (e.g. 1000000000)\n';
            if (!dec) prompt += '• Decimals? (default 9)\n';
            if (!description) prompt += '• Short description?\n';
            prompt += '\nReply with all details and I will create it.';
            setMsgs(p => [...p, { id: Date.now(), text: prompt, from: 'bot' }]);
            break;
          }
          // Show studio card — user picks image and launches from there
          const studioCardId = Date.now() + 1;
          setMsgs(p => [...p, { id: studioCardId, from: 'bot', text: '', card: {
            type: 'studio_launch',
            data: { name, symbol, supply: supply || '1000000000', decimals: dec || '9', description: description || '', creator: pk }
          }}]);
          break;
        }

        case 'BASKET_SWAP': {
          const trades = data.trades || [];
          if (!trades.length) { setMsgs(p => [...p, { id: Date.now(), text: 'No trades specified.', from: 'bot' }]); break; }
          setMsgs(p => [...p, { id: Date.now(), text: `⏳ Preparing ${trades.length} swap${trades.length>1?'s':''}...`, from: 'bot' }]);
          let done = 0, failed = 0;
          for (const t of trades) {
            const from = (t.from||'USDC').toUpperCase();
            const to = (t.to||'SOL').toUpperCase();
            const amount = t.amount || t.amountUSD;
            const fromToken = await resolveToken(from);
            const toToken = await resolveToken(to);
            if (!fromToken || !toToken || !amount) {
              setMsgs(p => [...p, { id: Date.now(), text: `❌ ${from}→${to} failed: Unknown token`, from: 'bot' }]);
              failed++; continue;
            }
            try {
              const txSig = await executeSwapTx(fromToken.mint, toToken.mint, parseFloat(amount), fromToken.decimals||6, pk, secretKey, RPC_URL);
              setMsgs(p => [...p, { id: Date.now(), text: `✅ ${from}→${to}: ${txSig.slice(0,16)}...
https://solscan.io/tx/${txSig}`, from: 'bot' }]);
              done++;
            } catch(e:any) { setMsgs(p => [...p, { id: Date.now(), text: `❌ ${from}→${to} failed: ${e.message}`, from: 'bot' }]); failed++; }
          }
          setMsgs(p => [...p, { id: Date.now(), text: `Basket done: ${done} succeeded, ${failed} failed`, from: 'bot' }]);
          fetchPortfolio();
          break;
        }

        case 'SWAP_ALL_WALLET': {
          const to = (data.to||'USDC').toUpperCase();
          const exclude = (data.exclude||[]).map((s:string)=>s.toUpperCase());
          exclude.push(to);
          setMsgs(p => [...p, { id: Date.now(), text: `⏳ Swapping all wallet tokens to ${to}...`, from: 'bot' }]);
          // Fetch portfolio then swap each token
          try {
            const rpcConn = { url: RPC_URL };
            const balRes = await fetch(`https://lite-api.jup.ag/ultra/v1/balances/${pk}`);
            const balData = await balRes.json();
            const tokens = Object.entries(balData?.tokenBalances||{}) as [string,any][];
            let done = 0, failed = 0;
            for (const [mint, bal] of tokens) {
              if (!bal?.uiAmount || bal.uiAmount <= 0) continue;
              const sym = Object.entries(TOKENS).find(([s,m])=>m===mint)?.[0];
              if (!sym || exclude.includes(sym.toUpperCase())) continue;
              try {
                const txSig = await executeSwapTx(mint, TOKENS[to], bal.uiAmount, bal.decimals||6, pk, secretKey, RPC_URL);
                setMsgs(p => [...p, { id: Date.now(), text: `✅ ${sym}→${to}: ${txSig.slice(0,16)}...
https://solscan.io/tx/${txSig}`, from: 'bot' }]);
                done++;
              } catch(e:any) { failed++; }
            }
            setMsgs(p => [...p, { id: Date.now(), text: `Done: ${done} swapped, ${failed} failed`, from: 'bot' }]);
            fetchPortfolio();
          } catch(e:any) { setMsgs(p => [...p, { id: Date.now(), text: `❌ Failed: ${e.message}`, from: 'bot' }]); }
          break;
        }

        case 'FETCH_LOCKS': {
          setMsgs(p => [...p, { id: Date.now(), text: '⏳ Fetching your token locks...', from: 'bot' }]);
          try {
            const lockRes = await fetch(`https://chatfi.pro/api/lock?wallet=${pk}`);
            const lockData = await lockRes.json();
            const locks = lockData.locks || lockData.positions || [];
            if (!locks.length) {
              setMsgs(p => [...p, { id: Date.now(), text: '🔒 No active locks found.\nUse "lock 100 JUP for 30 days" to create one.', from: 'bot' }]);
            } else {
              const txt = locks.map((l:any) => {
                const sym = l.symbol || l.token || '?';
                const amt = l.amount || l.lockedAmount || '?';
                const cliff = l.cliffDays || l.cliff || '?';
                const vesting = l.vestingDays || l.vesting || '?';
                const claimable = l.claimableAmount ? `\n  Claimable: ${l.claimableAmount}` : '';
                return `• ${amt} ${sym}\n  Cliff: ${cliff}d · Vesting: ${vesting}d${claimable}`;
              }).join('\n\n');
              setMsgs(p => [...p, { id: Date.now(), text: `🔒 Your Token Locks:\n\n${txt}`, from: 'bot' }]);
            }
          } catch(e:any) { setMsgs(p => [...p, { id: Date.now(), text: `❌ Failed to fetch locks: ${e.message}`, from: 'bot' }]); }
          break;
        }

        case 'FETCH_TRIGGER_ORDERS': {
          setMsgs(p => [...p, { id: Date.now(), text: '⏳ Fetching your limit orders...', from: 'bot' }]);
          try {
            const trigRes = await fetch(`https://trigger.jup.ag/v1/orders?wallet=${pk}&status=active`);
            const trigData = await trigRes.json();
            const orders = trigData.orders || trigData || [];
            if (!orders.length) {
              setMsgs(p => [...p, { id: Date.now(), text: 'No active limit orders. Say "buy SOL when price drops below $140" to create one.', from: 'bot' }]);
            } else {
              const txt = orders.slice(0,10).map((o:any) => {
                const inSym = o.inputMint?.slice(0,6) || '?';
                const outSym = o.outputMint?.slice(0,6) || '?';
                const amt = o.inAmount ? (parseFloat(o.inAmount)/1e6).toFixed(2) : '?';
                const price = o.triggerPrice || o.price || '?';
                return `• ${amt} ${inSym}→${outSym} @ $${price}`;
              }).join('\n');
              setMsgs(p => [...p, { id: Date.now(), text: `📋 Active Limit Orders:
${txt}`, from: 'bot' }]);
            }
          } catch(e:any) { setMsgs(p => [...p, { id: Date.now(), text: `❌ Failed to fetch orders: ${e.message}`, from: 'bot' }]); }
          break;
        }

        case 'FETCH_RECURRING_ORDERS': {
          setMsgs(p => [...p, { id: Date.now(), text: '⏳ Fetching your DCA orders...', from: 'bot' }]);
          try {
            const dcaRes = await fetch(`https://dca.jup.ag/v2/dca?user=${pk}&status=active`);
            const dcaData = await dcaRes.json();
            const orders = dcaData.dcaAccounts || dcaData || [];
            if (!orders.length) {
              setMsgs(p => [...p, { id: Date.now(), text: '📅 No active DCA orders. Say "DCA $10 USDC to SOL daily for 7 days" to create one.', from: 'bot' }]);            } else {
              const txt = orders.slice(0,10).map((o:any) => {
                const inSym = o.inputMint?.slice(0,6) || '?';
                const outSym = o.outputMint?.slice(0,6) || '?';
                const amt = o.inAmountPerCycle ? (parseFloat(o.inAmountPerCycle)/1e6).toFixed(2) : '?';
                const interval = o.cycleFrequency === 86400 ? 'daily' : o.cycleFrequency === 3600 ? 'hourly' : `every ${o.cycleFrequency}s`;
                const remaining = o.remainingCycles || '?';
                return `• ${amt} ${inSym}→${outSym} ${interval} · ${remaining} left`;
              }).join('\n');
              setMsgs(p => [...p, { id: Date.now(), text: `📅 Active DCA Orders:
${txt}`, from: 'bot' }]);
            }
          } catch(e:any) { setMsgs(p => [...p, { id: Date.now(), text: `❌ Failed to fetch DCA orders: ${e.message}`, from: 'bot' }]); }
          break;
        }

        case 'FETCH_STUDIO_FEES': {
          setMsgs(p => [...p, { id: Date.now(), text: '⏳ Fetching your creator fees...', from: 'bot' }]);
          try {
            const feeRes = await fetch(`https://chatfi.pro/api/studio/fees?wallet=${pk}`);
            const feeData = await feeRes.json();
            if (feeData.error) throw new Error(feeData.error);
            const fees = feeData.fees || [];
            if (!fees.length) {
              setMsgs(p => [...p, { id: Date.now(), text: '🎨 No creator fees found for your wallet.', from: 'bot' }]);
            } else {
              const txt = fees.map((f:any) => `• ${f.symbol || '?'}: ${f.amount || '?'} ($${f.valueUSD?.toFixed(2)||'?'})`).join('\n');
              setMsgs(p => [...p, { id: Date.now(), text: `Your Creator Fees:\n${txt}`, from: 'bot' }]);
            }
          } catch(e:any) { setMsgs(p => [...p, { id: Date.now(), text: `❌ Failed to fetch creator fees: ${e.message}`, from: 'bot' }]); }
          break;
        }

        case 'FETCH_EARN_POSITIONS': {
          setMsgs(p => [...p, { id: Date.now(), text: '⏳ Fetching your earn positions...', from: 'bot' }]);
          try {
            const posRes = await fetch('https://chatfi.pro/api/jupiter', {
              method:'POST', headers:{'Content-Type':'application/json'},
              body: JSON.stringify({url:`https://api.jup.ag/lend/v1/earn/positions?users=${pk}`,method:'GET'})
            });
            const positions = await posRes.json();
            const active = Array.isArray(positions) ? positions.filter((p:any) => parseFloat(p.underlyingBalance||'0') > 0) : [];
            setMsgs(p => p.filter(m => m.text !== '⏳ Fetching your earn positions...'));
            if (!active.length) {
              setMsgs(p => [...p, { id: Date.now(), from: 'bot', text: '📭 No active earn positions.\n\nSay "deposit 10 USDC into earn" to start earning yield.' }]);
            } else {
              const lines = active.map((pos:any) => {
                const sym = pos.token?.asset?.symbol || pos.token?.uiSymbol || '?';
                const dec = pos.token?.asset?.decimals ?? 6;
                const bal = (parseFloat(pos.underlyingBalance||'0') / Math.pow(10, dec)).toFixed(4);
                const apy = (parseInt(pos.token?.totalRate||'0')/100).toFixed(2);
                const price = parseFloat(pos.token?.asset?.price||'0');
                const usd = price ? `($${(parseFloat(bal)*price).toFixed(2)})` : '';
                return `• ${bal} ${sym} ${usd} — ${apy}% APY`;
              }).join('\n');
              setMsgs(p => [...p, { id: Date.now(), from: 'bot', text: `🏦 Your Earn Positions:\n\n${lines}` }]);
            }
          } catch(e:any) { setMsgs(p => [...p, { id: Date.now(), text: `❌ Failed: ${e.message}`, from: 'bot' }]); }
          break;
        }
        case 'FETCH_SEND_HISTORY': {
          setMsgs(p => [...p, { id: Date.now(), text: '⏳ Fetching your send history...', from: 'bot' }]);
          try {
            const sendRes = await fetch(`https://chatfi.pro/api/send-history?wallet=${pk}`);
            const sendData = await sendRes.json();
            const history = sendData.history || [];
            if (!history.length) {
              setMsgs(p => [...p, { id: Date.now(), text: '📨 No send history found.', from: 'bot' }]);
            } else {
              const txt = history.slice(0,10).map((h:any) => `• ${h.amount} ${h.token} — ${h.status||'?'}
  ${h.tx?.slice(0,20)||''}...`).join('\n');
              setMsgs(p => [...p, { id: Date.now(), text: `Send History:\n${txt}`, from: 'bot' }]);
            }
          } catch(e:any) { setMsgs(p => [...p, { id: Date.now(), text: `❌ Failed to fetch send history: ${e.message}`, from: 'bot' }]); }
          break;
        }

        case 'FETCH_PERPS_POSITIONS':
        case 'SHOW_PERPS': {
          setMsgs(p => [...p, { id: Date.now(), text: '⏳ Fetching your perpetuals positions...', from: 'bot' }]);
          try {
            const perpRes = await fetch(`https://lite-api.jup.ag/perps/v1/positions?wallet=${pk}`);
            const perpData = await perpRes.json();
            const positions = perpData.positions || perpData || [];
            if (!positions.length) {
              setMsgs(p => [...p, { id: Date.now(), text: '📊 No open perps positions. Say "open 5x long SOL perp with 10 USDC" to start.', from: 'bot' }]);            } else {
              const txt = positions.map((p:any) => {
                const side = p.side || '?';
                const market = p.market || p.symbol || '?';
                const size = p.sizeUsd ? `$${parseFloat(p.sizeUsd).toFixed(2)}` : '?';
                const pnl = p.unrealizedPnl ? `PnL: $${parseFloat(p.unrealizedPnl).toFixed(2)}` : '';
                const lev = p.leverage ? `${parseFloat(p.leverage).toFixed(1)}x` : '';
                return `• ${side.toUpperCase()} ${market} ${lev}
  Size: ${size} ${pnl}`;
              }).join('\n\n');
              setMsgs(p => [...p, { id: Date.now(), text: `📊 Your Perps Positions:

${txt}`, from: 'bot' }]);
            }
          } catch(e:any) { setMsgs(p => [...p, { id: Date.now(), text: `❌ Failed to fetch perps: ${e.message}`, from: 'bot' }]); }
          break;
        }

        case 'SET_PRICE_ALERT': {
          const alertToken = (data.token||'SOL').toUpperCase();
          const alertCond = data.condition||'below';
          const alertPrice = parseFloat(data.price||data.triggerPrice||0);
          if (!alertPrice) { setMsgs(p => [...p, { id: Date.now(), text: 'Please specify a price. Example: alert me when SOL drops below $140', from: 'bot' }]); break; }
          setMsgs(p => [...p, { id: Date.now(), text: `🔔 Price alert set!
${alertToken} ${alertCond} $${alertPrice}
I will notify you in chat when it triggers.`, from: 'bot' }]);
          break;
        }

        case 'SHOW_PREDICTION':
        case 'FETCH_PREDICTIONS': {
          try {
            const cat = data?.sport || data?.category || null;
            const query = data?.query || data?.searchQuery || (data?.teamA && data?.teamB ? `${data.teamA} ${data.teamB}` : null);
            const limit = parseInt(data?.limit) || 20;
            const fetchLimit = Math.max(20, Math.min(limit, 100));
            setMsgs(p => [...p, { id: Date.now(), from: 'bot', text: `🔍 Fetching prediction markets...` }]);

            const extractEvents = (raw:any) => {
              if (Array.isArray(raw)) return raw;
              if (Array.isArray(raw?.data)) return raw.data;
              if (Array.isArray(raw?.events)) return raw.events;
              return [];
            };

            let events:any[] = [];
            // Try search first if query provided
            if (query) {
              try {
                const res = await fetch('https://chatfi.pro/api/jupiter', {
                  method:'POST', headers:{'Content-Type':'application/json'},
                  body: JSON.stringify({ url:`https://lite-api.jup.ag/prediction/v1/events/search?query=${encodeURIComponent(query)}&limit=${fetchLimit}&includeMarkets=true`, method:'GET' })
                });
                const raw = await res.json();
                events = extractEvents(raw);
              } catch {}
            }
            // Fallback to category fetch
            if (!events.length) {
              try {
                let url = `https://lite-api.jup.ag/prediction/v1/events?includeMarkets=true&sortBy=volume&sortDirection=desc&end=${fetchLimit*2}`;
                if (cat && cat !== 'null') url += `&category=${cat.toLowerCase()}`;
                const res = await fetch('https://chatfi.pro/api/jupiter', {
                  method:'POST', headers:{'Content-Type':'application/json'},
                  body: JSON.stringify({ url, method:'GET' })
                });
                const raw = await res.json();
                events = extractEvents(raw);
                // client-side filter if query
                if (query && events.length) {
                  const lq = query.toLowerCase();
                  const filtered = events.filter((e:any) =>
                    e.metadata?.title?.toLowerCase().includes(lq) ||
                    e.title?.toLowerCase().includes(lq) ||
                    (e.markets||[]).some((mk:any) => mk.metadata?.title?.toLowerCase().includes(lq))
                  );
                  if (filtered.length) events = filtered;
                }
              } catch {}
            }

            if (!events.length) {
              setMsgs(p => [...p, { id: Date.now(), from: 'bot', text: '❌ No prediction markets found. Try: "show sports predictions" or "Arsenal vs Man City".' }]);
              break;
            }
            const cardId = Date.now() + 1;
            setMsgs(p => [...p, {
              id: cardId, from: 'bot', text: '',
              card: { type: 'predictions', data: { events: events.slice(0, limit) } }
            }]);
          } catch(e:any) {
            setMsgs(p => [...p, { id: Date.now(), from: 'bot', text: `❌ Failed to fetch predictions: ${e.message}` }]);
          }
          break;
        }

        case 'PLACE_PREDICTION': {
          const { searchQuery, outcome, side, amount } = data || {};
          if (!searchQuery || !outcome || !amount) {
            setMsgs(p => [...p, { id: Date.now(), from: 'bot', text: 'Please specify match, outcome, side (yes/no) and amount.' }]);
            break;
          }
          const amtNum = parseFloat(amount);
          if (!amtNum || amtNum < 5) {
            setMsgs(p => [...p, { id: Date.now(), from: 'bot', text: 'Minimum bet is $5 USDC.' }]);
            break;
          }
          setMsgs(p => [...p, { id: Date.now(), from: 'bot', text: `⏳ Placing ${(side||'yes').toUpperCase()} $${amtNum} on ${outcome}...` }]);
          try {
            // 1. Find market
            const res = await fetch('https://chatfi.pro/api/jupiter', {
              method:'POST', headers:{'Content-Type':'application/json'},
              body: JSON.stringify({ url:`https://lite-api.jup.ag/prediction/v1/events/search?query=${encodeURIComponent(searchQuery)}&limit=10&includeMarkets=true`, method:'GET' })
            });
            const raw = await res.json();
            const events = Array.isArray(raw) ? raw : (raw?.data || raw?.events || []);
            if (!events.length) throw new Error(`No market found for: ${searchQuery}`);

            // 2. Find matching outcome market
            const outcomeLower = (outcome||'').toLowerCase();
            let foundMarketId = null;
            for (const evt of events) {
              const openMks = (evt.markets||[]).filter((mk:any) => !mk.status || mk.status === 'open');
              const match = openMks.find((mk:any) => {
                const t = (mk.metadata?.title || mk.title || '').toLowerCase();
                return t.includes(outcomeLower) || outcomeLower.includes(t);
              }) || openMks[0];
              if (match) { foundMarketId = match.marketId || match.id; break; }
            }
            if (!foundMarketId) throw new Error(`No open market found for outcome: ${outcome}`);

            // 3. Place order
            const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
            const depositAmount = Math.floor(amtNum * 1_000_000);
            const isYes = (side||'yes') === 'yes';
            const orderRes = await fetch('https://chatfi.pro/api/jupiter', {
              method:'POST', headers:{'Content-Type':'application/json'},
              body: JSON.stringify({
                url:'https://lite-api.jup.ag/prediction/v1/orders',
                method:'POST',
                body:{ ownerPubkey: pk, marketId: foundMarketId, isYes, isBuy: true, depositAmount, depositMint: USDC_MINT }
              })
            });
            const orderData = await orderRes.json();
            if (!orderData?.transaction) throw new Error(orderData?.message || orderData?.error || 'No transaction returned');

            // 4. Sign and send
            const { VersionedTransaction: VT, Keypair: KP } = require('@solana/web3.js');
            const keypair = KP.fromSecretKey(secretKey);
            const tx = VT.deserialize(Buffer.from(orderData.transaction,'base64'));
            tx.sign([keypair]);
            const signed = Buffer.from(tx.serialize()).toString('base64');
            const sendRes = await fetch('https://chatfi.pro/api/jupiter', {
              method:'POST', headers:{'Content-Type':'application/json'},
              body: JSON.stringify({ url:'https://api.mainnet-beta.solana.com', method:'POST',
                body:{ jsonrpc:'2.0', id:1, method:'sendTransaction', params:[signed,{encoding:'base64',skipPreflight:true}] }
              })
            });
            const sendData = await sendRes.json();
            const sig = sendData?.result;
            if (!sig) throw new Error(sendData?.error?.message || 'Transaction failed');
            setMsgs(p => [...p, { id: Date.now(), from: 'bot', text: `✅ ${(side||'yes').toUpperCase()} $${amtNum} on ${outcome} placed!
https://solscan.io/tx/${sig}` }]);
          } catch(e:any) {
            setMsgs(p => [...p, { id: Date.now(), from: 'bot', text: `❌ Bet failed: ${e.message}` }]);
          }
          break;
        }

        case 'COPY_TRADE': {
          const { wallet: copyWallet, limit } = data;
          if (!copyWallet) {
            setMsgs(p => [...p, { id: Date.now(), from: 'bot', text: 'Please provide a wallet address to copy trades from.' }]);
            break;
          }
          setMsgs(p => [...p, { id: Date.now(), from: 'bot', text: `🔍 Analysing whale wallet ${copyWallet.slice(0,8)}...` }]);
          try {
            // Fetch signatures + token balances in parallel
            const fetchLimit = Math.min(parseInt(limit)||20, 50);
            const [sigsRes, balRes] = await Promise.allSettled([
              rpcFetch('getSignaturesForAddress', [copyWallet, { limit: fetchLimit }]),
              fetch(`https://lite-api.jup.ag/ultra/v1/balances/${copyWallet}`).then(r=>r.json()),
            ]);
            const sigs = sigsRes.status==='fulfilled' ? (sigsRes.value?.result||[]) : [];
            const balData = balRes.status==='fulfilled' ? balRes.value : {};
            // Build token holdings
            const tokenBals = Object.entries(balData?.tokenBalances||{}) as [string,any][];
            const holdings: any[] = [];
            for (const [mint, bal] of tokenBals) {
              if (!bal?.uiAmount || bal.uiAmount <= 0) continue;
              const resolved = await resolveToken(mint).catch(()=>null);
              const sym = resolved ? (Object.keys(TOKENS).find(k=>TOKENS[k]===mint)||mint.slice(0,6)) : mint.slice(0,6);
              holdings.push({ sym, amount: bal.uiAmount, mint });
            }
            // Format trades with full sig for copying
            const trades = sigs.slice(0, Math.min(fetchLimit, 20)).map((s:any) => ({
              sig: s.signature,
              date: s.blockTime ? new Date(s.blockTime*1000).toLocaleDateString() : '?',
              err: !!s.err,
            }));
            const cardId = Date.now() + 1;
            setMsgs(p => p.filter(m => m.text !== `🔍 Analysing whale wallet ${copyWallet.slice(0,8)}...`));
            setMsgs(p => [...p, {
              id: cardId, from: 'bot', text: '',
              card: { type: 'copy_trade', data: { wallet: copyWallet, trades, holdings } }
            }]);
          } catch(e:any) {
            setMsgs(p => [...p, { id: Date.now(), from: 'bot', text: `❌ Failed to fetch wallet: ${e.message}` }]);
          }
          break;
        }

        case 'SHOW_TRIGGER_V2': {
          // Map to SHOW_TRIGGER
          const d2 = {
            from: data.from,
            to: data.to,
            amount: data.amount,
            targetPrice: data.triggerPriceUsd,
            direction: data.triggerCondition || 'below'
          };
          const cardId = Date.now() + 1;
          setMsgs(p => [...p, {
            id: cardId, from: 'bot', text: '',
            card: {
              type: 'trigger', data: d2,
              onCancel: () => updateCard(cardId, { status: 'cancelled' }),
              onConfirm: async () => {
                updateCard(cardId, { status: 'loading' });
                try {
                  const { publicKey: pk2, secretKey: sk2 } = deriveWallet(wallet!);
                  const txSig = await createTriggerOrder(TOKENS[d2.from]||d2.from, TOKENS[d2.to]||d2.to, DECIMALS[d2.from]||6, DECIMALS[d2.to]||6, parseFloat(d2.amount), parseFloat(d2.targetPrice), d2.direction, pk2, sk2);
                  updateCard(cardId, { status: 'success' });
                  setMsgs(p => [...p, { id: Date.now(), from: 'bot', text: 'Limit order placed! https://solscan.io/tx/' + txSig }]);
                } catch(e:any) { updateCard(cardId, { status: 'error', error: e.message }); }
              }
            }
          }]);
          break;
        }

        case 'FETCH_TOKEN_CATEGORY': {
          const cat = data.category || 'toptrending';
          const interval = data.interval || '24h';
          const limit = data.limit || 20;
          const catLabel = cat === 'toptrending' ? 'Top Trending' : cat === 'toptraded' ? 'Top Traded' : 'Top Organic Score';
          try {
            const res = await fetch(`https://api.jup.ag/tokens/v2/${cat}/${interval}?limit=${limit}`);
            const tokens = await res.json();
            const list = Array.isArray(tokens) ? tokens : tokens?.tokens || [];
            const cardId = Date.now() + 1;
            setMsgs(p => [...p, {
              id: cardId, from: 'bot', text: '',
              card: { type: 'trending', data: { tokens: list.slice(0, limit), label: catLabel, interval } }
            }]);
          } catch(e:any) {
            setMsgs(p => [...p, { id: Date.now(), from: 'bot', text: `Failed to fetch trending tokens: ${e.message}` }]);
          }
          break;
        }

        case 'CHAINED_ACTIONS': {
          const steps = data.steps || [];
          if (!steps.length) { setMsgs(p => [...p, { id: Date.now(), text: 'No steps found in chain.', from: 'bot' }]); break; }
          setMsgs(p => [...p, { id: Date.now(), text: `⏳ Executing ${steps.length} actions in sequence...`, from: 'bot' }]);
          for (let i = 0; i < steps.length; i++) {
            const step = steps[i];
            setMsgs(p => [...p, { id: Date.now(), text: `▶ Step ${i+1}/${steps.length}: ${step.action?.replace(/_/g,' ').toLowerCase()}...`, from: 'bot' }]);
            await new Promise(r => setTimeout(r, 600));
            await dispatchAction(step.action, step.actionData || {});
          }
          break;
        }

        case 'FETCH_TOKEN_INFO': {
          const sym = (data.symbol||data.token||'').toUpperCase();
          if (!sym) { setMsgs(p => [...p, { id: Date.now(), text: 'Please specify a token symbol.', from: 'bot' }]); break; }
          setMsgs(p => [...p, { id: Date.now(), text: `🔍 Fetching ${sym}...`, from: 'bot' }]);
          try {
            const resolved = await resolveToken(sym);
            if (!resolved) throw new Error('Token not found');
            const mint = resolved.mint;
            const proxyRes = await fetch('https://chatfi.pro/api/jupiter', {
              method:'POST', headers:{'Content-Type':'application/json'},
              body: JSON.stringify({url:`https://lite-api.jup.ag/tokens/v2/search?query=${mint}&limit=1`,method:'GET'})
            });
            const proxyData = await proxyRes.json();
            const info = Array.isArray(proxyData) ? proxyData[0] : proxyData;
            if (!info) throw new Error('Token not found');
            setMsgs(p => p.filter(m => m.text !== `🔍 Fetching ${sym}...`));
            setMsgs(p => [...p, { id: Date.now(), from: 'bot', text: '', card: { type: 'token_info', data: {
              symbol: info.symbol || sym,
              name: info.name || sym,
              logo: info.icon || resolved.logoURI || '',
              price: info.usdPrice || null,
              priceChange24h: info.stats1h?.priceChange || null,
              priceChange5m: info.stats5m?.priceChange || null,
              priceChange6h: info.stats6h?.priceChange || null,
              mcap: info.mcap || null,
              fdv: info.fdv || null,
              liquidity: info.liquidity || null,
              volume1h: info.stats1h?.buyVolume != null ? (info.stats1h.buyVolume + info.stats1h.sellVolume) : null,
              holders: info.holderCount || null,
              circSupply: info.circSupply || null,
              totalSupply: info.totalSupply || null,
              twitter: info.twitter || null,
              website: info.website || null,
              isVerified: !!info.twitter || !!info.website,
              mint,
            }}}]);
          } catch(e:any) { setMsgs(p => [...p, { id: Date.now(), text: `❌ Could not fetch token info: ${e.message}`, from: 'bot' }]); }
          break;
        }
      }
    } catch(e:any) { setMsgs(p => [...p, { id: Date.now(), text: `❌ Error: ${e.message}`, from: 'bot' }]); }
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
    let mint = '';
    if (token === 'SOL') mint = 'So11111111111111111111111111111111111111112';
    else {
      const allPost = tx.meta?.postTokenBalances||[];
      const pb = allPost.find((p:any)=>p.owner===myPk);
      if (pb) mint = pb.mint;
    }
    return {sig:sig.signature,time,failed:!!sig.err,type,amount,token,mint};
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
    if (!query || query.length < 1) {
      setResults([
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
    try {
      const res = await fetch('https://lite-api.jup.ag/tokens/v2/search?query=' + encodeURIComponent(query) + '&limit=6');
      const data = await res.json();
      const tokens = (Array.isArray(data) ? data : (data.tokens || [])).map((t:any) => ({...t, address: t.id || t.address, logoURI: t.logoURI || t.icon || ''}));
      setResults(tokens);
      // Force fetch logos for tokens missing them
      tokens.forEach(async (t:any) => {
        if (!t.logoURI && (t.address || t.id)) {
          try {
            const lr = await fetch('https://lite-api.jup.ag/tokens/v2/token/' + (t.address || t.id));
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
            <Text style={{color:C.text,fontSize:16,letterSpacing:0.5}}>Back</Text>
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
            <TouchableOpacity onPress={()=>setOnboardStep('fingerprint')} style={{paddingVertical:16,borderRadius:30,borderWidth:1,borderColor:C.border,alignItems:'center',width:'100%'}}>
              <Text style={{color:C.text,fontSize:16,letterSpacing:0.5}}>Back</Text>
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
              <TouchableOpacity onPress={()=>setOnboardStep('wordcount')} style={{paddingVertical:16,borderRadius:30,borderWidth:1,borderColor:C.border,alignItems:'center',width:'100%'}}>
                <Text style={{color:C.text,fontSize:16,letterSpacing:0.5}}>Back</Text>
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
            <TextInput key="username-input" value={onboardName} onChangeText={setOnboardName} placeholder="wallet01" placeholderTextColor={C.muted} style={{flex:1,color:C.text,fontSize:16,paddingVertical:12}} autoCapitalize="none" blurOnSubmit={false} returnKeyType="done"/>
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
            <TouchableOpacity onPress={()=>setOnboardStep('seedphrase')} style={{paddingVertical:16,borderRadius:30,borderWidth:1,borderColor:C.border,alignItems:'center',width:'100%'}}>
              <Text style={{color:C.text,fontSize:16,letterSpacing:0.5}}>Back</Text>
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
          <View style={{backgroundColor:C.modal,borderTopLeftRadius:20,borderTopRightRadius:20,maxHeight:"80%",paddingBottom:72}}>
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
                  <View style={{width:42,height:42,borderRadius:21,marginRight:12,position:'relative'}}>
                    <TokLogo uri={tx.mint?'https://img.jup.ag/tokens/'+tx.mint:''} fallback={''} symbol={tx.token} style={{width:42,height:42,borderRadius:21}} mint={tx.mint||''} />
                    <View style={{position:'absolute',bottom:0,right:0,width:16,height:16,borderRadius:8,backgroundColor:tx.failed?"#3a1a1a":tx.type==="RECEIVE"?"#1a2a1a":"#1a1a2a",alignItems:"center",justifyContent:"center"}}>
                      <Text style={{fontSize:10}}>{tx.failed?"❌":tx.type==="RECEIVE"?"↓":tx.type==="SWAP"?"⇄":"↑"}</Text>
                    </View>
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
          <View style={{backgroundColor:C.modal,borderTopLeftRadius:20,borderTopRightRadius:20,padding:24,paddingBottom:36}}>
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
      {selectedToken && <TokenModal token={selectedToken} pubkey={pubkey} onClose={() => setSelectedToken(null)}
  onSend={async (mint, recipient, amount, symbol, decimals) => {
    if (!wallet) { Alert.alert('Error', 'This is a watch-only account'); return; }
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
/>}
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
        setChangingPasscode={setChangingPasscode}
        setUserName={setUserName}
        setAccounts={setAccounts}
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

      {tab !== 'dapp' && tab !== 'settings' && <View style={s.header}>
        <View style={s.logoRow}>
          
          <TouchableOpacity onPress={() => setShowAccountModal(true)} style={{flexDirection:'row',alignItems:'center',gap:8}}>
  <View style={{width:36,height:36,borderRadius:18,backgroundColor:C.green,alignItems:'center',justifyContent:'center'}}>
    {(accounts||[])[activeAccIdx]?.avatar
      ? <Text style={{fontSize:20}}>{(accounts||[])[activeAccIdx].avatar}</Text>
      : <Text style={{color:'#0d1117',fontWeight:'bold',fontSize:16}}>{userName?.[0]?.toUpperCase()||'C'}</Text>
    }
  </View>
  {userName ? <Text style={{color:C.text,fontWeight:'600',fontSize:15}}>{userName}</Text> : null}
</TouchableOpacity>
        </View>
        <TouchableOpacity
          onPress={() => setShowChat(v => !v)}
          style={{flexDirection:'row',alignItems:'center',gap:6,backgroundColor:showChat?'rgba(163,230,53,0.12)':'rgba(163,230,53,0.08)',borderWidth:1,borderColor:C.green,borderRadius:24,paddingHorizontal:14,paddingVertical:7}}>
          <Ionicons name={showChat ? 'wallet-outline' : 'chatbubble-ellipses-outline'} size={15} color={C.green}/>
          <Text style={{color:C.green,fontSize:12,fontWeight:'700',letterSpacing:0.3}}>{showChat ? 'Wallet' : 'Chat'}</Text>
          <Ionicons name={showChat ? 'arrow-up' : 'arrow-down'} size={12} color={C.green}/>
        </TouchableOpacity>
      </View>}

      <KeyboardAvoidingView style={s.content} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={0}>

        {/* CHAT */}
        <View style={{position:'absolute',top:0,left:0,right:0,bottom:0,zIndex:9999,display:showChat?'flex':'none',backgroundColor:C.bg}}>
          <View style={s.flex}>

                <ScrollView style={s.msgs} contentContainerStyle={{ paddingBottom: 16, paddingHorizontal: 12 }}>
              {msgs.map(m => (
                <View key={m.id} style={m.from === 'user' ? [s.bubble, s.userBubble] : {marginBottom:8}}>
                  {m.from === 'bot' && !m.card && (
                    <View style={[s.bubble, s.botBubble]}>
                      <View style={s.botTag}><View style={s.botDot} /><Text style={s.botTagTxt}>ChatFi AI</Text></View>
                      <Text style={s.bubbleTxt}>{m.text}</Text>
                    </View>
                  )}
                  {m.from === 'user' && <Text style={s.bubbleTxt}>{m.text}</Text>}
                  {m.card && renderCard(m.card)}
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
              <TextInput style={s.input} value={input} onChangeText={(t)=>{setInput(t);inputRef.current=t;}} placeholder="Ask ChatFi anything..." placeholderTextColor={C.muted} onSubmitEditing={() => sendMsg(inputRef.current||input)} editable={!aiLoading} autoCorrect={false} autoCapitalize="none" blurOnSubmit={false} />
              <TouchableOpacity style={[s.sendBtn, aiLoading && { opacity: 0.5 }]} onPress={() => sendMsg(inputRef.current||input)} disabled={aiLoading}>
                <Ionicons name="send" size={20} color="#0d1117" />
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* SWAP */}
      <View style={{flex:1, display: !showChat && tab === 'swap' ? 'flex' : 'none'}}>
        <SwapScreen
          wallet={wallet}
          pubkey={pubkey}
          tokenBalances={tokenBalances}
          solBalance={solBalance}
          fromToken2={fromToken2}
          setFromToken2={setFromToken2}
          toToken2={toToken2}
          setToToken2={setToToken2}
          showToast={showToast}
          C={C}
          s={s}
          nacl={nacl}
          deriveWallet={deriveWallet}
          executeSwapTx={async (quote:any, fromTok:any, toTok:any, amt:number) => {
            const { publicKey: pk2, secretKey: sk2 } = deriveWallet(wallet!);
            return executeSwapTx(fromTok.mint, toTok.mint, amt, fromTok.decimals||6, pk2, sk2, 'https://api.mainnet-beta.solana.com');
          }}
          fetchPortfolio={fetchPortfolio}
          requireAuth={requireAuth}
          createTriggerOrder={createTriggerOrder}
          createRecurringOrder={createRecurringOrder}
        />
      </View>
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
                  {portfolioLoading && tokenBalances.length===0 ? '...' : privacyMode ? '****' : '$'+((tokenBalances.filter(t=>t.mint!=='So11111111111111111111111111111111111111112').reduce((sum,t) => sum + (t.amount||0)*(t.price||0), 0)) + (solBalance||0)*(solPrice||0)).toFixed(2)}
                </Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={copyAddress} style={{flexDirection:'row',alignItems:'center',gap:6,marginTop:4}}>
                  <Text style={s.pfAddressTxt}>{pubkey ? pubkey.slice(0,4)+'....'+pubkey.slice(-4) : ''}</Text>
                </TouchableOpacity>
              </View>
              {/* Action Buttons */}
              <View style={{flexDirection:'row',justifyContent:'space-around',paddingVertical:16}}>
                <TouchableOpacity style={s.pfActionBtn} onPress={()=>setShowSendModal(true)}>
                  <View style={s.pfActionIcon}><Ionicons name="arrow-up-outline" size={22} color={C.text} /></View>
                  <Text style={s.pfActionLbl}>Send</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.pfActionBtn} onPress={()=>setTab('swap')}>
                  <View style={s.pfActionIcon}><Ionicons name="bar-chart-outline" size={22} color={C.text} /></View>
                  <Text style={s.pfActionLbl}>Trade</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.pfActionBtn} onPress={()=>setShowReceiveModal(true)}>
                  <View style={s.pfActionIcon}><Ionicons name="arrow-down-outline" size={22} color={C.text} /></View>
                  <Text style={s.pfActionLbl}>Receive</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.pfActionBtn} onPress={async()=>{if(!cameraPermission?.granted){await requestCameraPermission();}setShowScanModal(true);}}>
                  <View style={s.pfActionIcon}><Ionicons name="scan-outline" size={22} color={C.text} /></View>
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
              {portfolioLoading && tokenBalances.length===0 && <ActivityIndicator color={C.green} style={{marginTop:20}} />}
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
        <View style={{flex:1, display: tab === 'dapp' ? 'flex' : 'none'}}>
          <DappBrowser walletAddress={pubkey} secretKey={wallet ? deriveWallet(wallet).secretKey : null} wallet={wallet} mwaInitUrl={mwaInitUrl} onMwaHandled={() => setMwaInitUrl(null)} />
        </View>
        {/* SETTINGS */}
      {tab === 'settings' && (
        <View style={{flex:1, paddingTop: StatusBar.currentHeight||0}}>
        <SettingsTab
          accounts={accounts}
          activeAccIdx={activeAccIdx}
          switchAccount={switchAccount}
          addAccount={addAccount}
          setAccounts={setAccounts}
          wallet={wallet}
          pubkey={pubkey}
          requireAuth={requireAuth}
          setSeedPhrase={setSeedPhrase}
          setShowSeedModal={setShowSeedModal}
          setPrivKey={setPrivKey}
          setShowPrivKeyModal={setShowPrivKeyModal}
          setWallet={setWallet}
          setPubkey={setPubkey}
          setSolBalance={setSolBalance}
          securityEnabled={securityEnabled}
          setChangingPasscode={setChangingPasscode}
          deriveWallet={deriveWallet}
          getPrivateKey={getPrivateKey}
          nacl={nacl}
          C={C}
          s={s}
          appLanguage={appLanguage}
          setAppLanguage={setAppLanguage}
          appCurrency={appCurrency}
          setAppCurrency={setAppCurrency}
          appNetwork={appNetwork}
          setAppNetwork={setAppNetwork}
          exchangeRates={exchangeRates}
          currencySymbol={currencySymbol}
          setCurrencySymbol={setCurrencySymbol}
        />
        </View>
      )}
      </KeyboardAvoidingView>

      {/* TAB BAR */}
      <View style={s.tabBar}>
        {TABS.map((t) => { const { id, label, icon } = t;
          const active = tab === id;
          return (
            <TouchableOpacity key={id} style={s.tabItem} onPress={() => setTabPersist(id)}>
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
  tabBar: { flexDirection: 'row', backgroundColor: '#080c0a', borderTopWidth: 0, borderTopColor: 'transparent', paddingTop: 10, paddingBottom: 24, paddingHorizontal: 4, zIndex: 1 },
  tabItem: { flex: 1, alignItems: 'center', gap: 4, paddingHorizontal: 0 },
  tabIcon: { fontSize: 22, color: 'rgba(255,255,255,0.4)' },
  tabIconActive: { color: '#39FF82', textShadowColor: '#39FF82', textShadowOffset: {width:0,height:0}, textShadowRadius: 8 },
  tabLabel: { color: 'rgba(255,255,255,0.4)', fontSize: 9, marginTop: 2, letterSpacing: -0.3, width: '100%', textAlign: 'center' },
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
