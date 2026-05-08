import { View, Text, TouchableOpacity, StyleSheet, ScrollView, TextInput, StatusBar } from 'react-native';
import { useState } from 'react';

const C = {
  bg: '#0a0f1e',
  card: '#111827',
  border: '#1e2d40',
  accent: '#00d4ff',
  accent2: '#7c3aed',
  green: '#00c896',
  red: '#ff4d6d',
  text: '#ffffff',
  muted: '#6b7280',
  input: '#1a2332',
};

const TABS = [
  { id: 'chat', label: 'Chat', icon: '💬' },
  { id: 'swap', label: 'Swap', icon: '⚡' },
  { id: 'portfolio', label: 'Portfolio', icon: '📊' },
  { id: 'settings', label: 'More', icon: '⚙️' },
];

const TOKENS = [
  { symbol: 'SOL', name: 'Solana', price: '$143.20', change: '+2.4%', up: true, bal: '0.0021' },
  { symbol: 'USDC', name: 'USD Coin', price: '$1.00', change: '+0.01%', up: true, bal: '170.33' },
  { symbol: 'JUP', name: 'Jupiter', price: '$0.208', change: '+2.5%', up: true, bal: '1.52' },
  { symbol: 'BONK', name: 'Bonk', price: '$0.000069', change: '-1.2%', up: false, bal: '0.14' },
];

