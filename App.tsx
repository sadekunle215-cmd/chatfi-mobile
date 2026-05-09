import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, TextInput, StatusBar, SafeAreaView, Modal, Alert, ActivityIndicator, Clipboard, RefreshControl } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { generateWallet, getPublicKey, importWallet as deriveWallet } from './wallet';
import { askAI, getJupiterQuote, getTokenBalances, executeSwap as executeSwapTx, getTokenPrice, createTriggerOrder, createRecurringOrder, TOKENS, DECIMALS } from './sendMsg';

const C = {
  bg: '#0d1117', card: '#161b22', card2: '#1c2128',
  border: '#30363d', green: '#3fb950', blue: '#58a6ff',
  text: '#e6edf3', muted: '#8b949e', red: '#f85149', orange: '#d29922',
};

const RPC = 'https://api.mainnet-beta.solana.com';

const TABS = [
  { id: 'chat', label: 'Chat', icon: '◉' },
  { id: 'swap', label: 'Swap', icon: '⇄' },
  { id: 'portfolio', label: 'Portfolio', icon: '▦' },
  { id: 'settings', label: 'Settings', icon: '◈' },
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

export default function App() {
  const [tab, setTab] = useState('chat');
  const [wallet, setWallet] = useState<string | null>(null);
  const [pubkey, setPubkey] = useState<string | null>(null);
  const [showWalletModal, setShowWalletModal] = useState(false);
  const [showSeedModal, setShowSeedModal] = useState(false);
  const [showSendModal, setShowSendModal] = useState(false);
  const [showReceiveModal, setShowReceiveModal] = useState(false);
  const [seedPhrase, setSeedPhrase] = useState('');
  const [importSeed, setImportSeed] = useState('');
  const [msgs, setMsgs] = useState([
    { id: 1, text: 'Welcome to ChatFi! Your AI DeFi assistant on Solana.\n\nTry:\n• "swap 1 SOL to USDC"\n• "price of JUP"\n• "what is yield farming?"', from: 'bot' }
  ]);
  const [input, setInput] = useState('');
  const [aiLoading, setAiLoading] = useState(false);

  // Swap state
  const [fromToken, setFromToken] = useState('SOL');
  const [toToken, setToToken] = useState('USDC');
  const [amt, setAmt] = useState('');
  const [quote, setQuote] = useState<any>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [slippage, setSlippage] = useState('0.5');

  // Portfolio state
  const [solBalance, setSolBalance] = useState<number | null>(null);
  const [tokenBalances, setTokenBalances] = useState<Array<{symbol: string, mint: string, amount: number}>>([]);
  const [portfolioLoading, setPortfolioLoading] = useState(false);
  const [portfolioRefreshing, setPortfolioRefreshing] = useState(false);

  // Send state
  const [sendTo, setSendTo] = useState('');
  const [sendAmt, setSendAmt] = useState('');
  const [sendLoading, setSendLoading] = useState(false);

  // Settings
  const [rpcEndpoint, setRpcEndpoint] = useState('mainnet-beta');

  useEffect(() => {
    AsyncStorage.getItem('wallet_mnemonic').then(m => {
      if (m) { setWallet(m); setPubkey(getPublicKey(m)); }
    });
  }, []);

  useEffect(() => {
    if (pubkey && tab === 'portfolio') fetchPortfolio();
  }, [pubkey, tab]);

  const fetchPortfolio = async () => {
    if (!pubkey) return;
    setPortfolioLoading(true);
    try {
      const res = await fetch(RPC, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getBalance', params: [pubkey] })
      });
      const data = await res.json();
      if (data.result?.value !== undefined) {
        setSolBalance(data.result.value / 1e9);
      const tokens = await getTokenBalances(pubkey);
      setTokenBalances(tokens);
      }
    } catch {}
    setPortfolioLoading(false);
    setPortfolioRefreshing(false);
  };

  const createWallet = () => {
    try {
      const { mnemonic, publicKey: genPk } = generateWallet();
      setSeedPhrase(mnemonic);
      setShowSeedModal(true);
    } catch (e) {
      Alert.alert('Error', 'Failed to generate wallet. Please try again.');
    }
  };

  const confirmSeed = async () => {
    await AsyncStorage.setItem('wallet_mnemonic', seedPhrase);
    setWallet(seedPhrase);
    setPubkey(getPublicKey(seedPhrase));
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
      await AsyncStorage.setItem('wallet_mnemonic', importSeed.trim());
      setWallet(importSeed.trim()); setPubkey(pk);
      setShowWalletModal(false); setImportSeed('');
      Alert.alert('Wallet Imported!', 'Your wallet is ready.');
    } catch { Alert.alert('Error', 'Invalid seed phrase'); }
  };

  const sendMsg = async () => {
    if (!input.trim() || aiLoading) return;
    const q = input;
    setMsgs(p => [...p, { id: Date.now(), text: q, from: 'user' }]);
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

  const sendTokens = async () => {
    if (!sendAmt || isNaN(parseFloat(sendAmt))) { Alert.alert('Invalid amount'); return; }
    if (!wallet) { Alert.alert('No wallet', 'Create a wallet first'); return; }
    setSendLoading(true);
    try {
      const { publicKey: pk, secretKey } = deriveWallet(wallet);
      const mint = TOKENS[sendToken] || TOKENS['SOL'];
      const decimals = DECIMALS[sendToken] ?? 9;
      const amountNum = Math.round(parseFloat(sendAmt) * Math.pow(10, decimals));
      const randBytes = new Uint8Array(13);
      crypto.getRandomValues(randBytes);
      const inviteCode = bs58.encode(randBytes).slice(0, 12);
      const res = await fetch('https://chatfi.pro/api/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sender: pk, amount: amountNum, mint, inviteCode }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      if (!data.partiallySignedTx) throw new Error('No transaction returned');
      const txBytes = Uint8Array.from(Buffer.from(data.partiallySignedTx, 'base64'));
      const tx = VersionedTransaction.deserialize(txBytes);
      const msgBytes = tx.message.serialize();
      const userPk = new PublicKey(pk);
      const userIdx = tx.message.staticAccountKeys.findIndex((k: any) => k.equals(userPk));
      if (userIdx < 0) throw new Error('User signer slot not found');
      tx.signatures[userIdx] = nacl.sign.detached(msgBytes, secretKey);
      // Derive invite seed via SHA-256('invite:' + code) using nacl hash
      const encoder = new TextEncoder();
      const inviteSeed = nacl.hash(encoder.encode('invite:' + inviteCode)).slice(0, 32);
      const inviteKp = nacl.sign.keyPair.fromSeed(inviteSeed);
      const invitePk = new PublicKey(inviteKp.publicKey);
      const inviteIdx = tx.message.staticAccountKeys.findIndex((k: any) => k.equals(invitePk));
      if (inviteIdx >= 0) tx.signatures[inviteIdx] = nacl.sign.detached(msgBytes, inviteKp.secretKey);
      const rpcRes = await fetch('https://api.mainnet-beta.solana.com', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0', id: 1, method: 'sendTransaction',
          params: [Buffer.from(tx.serialize()).toString('base64'), { encoding: 'base64', preflightCommitment: 'confirmed' }],
        }),
      });
      const rpcData = await rpcRes.json();
      if (rpcData.error) throw new Error(rpcData.error.message);
      const link = 'https://jup.ag/send?code=' + inviteCode;
      Alert.alert('Sent!', 'Share this link to claim:\n' + link);
      setShowSendModal(false);
    } catch (e: any) {
      Alert.alert('Send Failed', e.message || 'Unknown error');
    } finally {
      setSendLoading(false);
    }
  };

  const copyAddress = () => {
    if (pubkey) {
      Clipboard.setString(pubkey);
      Alert.alert('Copied!', 'Wallet address copied to clipboard');
    }
  };

  const shortKey = pubkey ? pubkey.slice(0, 4) + '...' + pubkey.slice(-4) : null;

  return (
    <SafeAreaView style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />

      <View style={s.header}>
        <View style={s.logoRow}>
          <View style={s.logoDot} />
          <Text style={s.logoText}>ChatFi</Text>
        </View>
        <TouchableOpacity style={[s.walletBtn, wallet ? s.walletBtnOn : null]} onPress={() => setShowWalletModal(true)}>
          <Text style={[s.walletBtnTxt, wallet ? { color: C.green } : null]}>{wallet ? shortKey : 'Connect Wallet'}</Text>
        </TouchableOpacity>
      </View>

      <View style={s.content}>

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
              <TextInput style={s.input} value={input} onChangeText={setInput} placeholder="Ask ChatFi anything..." placeholderTextColor={C.muted} onSubmitEditing={sendMsg} editable={!aiLoading} />
              <TouchableOpacity style={[s.sendBtn, aiLoading && { opacity: 0.5 }]} onPress={sendMsg} disabled={aiLoading}>
                <Text style={s.sendBtnTxt}>→</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* SWAP */}
        {tab === 'swap' && (
          <ScrollView style={s.pad}>
            <Text style={s.pageTitle}>Swap</Text>
            <View style={s.card}>
              <Text style={s.cardLabel}>You Pay</Text>
              <TextInput style={s.bigInput} value={amt} onChangeText={setAmt} placeholder="0" placeholderTextColor={C.border} keyboardType="numeric" />
              <View style={s.tokenRow}>
                {TOKEN_LIST.map(t => (
                  <TouchableOpacity key={t} onPress={() => setFromToken(t)} style={[s.chip, fromToken === t && s.chipActive]}>
                    <Text style={[s.chipTxt, fromToken === t && s.chipTxtActive]}>{t}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <TouchableOpacity style={s.arrowRow} onPress={() => { const tmp = fromToken; setFromToken(toToken); setToToken(tmp); setQuote(null); }}>
              <Text style={{ color: C.green, fontSize: 24 }}>↕</Text>
            </TouchableOpacity>

            <View style={s.card}>
              <Text style={s.cardLabel}>You Receive</Text>
              <Text style={s.bigOutput}>{quote ? quote.outAmount.toFixed(6) : '—'}</Text>
              <View style={s.tokenRow}>
                {TOKEN_LIST.map(t => (
                  <TouchableOpacity key={t} onPress={() => { setToToken(t); setQuote(null); }} style={[s.chip, toToken === t && s.chipActive]}>
                    <Text style={[s.chipTxt, toToken === t && s.chipTxtActive]}>{t}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {quote && (
              <View style={s.quoteBox}>
                <Text style={s.quoteRow}>Price impact: <Text style={s.quoteVal}>{quote.priceImpact}%</Text></Text>
                <Text style={s.quoteRow}>Route: <Text style={s.quoteVal}>{quote.route}</Text></Text>
                <Text style={s.quoteRow}>Slippage: <Text style={s.quoteVal}>{slippage}%</Text></Text>
              </View>
            )}

            <TouchableOpacity style={s.greenBtn} onPress={fetchQuote}>
              {quoteLoading ? <ActivityIndicator color={C.bg} /> : <Text style={s.greenBtnTxt}>Get Quote</Text>}
            </TouchableOpacity>

            {quote && (
              <TouchableOpacity style={s.swapExecBtn} onPress={executeSwap}>
                <Text style={s.greenBtnTxt}>Swap {fromToken} → {toToken}</Text>
              </TouchableOpacity>
            )}

            {!wallet && (
              <TouchableOpacity style={s.outlineBtn} onPress={() => setShowWalletModal(true)}>
                <Text style={s.outlineBtnTxt}>Connect Wallet to Swap</Text>
              </TouchableOpacity>
            )}

            <View style={s.slippageRow}>
              <Text style={s.cardLabel}>Slippage: </Text>
              {['0.1','0.5','1.0'].map(v => (
                <TouchableOpacity key={v} onPress={() => setSlippage(v)} style={[s.slippageChip, slippage === v && s.chipActive]}>
                  <Text style={[s.chipTxt, slippage === v && s.chipTxtActive]}>{v}%</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        )}

        {/* PORTFOLIO */}
        {tab === 'portfolio' && (
          <ScrollView style={s.pad} refreshControl={<RefreshControl refreshing={portfolioRefreshing} onRefresh={() => { setPortfolioRefreshing(true); fetchPortfolio(); }} tintColor={C.green} />}>
            <Text style={s.pageTitle}>Portfolio</Text>
            {!wallet ? (
              <View style={s.emptyState}>
                <Text style={s.emptyTitle}>No Wallet</Text>
                <Text style={s.emptyText}>Create or import a wallet to view your portfolio</Text>
                <TouchableOpacity style={s.greenBtn} onPress={() => setShowWalletModal(true)}>
                  <Text style={s.greenBtnTxt}>Get Started</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View>
                <View style={s.balanceCard}>
                  <Text style={s.balLabel}>Total Balance</Text>
                  {portfolioLoading ? <ActivityIndicator color={C.green} style={{ marginVertical: 8 }} /> : (
                    <Text style={s.balValue}>{solBalance !== null ? `${solBalance.toFixed(4)} SOL` : '—'}</Text>
                  )}
                  <Text style={s.walletAddress} numberOfLines={1}>{pubkey}</Text>
                  <View style={s.portfolioActions}>
                    <TouchableOpacity style={s.portfolioAction} onPress={() => setShowSendModal(true)}>
                      <Text style={s.portfolioActionIcon}>↑</Text>
                      <Text style={s.portfolioActionTxt}>Send</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={s.portfolioAction} onPress={() => setShowReceiveModal(true)}>
                      <Text style={s.portfolioActionIcon}>↓</Text>
                      <Text style={s.portfolioActionTxt}>Receive</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={s.portfolioAction} onPress={() => setTab('swap')}>
                      <Text style={s.portfolioActionIcon}>⇄</Text>
                      <Text style={s.portfolioActionTxt}>Swap</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={s.portfolioAction} onPress={copyAddress}>
                      <Text style={s.portfolioActionIcon}>⎘</Text>
                      <Text style={s.portfolioActionTxt}>Copy</Text>
                    </TouchableOpacity>
                  </View>
                </View>
                <Text style={s.sectionLabel}>ASSETS</Text>
                {tokenBalances.map((t, i) => (
                  <View key={i} style={s.assetRow}>
                    <View style={s.assetIcon}><Text style={s.assetIconTxt}>{t.symbol[0]}</Text></View>
                    <View style={s.assetInfo}>
                      <Text style={s.assetName}>{t.symbol}</Text>
                      <Text style={s.assetPrice}>{t.mint.slice(0,6)}...</Text>
                    </View>
                    <Text style={s.assetBal}>{t.amount.toFixed(4)}</Text>
                  </View>
                ))}
                <TouchableOpacity style={[s.outlineBtn, { marginTop: 16 }]} onPress={fetchPortfolio}>
                  <Text style={s.outlineBtnTxt}>Refresh Balances</Text>
                </TouchableOpacity>
              </View>
            )}
          </ScrollView>
        )}

        {/* SETTINGS */}
        {tab === 'settings' && (
          <ScrollView style={s.pad}>
            <Text style={s.pageTitle}>Settings</Text>
            {wallet && (
              <View style={s.card}>
                <Text style={s.cardLabel}>Connected Wallet</Text>
                <Text style={s.settingVal} numberOfLines={1}>{pubkey}</Text>
                <TouchableOpacity onPress={copyAddress} style={{ marginTop: 8 }}>
                  <Text style={{ color: C.blue, fontSize: 13 }}>Copy Address</Text>
                </TouchableOpacity>
              </View>
            )}
            <View style={s.card}>
              <Text style={s.cardLabel}>RPC Endpoint</Text>
              {['mainnet-beta', 'devnet', 'testnet'].map(r => (
                <TouchableOpacity key={r} onPress={() => setRpcEndpoint(r)} style={s.rpcOption}>
                  <Text style={[s.rpcTxt, rpcEndpoint === r && { color: C.green }]}>{r}</Text>
                  {rpcEndpoint === r && <Text style={{ color: C.green }}>✓</Text>}
                </TouchableOpacity>
              ))}
            </View>
            <View style={s.card}>
              <Text style={s.cardLabel}>Slippage Tolerance</Text>
              <View style={s.tokenRow}>
                {['0.1','0.5','1.0','2.0'].map(v => (
                  <TouchableOpacity key={v} onPress={() => setSlippage(v)} style={[s.chip, slippage === v && s.chipActive]}>
                    <Text style={[s.chipTxt, slippage === v && s.chipTxtActive]}>{v}%</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            {[{ label: 'Theme', val: 'Dark' }, { label: 'Version', val: '1.0.0' }].map(r => (
              <View key={r.label} style={s.settingRow}>
                <Text style={s.settingLabel}>{r.label}</Text>
                <Text style={s.settingVal}>{r.val}</Text>
              </View>
            ))}
        {wallet && (
          <>
            <TouchableOpacity style={s.dangerBtn} onPress={() => {
              Alert.alert('Seed Phrase', 'Only view in a private place.', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Show', onPress: () => Alert.alert('Your Seed Phrase', wallet || '') },
              ]);
            }}>
              <Text style={s.dangerBtnTxt}>Show Seed Phrase</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.dangerBtn} onPress={() => {
              Alert.alert('Remove Wallet', 'Make sure you have your seed phrase!', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Remove', style: 'destructive', onPress: async () => {
                  await AsyncStorage.removeItem('wallet_mnemonic');
                  setWallet(null); setPubkey(null); setSolBalance(null);
                }},
              ]);
            }}>
              <Text style={s.dangerBtnTxt}>Remove Wallet</Text>
            </TouchableOpacity>
          </>
        )}
      </View>

      {/* TAB BAR */}
      <View style={s.tabBar}>
        {TABS.map(({ id, label, icon }) => {
          const active = tab === id;
          return (
            <TouchableOpacity key={id} style={s.tabItem} onPress={() => setTab(id)}>
              <Text style={[s.tabIcon, active && s.tabIconActive]}>{icon}</Text>
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
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, paddingTop: 44, borderBottomWidth: 1, borderBottomColor: C.border },
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
  card: { backgroundColor: C.card, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: C.border, marginBottom: 8 },
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
  balanceCard: { backgroundColor: C.card, borderRadius: 16, padding: 20, borderWidth: 1, borderColor: C.border, alignItems: 'center', marginBottom: 16 },
  balLabel: { color: C.muted, fontSize: 12 },
  balValue: { color: C.text, fontSize: 36, fontWeight: 'bold', marginVertical: 6 },
  walletAddress: { color: C.blue, fontSize: 11, marginBottom: 16 },
  portfolioActions: { flexDirection: 'row', gap: 12, marginTop: 4 },
  portfolioAction: { alignItems: 'center', backgroundColor: C.card2, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10, borderWidth: 1, borderColor: C.border },
  portfolioActionIcon: { color: C.green, fontSize: 18, fontWeight: 'bold' },
  portfolioActionTxt: { color: C.text, fontSize: 11, marginTop: 2 },
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
  closeBtn: { padding: 14, alignItems: 'center', marginTop: 8 },
  closeBtnTxt: { color: C.muted, fontSize: 14 },
  seedWarning: { color: C.orange, fontSize: 13, textAlign: 'center', marginBottom: 16, lineHeight: 20 },
  seedGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  seedWord: { width: '30%', flexDirection: 'row', alignItems: 'center', backgroundColor: C.bg, borderRadius: 8, padding: 8, borderWidth: 1, borderColor: C.border, gap: 6 },
  seedNum: { color: C.muted, fontSize: 11, width: 16 },
  seedWordTxt: { color: C.text, fontSize: 13, fontWeight: '600' },
  addressBox: { backgroundColor: C.bg, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: C.border, marginBottom: 16 },
  addressTxt: { color: C.text, fontSize: 13, lineHeight: 20 },
  tabBar: { flexDirection: 'row', backgroundColor: C.card, borderTopWidth: 1, borderTopColor: C.border, paddingTop: 10, paddingBottom: 24 },
  tabItem: { flex: 1, alignItems: 'center', gap: 4 },
  tabIcon: { fontSize: 20, color: C.muted },
  tabIconActive: { color: C.green },
  tabLabel: { color: C.muted, fontSize: 11 },
  tabLabelActive: { color: C.green, fontWeight: '600' },
});
