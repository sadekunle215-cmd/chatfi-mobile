import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, TextInput, StatusBar, SafeAreaView, Modal, Alert, ActivityIndicator } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { generateWallet, getPublicKey } from './wallet';
import { askAI } from './sendMsg';

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
  orange: '#d29922',
};

const TABS = [
  { id: 'chat', label: 'Chat', icon: '◉' },
  { id: 'swap', label: 'Swap', icon: '⇄' },
  { id: 'portfolio', label: 'Portfolio', icon: '▦' },
  { id: 'settings', label: 'Settings', icon: '◈' },
];

export default function App() {
  const [tab, setTab] = useState('chat');
  const [wallet, setWallet] = useState<string | null>(null);
  const [pubkey, setPubkey] = useState<string | null>(null);
  const [showWalletModal, setShowWalletModal] = useState(false);
  const [showSeedModal, setShowSeedModal] = useState(false);
  const [seedPhrase, setSeedPhrase] = useState('');
  const [importSeed, setImportSeed] = useState('');
  const [msgs, setMsgs] = useState([
    { id: 1, text: 'Welcome to ChatFi! Your AI-powered DeFi assistant on Solana.\n\nAsk me anything about swaps, prices, or DeFi strategies.', from: 'bot' }
  ]);
  const [input, setInput] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [fromToken, setFromToken] = useState('SOL');
  const [toToken, setToToken] = useState('USDC');
  const [amt, setAmt] = useState('');

  useEffect(() => {
    AsyncStorage.getItem('wallet_mnemonic').then(m => {
      if (m) { setWallet(m); setPubkey(getPublicKey(m)); }
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
    Alert.alert('Wallet Created!', 'Keep your seed phrase safe!');
  };

  const importWallet = async () => {
    const words = importSeed.trim().split(/\s+/);
    if (words.length !== 12 && words.length !== 24) {
      Alert.alert('Invalid', 'Enter a valid 12 or 24 word seed phrase');
      return;
    }
    try {
      const pk = getPublicKey(importSeed.trim());
      await AsyncStorage.setItem('wallet_mnemonic', importSeed.trim());
      setWallet(importSeed.trim());
      setPubkey(pk);
      setShowWalletModal(false);
      setImportSeed('');
      Alert.alert('Wallet Imported!', 'Your wallet is ready.');
    } catch {
      Alert.alert('Error', 'Invalid seed phrase');
    }
  };

  const sendMsg = async () => {
    if (!input.trim() || aiLoading) return;
    const q = input;
    setMsgs(p => [...p, { id: Date.now(), text: q, from: 'user' }]);
    setInput('');
    setAiLoading(true);
    const reply = await askAI(q, pubkey);
    setMsgs(p => [...p, { id: Date.now() + 1, text: reply, from: 'bot' }]);
    setAiLoading(false);
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
        {tab === 'chat' && (
          <View style={s.flex}>
            <ScrollView style={s.msgs} contentContainerStyle={{ paddingBottom: 16 }}>
              {msgs.map(m => (
                <View key={m.id} style={[s.bubble, m.from === 'user' ? s.userBubble : s.botBubble]}>
                  {m.from === 'bot' && (
                    <View style={s.botTag}>
                      <View style={s.botDot} />
                      <Text style={s.botTagTxt}>ChatFi AI</Text>
                    </View>
                  )}
                  <Text style={s.bubbleTxt}>{m.text}</Text>
                </View>
              ))}
              {aiLoading && (
                <View style={s.botBubble}>
                  <View style={s.botTag}>
                    <View style={s.botDot} />
                    <Text style={s.botTagTxt}>ChatFi AI</Text>
                  </View>
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

        {tab === 'swap' && (
          <ScrollView style={s.pad}>
            <Text style={s.pageTitle}>Swap</Text>
            <View style={s.card}>
              <Text style={s.cardLabel}>You Pay</Text>
              <TextInput style={s.bigInput} value={amt} onChangeText={setAmt} placeholder="0" placeholderTextColor={C.border} keyboardType="numeric" />
              <View style={s.tokenRow}>
                {['SOL', 'USDC', 'JUP', 'BONK', 'WIF'].map(t => (
                  <TouchableOpacity key={t} onPress={() => setFromToken(t)} style={[s.chip, fromToken === t && s.chipActive]}>
                    <Text style={[s.chipTxt, fromToken === t && s.chipTxtActive]}>{t}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <View style={s.arrowRow}><Text style={{ color: C.green, fontSize: 24 }}>↓</Text></View>
            <View style={s.card}>
              <Text style={s.cardLabel}>You Receive</Text>
              <Text style={s.bigOutput}>—</Text>
              <View style={s.tokenRow}>
                {['SOL', 'USDC', 'JUP', 'BONK', 'WIF'].map(t => (
                  <TouchableOpacity key={t} onPress={() => setToToken(t)} style={[s.chip, toToken === t && s.chipActive]}>
                    <Text style={[s.chipTxt, toToken === t && s.chipTxtActive]}>{t}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <TouchableOpacity style={s.greenBtn}><Text style={s.greenBtnTxt}>Get Quote</Text></TouchableOpacity>
            {!wallet && (
              <TouchableOpacity style={s.outlineBtn} onPress={() => setShowWalletModal(true)}>
                <Text style={s.outlineBtnTxt}>Connect Wallet to Swap</Text>
              </TouchableOpacity>
            )}
          </ScrollView>
        )}

        {tab === 'portfolio' && (
          <ScrollView style={s.pad}>
            <Text style={s.pageTitle}>Portfolio</Text>
            {!wallet ? (
              <View style={s.emptyState}>
                <Text style={s.emptyTitle}>No Wallet Connected</Text>
                <Text style={s.emptyText}>Create or import a wallet to view your portfolio</Text>
                <TouchableOpacity style={s.greenBtn} onPress={() => setShowWalletModal(true)}>
                  <Text style={s.greenBtnTxt}>Get Started</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={s.balanceCard}>
                <Text style={s.balLabel}>Wallet Address</Text>
                <Text style={s.walletAddress} numberOfLines={1}>{pubkey}</Text>
                <Text style={s.balValue}>$0.00</Text>
                <Text style={s.balSub}>Fetching balances...</Text>
              </View>
            )}
          </ScrollView>
        )}

        {tab === 'settings' && (
          <ScrollView style={s.pad}>
            <Text style={s.pageTitle}>Settings</Text>
            {wallet && (
              <View style={s.card}>
                <Text style={s.cardLabel}>Connected Wallet</Text>
                <Text style={s.settingVal} numberOfLines={1}>{pubkey}</Text>
              </View>
            )}
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
            {wallet && (
              <TouchableOpacity style={s.dangerBtn} onPress={() => {
                Alert.alert('Remove Wallet', 'Make sure you have your seed phrase!', [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Remove', style: 'destructive', onPress: async () => {
                    await AsyncStorage.removeItem('wallet_mnemonic');
                    setWallet(null); setPubkey(null);
                  }}
                ]);
              }}>
                <Text style={s.dangerBtnTxt}>Remove Wallet</Text>
              </TouchableOpacity>
            )}
          </ScrollView>
        )}
      </View>

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

      <Modal visible={showSeedModal} animationType="slide" transparent>
        <View style={s.modalOverlay}>
          <View style={s.modalCard}>
            <Text style={s.modalTitle}>Your Seed Phrase</Text>
            <Text style={s.seedWarning}>Write these 12 words down. Never share them with anyone!</Text>
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
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  flex: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, paddingTop: 20, borderBottomWidth: 1, borderBottomColor: C.border },
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
  greenBtn: { backgroundColor: C.green, borderRadius: 14, padding: 16, alignItems: 'center', marginTop: 8 },
  greenBtnTxt: { color: C.bg, fontWeight: 'bold', fontSize: 16 },
  outlineBtn: { borderWidth: 1, borderColor: C.blue, borderRadius: 14, padding: 14, alignItems: 'center', marginTop: 8 },
  outlineBtnTxt: { color: C.blue, fontWeight: '600', fontSize: 14 },
  emptyState: { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyTitle: { color: C.text, fontSize: 18, fontWeight: 'bold' },
  emptyText: { color: C.muted, fontSize: 14, textAlign: 'center' },
  balanceCard: { backgroundColor: C.card, borderRadius: 16, padding: 20, borderWidth: 1, borderColor: C.border, alignItems: 'center', marginBottom: 16 },
  balLabel: { color: C.muted, fontSize: 12 },
  walletAddress: { color: C.blue, fontSize: 12, marginVertical: 4 },
  balValue: { color: C.text, fontSize: 36, fontWeight: 'bold' },
  balSub: { color: C.muted, fontSize: 12, marginTop: 4 },
  settingRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: C.border },
  settingLabel: { color: C.text, fontSize: 15 },
  settingVal: { color: C.green, fontSize: 14, flex: 1, textAlign: 'right' },
  dangerBtn: { borderWidth: 1, borderColor: C.red, borderRadius: 14, padding: 14, alignItems: 'center', marginTop: 16 },
  dangerBtnTxt: { color: C.red, fontWeight: '600', fontSize: 14 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: C.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, borderWidth: 1, borderColor: C.border },
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
  orange: { color: '#d29922' },
  tabBar: { flexDirection: 'row', backgroundColor: C.card, borderTopWidth: 1, borderTopColor: C.border, paddingTop: 10, paddingBottom: 24 },
  tabItem: { flex: 1, alignItems: 'center', gap: 4 },
  tabIcon: { fontSize: 20, color: C.muted },
  tabIconActive: { color: C.green },
  tabLabel: { color: C.muted, fontSize: 11 },
  tabLabelActive: { color: C.green, fontWeight: '600' },
});
