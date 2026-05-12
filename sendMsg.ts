import 'react-native-get-random-values';
import nacl from 'tweetnacl';

export const TOKENS: Record<string, string> = {
  SOL:  'So11111111111111111111111111111111111111112',
  USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  USDT: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
  JUP:  'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN',
  BONK: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
  WIF:  'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm',
};

export const DECIMALS: Record<string, number> = {
  SOL: 9, USDC: 6, USDT: 6, JUP: 6, BONK: 5, WIF: 6,
};

const RPC = 'https://api.mainnet-beta.solana.com';
const JUP_QUOTE  = 'https://lite-api.jup.ag/swap/v1/quote';
const JUP_ORDER  = 'https://lite-api.jup.ag/ultra/v1/order';
const JUP_EXEC   = 'https://lite-api.jup.ag/ultra/v1/execute';
const JUP_PRICE  = 'https://lite-api.jup.ag/price/v2';
const JUP_TRIGGER = 'https://trigger.jup.ag/v1';
const JUP_RECURRING = 'https://dca.jup.ag/v2';

// ── Action types returned by AI ──────────────────────────────────────────────
export type ChatAction =
  | 'SWAP' | 'SHOW_SWAP'
  | 'SHOW_TRIGGER' | 'SHOW_RECURRING'
  | 'SHOW_SEND' | 'FETCH_PORTFOLIO'
  | 'FETCH_PRICE' | 'SHOW_EARN'
  | 'SHOW_LOCK' | 'SHOW_STUDIO'
  | null;

export type AIResponse = {
  action: ChatAction;
  actionData: Record<string, any>;
  text: string;
};

// ── Jupiter quote ────────────────────────────────────────────────────────────
export const getJupiterQuote = async (from: string, to: string, amount: number) => {
  const inputMint  = TOKENS[from];
  const outputMint = TOKENS[to];
  if (!inputMint || !outputMint) return null;
  const amountSmallest = Math.floor(amount * Math.pow(10, DECIMALS[from] || 6));
  const url = `${JUP_QUOTE}?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amountSmallest}&slippageBps=50`;
  const res  = await fetch(url);
  const data = await res.json();
  if (data.error) return null;
  const outAmount    = parseInt(data.outAmount) / Math.pow(10, DECIMALS[to] || 6);
  const priceImpact  = parseFloat(data.priceImpactPct || '0').toFixed(4);
  const route        = data.routePlan?.map((r: any) => r.swapInfo?.label).filter(Boolean).join(' → ') || 'Direct';
  return { outAmount, priceImpact, route, raw: data };
};

// ── Token price ──────────────────────────────────────────────────────────────
export const getTokenPrice = async (token: string): Promise<string> => {
  try {
    const mint = TOKENS[token];
    if (!mint) return 'Unknown token';
    const res  = await fetch(`${JUP_PRICE}?ids=${mint}`);
    const data = await res.json();
    const price = data.data?.[mint]?.price;
    if (price) return `${token} is currently $${parseFloat(price).toFixed(4)} USD`;
    return `Could not fetch ${token} price right now.`;
  } catch {
    return `Could not fetch ${token} price right now.`;
  }
};

// ── Execute swap via Jupiter Ultra API ───────────────────────────────────────
export const executeSwap = async (
  fromMint: string, toMint: string, amount: number,
  fromDecimals: number, publicKey: string,
  secretKey: Uint8Array, rpcUrl: string
): Promise<string> => {
  const amountRaw = Math.floor(amount * Math.pow(10, fromDecimals));
  const orderRes  = await fetch(`${JUP_ORDER}?inputMint=${fromMint}&outputMint=${toMint}&amount=${amountRaw}&taker=${publicKey}`);
  const orderData = await orderRes.json();
  if (orderData.error) throw new Error(orderData.error);
  if (!orderData.transaction) throw new Error('No transaction from Jupiter');
  const txBytes = Buffer.from(orderData.transaction, 'base64');
  const sigCount = txBytes[0];
  const messageOffset = 1 + sigCount * 64;
  const message   = txBytes.slice(messageOffset);
  const signature = nacl.sign.detached(message, secretKey);
  for (let i = 0; i < 64; i++) txBytes[1 + i] = signature[i];
  const execRes  = await fetch(JUP_EXEC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ signedTransaction: txBytes.toString('base64'), requestId: orderData.requestId })
  });
  const execData = await execRes.json();
  if (execData.error) throw new Error(JSON.stringify(execData.error));
  const txSig = execData.signature || execData.txid;
  if (!txSig) throw new Error('No signature from execute');
  return txSig;
};

