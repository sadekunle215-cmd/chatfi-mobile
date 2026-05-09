const TOKENS: Record<string, string> = {
  SOL: 'So11111111111111111111111111111111111111112',
  USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  USDT: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
  JUP: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN',
  BONK: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
  WIF: 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm',
};

const DECIMALS: Record<string, number> = {
  SOL: 9, USDC: 6, USDT: 6, JUP: 6, BONK: 5, WIF: 6,
};

const parseSwapIntent = (text: string) => {
  const lower = text.toLowerCase();
  const m = lower.match(/swap\s+([\d.]+)\s*([a-z]+)\s+(?:to|for)\s+([a-z]+)/);
  if (m) return { amount: parseFloat(m[1]), from: m[2].toUpperCase(), to: m[3].toUpperCase() };
  const m2 = lower.match(/([\d.]+)\s*([a-z]+)\s+(?:to|for|into)\s+([a-z]+)/);
  if (m2 && (lower.includes('convert') || lower.includes('exchange'))) return { amount: parseFloat(m2[1]), from: m2[2].toUpperCase(), to: m2[3].toUpperCase() };
  return null;
};

const parsePriceIntent = (text: string) => {
  const lower = text.toLowerCase();
  for (const token of Object.keys(TOKENS)) {
    if (lower.includes(token.toLowerCase()) && (lower.includes('price') || lower.includes('worth') || lower.includes('cost') || lower.includes('value'))) {
      return token;
    }
  }
  return null;
};

export const getJupiterQuote = async (from: string, to: string, amount: number) => {
  const inputMint = TOKENS[from];
  const outputMint = TOKENS[to];
  if (!inputMint || !outputMint) return null;
  const amountSmallest = Math.floor(amount * Math.pow(10, DECIMALS[from] || 6));
  const url = `https://quote-api.jup.ag/v6/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amountSmallest}&slippageBps=50`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.error) return null;
  const outAmount = parseInt(data.outAmount) / Math.pow(10, DECIMALS[to] || 6);
  const priceImpact = parseFloat(data.priceImpactPct || '0').toFixed(4);
  const route = data.routePlan?.map((r: any) => r.swapInfo?.label).filter(Boolean).join(' → ') || 'Direct';
  return { outAmount, priceImpact, route, raw: data };
};

const getTokenPrice = async (token: string): Promise<string> => {
  try {
    const mint = TOKENS[token];
    if (!mint) return 'Unknown token';
    const res = await fetch(`https://price.jup.ag/v6/price?ids=${mint}`);
    const data = await res.json();
    const price = data.data?.[mint]?.price;
    if (price) return `${token} is currently $${parseFloat(price).toFixed(4)} USD`;
    return `Could not fetch ${token} price right now.`;
  } catch {
    return `Could not fetch ${token} price right now.`;
  }
};

export const askAI = async (question: string, walletAddress: string | null): Promise<string> => {
  const swapIntent = parseSwapIntent(question);
  if (swapIntent && TOKENS[swapIntent.from] && TOKENS[swapIntent.to]) {
    try {
      const quote = await getJupiterQuote(swapIntent.from, swapIntent.to, swapIntent.amount);
      if (quote) {
        return `Jupiter Quote\n\nYou pay: ${swapIntent.amount} ${swapIntent.from}\nYou receive: ${quote.outAmount.toFixed(6)} ${swapIntent.to}\nPrice impact: ${quote.priceImpact}%\nRoute: ${quote.route}\n\n${walletAddress ? 'Go to the Swap tab to execute this trade.' : 'Create a wallet first to execute swaps.'}`;
      }
    } catch {}
  }

  const priceToken = parsePriceIntent(question);
  if (priceToken) {
    return await getTokenPrice(priceToken);
  }

  try {
    const res = await fetch('https://chatfi.pro/api/claude', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 1000,
        system: 'You are ChatFi, an AI DeFi assistant on Solana. You can fetch live Jupiter swap quotes and token prices. Respond in plain conversational text only. No JSON, no markdown, no code blocks. Be concise and friendly.' + (walletAddress ? ' User wallet: ' + walletAddress : ''),
        messages: [{ role: 'user', content: question }]
      })
    });
    const data = await res.json();
    return data.content?.[0]?.text || 'Sorry, could not get a response.';
  } catch {
    return 'Network error. Please try again.';
  }
};

export const getTokenBalances = async (publicKey: string): Promise<Array<{symbol: string, mint: string, amount: number, usdValue?: number}>> => {
  try {
    const RPC_URL = 'https://api.mainnet-beta.solana.com';

    // Get SOL balance
    const solRes = await fetch(RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 1,
        method: 'getBalance',
        params: [publicKey]
      })
    });
    const solData = await solRes.json();
    const solAmount = (solData.result?.value || 0) / 1e9;

    // Get SPL token accounts
    const tokenRes = await fetch(RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 2,
        method: 'getTokenAccountsByOwner',
        params: [
          publicKey,
          { programId: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' },
          { encoding: 'jsonParsed' }
        ]
      })
    });
    const tokenData = await tokenRes.json();

    const balances: Array<{symbol: string, mint: string, amount: number}> = [
      { symbol: 'SOL', mint: TOKENS.SOL, amount: solAmount }
    ];

    // Map known mints to symbols
    const mintToSymbol: Record<string, string> = {};
    for (const [sym, mint] of Object.entries(TOKENS)) {
      mintToSymbol[mint] = sym;
    }

    for (const account of (tokenData.result?.value || [])) {
      const info = account.account.data.parsed.info;
      const mint = info.mint;
      const amount = info.tokenAmount.uiAmount;
      if (amount > 0 && mintToSymbol[mint]) {
        balances.push({ symbol: mintToSymbol[mint], mint, amount });
      }
    }

    return balances;
  } catch {
    return [];
  }
};
