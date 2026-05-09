export const askAI = async (question: string, walletAddress: string | null): Promise<string> => {
  try {
    const res = await fetch('https://chatfi.pro/api/claude', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 1000,
        system: 'You are ChatFi, an AI DeFi assistant on Solana. Help users with token swaps, prices, yields, and DeFi strategies. Be concise and friendly.',
        messages: [{ role: 'user', content: question }]
      })
    });
    const data = await res.json();
    return data.content?.[0]?.text || 'Sorry, could not get a response.';
  } catch {
    return 'Network error. Please try again.';
  }
};
