import React, { useState, useEffect, useCallback, useRef } from 'react';
import { WebView } from 'react-native-webview';
import { CameraView, useCameraPermissions } from 'expo-camera';
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

async function _sendSPL(pubkey,secretKey,recipient,amountRaw,mint){
  const {Connection,PublicKey,Transaction,SystemProgram} = require('@solana/web3.js');
  const conn = new Connection('https://api.mainnet-beta.solana.com','confirmed');
  const TOKEN_PROG = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
  const ASSOC_PROG = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJe1bw');
  const mintPk = new PublicKey(mint);
  const fromPk = new PublicKey(pubkey);
  const toPk = new PublicKey(recipient);
  const [fromATA] = PublicKey.findProgramAddressSync([fromPk.toBuffer(),TOKEN_PROG.toBuffer(),mintPk.toBuffer()],ASSOC_PROG);
  const [toATA] = PublicKey.findProgramAddressSync([toPk.toBuffer(),TOKEN_PROG.toBuffer(),mintPk.toBuffer()],ASSOC_PROG);
  const tx = new Transaction();
  const toATAInfo = await conn.getAccountInfo(toATA);
  if(!toATAInfo){tx.add({keys:[{pubkey:fromPk,isSigner:true,isWritable:true},{pubkey:toATA,isSigner:false,isWritable:true},{pubkey:toPk,isSigner:false,isWritable:false},{pubkey:mintPk,isSigner:false,isWritable:false},{pubkey:SystemProgram.programId,isSigner:false,isWritable:false},{pubkey:TOKEN_PROG,isSigner:false,isWritable:false}],programId:ASSOC_PROG,data:Buffer.alloc(0)});}
  const ixData=Buffer.alloc(9);ixData[0]=3;ixData.writeBigUInt64LE(BigInt(amountRaw),1);
  tx.add({keys:[{pubkey:fromATA,isSigner:false,isWritable:true},{pubkey:toATA,isSigner:false,isWritable:true},{pubkey:fromPk,isSigner:true,isWritable:false}],programId:TOKEN_PROG,data:ixData});
  const {blockhash}=await conn.getLatestBlockhash('confirmed');
  tx.recentBlockhash=blockhash;tx.feePayer=fromPk;
  tx.sign({publicKey:fromPk,secretKey});
  const sig=await conn.sendRawTransaction(tx.serialize(),{skipPreflight:false,preflightCommitment:'confirmed'});
  return sig;
}


