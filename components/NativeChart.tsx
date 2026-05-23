import React from 'react';
import { View, Text, ActivityIndicator, TouchableOpacity } from 'react-native';
import { WebView } from 'react-native-webview';
import Svg, { Line as SvgLine, Rect as SvgRect } from 'react-native-svg';
import { C } from '../theme';

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

function NativePriceChart({ mint, C, avgBuy }: any) {
  const [chartData, setChartData] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [range, setRange] = React.useState('1D');
  const [touchX, setTouchX] = React.useState<number|null>(null);
  const [touchIdx, setTouchIdx] = React.useState<number|null>(null);

  React.useEffect(() => {
    if (!mint) { setLoading(false); return; }
    setLoading(true); setChartData([]); setTouchX(null); setTouchIdx(null);
    const gtCfg: any = {
      '1H': { gran:'minute', agg:5,  lim:12 },
      '1D': { gran:'hour',   agg:1,  lim:24 },
      '1W': { gran:'hour',   agg:4,  lim:42 },
      '1M': { gran:'day',    agg:1,  lim:30 },
      'YTD':{ gran:'day',    agg:1,  lim:150 },
    }[range] || { gran:'hour', agg:1, lim:24 };

    fetch('https://chatfi.pro/api/jupiter', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ url: `https://api.geckoterminal.com/api/v2/networks/solana/tokens/${mint}/ohlcv/${gtCfg.gran}?aggregate=${gtCfg.agg}&limit=${gtCfg.lim}`, method:'GET' })
    })
      .then(r => r.json())
      .then(d => {
        const list = d?.data?.attributes?.ohlcv_list;
        if (list?.length) {
          setChartData(list.map(([ts,,,,close]: any) => ({ t: ts*1000, p: parseFloat(close) })).filter((d:any) => d.p > 0));
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [mint, range]);

  const { width: screenW } = require('react-native').Dimensions.get('window');
  const W = screenW; const H = 200; const PAD_L = 8; const PAD_R = 56; const PAD_V = 12;
  const prices = chartData.map((d:any) => d.p);
  const times  = chartData.map((d:any) => d.t);
  const min = prices.length ? Math.min(...prices) : 0;
  const max = prices.length ? Math.max(...prices) : 1;
  const range_ = (max - min) || min * 0.001 || 1;
  const px = (i:number) => PAD_L + (i / Math.max(prices.length - 1, 1)) * (W - PAD_L - PAD_R);
  const py = (p:number) => PAD_V + ((max - p) / range_) * (H - PAD_V*2);
  const isUp = prices.length > 1 ? prices[prices.length-1] >= prices[0] : true;
  const color = isUp ? C.green : '#ff4444';
  const pct = prices.length > 1 && prices[0] > 0 ? ((prices[prices.length-1] - prices[0]) / prices[0] * 100) : 0;
  const linePts = prices.map((p:number, i:number) => `${px(i).toFixed(1)},${py(p).toFixed(1)}`).join(' ');
  const areaPts = prices.length > 1 ? `${PAD_L},${H} ${linePts} ${(W-PAD_R).toFixed(1)},${H}` : '';

  // Y-axis labels
  const yLabels = [max, (max+min)/2, min];
  // X-axis labels — show 4 evenly spaced dates
  const xLabelIdxs = prices.length > 3 ? [0, Math.floor(prices.length/3), Math.floor(prices.length*2/3), prices.length-1] : [];
  const fmtDate = (ts:number) => {
    const d = new Date(ts);
    return range==='1H' ? d.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})
      : range==='1D' ? d.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})
      : d.toLocaleDateString([],{month:'short',day:'numeric'});
  };
  const fmtPrice = (p:number) => p >= 1 ? '$'+p.toFixed(2) : p >= 0.01 ? '$'+p.toFixed(4) : '$'+p.toExponential(2);

  // Touch price
  const activePrice = touchIdx !== null ? prices[touchIdx] : prices[prices.length-1];
  const activeTime  = touchIdx !== null ? times[touchIdx]  : times[times.length-1];

  // Avg buy line
  const avgBuyY = avgBuy && prices.length > 1 ? py(avgBuy) : null;

  return (
    <View style={{ marginBottom:4 }}>
      {/* Touch price display */}
      {prices.length > 1 && (
        <View style={{ flexDirection:'row', justifyContent:'space-between', paddingHorizontal:16, marginBottom:4 }}>
          <Text style={{ color:C.text, fontSize:13, fontWeight:'600' }}>
            {touchIdx !== null ? fmtPrice(activePrice) : ''}
          </Text>
          <Text style={{ color:C.muted, fontSize:11 }}>
            {touchIdx !== null && activeTime ? fmtDate(activeTime) : ''}
          </Text>
        </View>
      )}

      {loading ? (
        <View style={{ height:H, alignItems:'center', justifyContent:'center' }}>
          <ActivityIndicator color={C.green} size="small"/>
        </View>
      ) : prices.length < 2 ? (
        <View style={{ height:H, alignItems:'center', justifyContent:'center' }}>
          <Text style={{ color:C.muted, fontSize:12 }}>No chart data</Text>
        </View>
      ) : (
        <View>
          <View
            onStartShouldSetResponder={() => true}
            onResponderMove={(e) => {
              const x = e.nativeEvent.locationX;
              const idx = Math.round(((x - PAD_L) / (W - PAD_L - PAD_R)) * (prices.length - 1));
              const clamped = Math.max(0, Math.min(prices.length - 1, idx));
              setTouchX(px(clamped));
              setTouchIdx(clamped);
            }}
            onResponderRelease={() => { setTouchX(null); setTouchIdx(null); }}
          >
            <Svg width={W} height={H}>
              <Defs>
                <LinearGradient id="cg2" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0%" stopColor={color} stopOpacity="0.25"/>
                  <Stop offset="100%" stopColor={color} stopOpacity="0.01"/>
                </LinearGradient>
              </Defs>

              {/* Area fill */}
              <SvgPolygon points={areaPts} fill="url(#cg2)"/>

              {/* Avg buy dashed line */}
              {avgBuyY !== null && (
                <>
                  <SvgLine x1={PAD_L} y1={avgBuyY} x2={W-PAD_R} y2={avgBuyY}
                    stroke="#f59e0b" strokeWidth="1" strokeDasharray="4,4"/>
                  <SvgText x={W-PAD_R+4} y={avgBuyY+4} fill="#f59e0b" fontSize="9">Avg</SvgText>
                </>
              )}

              {/* Price line */}
              <SvgPolyline points={linePts} fill="none" stroke={color} strokeWidth="2"
                strokeLinejoin="round" strokeLinecap="round"/>

              {/* Y-axis labels */}
              {yLabels.map((p, i) => (
                <SvgText key={i} x={W-PAD_R+4} y={py(p)+4} fill={C.muted} fontSize="9" textAnchor="start">
                  {fmtPrice(p)}
                </SvgText>
              ))}

              {/* X-axis labels */}
              {xLabelIdxs.map((idx, i) => (
                <SvgText key={i} x={px(idx)} y={H-2} fill={C.muted} fontSize="9" textAnchor="middle">
                  {fmtDate(times[idx])}
                </SvgText>
              ))}

              {/* Touch vertical line */}
              {touchX !== null && (
                <>
                  <SvgLine x1={touchX} y1={PAD_V} x2={touchX} y2={H-PAD_V}
                    stroke={C.muted} strokeWidth="1" strokeDasharray="3,3"/>
                  <SvgCircle cx={touchX} cy={py(activePrice||0)} r="4" fill={color}/>
                </>
              )}

              {/* Current price dot */}
              {touchX === null && (
                <SvgCircle cx={px(prices.length-1)} cy={py(prices[prices.length-1])} r="5" fill={color}/>
              )}
            </Svg>
          </View>

          {/* X-axis date strip */}
          <View style={{ flexDirection:'row', justifyContent:'space-between', paddingHorizontal:PAD_L, marginTop:2, paddingRight:PAD_R }}>
          </View>

          {/* Range selector */}
          <View style={{ flexDirection:'row', paddingHorizontal:16, gap:4, marginTop:8, marginBottom:4 }}>
            {['1H','1D','1W','1M','YTD'].map(r => (
              <TouchableOpacity key={r} onPress={() => setRange(r)}
                style={{ paddingHorizontal:10, paddingVertical:5, borderRadius:8,
                  backgroundColor: range === r ? color+'22' : 'transparent',
                  borderWidth:1, borderColor: range === r ? color : 'transparent' }}>
                <Text style={{ color: range === r ? color : C.muted, fontSize:12, fontWeight:'600' }}>{r}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}
    </View>
  );
}


export default NativeChart;
