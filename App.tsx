import { View, Text, TouchableOpacity, StyleSheet, ScrollView, TextInput, ActivityIndicator } from 'react-native';
import { useState } from 'react';

const TABS = ['Chat', 'Swap', 'Portfolio', 'Settings'];

export default function App() {
  const [activeTab, setActiveTab] = useState('Chat');
  const [messages, setMessages] = useState([
    { id: 1, text: 'Welcome to ChatFi! Your DeFi assistant on Solana.', from: 'bot' }
  ]);
  const [input, setInput] = useState('');

  const sendMessage = () => {
    if (!input.trim()) return;
    setMessages(prev => [...prev, { id: Date.now(), text: input, from: 'user' }]);
    setMessages(prev => [...prev, { id: Date.now()+1, text: 'Processing your request...', from: 'bot' }]);
    setInput('');
  };

  return (
    <View style={s.container}>
      <View style={s.header}>
        <Text style={s.headerText}>ChatFi</Text>
        <Text style={s.headerSub}>DeFi on Solana</Text>
      </View>
      <View style={s.tabs}>
        {TABS.map(tab => (
          <TouchableOpacity key={tab} onPress={() => setActiveTab(tab)} style={[s.tab, activeTab===tab && s.activeTab]}>
            <Text style={[s.tabText, activeTab===tab && s.activeTabText]}>{tab}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {activeTab==='Chat' && (
        <View style={s.chatContainer}>
          <ScrollView style={s.messages}>
            {messages.map(msg => (
              <View key={msg.id} style={[s.bubble, msg.from==='user' ? s.userBubble : s.botBubble]}>
                <Text style={s.bubbleText}>{msg.text}</Text>
              </View>
            ))}
          </ScrollView>
          <View style={s.inputRow}>
            <TextInput style={s.input} value={input} onChangeText={setInput} placeholder="Ask ChatFi..." placeholderTextColor="#666" />
            <TouchableOpacity style={s.sendBtn} onPress={sendMessage}>
              <Text style={s.sendText}>Send</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
      {activeTab==='Swap' && (
        <View style={s.center}>
          <Text style={s.bigText}>⚡ Swap</Text>
          <Text style={s.subText}>Jupiter DEX integration</Text>
        </View>
      )}
      {activeTab==='Portfolio' && (
        <View style={s.center}>
          <Text style={s.bigText}>💼 Portfolio</Text>
          <Text style={s.subText}>Connect wallet to view</Text>
        </View>
      )}
      {activeTab==='Settings' && (
        <View style={s.center}>
          <Text style={s.bigText}>⚙️ Settings</Text>
          <Text style={s.subText}>RPC and preferences</Text>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container:{flex:1,backgroundColor:'#0d1117'},
  header:{paddingTop:50,paddingBottom:12,alignItems:'center',backgroundColor:'#161b22'},
  headerText:{color:'#58a6ff',fontSize:26,fontWeight:'bold'},
  headerSub:{color:'#8b949e',fontSize:12,marginTop:2},
  tabs:{flexDirection:'row',backgroundColor:'#161b22',borderBottomWidth:1,borderBottomColor:'#30363d'},
  tab:{flex:1,paddingVertical:12,alignItems:'center'},
  activeTab:{borderBottomWidth:2,borderBottomColor:'#58a6ff'},
  tabText:{color:'#8b949e',fontSize:13},
  activeTabText:{color:'#58a6ff',fontWeight:'bold'},
  chatContainer:{flex:1},
  messages:{flex:1,padding:16},
  bubble:{maxWidth:'80%',padding:12,borderRadius:16,marginBottom:8},
  userBubble:{backgroundColor:'#1f6feb',alignSelf:'flex-end'},
  botBubble:{backgroundColor:'#21262d',alignSelf:'flex-start'},
  bubbleText:{color:'#fff',fontSize:14},
  inputRow:{flexDirection:'row',padding:12,backgroundColor:'#161b22'},
  input:{flex:1,backgroundColor:'#21262d',color:'#fff',borderRadius:20,paddingHorizontal:16,paddingVertical:10},
  sendBtn:{marginLeft:8,backgroundColor:'#1f6feb',borderRadius:20,paddingHorizontal:16,justifyContent:'center'},
  sendText:{color:'#fff',fontWeight:'bold'},
  center:{flex:1,alignItems:'center',justifyContent:'center'},
  bigText:{color:'#fff',fontSize:32,marginBottom:8},
  subText:{color:'#8b949e',fontSize:16},
});
