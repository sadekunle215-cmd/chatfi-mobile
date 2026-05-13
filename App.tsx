import React, { useState, useEffect, useCallback, useRef } from 'react';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { WebView } from 'react-native-webview';
import Svg, { Line as SvgLine, Rect as SvgRect } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { Image, View, Text, TouchableOpacity, StyleSheet, ScrollView, TextInput, StatusBar, SafeAreaView, Modal, Alert, ActivityIndicator, Clipboard, RefreshControl, KeyboardAvoidingView, Platform, Animated, AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as LocalAuthentication from 'expo-local-authentication';
import { generateWallet, getPublicKey, getPrivateKey, importWallet as deriveWallet, signAndSendTransaction } from './wallet';
import nacl from 'tweetnacl';
import { askAI, getJupiterQuote, executeSwap as executeSwapTx, getTokenPrice, createTriggerOrder, createRecurringOrder } from './sendMsg';
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
  border: '#2a3f52', green: '#C7F284', blue: '#79e0f2',
  text: '#e8f4e8', muted: '#7a9bb5', red: '#ff5555', orange: '#ffaa00',
  gradTop: '#1C2936', gradBot: '#0d1117',
};

const RPC = 'https://api.mainnet-beta.solana.com';

async function _sendSOL(pubkey:string,secretKey:Uint8Array,recipient:string,lamports:number):Promise<string>{
  const bs58=require('bs58');
  const bh=await(await fetch(RPC,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'getLatestBlockhash',params:[{commitment:'confirmed'}]})})).json();
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
  const r=await(await fetch(RPC,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'sendTransaction',params:[Buffer.from(tx).toString('base64'),{encoding:'base64',preflightCommitment:'confirmed'}]})})).json();
  if(r.error)throw new Error(r.error.message);
  return r.result;
}

async function _sendSPL(pubkey:string,secretKey:Uint8Array,recipient:string,amountRaw:number,mint:string):Promise<string>{
  // Use Jupiter Ultra swap to same token as a transfer mechanism isn't ideal
  // Instead use raw RPC with correct Solana legacy tx format
  const bs58=require('bs58');
  const bh=await(await fetch(RPC,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'getLatestBlockhash',params:[{commitment:'confirmed'}]})})).json();
  const blockhash=bh.result.value.blockhash;
  const sa=await(await fetch(RPC,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:2,method:'getTokenAccountsByOwner',params:[pubkey,{mint},{encoding:'jsonParsed'}]})})).json();
  const sATA=sa.result?.value?.[0]?.pubkey;
  if(!sATA)throw new Error('No token account for '+mint);
  const ra=await(await fetch(RPC,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:3,method:'getTokenAccountsByOwner',params:[recipient,{mint},{encoding:'jsonParsed'}]})})).json();
  const rATA=ra.result?.value?.[0]?.pubkey;
  if(!rATA)throw new Error('Recipient has no account for this token');
  const ownerBytes=bs58.decode(pubkey);
  const srcBytes=bs58.decode(sATA);
  const dstBytes=bs58.decode(rATA);
  const bhBytes=bs58.decode(blockhash);
  const tpBytes=bs58.decode('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
  // SPL transfer instruction: discriminator=3, amount=u64LE
  const ixData=new Uint8Array(9);
  ixData[0]=3;
  const dv=new DataView(ixData.buffer);
  dv.setBigUint64(1,BigInt(amountRaw),true);
  // Legacy message format:
  // [numRequiredSigs=1, numReadonlySignedAccounts=0, numReadonlyUnsignedAccounts=1]
  // numAccounts=3: [owner(writable,signer), srcATA(writable), dstATA(writable), tokenProgram(readonly)]
  // Wait - correct: owner signs but ATAs are writable, tokenProgram readonly unsigned
  // Header: numSigs=1, numReadonlySigned=0, numReadonlyUnsigned=1 (tokenProgram)
  // Accounts: owner, srcATA, dstATA, tokenProgram
  // Instruction: progIdx=3(tokenProgram), accounts=[1,2,0](src,dst,owner), data=ixData
  const msg=new Uint8Array(3+1+4*32+32+1+1+1+3+1+9);
  let o=0;
  msg[o++]=1;msg[o++]=0;msg[o++]=1; // header
  msg[o++]=4; // 4 accounts
  msg.set(ownerBytes,o);o+=32;
  msg.set(srcBytes,o);o+=32;
  msg.set(dstBytes,o);o+=32;
  msg.set(tpBytes,o);o+=32;
  msg.set(bhBytes,o);o+=32;
  msg[o++]=1; // 1 instruction
  msg[o++]=3; // token program at index 3
  msg[o++]=3; // 3 account indices
  msg[o++]=1;msg[o++]=2;msg[o++]=0; // srcATA, dstATA, owner
  msg[o++]=9; // data len
  msg.set(ixData,o);
  const sig=nacl.sign.detached(msg,secretKey);
  const tx=new Uint8Array(1+64+msg.length);
  tx[0]=1;tx.set(sig,1);tx.set(msg,65);
  const r=await(await fetch(RPC,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'sendTransaction',params:[Buffer.from(tx).toString('base64'),{encoding:'base64',preflightCommitment:'confirmed',skipPreflight:false}]})})).json();
  if(r.error)throw new Error(r.error.message);
  return r.result;
}


