import { View, Text, TouchableOpacity, StyleSheet, ScrollView, TextInput, StatusBar, SafeAreaView } from 'react-native';
import { useState } from 'react';
import Svg, { Path, Circle, Line, Polyline, Rect, Polygon } from 'react-native-svg';

const C = {
  bg: '#0d1117',
  card: '#161b22',
  card2: '#1c2128',
  border: '#30363d',
  green: '#3fb950',
  blue: '#58a6ff',
  text: '#e6edf3',
  muted: '#8b949e',
  input: '#0d1117',
  red: '#f85149',
  orange: '#d29922',
};

const IconChat = ({size=22, color=C.muted}) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <Path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
  </Svg>
);
const IconSwap = ({size=22, color=C.muted}) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <Polyline points="17 1 21 5 17 9"/><Path d="M3 11V9a4 4 0 0 1 4-4h14"/><Polyline points="7 23 3 19 7 15"/><Path d="M21 13v2a4 4 0 0 1-4 4H3"/>
  </Svg>
);
const IconChart = ({size=22, color=C.muted}) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <Line x1="18" y1="20" x2="18" y2="10"/><Line x1="12" y1="20" x2="12" y2="4"/><Line x1="6" y1="20" x2="6" y2="14"/>
  </Svg>
);
const IconSettings = ({size=22, color=C.muted}) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <Circle cx="12" cy="12" r="3"/><Path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
  </Svg>
);
const IconSend = ({size=18, color=C.bg}) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <Line x1="22" y1="2" x2="11" y2="13"/><Polygon points="22 2 15 22 11 13 2 9 22 2"/>
  </Svg>
);
const IconWallet = ({size=16, color=C.text}) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <Rect x="2" y="5" width="20" height="14" rx="2"/><Path d="M16 12h2"/><Path d="M2 10h20"/>
  </Svg>
);
const IconArrow = ({size=16, color=C.muted}) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <Line x1="12" y1="5" x2="12" y2="19"/><Polyline points="19 12 12 19 5 12"/>
  </Svg>
);

const TABS = [
  { id: 'chat', label: 'Chat', Icon: IconChat },
  { id: 'swap', label: 'Swap', Icon: IconSwap },
  { id: 'portfolio', label: 'Portfolio', Icon: IconChart },
  { id: 'settings', label: 'Settings', Icon: IconSettings },
];

const TOKENS = [
  { symbol: 'SOL', name: 'Solana', price: '$143.20', change: '+2.4%', up: true, bal: '0.0021', usd: '$0.31' },
  { symbol: 'USDC', name: 'USD Coin', price: '$1.00', change: '+0.01%', up: true, bal: '170.33', usd: '$170.33' },
  { symbol: 'JUP', name: 'Jupiter', price: '$0.208', change: '+2.5%', up: true, bal: '1.52', usd: '$0.32' },
  { symbol: 'BONK', name: 'Bonk', price: '$0.000069', change: '-1.2%', up: false, bal: '0.14', usd: '$0.01' },
];

