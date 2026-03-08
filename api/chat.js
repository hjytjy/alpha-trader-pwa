// Vercel serverless function — proxies Ollama Cloud from server side
// Bypasses CORS since this runs on Vercel server, not the browser

const MODELS = ['qwen3.5:35b','qwen3.5:27b','gemma3:27b','qwen3.5:9b'];
const API_KEY = 'f68ecd88ae114678ad6a8c0898360c02.n7kWW3t17BpgEfnmwj4Z7Ews';

export default async function handler(req, res) {
  // Allow browser requests from any origin
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  const { messages } = req.body;
  if (!messages) { res.status(400).json({ error: 'messages required' }); return; }

  let lastError = '';
  for (const model of MODELS) {
    try {
      const response = await fetch('https://ollama.com/api/chat', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ model, messages, stream: false }),
        signal: AbortSignal.timeout(55000)
      });

      const data = await response.json();
      if (data.message?.content) {
        res.status(200).json({ content: data.message.content, model });
        return;
      }
      if (data.choices?.[0]?.message?.content) {
        res.status(200).json({ content: data.choices[0].message.content, model });
        return;
      }
      if (data.error) throw new Error(data.error);
      throw new Error('No content in response');
    } catch(e) {
      lastError = e.message;
      if (e.message.includes('401') || e.message.includes('403')) {
        res.status(401).json({ error: 'API key rejected' });
        return;
      }
      continue;
    }
  }
  res.status(500).json({ error: 'All models failed: ' + lastError });
}
