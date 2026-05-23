import React from 'react';
import { View, Text, Image } from 'react-native';
import { C } from '../theme';

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

export default TokLogo;