export default function App() {
  const [tab, setTab] = useState('chat');
  const [msgs, setMsgs] = useState([
    { id: 1, text: 'Welcome to ChatFi! Your AI-powered DeFi assistant on Solana.\n\nAsk me to swap tokens, check prices, or explain DeFi strategies.', from: 'bot' }
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
      setMsgs(p => [...p, { id: Date.now()+1, text: 'Connecting to AI backend...', from: 'bot' }]);
    }, 400);
  };

  return (
    <SafeAreaView style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />

      {/* Header */}
      <View style={s.header}>
        <View style={s.logoRow}>
          <View style={s.logoDot} />
          <Text style={s.logoText}>ChatFi</Text>
        </View>
        <TouchableOpacity style={s.walletBtn}>
          <IconWallet size={14} color={C.green} />
          <Text style={s.walletBtnTxt}>Connect</Text>
        </TouchableOpacity>
      </View>

      {/* Content */}
      <View style={s.content}>

        {/* CHAT */}
        {tab === 'chat' && (
          <View style={s.flex}>
            <ScrollView style={s.msgs} contentContainerStyle={{paddingBottom:16}}>
              {msgs.map(m => (
                <View key={m.id} style={[s.bubble, m.from==='user' ? s.userBubble : s.botBubble]}>
                  {m.from === 'bot' && (
                    <View style={s.botTag}>
                      <View style={s.botDot}/>
                      <Text style={s.botTagTxt}>ChatFi AI</Text>
                    </View>
                  )}
                  <Text style={s.bubbleTxt}>{m.text}</Text>
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
                multiline={false}
              />
              <TouchableOpacity style={s.sendBtn} onPress={send}>
                <IconSend size={16} color={C.bg} />
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
              <TextInput
                style={s.bigInput}
                value={amt}
                onChangeText={setAmt}
                placeholder="0"
                placeholderTextColor={C.border}
                keyboardType="numeric"
              />
              <View style={s.tokenRow}>
                {['SOL','USDC','JUP','BONK','WIF'].map(t => (
                  <TouchableOpacity key={t} onPress={() => setFrom(t)}
                    style={[s.chip, from===t && s.chipActive]}>
                    <Text style={[s.chipTxt, from===t && s.chipTxtActive]}>{t}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={s.arrowRow}>
              <IconArrow size={20} color={C.green} />
            </View>

            <View style={s.card}>
              <Text style={s.cardLabel}>You Receive</Text>
              <Text style={s.bigOutput}>—</Text>
              <View style={s.tokenRow}>
                {['SOL','USDC','JUP','BONK','WIF'].map(t => (
                  <TouchableOpacity key={t} onPress={() => setTo(t)}
                    style={[s.chip, to===t && s.chipActive]}>
                    <Text style={[s.chipTxt, to===t && s.chipTxtActive]}>{t}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <TouchableOpacity style={s.greenBtn}>
              <Text style={s.greenBtnTxt}>Get Quote</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.outlineBtn}>
              <IconWallet size={15} color={C.blue} />
              <Text style={s.outlineBtnTxt}>Connect Wallet to Swap</Text>
            </TouchableOpacity>
          </ScrollView>
        )}

        {/* PORTFOLIO */}
        {tab === 'portfolio' && (
          <ScrollView style={s.pad}>
            <Text style={s.pageTitle}>Portfolio</Text>
            <View style={s.balanceCard}>
              <Text style={s.balLabel}>Total Balance</Text>
              <Text style={s.balValue}>$184.42</Text>
              <View style={s.pnlRow}>
                <Text style={s.pnlRed}>24H  -3.3%</Text>
                <Text style={s.pnlGreen}>  •  7D  +0.07%</Text>
              </View>
              <View style={s.balActions}>
                {['Send','Receive','Swap'].map(a => (
                  <TouchableOpacity key={a} style={s.balAction}>
                    <Text style={s.balActionTxt}>{a}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <Text style={s.sectionLabel}>Assets</Text>
            {TOKENS.map(t => (
              <View key={t.symbol} style={s.assetRow}>
                <View style={s.assetIcon}>
                  <Text style={s.assetIconTxt}>{t.symbol[0]}</Text>
                </View>
                <View style={s.assetInfo}>
                  <Text style={s.assetName}>{t.name}</Text>
                  <Text style={s.assetPrice}>{t.price}  <Text style={t.up ? s.green : s.red}>{t.change}</Text></Text>
                </View>
                <View style={s.assetBal}>
                  <Text style={s.assetBalUsd}>{t.usd}</Text>
                  <Text style={s.assetBalAmt}>{t.bal} {t.symbol}</Text>
                </View>
              </View>
            ))}
          </ScrollView>
        )}

        {/* SETTINGS */}
        {tab === 'settings' && (
          <ScrollView style={s.pad}>
            <Text style={s.pageTitle}>Settings</Text>
            {[
              { label: 'RPC Endpoint', val: 'mainnet-beta' },
              { label: 'Slippage Tolerance', val: '0.5%' },
              { label: 'Theme', val: 'Dark' },
              { label: 'App Version', val: '1.0.0' },
            ].map(r => (
              <View key={r.label} style={s.settingRow}>
                <Text style={s.settingLabel}>{r.label}</Text>
                <Text style={s.settingVal}>{r.val}</Text>
              </View>
            ))}
          </ScrollView>
        )}
      </View>

      {/* Tab Bar */}
      <View style={s.tabBar}>
        {TABS.map(({id, label, Icon}) => {
          const active = tab === id;
          return (
            <TouchableOpacity key={id} style={s.tabItem} onPress={() => setTab(id)}>
              <Icon size={22} color={active ? C.green : C.muted} />
              <Text style={[s.tabLabel, active && s.tabLabelActive]}>{label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root:{flex:1,backgroundColor:C.bg},
  flex:{flex:1},
  header:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',paddingHorizontal:20,paddingVertical:14,borderBottomWidth:1,borderBottomColor:C.border},
  logoRow:{flexDirection:'row',alignItems:'center',gap:8},
  logoDot:{width:10,height:10,borderRadius:5,backgroundColor:C.green},
  logoText:{color:C.text,fontSize:20,fontWeight:'bold',letterSpacing:0.5},
  walletBtn:{flexDirection:'row',alignItems:'center',gap:6,borderWidth:1,borderColor:C.green,borderRadius:20,paddingHorizontal:14,paddingVertical:7},
  walletBtnTxt:{color:C.green,fontSize:13,fontWeight:'600'},
  content:{flex:1},
  pad:{padding:16},
  msgs:{flex:1,paddingHorizontal:16,paddingTop:16},
  bubble:{marginBottom:12,maxWidth:'85%'},
  userBubble:{alignSelf:'flex-end',backgroundColor:C.card2,borderRadius:16,borderBottomRightRadius:4,padding:12,borderWidth:1,borderColor:C.border},
  botBubble:{alignSelf:'flex-start',backgroundColor:C.card,borderRadius:16,borderBottomLeftRadius:4,padding:12,borderWidth:1,borderColor:C.border},
  botTag:{flexDirection:'row',alignItems:'center',gap:5,marginBottom:6},
  botDot:{width:6,height:6,borderRadius:3,backgroundColor:C.green},
  botTagTxt:{color:C.green,fontSize:11,fontWeight:'600'},
  bubbleTxt:{color:C.text,fontSize:14,lineHeight:21},
  inputRow:{flexDirection:'row',paddingHorizontal:16,paddingVertical:12,borderTopWidth:1,borderTopColor:C.border,gap:10},
  input:{flex:1,backgroundColor:C.card,color:C.text,borderRadius:24,paddingHorizontal:18,paddingVertical:11,fontSize:14,borderWidth:1,borderColor:C.border},
  sendBtn:{width:44,height:44,borderRadius:22,backgroundColor:C.green,alignItems:'center',justifyContent:'center'},
  pageTitle:{color:C.text,fontSize:22,fontWeight:'bold',marginBottom:18},
  card:{backgroundColor:C.card,borderRadius:16,padding:16,borderWidth:1,borderColor:C.border,marginBottom:4},
  cardLabel:{color:C.muted,fontSize:12,marginBottom:8},
  bigInput:{color:C.text,fontSize:32,fontWeight:'bold',paddingVertical:4},
  bigOutput:{color:C.muted,fontSize:32,fontWeight:'bold',paddingVertical:4,marginBottom:8},
  tokenRow:{flexDirection:'row',flexWrap:'wrap',gap:6,marginTop:8},
  chip:{paddingHorizontal:12,paddingVertical:6,borderRadius:20,backgroundColor:C.bg,borderWidth:1,borderColor:C.border},
  chipActive:{backgroundColor:C.green,borderColor:C.green},
  chipTxt:{color:C.muted,fontSize:12},
  chipTxtActive:{color:C.bg,fontWeight:'bold'},
  arrowRow:{alignItems:'center',paddingVertical:8},
  greenBtn:{backgroundColor:C.green,borderRadius:14,padding:16,alignItems:'center',marginTop:16},
  greenBtnTxt:{color:C.bg,fontWeight:'bold',fontSize:16},
  outlineBtn:{flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8,borderWidth:1,borderColor:C.blue,borderRadius:14,padding:14,marginTop:8},
  outlineBtnTxt:{color:C.blue,fontWeight:'600',fontSize:14},
  balanceCard:{backgroundColor:C.card,borderRadius:16,padding:20,borderWidth:1,borderColor:C.border,alignItems:'center',marginBottom:20},
  balLabel:{color:C.muted,fontSize:13,marginBottom:4},
  balValue:{color:C.text,fontSize:38,fontWeight:'bold',marginBottom:4},
  pnlRow:{flexDirection:'row',marginBottom:16},
  pnlRed:{color:C.red,fontSize:13},
  pnlGreen:{color:C.green,fontSize:13},
  balActions:{flexDirection:'row',gap:12},
  balAction:{backgroundColor:C.card2,borderRadius:12,paddingHorizontal:20,paddingVertical:10,borderWidth:1,borderColor:C.border},
  balActionTxt:{color:C.text,fontSize:13,fontWeight:'600'},
  sectionLabel:{color:C.muted,fontSize:12,fontWeight:'600',marginBottom:10,letterSpacing:0.5},
  assetRow:{flexDirection:'row',alignItems:'center',backgroundColor:C.card,borderRadius:14,padding:14,marginBottom:8,borderWidth:1,borderColor:C.border},
  assetIcon:{width:40,height:40,borderRadius:20,backgroundColor:C.card2,borderWidth:1,borderColor:C.border,alignItems:'center',justifyContent:'center',marginRight:12},
  assetIconTxt:{color:C.green,fontWeight:'bold',fontSize:15},
  assetInfo:{flex:1},
  assetName:{color:C.text,fontSize:14,fontWeight:'600'},
  assetPrice:{color:C.muted,fontSize:12,marginTop:2},
  green:{color:C.green},
  red:{color:C.red},
  assetBal:{alignItems:'flex-end'},
  assetBalUsd:{color:C.text,fontSize:14,fontWeight:'600'},
  assetBalAmt:{color:C.muted,fontSize:11,marginTop:2},
  settingRow:{flexDirection:'row',justifyContent:'space-between',paddingVertical:16,borderBottomWidth:1,borderBottomColor:C.border},
  settingLabel:{color:C.text,fontSize:15},
  settingVal:{color:C.green,fontSize:15},
  tabBar:{flexDirection:'row',backgroundColor:C.card,borderTopWidth:1,borderTopColor:C.border,paddingTop:10,paddingBottom:24},
  tabItem:{flex:1,alignItems:'center',gap:4},
  tabLabel:{color:C.muted,fontSize:11},
  tabLabelActive:{color:C.green,fontWeight:'600'},
});