// ── Sign and send raw transaction ─────────────────────────────────────────────
export const signAndSendTx = async (
  base64Tx: string, secretKey: Uint8Array
): Promise<string> => {
  const txBytes = Buffer.from(base64Tx, 'base64');
  const sigCount = txBytes[0];
  const messageOffset = 1 + sigCount * 64;
  const message   = txBytes.slice(messageOffset);
  const signature = nacl.sign.detached(message, secretKey);
  for (let i = 0; i < 64; i++) txBytes[1 + i] = signature[i];
  const res  = await fetch(RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0', id: 1,
      method: 'sendTransaction',
      params: [txBytes.toString('base64'), { encoding: 'base64', preflightCommitment: 'confirmed' }]
    })
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return data.result;
};

// ── Trigger (limit) order ─────────────────────────────────────────────────────
export const createTriggerOrder = async (
  fromMint: string, toMint: string,
  fromDecimals: number, toDecimals: number,
  amount: number, targetPrice: number,
  direction: 'below' | 'above',
  publicKey: string, secretKey: Uint8Array
): Promise<string> => {
  const amountRaw  = Math.floor(amount * Math.pow(10, fromDecimals));
  const receiveAmt = direction === 'below' ? amount / targetPrice : amount * targetPrice;
  const takingRaw  = Math.floor(receiveAmt * Math.pow(10, toDecimals));
  const orderRes   = await fetch(`${JUP_TRIGGER}/createOrder`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      inputMint: fromMint, outputMint: toMint,
      maker: publicKey, payer: publicKey,
      params: { makingAmount: amountRaw.toString(), takingAmount: takingRaw.toString() },
      computeUnitPrice: 'auto'
    })
  });
  const orderData = await orderRes.json();
  if (orderData.error) throw new Error(JSON.stringify(orderData.error));
  if (!orderData.transaction) throw new Error('No transaction from Jupiter Trigger');
  return signAndSendTx(orderData.transaction, secretKey);
};

