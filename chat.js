// Vercel serverless function — proxies Ollama Cloud from server side
// Bypasses CORS since this runs on Vercel server, not the browser

const MODELS = ['qwen3-vl:32b','qwen3.5:35b','qwen3.5:27b','gemma3:27b','qwen3.5:9b'];
const API_KEY = '597664991279490caaa58863e386420c.S6gtyZCvSEVBrA62tgYjHUJv';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  const { messages, images } = req.body;
  if (!messages) { res.status(400).json({ error: 'messages required' }); return; }

  // If images attached, force vision model first
  const modelList = images && images.length > 0
    ? ['qwen3-vl:32b', ...MODELS.filter(m => m !== 'qwen3-vl:32b')]
    : MODELS.filter(m => m !== 'qwen3-vl:32b'); // skip vision model for text-only

  // Build messages with images embedded if present
  let finalMessages = messages;
  if (images && images.length > 0) {
    // Find last user message and add images to it
    finalMessages = [...messages];
    for (let i = finalMessages.length - 1; i >= 0; i--) {
      if (finalMessages[i].role === 'user') {
        const content = [];
        // Add text first if present
        if (typeof finalMessages[i].content === 'string' && finalMessages[i].content) {
          content.push({ type: 'text', text: finalMessages[i].content });
        }
        // Add each image
        images.forEach(dataUrl => {
          const base64 = dataUrl.replace(/^data:image\/[a-z]+;base64,/, '');
          content.push({ type: 'image_url', image_url: { url: dataUrl } });
        });
        finalMessages[i] = { ...finalMessages[i], content };
        break;
      }
    }
  }

  let lastError = '';
  for (const model of modelList) {
    try {
      const response = await fetch('https://ollama.com/api/chat', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ model, messages: finalMessages, stream: false }),
        signal: AbortSignal.timeout(55000)
      });

      const data = await response.json();
      if (data.message?.content) { res.status(200).json({ content: data.message.content, model }); return; }
      if (data.choices?.[0]?.message?.content) { res.status(200).json({ content: data.choices[0].message.content, model }); return; }
      if (data.error) throw new Error(data.error);
      throw new Error('No content in response');
    } catch(e) {
      lastError = e.message;
      if (e.message.includes('401') || e.message.includes('403')) {
        res.status(401).json({ error: 'API key rejected' }); return;
      }
      continue;
    }
  }
  res.status(500).json({ error: 'All models failed: ' + lastError });
}
