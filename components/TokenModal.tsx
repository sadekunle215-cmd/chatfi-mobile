import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, TextInput, Modal, Alert, ActivityIndicator, Image, Linking, Platform, StatusBar, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CameraView } from 'expo-camera';
import { C } from '../theme';
import { rpcFetch } from '../wallet';
import { resolveToken } from '../sendMsg';

function TokenModal({ token, pubkey, onClose, onSend, onTrade, tokenBalances: modalTokens, requestCameraPermission }: any) {
  const [view, setView] = React.useState('overview');
  const [sendAddr, setSendAddr] = React.useState('');
  const [sendAmt, setSendAmt] = React.useState('');
  const [sendStep, setSendStep] = React.useState<'amount'|'recipient'|'summary'>('amount');
  const [recentAddresses, setRecentAddresses] = React.useState<any[]>([]);
  const [estimatedFee, setEstimatedFee] = React.useState<number|null>(null);
  const [feeLoading, setFeeLoading] = React.useState(false);
  const [showTokenPicker, setShowTokenPicker] = React.useState(false);
  const [showSendQR, setShowSendQR] = React.useState(false);
  const [sendToken, setSendToken] = React.useState<any>(null);
  const [allTokens, setAllTokens] = React.useState<any[]>([]);
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
    // Fetch holder count from Birdeye
    fetch('https://public-api.birdeye.so/defi/token_overview?address=' + token.mint, {
      headers: { 'X-Chain': 'solana' }
    }).then(r => r.json()).then(d => {
      const count = d?.data?.holder;
      if (count) setHolderCount(count);
    }).catch(() => {});
  }, [token?.mint]);

  const fetchHolders = async () => {
    if (!token?.mint || holdersLoading) return;
    setHoldersLoading(true);
    try {
      // Use Helius getTokenLargestAccounts via chatfi proxy
      const r = await fetch('https://chatfi.pro/api/jupiter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: 'SOLANA_RPC',
          method: 'POST',
          body: { jsonrpc: '2.0', id: 1, method: 'getTokenLargestAccounts', params: [token.mint] }
        })
      });
      const d = await r.json();
      const accounts = d?.result?.value || [];
      setTopHolders(accounts.slice(0, 20));
      setHolderCount(accounts.length);
    } catch(e) {}
    setHoldersLoading(false);
  };

  const fetchTrades = async () => {
    if (!token?.mint || tradesLoading) return;
    setTradesLoading(true);
    try {
      // Fetch recent transactions from Birdeye public API
      const r = await fetch(
        'https://public-api.birdeye.so/defi/txs/token?address=' + token.mint + '&offset=0&limit=50&tx_type=swap',
        { headers: { 'X-Chain': 'solana' } }
      );
      const d = await r.json();
      const items = d?.data?.items || [];
      const mapped = items.map((tx: any) => ({
        time: tx.blockUnixTime ? Math.round((Date.now()/1000 - tx.blockUnixTime) / 60) : null,
        type: tx.side === 'buy' ? 'B' : 'S',
        price: tx.price || 0,
        volumeUsd: tx.volumeUSD || 0,
        tokenAmount: tx.side === 'buy' ? (tx.to?.amount || 0) : (tx.from?.amount || 0),
        trader: tx.owner || tx.source || '',
      }));
      setTrades(mapped);
    } catch(e) {}
    setTradesLoading(false);
  };

  if (!token) return null;

  // For native SOL, DexScreener returns pool price (wrong) — use the passed-in price directly
  const isNativeSOL = token.mint === 'So11111111111111111111111111111111111111112';
  const price = isNativeSOL
    ? (token.price ? String(token.price) : null)
    : (pairData?.priceUsd || (token.price ? String(token.price) : null));
  const priceChange = pairData?.priceChange?.h24;
  const mktCap = pairData?.marketCap;
  const liquidity = pairData?.liquidity?.usd;
  const holders = holderCount ?? pairData?.info?.holders ?? null;
  // Organic score: ratio of organic buys to total txns (0-10 scale)
  const rawBuys = pairData?.txns?.h24?.buys || 0;
  const rawSells = pairData?.txns?.h24?.sells || 0;
  const totalTxns = rawBuys + rawSells;
  const orgScore = totalTxns > 0 ? Math.min(10, Math.round((rawBuys / totalTxns) * 10)) : null;
  const twitter = pairData?.info?.socials?.find((s:any)=>s.type==='twitter')?.url;
  const website = pairData?.info?.websites?.[0]?.url;
  const positionVal = token.amount * (token.price || 0);
  const positionChange = positionVal - (token.amount * (token.avgBuy || token.price || 0));
  const fmt = (n:number) => n >= 1e6 ? '$'+(n/1e6).toFixed(2)+'M' : n >= 1e3 ? '$'+(n/1e3).toFixed(2)+'K' : '$'+n?.toFixed(2);
  const tfMap: Record<string,string> = {'1H':'15','1D':'60','1W':'240','1M':'1D','YTD':'1W'};
  const chartUrl = pairData?.pairAddress
    ? 'https://dexscreener.com/solana/' + pairData.pairAddress + '?embed=1&theme=dark&trades=0&info=0'
    : '';

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
                <Text style={{color:C.muted,fontSize:10,letterSpacing:0.5}}>ORG</Text>
                <Text style={{color:orgScore!=null&&orgScore>=5?C.green:'#ff4444',fontSize:12,fontWeight:'700'}}>
                  {orgScore != null ? orgScore + '/10' : '—'}
                </Text>
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
            <NativePriceChart mint={token?.mint} C={C} avgBuy={token?.avgBuy||null} />
            <View style={{flexDirection:'row',borderBottomWidth:1,borderBottomColor:C.border}}>
              {['Overview','Terminal','Live Feed'].map(tab=>(
                <TouchableOpacity key={tab} onPress={()=>{setActiveTab(tab);if(tab==='Terminal')fetchHolders();if(tab==='Live Feed')fetchTrades();}} style={{flex:1,paddingVertical:12,alignItems:'center',borderBottomWidth:2,borderBottomColor:tab===activeTab?C.green:'transparent'}}>
                  <Text style={{color:tab===activeTab?C.green:C.muted,fontSize:14,fontWeight:'600'}}>{tab}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <ScrollView style={{flex:1}} showsVerticalScrollIndicator={false}>
              {/* Overview Tab content */}
              {activeTab === 'Overview' && (
                <View>
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
                </View>
              )}
              {/* Terminal Tab — Top 20 Holders */}
              {activeTab === 'Terminal' && (
                <View style={{padding:16}}>
                  <Text style={{color:C.text,fontWeight:'700',fontSize:16,marginBottom:12}}>Top Holders</Text>
                  {holdersLoading && <ActivityIndicator color={C.green} style={{marginTop:20}}/>}
                  {!holdersLoading && topHolders.length === 0 && (
                    <Text style={{color:C.muted,textAlign:'center',marginTop:20,fontSize:13}}>No holder data available</Text>
                  )}
                  {!holdersLoading && topHolders.length > 0 && (
                    <View>
                      {/* Header */}
                      <View style={{flexDirection:'row',paddingVertical:8,borderBottomWidth:1,borderBottomColor:C.border,marginBottom:4}}>
                        <Text style={{color:C.muted,fontSize:11,width:32}}>#</Text>
                        <Text style={{color:C.muted,fontSize:11,flex:1}}>ADDRESS</Text>
                        <Text style={{color:C.muted,fontSize:11,textAlign:'right'}}>AMOUNT</Text>
                      </View>
                      {topHolders.map((h:any, i:number) => (
                        <View key={i} style={{flexDirection:'row',alignItems:'center',paddingVertical:10,borderBottomWidth:1,borderBottomColor:C.border}}>
                          <Text style={{color:C.muted,fontSize:13,width:32}}>#{i+1}</Text>
                          <Text style={{color:C.green,fontSize:12,flex:1,fontFamily:'monospace'}} numberOfLines={1}>
                            {h.address ? h.address.slice(0,6)+'...'+h.address.slice(-4) : '—'}
                          </Text>
                          <Text style={{color:C.text,fontSize:13,fontWeight:'600',textAlign:'right'}}>
                            {h.uiAmount ? Number(h.uiAmount).toLocaleString(undefined,{maximumFractionDigits:0}) : '—'}
                          </Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              )}

              {/* Live Feed Tab — real onchain trades */}
              {activeTab === 'Live Feed' && (
                <View style={{padding:16}}>
                  <View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
                    <Text style={{color:C.text,fontWeight:'700',fontSize:16}}>Live Feed</Text>
                    <TouchableOpacity onPress={fetchTrades}
                      style={{backgroundColor:C.card,borderRadius:8,paddingHorizontal:12,paddingVertical:6}}>
                      <Text style={{color:C.green,fontSize:12,fontWeight:'600'}}>↻ Refresh</Text>
                    </TouchableOpacity>
                  </View>
                  {tradesLoading && <ActivityIndicator color={C.green} style={{marginTop:20}}/>}
                  {!tradesLoading && trades.length === 0 && (
                    <Text style={{color:C.muted,textAlign:'center',marginTop:20,fontSize:13}}>No trading data available</Text>
                  )}
                  {!tradesLoading && trades.length > 0 && (
                    <View>
                      {/* Column headers */}
                      <View style={{flexDirection:'row',paddingVertical:8,borderBottomWidth:1,borderBottomColor:C.border,marginBottom:4}}>
                        <Text style={{color:C.muted,fontSize:10,width:40}}>TIME</Text>
                        <Text style={{color:C.muted,fontSize:10,width:24}}/>
                        <Text style={{color:C.muted,fontSize:10,flex:1}}>PRICE</Text>
                        <Text style={{color:C.muted,fontSize:10,flex:1,textAlign:'right'}}>VOL</Text>
                        <Text style={{color:C.muted,fontSize:10,flex:1,textAlign:'right'}}>{token.symbol}</Text>
                        <Text style={{color:C.muted,fontSize:10,width:70,textAlign:'right'}}>TRADER</Text>
                      </View>
                      {trades.map((tx:any, i:number) => {
                        const isBuy = tx.type === 'B';
                        const timeLabel = tx.time != null
                          ? tx.time < 60 ? tx.time + 'm' : Math.round(tx.time/60/24) + 'd'
                          : '—';
                        const priceStr = tx.price > 0
                          ? '$' + (tx.price < 0.0001 ? tx.price.toExponential(2) : tx.price < 0.01 ? tx.price.toFixed(6) : tx.price.toFixed(4))
                          : '—';
                        const volStr = tx.volumeUsd > 0
                          ? tx.volumeUsd >= 1000 ? '$' + (tx.volumeUsd/1000).toFixed(2) + 'K' : '$' + tx.volumeUsd.toFixed(2)
                          : '—';
                        const amtStr = tx.tokenAmount > 0
                          ? tx.tokenAmount >= 1000 ? (tx.tokenAmount/1000).toFixed(1) + 'K' : tx.tokenAmount.toFixed(0)
                          : '—';
                        const traderStr = tx.trader ? tx.trader.slice(0,4)+'...'+tx.trader.slice(-4) : '—';
                        return (
                          <View key={i} style={{flexDirection:'row',alignItems:'center',paddingVertical:9,borderBottomWidth:1,borderBottomColor:C.border}}>
                            <Text style={{color:C.muted,fontSize:11,width:40}}>{timeLabel}</Text>
                            <View style={{width:24,alignItems:'center'}}>
                              <View style={{backgroundColor:isBuy?'rgba(57,255,20,0.15)':'rgba(255,68,68,0.15)',borderRadius:4,paddingHorizontal:3,paddingVertical:1}}>
                                <Text style={{color:isBuy?C.green:'#ff4444',fontSize:10,fontWeight:'700'}}>{tx.type}</Text>
                              </View>
                            </View>
                            <Text style={{color:C.text,fontSize:12,flex:1}}>{priceStr}</Text>
                            <Text style={{color:isBuy?C.green:'#ff4444',fontSize:12,flex:1,textAlign:'right'}}>{volStr}</Text>
                            <Text style={{color:C.text,fontSize:12,flex:1,textAlign:'right'}}>{amtStr}</Text>
                            <Text style={{color:C.muted,fontSize:11,width:70,textAlign:'right',fontFamily:'monospace'}}>{traderStr}</Text>
                          </View>
                        );
                      })}
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
              <TouchableOpacity onPress={()=>{ onTrade && onTrade(token); onClose(); }} style={{flex:1,backgroundColor:C.card,borderRadius:14,padding:14,alignItems:'center',flexDirection:'row',justifyContent:'center',gap:6}}>
                <Ionicons name="swap-horizontal-outline" size={18} color={C.green}/>
                <Text style={{color:C.green,fontWeight:'bold'}}>Trade</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={()=>{setSendStep('amount');setView('send');}}
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
        {view === 'send' && sendStep === 'amount' && (
          <View style={{flex:1,backgroundColor:C.bg}}>
            {/* Header */}
            <View style={{flexDirection:'row',alignItems:'center',paddingHorizontal:16,paddingTop:(StatusBar.currentHeight||0)+12,paddingBottom:12,borderBottomWidth:1,borderBottomColor:C.border}}>
              <TouchableOpacity onPress={()=>setView('overview')} style={{marginRight:12}}>
                <Ionicons name="arrow-back" size={22} color={C.text}/>
              </TouchableOpacity>
              <Text style={{color:C.text,fontWeight:'700',fontSize:17,flex:1,textAlign:'center'}}>Send {(sendToken||token)?.symbol}</Text>
              <TouchableOpacity onPress={()=>{fetchTxHistory();setShowTxModal(true);}} style={{padding:8}}>
                <Ionicons name="time-outline" size={20} color={C.text}/>
              </TouchableOpacity>
            </View>

            {/* Amount display */}
            <View style={{flex:1,alignItems:'center',justifyContent:'center',paddingHorizontal:24}}>
              <TouchableOpacity onPress={()=>setShowTokenPicker(true)}
                style={{flexDirection:'row',alignItems:'center',gap:8,backgroundColor:C.card,borderRadius:24,paddingHorizontal:16,paddingVertical:10,marginBottom:24}}>
                <TokLogo uri={(sendToken||token).logoURI||''} symbol={(sendToken||token).symbol} style={{width:28,height:28,borderRadius:14}} mint={(sendToken||token).mint}/>
                <Text style={{color:C.text,fontWeight:'700',fontSize:16}}>{(sendToken||token).symbol}</Text>
                <Ionicons name="chevron-down" size={16} color={C.muted}/>
              </TouchableOpacity>
              <Text style={{color:C.text,fontSize:64,fontWeight:'300',letterSpacing:-2}}>
                {sendAmt || '0'}
              </Text>
              <Text style={{color:C.muted,fontSize:16,marginTop:4}}>
                ${(parseFloat(sendAmt||'0') * ((sendToken||token)?.price||0)).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:6})}
              </Text>
              <TouchableOpacity onPress={()=>setSendAmt(String((sendToken||token).amount||0))}
                style={{marginTop:16,backgroundColor:C.card,borderRadius:20,paddingHorizontal:14,paddingVertical:6}}>
                <Text style={{color:C.muted,fontSize:13}}>Balance: {(sendToken||token).amount?.toFixed(4)} {(sendToken||token).symbol}</Text>
              </TouchableOpacity>
            </View>

            {/* Continue button */}
            <TouchableOpacity
              onPress={async()=>{
                if(!sendAmt||isNaN(parseFloat(sendAmt))||parseFloat(sendAmt)<=0){Alert.alert('Error','Enter an amount');return;}
                if(parseFloat(sendAmt)>(sendToken||token).amount){Alert.alert('Error','Insufficient balance');return;}
                // Load recent addresses
                try {
                  const raw = await AsyncStorage.getItem('recent_addresses');
                  setRecentAddresses(raw ? JSON.parse(raw) : []);
                } catch(e) {}
                setSendStep('recipient');
              }}
              style={{margin:16,backgroundColor:parseFloat(sendAmt||'0')>0?C.green:'#1c2128',borderRadius:16,padding:16,alignItems:'center'}}>
              <Text style={{color:parseFloat(sendAmt||'0')>0?'#0d1117':C.muted,fontWeight:'700',fontSize:16}}>Enter Amount</Text>
            </TouchableOpacity>

            {/* Custom numpad */}
            <View style={{paddingHorizontal:12,paddingBottom:24}}>
              {[['MAX','1','2','3'],['75%','4','5','6'],['50%','7','8','9'],['CLEAR','.','0','⌫']].map((row,ri)=>(
                <View key={ri} style={{flexDirection:'row',gap:8,marginBottom:8}}>
                  {row.map(k=>(
                    <TouchableOpacity key={k} onPress={()=>{
                      if(k==='MAX'){setSendAmt(String(token.amount||0));return;}
                      if(k==='75%'){setSendAmt(String(((token.amount||0)*0.75).toFixed(6)));return;}
                      if(k==='50%'){setSendAmt(String(((token.amount||0)*0.50).toFixed(6)));return;}
                      if(k==='CLEAR'){setSendAmt('');return;}
                      if(k==='⌫'){setSendAmt(p=>p.slice(0,-1));return;}
                      if(k==='.'&&sendAmt.includes('.')){return;}
                      setSendAmt(p=>(p==='0'&&k!=='.')?k:p+k);
                    }}
                    style={{
                      flex:1,aspectRatio:k==='MAX'||k==='75%'||k==='50%'||k==='CLEAR'?undefined:1,
                      height:60,backgroundColor:k==='MAX'||k==='75%'||k==='50%'||k==='CLEAR'?'#1c2128':C.card,
                      borderRadius:14,alignItems:'center',justifyContent:'center'
                    }}>
                      <Text style={{color:k==='MAX'||k==='75%'||k==='50%'?C.green:k==='CLEAR'?'#ff4444':C.text,fontSize:k==='MAX'||k==='75%'||k==='50%'||k==='CLEAR'?13:20,fontWeight:'600'}}>{k}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ))}
            </View>
          </View>
        )}

        {view === 'send' && sendStep === 'recipient' && (
          <View style={{flex:1,backgroundColor:C.bg}}>
            <View style={{flexDirection:'row',alignItems:'center',paddingHorizontal:16,paddingTop:(StatusBar.currentHeight||0)+12,paddingBottom:12,borderBottomWidth:1,borderBottomColor:C.border}}>
              <TouchableOpacity onPress={()=>setSendStep('amount')} style={{marginRight:12}}>
                <Ionicons name="arrow-back" size={22} color={C.text}/>
              </TouchableOpacity>
              <Text style={{color:C.text,fontSize:17,fontWeight:'700',flex:1}}>Select Recipient</Text>
            </View>

            {/* Address input */}
            <View style={{flexDirection:'row',alignItems:'center',margin:16,backgroundColor:C.card,borderRadius:14,paddingHorizontal:14,paddingVertical:10,gap:10}}>
              <TextInput
                value={sendAddr} onChangeText={setSendAddr}
                placeholder="To: Enter address" placeholderTextColor={C.muted}
                autoCapitalize="none" style={{flex:1,color:C.text,fontSize:14}}
              />
              <TouchableOpacity onPress={async()=>{ const t=await Clipboard.getString(); setSendAddr(t); }}>
                <Text style={{color:C.green,fontWeight:'700',fontSize:14}}>Paste</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={async()=>{
                const {status} = await requestCameraPermission();
                if(status!=='granted'){Alert.alert('Permission','Camera permission required');return;}
                setShowSendQR(true);
              }}>
                <Ionicons name="scan-outline" size={20} color={C.muted}/>
              </TouchableOpacity>
            </View>

            {/* Recent addresses */}
            <ScrollView style={{flex:1}}>
              {recentAddresses.length > 0 && (
                <>
                  <Text style={{color:C.muted,fontSize:12,fontWeight:'700',paddingHorizontal:16,marginBottom:8,letterSpacing:0.5}}>RECENT</Text>
                  {recentAddresses.map((addr:any,i:number)=>(
                    <TouchableOpacity key={i} onPress={()=>setSendAddr(addr.address)}
                      style={{flexDirection:'row',alignItems:'center',paddingHorizontal:16,paddingVertical:14,borderBottomWidth:1,borderBottomColor:C.border}}>
                      <View style={{width:40,height:40,borderRadius:20,backgroundColor:C.card,alignItems:'center',justifyContent:'center',marginRight:12}}>
                        <Ionicons name="wallet-outline" size={18} color={C.muted}/>
                      </View>
                      <View style={{flex:1}}>
                        <Text style={{color:C.text,fontWeight:'600',fontSize:14}}>{addr.name || addr.address.slice(0,8)+'...'+addr.address.slice(-4)}</Text>
                        <Text style={{color:C.muted,fontSize:12,marginTop:2}}>{addr.address.slice(0,8)+'...'+addr.address.slice(-4)}</Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </>
              )}
              {recentAddresses.length === 0 && !sendAddr && (
                <Text style={{color:C.muted,textAlign:'center',marginTop:40,fontSize:14}}>No recent addresses</Text>
              )}
            </ScrollView>

            <TouchableOpacity
              onPress={async()=>{
                if(!sendAddr.trim()||sendAddr.trim().length<32){Alert.alert('Error','Enter a valid Solana address');return;}
                // Estimate fee
                setFeeLoading(true);
                try {
                  // Check if recipient ATA exists
                  const r = await fetch('https://chatfi.pro/api/jupiter',{method:'POST',headers:{'Content-Type':'application/json'},
                    body:JSON.stringify({url:'SOLANA_RPC',method:'POST',body:{jsonrpc:'2.0',id:1,method:'getBalance',params:[sendAddr.trim(),{commitment:'confirmed'}]}})});
                  const d = await r.json();
                  const exists = (d?.result?.value||0) > 0;
                  setEstimatedFee(exists ? 0.000005 : 0.002);
                } catch(e) { setEstimatedFee(0.000005); }
                setFeeLoading(false);
                setSendStep('summary');
              }}
              style={{margin:16,backgroundColor:sendAddr.trim().length>30?C.green:'#1c2128',borderRadius:16,padding:16,alignItems:'center'}}>
              <Text style={{color:sendAddr.trim().length>30?'#0d1117':C.muted,fontWeight:'700',fontSize:16}}>Continue</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Token picker modal */}
        {showTokenPicker && (
          <View style={{position:'absolute',top:0,left:0,right:0,bottom:0,zIndex:200,backgroundColor:C.bg}}>
            <View style={{flexDirection:'row',alignItems:'center',padding:16,borderBottomWidth:1,borderBottomColor:C.border,paddingTop:(StatusBar.currentHeight||0)+12}}>
              <TouchableOpacity onPress={()=>setShowTokenPicker(false)} style={{marginRight:12}}>
                <Ionicons name="arrow-back" size={22} color={C.text}/>
              </TouchableOpacity>
              <Text style={{color:C.text,fontSize:17,fontWeight:'700'}}>Select Token</Text>
            </View>
            <ScrollView>
              {(modalTokens||[token]).filter((t:any)=>t?.mint).filter((t:any,i:number,a:any[])=>a.findIndex((x:any)=>x?.mint===t.mint)===i).map((t:any,i:number)=>(
                <TouchableOpacity key={i} onPress={()=>{ setSendToken({...t, price: t.price||0}); setSendAmt(''); setShowTokenPicker(false); }}
                  style={{flexDirection:'row',alignItems:'center',padding:16,borderBottomWidth:1,borderBottomColor:C.border}}>
                  <TokLogo uri={t.logoURI||''} symbol={t.symbol} style={{width:40,height:40,borderRadius:20,marginRight:12}} mint={t.mint}/>
                  <View style={{flex:1}}>
                    <Text style={{color:C.text,fontWeight:'600',fontSize:15}}>{t.symbol}</Text>
                    <Text style={{color:C.muted,fontSize:12}}>Balance: {t.amount?.toFixed(4)}</Text>
                  </View>
                  {(sendToken||token)?.mint===t.mint && <Ionicons name="checkmark-circle" size={20} color={C.green}/>}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* QR Scanner for send */}
        {showSendQR && (
          <View style={{position:'absolute',top:0,left:0,right:0,bottom:0,zIndex:200,backgroundColor:'#000'}}>
            <CameraView style={{flex:1}} facing="back"
              onBarcodeScanned={({data})=>{
                const addr = data.startsWith('solana:') ? data.replace('solana:','').split('?')[0] : data;
                setSendAddr(addr);
                setShowSendQR(false);
              }}
            />
            <TouchableOpacity onPress={()=>setShowSendQR(false)}
              style={{position:'absolute',top:50,right:20,backgroundColor:'rgba(0,0,0,0.6)',borderRadius:20,padding:10}}>
              <Text style={{color:'#fff',fontSize:18}}>✕</Text>
            </TouchableOpacity>
            <Text style={{position:'absolute',bottom:60,alignSelf:'center',color:'#fff',fontSize:14}}>Point at a Solana wallet QR code</Text>
          </View>
        )}

        {view === 'send' && sendStep === 'summary' && (
          <View style={{flex:1,backgroundColor:C.bg}}>
            <View style={{flexDirection:'row',alignItems:'center',paddingHorizontal:16,paddingTop:(StatusBar.currentHeight||0)+12,paddingBottom:12,borderBottomWidth:1,borderBottomColor:C.border}}>
              <TouchableOpacity onPress={()=>setSendStep('recipient')} style={{marginRight:12}}>
                <Ionicons name="arrow-back" size={22} color={C.text}/>
              </TouchableOpacity>
              <Text style={{color:C.text,fontSize:17,fontWeight:'700',flex:1}}>Send Summary</Text>
            </View>

            {/* Token display */}
            <View style={{flex:1,alignItems:'center',justifyContent:'center'}}>
              <View style={{position:'relative',marginBottom:24}}>
                <TokLogo uri={token.logoURI||''} symbol={token.symbol} style={{width:80,height:80,borderRadius:40}} mint={token.mint}/>
                <View style={{position:'absolute',bottom:0,right:0,width:28,height:28,borderRadius:14,backgroundColor:'#fff',alignItems:'center',justifyContent:'center'}}>
                  <Ionicons name="arrow-up" size={16} color="#000"/>
                </View>
              </View>
              <Text style={{color:C.text,fontSize:40,fontWeight:'700'}}>{sendAmt} {token.symbol}</Text>
              <Text style={{color:C.muted,fontSize:16,marginTop:4}}>
                ~ ${(parseFloat(sendAmt||'0')*((sendToken||token)?.price||0)).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:6})}
              </Text>
            </View>

            {/* Summary details */}
            <View style={{marginHorizontal:16,backgroundColor:C.card,borderRadius:16,marginBottom:16}}>
              <View style={{flexDirection:'row',justifyContent:'space-between',padding:16,borderBottomWidth:1,borderBottomColor:C.border}}>
                <Text style={{color:C.muted,fontSize:14}}>To</Text>
                <Text style={{color:C.text,fontSize:14,fontWeight:'600'}}>{sendAddr.slice(0,8)+'...'+sendAddr.slice(-4)}</Text>
              </View>
              <View style={{flexDirection:'row',justifyContent:'space-between',padding:16,borderBottomWidth:1,borderBottomColor:C.border}}>
                <Text style={{color:C.muted,fontSize:14}}>Rate</Text>
                <Text style={{color:C.text,fontSize:14}}>1 {(sendToken||token).symbol} {(sendToken||token).price>0 ? '≈ $'+((sendToken||token).price).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:8}) : '≈ —'}</Text>
              </View>
              <View style={{flexDirection:'row',justifyContent:'space-between',padding:16}}>
                <Text style={{color:C.muted,fontSize:14}}>Fees</Text>
                <Text style={{color:C.text,fontSize:14}}>
                  {feeLoading ? '...' : `~${estimatedFee||0.000005} SOL`}
                </Text>
              </View>
            </View>

            <TouchableOpacity
              style={{margin:16,backgroundColor:sending?'#1c2128':C.green,borderRadius:16,padding:16,alignItems:'center',opacity:sending?0.6:1}}
              disabled={sending}
              onPress={async()=>{
                setSending(true);
                try{
                  const st = sendToken||token;
                  await onSend(st.mint,sendAddr.trim(),sendAmt,st.symbol,st.decimals??6);
                  // Save to recent addresses
                  try {
                    const raw = await AsyncStorage.getItem('recent_addresses');
                    const recents = raw ? JSON.parse(raw) : [];
                    const exists = recents.find((r:any)=>r.address===sendAddr.trim());
                    if(!exists) recents.unshift({address:sendAddr.trim(),ts:Date.now()});
                    await AsyncStorage.setItem('recent_addresses', JSON.stringify(recents.slice(0,20)));
                  } catch(e) {}
                  setSendAddr('');setSendAmt('');setSendStep('amount');setView('overview');
                }catch(e:any){Alert.alert('Send failed',e.message||'Unknown error');}
                finally{setSending(false);}
              }}>
              {sending?<ActivityIndicator color="#0d1117"/>:<Text style={{color:'#0d1117',fontWeight:'700',fontSize:16}}>Confirm Send</Text>}
            </TouchableOpacity>
          </View>
        )}
      </SafeAreaView>
    </Modal>
  );
}

export default TokenModal;