// ── Recurring (DCA) order ─────────────────────────────────────────────────────
export const createRecurringOrder = async (
  fromMint: string, toMint: string,
  fromDecimals: number,
  amountPerCycle: number, intervalSecs: number, numberOfOrders: number,
  publicKey: string, secretKey: Uint8Array
): Promise<string> => {
  const inAmt = Math.floor(amountPerCycle * Math.pow(10, fromDecimals));
  const res   = await fetch(`${JUP_RECURRING}/programmatic/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userPublicKey: publicKey,
      inAmount: inAmt.toString(),
      inAmountPerCycle: inAmt.toString(),
      cycleSecondsApart: intervalSecs,
      inputMint: fromMint, outputMint: toMint,
      numberOfOrders, startAt: null
    })
  });
  const data = await res.json();
  if (data.error) throw new Error(JSON.stringify(data.error));
  if (!data.transaction) throw new Error('No transaction from Jupiter DCA');
  return signAndSendTx(data.transaction, secretKey);
};

// ── Token balances ────────────────────────────────────────────────────────────
export const getTokenBalances = async (publicKey: string) => {
  try {
    const solRes  = await fetch(RPC, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getBalance', params: [publicKey] })
    });
    const solData   = await solRes.json();
    const solAmount = (solData.result?.value || 0) / 1e9;
    const tokenRes  = await fetch(RPC, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 2,
        method: 'getTokenAccountsByOwner',
        params: [publicKey,
          { programId: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' },
          { encoding: 'jsonParsed' }]
      })
    });
    const tokenData = await tokenRes.json();
    const balances: Array<{symbol: string, mint: string, amount: number}> = [
      { symbol: 'SOL', mint: TOKENS.SOL, amount: solAmount }
    ];
    const mintToSymbol: Record<string, string> = {};
    for (const [sym, mint] of Object.entries(TOKENS)) mintToSymbol[mint] = sym;
    for (const account of (tokenData.result?.value || [])) {
      const info   = account.account.data.parsed.info;
      const mint   = info.mint;
      const amount = info.tokenAmount.uiAmount;
      if (amount > 0 && mintToSymbol[mint]) balances.push({ symbol: mintToSymbol[mint], mint, amount });
    }
    return balances;
  } catch { return []; }
};

// ── AI chat with action dispatch ──────────────────────────────────────────────
export const askAI = async (
  question: string,
  walletAddress: string | null
): Promise<AIResponse> => {
  const SYSTEM = `You are ChatFi, an AI DeFi assistant on Solana integrated with Jupiter DEX.
You can execute real transactions for the user.
ALWAYS respond with valid JSON in this exact format:
{"action":"ACTION_TYPE","actionData":{},"text":"your message to user"}

ACTION TYPES and when to use them:
- "SWAP": user wants to swap tokens. actionData: {from,to,amount}
- "SHOW_TRIGGER": limit/trigger order. actionData: {from,to,amount,targetPrice,direction}
- "SHOW_RECURRING": DCA order. actionData: {from,to,amountPerCycle,intervalSecs,numberOfOrders}
- "SHOW_SEND": send tokens. actionData: {token,amount,recipient}
- "FETCH_PORTFOLIO": show portfolio/balances. actionData: {}
- "FETCH_PRICE": get token price. actionData: {token}
- "SHOW_EARN": Jupiter earn/lending. actionData: {}
- "SHOW_LOCK": lock tokens. actionData: {token,amount,days}
- "SHOW_STUDIO": create token. actionData: {}
- null: general question, no action needed.

Examples:
"swap 1 SOL to USDC" → {"action":"SWAP","actionData":{"from":"SOL","to":"USDC","amount":1},"text":"Swapping 1 SOL to USDC..."}
"buy SOL below $140" → {"action":"SHOW_TRIGGER","actionData":{"from":"USDC","to":"SOL","amount":140,"targetPrice":140,"direction":"below"},"text":"Setting limit order..."}
"DCA $10 USDC into SOL daily for 7 days" → {"action":"SHOW_RECURRING","actionData":{"from":"USDC","to":"SOL","amountPerCycle":10,"intervalSecs":86400,"numberOfOrders":7},"text":"Setting up DCA..."}
"what is SOL price" → {"action":"FETCH_PRICE","actionData":{"token":"SOL"},"text":"Fetching SOL price..."}
"show my portfolio" → {"action":"FETCH_PORTFOLIO","actionData":{},"text":"Loading your portfolio..."}
"create a token" → {"action":"SHOW_STUDIO","actionData":{},"text":"Opening Jupiter Studio..."}
"lock 100 JUP for 30 days" → {"action":"SHOW_LOCK","actionData":{"token":"JUP","amount":100,"days":30},"text":"Setting up token lock..."}

${walletAddress ? 'User wallet: ' + walletAddress : 'No wallet connected.'}
Return ONLY the JSON. No markdown, no explanation, no code blocks.`;

  try {
    const res  = await fetch('https://chatfi.pro/api/claude', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 500,
        system: SYSTEM,
        messages: [{ role: 'user', content: question }]
      })
    });
    const data = await res.json();
    const raw  = data.content?.[0]?.text || '{}';
    const clean = raw.replace(/```json|```/g, '').trim();
    try {
      const parsed = JSON.parse(clean);
      return {
        action:     parsed.action     || null,
        actionData: parsed.actionData || {},
        text:       parsed.text       || raw,
      };
    } catch {
      return { action: null, actionData: {}, text: raw };
    }
  } catch {
    return { action: null, actionData: {}, text: 'Network error. Please try again.' };
  }
};

export async function sendSolana(
  pubkey: string,
  secretKey: Uint8Array,
  recipient: string,
  lamports: number
): Promise<string> {
  const bs58 = require("bs58");
  const bhRes = await fetch(RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getLatestBlockhash", params: [{ commitment: "confirmed" }] }),
  });
  const bhData = await bhRes.json();
  const blockhash = bhData.result.value.blockhash;
  const fromPk = bs58.decode(pubkey);
  const toPk = bs58.decode(recipient);
  const bhBytes = bs58.decode(blockhash);
  const sysProg = new Uint8Array(32);
  const ixData = new Uint8Array(12);
  new DataView(ixData.buffer).setUint32(0, 2, true);
  new DataView(ixData.buffer).setBigUint64(4, BigInt(lamports), true);
  const msg = new Uint8Array([
    1, 0, 1, 3,
    ...fromPk, ...toPk, ...sysProg,
    ...bhBytes,
    1, 2, 2, 0, 1, 12, ...ixData,
  ]);
  const sig = nacl.sign.detached(msg, secretKey);
  const tx = new Uint8Array([1, ...sig, ...msg]);
  const txB64 = Buffer.from(tx).toString("base64");
  const sendRes = await fetch(RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "sendTransaction", params: [txB64, { encoding: "base64" }] }),
  });
  const sendData = await sendRes.json();
  if (sendData.error) throw new Error(sendData.error.message);
  return sendData.result;
}

const TOKEN_METADATA_PROGRAM_ID = 'metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s';
const logoCache: Record<string, string> = {};

export async function getTokenLogo(mint: string): Promise<string> {
  if (logoCache[mint]) return logoCache[mint];
  try {
    // Step 1: Derive metadata PDA
    const { PublicKey } = require('@solana/web3.js');
    const [metadataPDA] = PublicKey.findProgramAddressSync(
      [
        Buffer.from('metadata'),
        new PublicKey(TOKEN_METADATA_PROGRAM_ID).toBuffer(),
        new PublicKey(mint).toBuffer(),
      ],
      new PublicKey(TOKEN_METADATA_PROGRAM_ID)
    );

    // Step 2: Fetch on-chain account data
    const res = await fetch(RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 1,
        method: 'getAccountInfo',
        params: [metadataPDA.toBase58(), { encoding: 'base64' }],
      }),
    });
    const data = await res.json();
    const raw = Buffer.from(data.result.value.data[0], 'base64');

    // Step 3: Decode metadata layout
    // key(1) + update_authority(32) + mint(32) = 65
    let offset = 1 + 32 + 32;
    // name: u32 length + data (max 32 bytes, null padded)
    const nameLen = raw.readUInt32LE(offset); offset += 4 + nameLen;
    // symbol: u32 length + data (max 10 bytes, null padded)
    const symbolLen = raw.readUInt32LE(offset); offset += 4 + symbolLen;
    // uri: u32 length + data (max 200 bytes, null padded)
    const uriLen = raw.readUInt32LE(offset); offset += 4;
    const uri = raw.slice(offset, offset + uriLen).toString('utf8').replace(/ /g, '').trim();

    if (!uri) return '';

    // Step 4: Fetch off-chain JSON and get image
    const metaRes = await fetch(uri);
    const meta = await metaRes.json();
    const logo = meta.image || '';
    logoCache[mint] = logo;
    return logo;
  } catch {
    return '';
  }
}