export default function App() {
  const [tab, setTab] = useState('chat');
  const [msgs, setMsgs] = useState([
    { id: 1, text: 'Welcome to ChatFi! Your AI-powered DeFi assistant on Solana. Ask me anything.', from: 'bot' }
  ]);
  const [input, setInput] = useState('');
  const [from, setFrom] = useState('SOL');
  const [to, setTo] = useState('USDC');
  const [amt, setAmt] = useState('');

  const send = () => {
    if (!input.trim()) return;
    const q = input;
    setMsgs(p => [...p, { id: Date.now(), text: q, from: 'user' }]);
    setInput('');
    setTimeout(() => {
      setMsgs(p => [...p, { id: Date.now()+1, text: `Processing: "${q}"\n\nConnecting to Jupiter API...`, from: 'bot' }]);
    }, 500);
  };

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />

      {/* Header */}
      <View style={s.header}>
        <View>
          <Text style={s.logo}>ChatFi</Text>
          <Text style={s.logoSub}>DeFi on Solana</Text>
        </View>
        <View style={s.walletBtn}>
          <Text style={s.walletBtnText}>Connect Wallet</Text>
        </View>
      </View>

      {/* Content */}
      <View style={s.content}>
        {tab === 'chat' && (
          <View style={s.flex}>
            <ScrollView style={s.msgs} contentContainerStyle={{ paddingBottom: 12 }}>
              {msgs.map(m => (
                <View key={m.id} style={[s.bubble, m.from === 'user' ? s.userBubble : s.botBubble]}>
                  <Text style={s.bubbleText}>{m.text}</Text>
                </View>
              ))}
            </ScrollView>
            <View style={s.inputRow}>
              <TextInput
                style={s.input}
                value={input}
                onChangeText={setInput}
                placeholder="Ask ChatFi anything..."
                placeholderTextColor={C.muted}
                onSubmitEditing={send}
              />
              <TouchableOpacity style={s.sendBtn} onPress={send}>
                <Text style={s.sendTxt}>➤</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {tab === 'swap' && (
          <ScrollView style={s.pad}>
            <Text style={s.sectionTitle}>Swap Tokens</Text>
            <View style={s.swapCard}>
              <Text style={s.swapLabel}>From</Text>
              <View style={s.tokenRow}>
                {['SOL','USDC','JUP','BONK'].map(t => (
                  <TouchableOpacity key={t} onPress={() => setFrom(t)}
                    style={[s.tokenChip, from === t && s.tokenChipActive]}>
                    <Text style={[s.tokenChipTxt, from === t && s.tokenChipTxtActive]}>{t}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TextInput
                style={s.amtInput}
                value={amt}
                onChangeText={setAmt}
                placeholder="0.00"
                placeholderTextColor={C.muted}
                keyboardType="numeric"
              />
            </View>
            <View style={[s.swapCard, { marginTop: 8 }]}>
              <Text style={s.swapLabel}>To</Text>
              <View style={s.tokenRow}>
                {['SOL','USDC','JUP','BONK'].map(t => (
                  <TouchableOpacity key={t} onPress={() => setTo(t)}
                    style={[s.tokenChip, to === t && s.tokenChipActive]}>
                    <Text style={[s.tokenChipTxt, to === t && s.tokenChipTxtActive]}>{t}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <TouchableOpacity style={s.quoteBtn}>
              <Text style={s.quoteBtnTxt}>Get Quote</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.connectBtn}>
              <Text style={s.connectBtnTxt}>Connect Wallet to Swap</Text>
            </TouchableOpacity>
          </ScrollView>
        )}

        {tab === 'portfolio' && (
          <ScrollView style={s.pad}>
            <View style={s.portfolioHeader}>
              <Text style={s.portfolioLabel}>Total Balance</Text>
              <Text style={s.portfolioValue}>$184.42</Text>
              <View style={s.pnlRow}>
                <Text style={s.pnlBad}>24H -3.3%</Text>
                <Text style={s.pnlGood}>  •  7D +0.07%</Text>
              </View>
            </View>
            {TOKENS.map(t => (
              <View key={t.symbol} style={s.tokenCard}>
                <View style={s.tokenIcon}>
                  <Text style={s.tokenIconTxt}>{t.symbol[0]}</Text>
                </View>
                <View style={s.tokenInfo}>
                  <Text style={s.tokenName}>{t.name}</Text>
                  <Text style={s.tokenPrice}>{t.price} <Text style={t.up ? s.up : s.down}>{t.change}</Text></Text>
                </View>
                <View style={s.tokenBal}>
                  <Text style={s.tokenBalAmt}>{t.bal} {t.symbol}</Text>
                </View>
              </View>
            ))}
          </ScrollView>
        )}

        {tab === 'settings' && (
          <ScrollView style={s.pad}>
            <Text style={s.sectionTitle}>Settings</Text>
            {[
              { label: 'RPC Endpoint', val: 'mainnet-beta' },
              { label: 'Slippage', val: '0.5%' },
              { label: 'Theme', val: 'Dark' },
              { label: 'Version', val: '1.0.0' },
            ].map(r => (
              <View key={r.label} style={s.settingRow}>
                <Text style={s.settingLabel}>{r.label}</Text>
                <Text style={s.settingVal}>{r.val}</Text>
              </View>
            ))}
          </ScrollView>
        )}
      </View>

      {/* Bottom tabs */}
      <View style={s.tabBar}>
        {TABS.map(t => (
          <TouchableOpacity key={t.id} style={s.tabItem} onPress={() => setTab(t.id)}>
            <Text style={[s.tabIcon, tab === t.id && s.tabIconActive]}>{t.icon}</Text>
            <Text style={[s.tabLabel, tab === t.id && s.tabLabelActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  flex: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 52, paddingHorizontal: 20, paddingBottom: 16, backgroundColor: C.card, borderBottomWidth: 1, borderBottomColor: C.border },
  logo: { color: C.accent, fontSize: 22, fontWeight: 'bold', letterSpacing: 1 },
  logoSub: { color: C.muted, fontSize: 11 },
  walletBtn: { backgroundColor: C.accent2, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
  walletBtnText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
  content: { flex: 1 },
  pad: { flex: 1, padding: 16 },
  msgs: { flex: 1, padding: 16 },
  bubble: { maxWidth: '80%', padding: 12, borderRadius: 16, marginBottom: 10 },
  userBubble: { backgroundColor: C.accent2, alignSelf: 'flex-end' },
  botBubble: { backgroundColor: C.card, alignSelf: 'flex-start', borderWidth: 1, borderColor: C.border },
  bubbleText: { color: C.text, fontSize: 14, lineHeight: 20 },
  inputRow: { flexDirection: 'row', padding: 12, backgroundColor: C.card, borderTopWidth: 1, borderTopColor: C.border },
  input: { flex: 1, backgroundColor: C.input, color: C.text, borderRadius: 24, paddingHorizontal: 16, paddingVertical: 10, fontSize: 14 },
  sendBtn: { marginLeft: 8, backgroundColor: C.accent, width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  sendTxt: { color: C.bg, fontSize: 16, fontWeight: 'bold' },
  sectionTitle: { color: C.text, fontSize: 20, fontWeight: 'bold', marginBottom: 16 },
  swapCard: { backgroundColor: C.card, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: C.border },
  swapLabel: { color: C.muted, fontSize: 12, marginBottom: 10 },
  tokenRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  tokenChip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: C.input, borderWidth: 1, borderColor: C.border },
  tokenChipActive: { backgroundColor: C.accent, borderColor: C.accent },
  tokenChipTxt: { color: C.muted, fontSize: 13 },
  tokenChipTxtActive: { color: C.bg, fontWeight: 'bold' },
  amtInput: { backgroundColor: C.input, color: C.text, borderRadius: 12, padding: 14, fontSize: 20 },
  quoteBtn: { backgroundColor: C.green, borderRadius: 14, padding: 16, alignItems: 'center', marginTop: 16 },
  quoteBtnTxt: { color: C.bg, fontWeight: 'bold', fontSize: 16 },
  connectBtn: { backgroundColor: C.card, borderRadius: 14, padding: 16, alignItems: 'center', marginTop: 8, borderWidth: 1, borderColor: C.accent },
  connectBtnTxt: { color: C.accent, fontWeight: 'bold', fontSize: 15 },
  portfolioHeader: { backgroundColor: C.card, borderRadius: 16, padding: 20, alignItems: 'center', marginBottom: 16, borderWidth: 1, borderColor: C.border },
  portfolioLabel: { color: C.muted, fontSize: 13 },
  portfolioValue: { color: C.text, fontSize: 36, fontWeight: 'bold', marginVertical: 4 },
  pnlRow: { flexDirection: 'row' },
  pnlBad: { color: C.red, fontSize: 13 },
  pnlGood: { color: C.green, fontSize: 13 },
  tokenCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.card, borderRadius: 14, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: C.border },
  tokenIcon: { width: 42, height: 42, borderRadius: 21, backgroundColor: C.accent2, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  tokenIconTxt: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  tokenInfo: { flex: 1 },
  tokenName: { color: C.text, fontSize: 15, fontWeight: '600' },
  tokenPrice: { color: C.muted, fontSize: 13, marginTop: 2 },
  up: { color: C.green },
  down: { color: C.red },
  tokenBal: { alignItems: 'flex-end' },
  tokenBalAmt: { color: C.text, fontSize: 14, fontWeight: '600' },
  settingRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: C.border },
  settingLabel: { color: C.text, fontSize: 15 },
  settingVal: { color: C.accent, fontSize: 15 },
  tabBar: { flexDirection: 'row', backgroundColor: C.card, borderTopWidth: 1, borderTopColor: C.border, paddingBottom: 20, paddingTop: 10 },
  tabItem: { flex: 1, alignItems: 'center' },
  tabIcon: { fontSize: 20, marginBottom: 2 },
  tabIconActive: { transform: [{ scale: 1.1 }] },
  tabLabel: { color: C.muted, fontSize: 11 },
  tabLabelActive: { color: C.accent, fontWeight: 'bold' },
});
