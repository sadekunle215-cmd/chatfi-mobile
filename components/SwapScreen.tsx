import React from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, Image, Alert, ActivityIndicator, Linking, Platform, KeyboardAvoidingView, Animated, StatusBar } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { resolveToken } from '../sendMsg';
import { CURRENCY_SYMBOLS } from '../theme';
import { rpcFetch } from '../wallet';

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
      const {publicKey:pk,secretKey} = getKeypair(wallet);
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
      const {publicKey:pk,secretKey} = getKeypair(wallet);
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
    <ScrollView style={{ flex:1, backgroundColor:C.bg }} contentContainerStyle={{ paddingBottom:100 }}>
      <View style={{ flexDirection:'row', alignItems:'center', paddingHorizontal:20, paddingTop:(StatusBar.currentHeight||0)+16, paddingBottom:20 }}>
        <View style={{ width:44, height:44, borderRadius:22, backgroundColor:'#1c2128', alignItems:'center', justifyContent:'center' }}>
          {(accounts||[])[activeAccIdx]?.avatar
            ? <Text style={{fontSize:22}}>{(accounts||[])[activeAccIdx].avatar}</Text>
            : <Text style={{color:C.text,fontWeight:'bold',fontSize:16}}>{((accounts||[])[activeAccIdx]?.name||'U')[0].toUpperCase()}</Text>
          }
        </View>
        <Text style={{ color:C.text, fontSize:18, fontWeight:'bold', flex:1, textAlign:'center' }}>Settings</Text>
        <View style={{ width:44 }} />
      </View>
      {[
        { label:'General', sub:'Edit language and currency', icon:'options-outline', onPress: () => setSettingsView('general') },
        { label:'Manage Accounts', sub:'Add, import or watch accounts', icon:'people-outline', onPress: () => setSettingsView('manageAccounts') },
        { label:'Notifications', sub:'Get important updates', icon:'notifications-outline', onPress: () => setSettingsView('notifications') },
        { label:'Security & Privacy', sub:'Manage apps and more', icon:'shield-outline', onPress: () => setSettingsView('security') },
        { label:'Support', sub:'Contact our customer support', icon:'help-circle-outline', onPress: () => {} },
      ].map((item, i) => (
        <TouchableOpacity key={i} onPress={item.onPress}
          style={{ flexDirection:'row', alignItems:'center', paddingHorizontal:20, paddingVertical:18 }}>
          <View style={{ width:36, height:36, alignItems:'center', justifyContent:'center', marginRight:16 }}>
            <Ionicons name={item.icon as any} size={22} color={C.text} />
          </View>
          <View style={{ flex:1 }}>
            <Text style={{ color:C.text, fontSize:16, fontWeight:'600' }}>{item.label}</Text>
            <Text style={{ color:C.muted, fontSize:13, marginTop:2 }}>{item.sub}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={C.muted} />
        </TouchableOpacity>
      ))}
      <Text style={{ color:C.muted, fontSize:12, textAlign:'center', marginTop:32 }}>Version 1.0.0</Text>
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
            // Derive first 10 accounts (fast, no network)
            const derived: any[] = [];
            for(let j = 0; j < 10; j++) {
              try {
                const { publicKey: pk } = deriveWalletAtIndex(importSeedInput.trim(), j);
                const alreadyImported = existing.find((a:any) => a.pubkey === pk);
                derived.push({ index: j, pubkey: pk, imported: !!alreadyImported, name: alreadyImported?.name||('Account '+(j+1)) });
              } catch(e) { break; }
            }
            // Single RPC call for all balances at once
            try {
              const pubkeys = derived.map((d:any) => d.pubkey);
              const balRes = await rpcFetch('getMultipleAccounts', [pubkeys, {commitment:'confirmed'}]);
              const accs = balRes?.result?.value || [];
              derived.forEach((d:any, i:number) => {
                const balance = accs[i] ? (accs[i].lamports||0) / 1e9 : 0;
                if(balance > 0 || d.imported || d.index === 0) {
                  found.push({ ...d, balance });
                }
              });
            } catch(e) {
              derived.forEach((d:any) => found.push({ ...d, balance: 0 }));
            }
            setDiscoveredAccounts(found);
            setSelectedAccIdxs(found.filter((a:any) => !a.imported).map((a:any) => a.index));
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
            setAccounts(updated);
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


export default SwapScreen;
