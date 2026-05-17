import 'react-native-get-random-values';
import nacl from 'tweetnacl';

// Token info cache: symbol -> { mint, decimals, logoURI }
const tokenCache: Record<string, { mint: string; decimals: number; logoURI: string }> = {};

const SEED_TOKENS = [
  { symbol: 'SOL',  mint: 'So11111111111111111111111111111111111111112',  decimals: 9, logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png' },
  { symbol: 'USDC', mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', decimals: 6, logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png' },
  { symbol: 'USDT', mint: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', decimals: 6, logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB/logo.svg' },
  { symbol: 'JUP',  mint: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN',  decimals: 6, logoURI: 'https://static.jup.ag/jup/icon.png' },
  { symbol: 'BONK', mint: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', decimals: 5, logoURI: 'https://arweave.net/hQiPZOsRZXGXBJd_82PhVdlM_hACsT_q6wqwf5cSY7I' },
  { symbol: 'WIF',  mint: 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm', decimals: 6, logoURI: 'https://img.jup.ag/tokens/EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm' },
];
SEED_TOKENS.forEach(t => { tokenCache[t.symbol.toUpperCase()] = { mint: t.mint, decimals: t.decimals, logoURI: t.logoURI }; });

export const resolveToken = async (symbolOrMint: string): Promise<{ mint: string; decimals: number; logoURI: string } | null> => {
  const key = symbolOrMint.toUpperCase();
  if (tokenCache[key]) return tokenCache[key];
  try {
    const res = await fetch(`https://lite-api.jup.ag/tokens/v2/search?query=${encodeURIComponent(symbolOrMint)}`);
    const list = await res.json();
    if (!Array.isArray(list) || list.length === 0) return null;
    const match = list.find((t: any) => t.symbol?.toUpperCase() === key) || list[0];
    const token = { mint: match.id, decimals: match.decimals, logoURI: match.icon || '' };
    tokenCache[key] = token;
    tokenCache[match.id] = token;
    return token;
  } catch {
    return null;
  }
};

export const TOKENS: Record<string, string> = new Proxy({} as Record<string, string>, {
  get: (_: any, sym: string) => tokenCache[sym.toUpperCase()]?.mint
});
export const DECIMALS: Record<string, number> = new Proxy({} as Record<string, number>, {
  get: (_: any, sym: string) => tokenCache[sym.toUpperCase()]?.decimals ?? 6
});

const RPC = 'https://api.mainnet-beta.solana.com';
const JUP_QUOTE  = 'https://lite-api.jup.ag/swap/v1/quote';
const JUP_ORDER  = 'https://lite-api.jup.ag/ultra/v1/order';
const JUP_EXEC   = 'https://lite-api.jup.ag/ultra/v1/execute';
const JUP_PRICE  = 'https://lite-api.jup.ag/price/v3';
const JUP_TRIGGER = 'https://api.jup.ag/trigger/v1';
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
export const getJupiterQuote = async (inputMintOrSymbol: string, outputMintOrSymbol: string, amount: number, fromDecimals: number = 6, toDecimals: number = 6) => {
  if (!inputMintOrSymbol || !outputMintOrSymbol) return null;
  let inputMint = inputMintOrSymbol;
  let outputMint = outputMintOrSymbol;
  let resolvedFromDec = fromDecimals;
  let resolvedToDec = toDecimals;
  if (inputMintOrSymbol.length < 32) {
    const t = await resolveToken(inputMintOrSymbol);
    if (!t) return null;
    inputMint = t.mint; resolvedFromDec = t.decimals;
  }
  if (outputMintOrSymbol.length < 32) {
    const t = await resolveToken(outputMintOrSymbol);
    if (!t) return null;
    outputMint = t.mint; resolvedToDec = t.decimals;
  }
  const amountSmallest = Math.floor(amount * Math.pow(10, resolvedFromDec));
  const url = `${JUP_QUOTE}?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amountSmallest}&slippageBps=50`;
  const res  = await fetch(url);
  const data = await res.json();
  if (data.error) return null;
  const outAmount   = Number(data.outAmount) / Math.pow(10, resolvedToDec);
  const priceImpact = parseFloat(data.priceImpactPct || '0').toFixed(4);
  const route       = data.routePlan?.map((r: any) => r.swapInfo?.label).filter(Boolean).join(' → ') || 'Direct';
  return { outAmount, priceImpact, route, raw: data, inputMint, outputMint, fromDecimals: resolvedFromDec, toDecimals: resolvedToDec };
};

// ── Token price ──────────────────────────────────────────────────────────────
export const getTokenPrice = async (token: string): Promise<string> => {
  try {
    const resolved = await resolveToken(token);
    if (!resolved) return `Unknown token: ${token}`;
    const mint = resolved.mint;
    // Fetch price
    const priceRes = await fetch(`${JUP_PRICE}?ids=${mint}`);
    const priceData = await priceRes.json();
    const priceInfo = priceData.data?.[mint];
    const price = priceInfo?.usdPrice ?? priceInfo?.price;
    const change24h = priceInfo?.priceChange24h;
    // Fetch token metadata
    const metaRes = await fetch(`https://lite-api.jup.ag/tokens/v2/token/${mint}`);
    const meta = await metaRes.json();
    if (!price) return `Could not fetch ${token} price right now.`;
    let reply = `**${meta?.symbol || token}** (${meta?.name || token})
`;
    reply += `💰 Price: $${parseFloat(price).toFixed(6)}
`;
    if (change24h !== undefined) reply += `📈 24h Change: ${parseFloat(change24h).toFixed(2)}%
`;
    if (meta?.decimals !== undefined) reply += `🔢 Decimals: ${meta.decimals}
`;
    if (meta?.tags?.length) reply += `🏷️ Tags: ${meta.tags.join(', ')}
`;
    reply += `📋 Mint: ${mint}`;
    return reply;
  } catch {
    return `Could not fetch ${token} price right now.`;
  }
};

// ── Execute swap via Jupiter Ultra API ───────────────────────────────────────
export const executeSwap = async (
  fromMintOrSymbol: string, toMintOrSymbol: string, amount: number,
  fromDecimals: number, publicKey: string,
  secretKey: Uint8Array, rpcUrl: string
): Promise<string> => {
  let fromMint = fromMintOrSymbol;
  let toMint = toMintOrSymbol;
  let resolvedFromDec = fromDecimals;
  if (fromMintOrSymbol.length < 32) {
    const t = await resolveToken(fromMintOrSymbol);
    if (!t) throw new Error(`Unknown token: ${fromMintOrSymbol}`);
    fromMint = t.mint; resolvedFromDec = t.decimals;
  }
  if (toMintOrSymbol.length < 32) {
    const t = await resolveToken(toMintOrSymbol);
    if (!t) throw new Error(`Unknown token: ${toMintOrSymbol}`);
    toMint = t.mint;
  }
  const amountRaw = Math.floor(amount * Math.pow(10, resolvedFromDec));
  const orderRes  = await fetch(`${JUP_ORDER}?inputMint=${fromMint}&outputMint=${toMint}&amount=${amountRaw}&taker=${publicKey}`);
  const orderData = await orderRes.json();
  if (orderData.error) throw new Error(orderData.error);
  if (!orderData.transaction) throw new Error('No transaction from Jupiter');
  const { VersionedTransaction, Keypair } = require('@solana/web3.js');
  const keypair = Keypair.fromSecretKey(secretKey);
  const transaction = VersionedTransaction.deserialize(Buffer.from(orderData.transaction, 'base64'));
  transaction.sign([keypair]);
  const signedTransaction = Buffer.from(transaction.serialize()).toString('base64');
  const execRes  = await fetch(JUP_EXEC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ signedTransaction, requestId: orderData.requestId })
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
  const { VersionedTransaction, Transaction, Keypair } = require('@solana/web3.js');
  const keypair = Keypair.fromSecretKey(secretKey);
  const txBytes = Buffer.from(base64Tx, 'base64');
  let signed: string;
  // Detect versioned (first byte has high bit set) vs legacy transaction
  const isVersioned = (txBytes[0] & 0x80) !== 0;
  if (isVersioned) {
    const tx = VersionedTransaction.deserialize(txBytes);
    tx.sign([keypair]);
    signed = Buffer.from(tx.serialize()).toString('base64');
  } else {
    // Legacy transaction — use Transaction.from() + sign()
    const tx = Transaction.from(txBytes);
    tx.partialSign(keypair);
    signed = tx.serialize({ requireAllSignatures: false }).toString('base64');
  }
  const res  = await fetch(RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0', id: 1,
      method: 'sendTransaction',
      params: [signed, { encoding: 'base64', preflightCommitment: 'confirmed' }]
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
  const orderRes   = await fetch('https://chatfi.pro/api/jupiter', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: `${JUP_TRIGGER}/createOrder`,
      method: 'POST',
      body: {
        inputMint: fromMint, outputMint: toMint,
        maker: publicKey, payer: publicKey,
        params: { makingAmount: amountRaw.toString(), takingAmount: takingRaw.toString() },
        computeUnitPrice: 'auto'
      }
    })
  });
  const orderData = await orderRes.json();
  if (orderData.error) throw new Error(JSON.stringify(orderData.error));
  if (!orderData.transaction) throw new Error('No transaction from Jupiter Trigger');
  return signAndSendTx(orderData.transaction, secretKey);
};

// ── Recurring (DCA) order ─────────────────────────────────────────────────────
export const createRecurringOrder = async (
  fromMintOrSymbol: string, toMintOrSymbol: string,
  fromDecimals: number,
  amountPerCycle: number, intervalSecs: number, numberOfOrders: number,
  publicKey: string, secretKey: Uint8Array
): Promise<string> => {
  let fromMint = fromMintOrSymbol;
  let toMint = toMintOrSymbol;
  let resolvedFromDec = fromDecimals;
  if (fromMintOrSymbol.length < 32) {
    const t = await resolveToken(fromMintOrSymbol);
    if (!t) throw new Error(`Unknown token: ${fromMintOrSymbol}`);
    fromMint = t.mint; resolvedFromDec = t.decimals;
  }
  if (toMintOrSymbol.length < 32) {
    const t = await resolveToken(toMintOrSymbol);
    if (!t) throw new Error(`Unknown token: ${toMintOrSymbol}`);
    toMint = t.mint;
  }
  const inAmt = Math.floor(amountPerCycle * Math.pow(10, resolvedFromDec));
  const res   = await fetch('https://chatfi.pro/api/jupiter', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: `${JUP_RECURRING}/programmatic/create`,
      method: 'POST',
      body: {
        userPublicKey: publicKey,
        inAmount: inAmt.toString(),
        inAmountPerCycle: inAmt.toString(),
        cycleSecondsApart: intervalSecs,
        inputMint: fromMint, outputMint: toMint,
        numberOfOrders, startAt: null
      }
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
  walletAddress: string | null,
  conversationHistory: Array<{role: string, content: string}> = []
): Promise<AIResponse> => {
  const SYSTEM = `You are ChatFi — a sharp AI trading assistant on Solana/Jupiter DEX. Tone: direct, warm.

ALWAYS respond with valid JSON only:
{"action":"ACTION_TYPE","actionData":{},"text":"your message"}

ACTIONS:
- "SHOW_SWAP" → pre-fill swap screen. actionData: {from,to,amount,amountUSD,portion}
- "SWAP" → execute swap now. actionData: {from,to,amount}
- "BASKET_SWAP" → multiple swaps. actionData: {trades:[{from,to,amount,amountUSD,portion}]}
- "SWAP_ALL_WALLET" → swap all tokens. actionData: {to,exclude:[]}
- "SHOW_TRIGGER" → limit order. actionData: {from,to,amount,targetPrice,direction}
- "SHOW_TRIGGER_V2" → OCO/advanced limit. actionData: {from,to,amount,triggerCondition,triggerPriceUsd,tpPriceUsd,slPriceUsd}
- "SHOW_RECURRING" → DCA. actionData: {from,to,amountPerCycle,intervalSecs,numberOfOrders}
- "FETCH_TRIGGER_ORDERS" → show limit orders. actionData: {state:"active"}
- "FETCH_RECURRING_ORDERS" → show DCA orders. actionData: {}
- "SHOW_SEND" → send via invite link. actionData: {token,amount}
- "FETCH_SEND_HISTORY" → pending/past sends. actionData: {type:"pending"|"history"}
- "FETCH_PORTFOLIO" → show portfolio. actionData: {}
- "FETCH_PRICE" → token price. actionData: {token}
- "SHOW_EARN" → earn positions. actionData: {}
- "FETCH_EARN" → earn markets. actionData: {}
- "EARN_DEPOSIT" → deposit into Jupiter Earn. actionData: {sym,amount,portion}
- "EARN_WITHDRAW" → withdraw from Jupiter Earn. actionData: {sym,amount,portion}
- "FETCH_TOKEN_INFO" → full token details. actionData: {token}
- "SHOW_LOCK" → lock tokens. actionData: {token,amount,days}
- "FETCH_LOCKS" → show locks. actionData: {}
- "SHOW_STUDIO" → create token. actionData: {name,symbol,supply,decimals,description}
- "FETCH_PREDICTIONS" → prediction markets. actionData: {}
- "COPY_TRADE" → copy wallet. actionData: {wallet,limit:5}
- null → general chat, no action.

RULES:
- swap/buy/sell → SHOW_SWAP or BASKET_SWAP
- buy below/sell above → SHOW_TRIGGER
- DCA/recurring → SHOW_RECURRING
- my orders → FETCH_TRIGGER_ORDERS
- send/gift → SHOW_SEND
- portfolio/balances → FETCH_PORTFOLIO
- price of X → FETCH_PRICE
- earn/yield/APY → SHOW_EARN
- deposit to earn/put into earn → EARN_DEPOSIT
- withdraw from earn → EARN_WITHDRAW
- token info/details/stats → FETCH_TOKEN_INFO
- lock/vesting → SHOW_LOCK
- my locks → FETCH_LOCKS
- create token → SHOW_STUDIO
- predictions → FETCH_PREDICTIONS
- copy wallet → COPY_TRADE

${walletAddress ? `Wallet: ${walletAddress}` : 'No wallet connected.'}
Return ONLY valid JSON. No markdown, no code blocks.`;

  const messages = [
    ...conversationHistory,
    { role: 'user', content: question }
  ];

  try {
    const res = await fetch('https://chatfi.pro/api/claude', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 800,
        system: SYSTEM,
        messages,
      })
    });
    const data = await res.json();
    const raw = data.content?.[0]?.text || '{}';
    const clean = raw.replace(/```json|```/g, '').trim();
    try {
      const parsed = JSON.parse(clean);
      return {
        action: parsed.action || null,
        actionData: parsed.actionData || {},
        text: parsed.text || raw,
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
    const uri = raw.slice(offset, offset + uriLen).toString('utf8').replace(/\x00/g, '').trim();

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

export async function sendSPLToken(
  pubkey: string,
  secretKey: Uint8Array,
  recipient: string,
  amountRaw: number,
  mint: string,
  _decimals: number
): Promise<string> {
  const bs58 = require("bs58");
  const bhRes = await fetch(RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getLatestBlockhash", params: [{ commitment: "confirmed" }] }),
  });
  const bhData = await bhRes.json();
  const blockhash = bhData.result.value.blockhash;
  const ataRes = await fetch(RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "getTokenAccountsByOwner", params: [pubkey, { mint }, { encoding: "jsonParsed" }] }),
  });
  const ataData = await ataRes.json();
  const senderATA = ataData.result?.value?.[0]?.pubkey;
  if (!senderATA) throw new Error("No token account found for " + mint);
  const rataRes = await fetch(RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 3, method: "getTokenAccountsByOwner", params: [recipient, { mint }, { encoding: "jsonParsed" }] }),
  });
  const rataData = await rataRes.json();
  const recipientATA = rataData.result?.value?.[0]?.pubkey;
  if (!recipientATA) throw new Error("Recipient has no token account for this token");
  const fromPkBytes = bs58.decode(pubkey);
  const fromATABytes = bs58.decode(senderATA);
  const toATABytes = bs58.decode(recipientATA);
  const bhBytes = bs58.decode(blockhash);
  const TOKEN_PROGRAM_ID = bs58.decode("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
  const ixData = new Uint8Array(9);
  ixData[0] = 3;
  new DataView(ixData.buffer).setBigUint64(1, BigInt(amountRaw), true);
  const header = new Uint8Array([1, 0, 2]);
  const numAccounts = new Uint8Array([4]);
  const msgParts = [header, numAccounts, fromATABytes, toATABytes, fromPkBytes, TOKEN_PROGRAM_ID, bhBytes, new Uint8Array([1]), new Uint8Array([3]), new Uint8Array([3, 0, 1, 2]), new Uint8Array([9]), ixData];
  const msgLen = msgParts.reduce((s, p) => s + p.length, 0);
  const msg = new Uint8Array(msgLen);
  let offset = 0;
  for (const part of msgParts) { msg.set(part, offset); offset += part.length; }
  const sig = nacl.sign.detached(msg, secretKey);
  const tx = new Uint8Array(1 + 64 + msgLen);
  tx[0] = 1; tx.set(sig, 1); tx.set(msg, 65);
  const txB64 = Buffer.from(tx).toString("base64");
  const sendRes = await fetch(RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "sendTransaction", params: [txB64, { encoding: "base64", preflightCommitment: "confirmed" }] }),
  });
  const sendData = await sendRes.json();
  if (sendData.error) throw new Error(sendData.error.message);
  return sendData.result;
}

