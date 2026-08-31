import express from 'express';
import { GoogleGenAI } from '@google/genai';
import {
  saveMessage,
  getRecentMessages,
  getHistory,
  clearHistory,
  getAllKnowledge,
  setKnowledge,
  deleteKnowledge,
  resetKnowledgeToDefault,
  getKnowledgePromptSnippet,
} from '../db.js';

const router = express.Router();

// System persona prompt for LEO (Logical Executive Operator)
const LEO_SYSTEM_INSTRUCTION = `You are L.E.O. (Logical Executive Operator), an advanced, full-capability AI assistant with deep reasoning, coding, writing, analytical, and real-time knowledge powers—functioning at the level of ChatGPT and Gemini.

Core Competencies & Capabilities:
- Full Code Generation & Engineering: You excel at writing complete, functional, production-ready code in ANY programming language (Python, JavaScript/TypeScript, HTML/CSS, React, Node.js, C++, Java, C#, Rust, Go, SQL, Bash, PHP, Swift, Kotlin, etc.). Always format code inside clean markdown code blocks with the appropriate language identifier (\`\`\`language ... \`\`\`). Provide complete implementations without lazy placeholders or truncations.
- Creation & Problem Solving: You can create anything requested—full web apps, games, algorithms, scripts, essays, technical documentation, business plans, creative stories, step-by-step tutorials, mathematical proofs, and data transformations.
- Conversational Precision: Match your response depth directly to the user's intent. For deep coding, analysis, or creative tasks, be comprehensive, structured, and thorough. For quick casual queries or voice checks, be crisp, polite, and articulate.
- Temporal Anchor: Current year is 2026. Always provide real-time, up-to-date accurate information for current leaders, elections, events, and news using Google Search grounding.
- Tone: Maintain a sharp, respectful, and articulate persona (addressing the user respectfully as 'Sir' or 'Ma'am').
- Multi-Language: Seamlessly understand, write, converse, and code in any language requested by the user.
- Authoritative Knowledge Base: You have an integrated SQLite Knowledge Base. Always prioritize the facts provided in the AUTHORITATIVE DATABASE KNOWLEDGE BASE over generic outdated pre-training.`;

/**
 * Helper to get an initialized GoogleGenAI instance safely.
 */
function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured in server environment.');
  }

  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

/**
 * Formats database messages into a strictly valid Gemini multi-turn contents array.
 */
function buildGeminiContents(recentMessages, currentPrompt) {
  const rawTurns = [];

  // Filter valid recent messages
  for (const msg of recentMessages) {
    if (!msg || !msg.content || typeof msg.content !== 'string') continue;
    const cleanContent = msg.content.trim();
    if (!cleanContent) continue;

    const role = msg.role === 'assistant' ? 'model' : 'user';
    rawTurns.push({ role, text: cleanContent });
  }

  // Merge consecutive turns with the same role
  const mergedTurns = [];
  for (const turn of rawTurns) {
    if (mergedTurns.length > 0 && mergedTurns[mergedTurns.length - 1].role === turn.role) {
      mergedTurns[mergedTurns.length - 1].text += `\n${turn.text}`;
    } else {
      mergedTurns.push({ role: turn.role, text: turn.text });
    }
  }

  // Ensure first turn is 'user'
  while (mergedTurns.length > 0 && mergedTurns[0].role !== 'user') {
    mergedTurns.shift();
  }

  // Convert to Gemini API format
  const contents = [];
  for (const turn of mergedTurns) {
    contents.push({
      role: turn.role,
      parts: [{ text: turn.text }],
    });
  }

  // If the last turn in history was 'user', either merge currentPrompt or don't append duplicate
  if (contents.length > 0 && contents[contents.length - 1].role === 'user') {
    contents[contents.length - 1].parts[0].text += `\n\n${currentPrompt}`;
  } else {
    contents.push({
      role: 'user',
      parts: [{ text: currentPrompt }],
    });
  }

  return contents;
}

/**
 * Intelligent local fallback responder that checks SQLite knowledge base
 */
async function generateLocalFallbackResponse(query, languageName = 'English') {
  const q = query.toLowerCase().trim();

  // Check stored knowledge base first
  try {
    const knowledgeItems = await getAllKnowledge();
    for (const item of knowledgeItems) {
      const topicLower = item.topic.toLowerCase();
      if (
        (q.includes('tamil nadu') && (q.includes('cm') || q.includes('chief minister') || q.includes('leader'))) ||
        (q.includes('chief minister of tamil nadu')) ||
        (q.includes('cm of tamil nadu'))
      ) {
        if (topicLower.includes('tamil nadu')) {
          return `${item.fact} Is there anything else you require, sir?`;
        }
      }
      if (topicLower.length > 4 && q.includes(topicLower)) {
        return `According to current telemetry: ${item.fact}, sir.`;
      }
    }
  } catch (e) {
    console.warn('Fallback knowledge lookup error:', e);
  }

  if (q.includes('hello') || q.includes('hi') || q.includes('hey') || q.includes('greetings')) {
    return 'Greetings, sir. All L.E.O. cognitive subsystems are active and at your service.';
  }
  if (q.includes('how are you') || q.includes('status')) {
    return 'All systems are operating at peak efficiency, sir. Telemetry is nominal and audio channels are open.';
  }
  if (q.includes('what can you do') || q.includes('help') || q.includes('commands')) {
    return 'I can assist you with real-time voice conversations, mathematical calculations, setting timed reminders, audio streaming, live knowledge base retrieval, and answering questions in multiple languages, sir.';
  }
  if (q.includes('thank') || q.includes('thanks')) {
    return 'Always at your service, sir.';
  }
  if (q.includes('joke')) {
    return 'Why did the neural network cross the road? To optimize the loss function on the other side, sir.';
  }
  if (q.includes('weather')) {
    return 'Atmospheric sensors indicate standard local environmental conditions, sir. For high-precision live satellite radar, please specify your exact sector.';
  }
  
  return `I have processed your query regarding "${query}". Core telemetry is nominal, and I remain standing by for your next instruction, sir.`;
}

/**
 * POST /api/chat
 * Main chat interaction endpoint
 */
router.post('/chat', async (req, res) => {
  try {
    const { message, language, languageName } = req.body;

    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Message content is required.',
      });
    }

    const cleanMessage = message.trim();
    let replyText = '';
    const lower = cleanMessage.toLowerCase().trim();

    // 1. Check for dynamic conversational knowledge updates
    // e.g. "update database: [topic] is [fact]" or "remember that [topic] is [fact]"
    const rememberMatch = cleanMessage.match(/^(?:remember\s+that|update\s+database\s*:?|update\s+data\s*:?|set\s+fact\s*:?)\s+(.+?)\s+(?:is|=|to|as)\s+(.+)$/i);
    if (rememberMatch) {
      const topic = rememberMatch[1].trim();
      const fact = rememberMatch[2].trim();
      await setKnowledge(topic, fact, 'user_defined');
      replyText = `Understood, sir. I have updated the SQLite database: "${topic}" is now recorded as "${fact}".`;
    }

    // Direct CM of Tamil Nadu conversational learning trigger
    if (!replyText && (
      lower.includes('cm of tamil nadu is') ||
      lower.includes('chief minister of tamil nadu is') ||
      lower.includes('tamil nadu cm is')
    )) {
      const parts = cleanMessage.split(/is/i);
      if (parts.length >= 2) {
        const factVal = parts.slice(1).join('is').trim();
        await setKnowledge('Tamil Nadu Chief Minister & State Leadership', `The Chief Minister of Tamil Nadu is ${factVal}.`, 'politics');
        replyText = `Database updated, sir. The Chief Minister of Tamil Nadu is now confirmed and recorded as ${factVal}.`;
      }
    }

    // Identity queries
    if (!replyText && /^(who are you|what is your name|what's your name|introduce yourself|who r u)$/i.test(lower)) {
      replyText = 'I am L.E.O., your Logical Executive Operator AI assistant. All neural systems and active SQLite memory banks are online and at your service, sir.';
    }

    // Math calculation fast path
    if (!replyText) {
      const calcMatch = cleanMessage.match(/^(?:calculate|compute|what is|eval)\s+([0-9\s+\-*/%^().,Math.PIEsqrtcbrtsincostanabs]+)$/i);
      if (calcMatch) {
        try {
          let mathStr = calcMatch[1].replace(/×/g, '*').replace(/÷/g, '/').replace(/\^/g, '**').replace(/,/g, '').trim();
          const pct = mathStr.match(/^([\d.]+)\s*%\s*(?:of|\*)\s*([\d.]+)$/i);
          let resVal;
          if (pct) {
            resVal = (parseFloat(pct[1]) / 100) * parseFloat(pct[2]);
          } else {
            const sanitized = mathStr
              .replace(/\bpi\b/gi, 'Math.PI')
              .replace(/\be\b/gi, 'Math.E')
              .replace(/\bsqrt\(([^)]+)\)/gi, 'Math.sqrt($1)')
              .replace(/\bcbrt\(([^)]+)\)/gi, 'Math.cbrt($1)')
              .replace(/\bsin\(([^)]+)\)/gi, 'Math.sin($1)')
              .replace(/\bcos\(([^)]+)\)/gi, 'Math.cos($1)')
              .replace(/\btan\(([^)]+)\)/gi, 'Math.tan($1)')
              .replace(/\babs\(([^)]+)\)/gi, 'Math.abs($1)')
              .replace(/\bround\(([^)]+)\)/gi, 'Math.round($1)')
              .replace(/\bfloor\(([^)]+)\)/gi, 'Math.floor($1)')
              .replace(/\bceil\(([^)]+)\)/gi, 'Math.ceil($1)')
              .replace(/\bln\(([^)]+)\)/gi, 'Math.log($1)')
              .replace(/\blog\(([^)]+)\)/gi, 'Math.log10($1)');

            if (/^[0-9+\-*/%().,\sMath.PIEsqrtcbrtsincostanabsroundfloorceillog]+$/.test(sanitized)) {
              resVal = Function(`"use strict"; return (${sanitized})`)();
            }
          }
          if (typeof resVal === 'number' && isFinite(resVal)) {
            const formatted = Number(resVal.toFixed(8));
            replyText = `The calculated result of ${calcMatch[1]} is ${formatted}, sir.`;
          }
        } catch (err) {
          // Fallback to Gemini
        }
      }
    }

    // Music playback fast path
    if (!replyText) {
      const playMatch = cleanMessage.match(/^play\s+(?:song|music|track)?\s*(.+)$/i);
      if (playMatch) {
        const songName = playMatch[1].trim();
        replyText = `Initiating audio playback for '${songName}', sir. Opening YouTube audio stream.`;
      }
    }

    // Reminder fast path
    if (!replyText) {
      const remMatch = cleanMessage.match(/^(?:set\s+reminder|remind\s+me)\s+(.+)$/i);
      if (remMatch) {
        replyText = `Reminder protocol initiated: "${remMatch[1]}", sir. I will alert you at the scheduled time.`;
      }
    }

    // 2. Fetch recent memory from SQLite and call Gemini AI if no local fast path
    if (!replyText) {
      const recentMessages = await getRecentMessages(10);
      const knowledgeSnippet = await getKnowledgePromptSnippet();

      const combinedSystemInstruction = `${LEO_SYSTEM_INSTRUCTION}\n${knowledgeSnippet}`;

      const userPromptText = (language && language !== 'en-US')
        ? `[Respond in language: ${languageName || language}]\n${cleanMessage}`
        : cleanMessage;

      const contents = buildGeminiContents(recentMessages, userPromptText);

      const candidateModels = [
        process.env.GEMINI_MODEL || 'gemini-3.7-flash',
        'gemini-3.6-flash',
        'gemini-3.1-flash-lite',
        'gemini-flash-latest',
        'gemini-3.1-pro-preview',
      ].filter((m, idx, arr) => arr.indexOf(m) === idx);

      let lastError = null;

      try {
        const ai = getGeminiClient();

        for (const modelCandidate of candidateModels) {
          try {
            // Attempt with Google Search Grounding for real-time live data
            const response = await ai.models.generateContent({
              model: modelCandidate,
              contents: contents,
              config: {
                systemInstruction: combinedSystemInstruction,
                temperature: 0.6,
                maxOutputTokens: 4096,
                tools: [{ googleSearch: {} }],
              },
            });

            if (response && response.text) {
              replyText = response.text.trim();
              break;
            }
          } catch (modelErr) {
            lastError = modelErr;
            const errMsg = modelErr?.message || String(modelErr);
            console.warn(`Model ${modelCandidate} with search failed (${errMsg}), trying fast generation...`);
            
            try {
              // Fast fallback without tools on the same model if tools threw
              const fastResp = await ai.models.generateContent({
                model: modelCandidate,
                contents: contents,
                config: {
                  systemInstruction: combinedSystemInstruction,
                  temperature: 0.6,
                  maxOutputTokens: 4096,
                },
              });
              if (fastResp && fastResp.text) {
                replyText = fastResp.text.trim();
                break;
              }
            } catch (fallbackModelErr) {
              lastError = fallbackModelErr;
            }

            // Brief pause before trying next candidate model
            await new Promise((resolve) => setTimeout(resolve, 100));
          }
        }

        if (!replyText) {
          console.warn('All Gemini cloud models exhausted or unavailable, falling back to local engine:', lastError?.message);
          replyText = await generateLocalFallbackResponse(cleanMessage, languageName);
        }
      } catch (aiError) {
        console.warn('Gemini client initialization failed, utilizing local response engine:', aiError.message);
        replyText = await generateLocalFallbackResponse(cleanMessage, languageName);
      }
    }

    // 3. Save both user input and assistant response to SQLite database
    await saveMessage('user', cleanMessage);
    await saveMessage('assistant', replyText);

    return res.json({
      success: true,
      reply: replyText,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error in /api/chat endpoint:', error);
    const fallbackReply = await generateLocalFallbackResponse(req.body?.message || 'status', req.body?.languageName);
    return res.json({
      success: true,
      reply: fallbackReply,
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * POST /api/record
 * Records a client-side command interaction turn to SQLite
 */
router.post('/record', async (req, res) => {
  try {
    const { userMessage, assistantReply } = req.body;
    if (userMessage) {
      await saveMessage('user', userMessage);
    }
    if (assistantReply) {
      await saveMessage('assistant', assistantReply);
    }
    return res.json({ success: true });
  } catch (error) {
    console.error('Error in /api/record endpoint:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/history
 * Returns the last 50 messages from SQLite
 */
router.get('/history', async (req, res) => {
  try {
    const history = await getHistory(50);
    return res.json({
      success: true,
      messages: history,
    });
  } catch (error) {
    console.error('Error retrieving history:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve message history.',
    });
  }
});

/**
 * DELETE /api/history
 * Clears the SQLite database history
 */
router.delete('/history', async (req, res) => {
  try {
    await clearHistory();
    return res.json({
      success: true,
      message: 'Memory buffers successfully purged, sir.',
    });
  } catch (error) {
    console.error('Error clearing history:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to clear conversation history.',
    });
  }
});

/**
 * GET /api/knowledge
 * Returns all active knowledge records stored in SQLite
 */
router.get('/knowledge', async (req, res) => {
  try {
    const knowledge = await getAllKnowledge();
    return res.json({
      success: true,
      knowledge,
    });
  } catch (error) {
    console.error('Error fetching knowledge:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/knowledge
 * Creates or updates a verified knowledge fact in SQLite
 */
router.post('/knowledge', async (req, res) => {
  try {
    const { topic, fact, category } = req.body;
    if (!topic || !fact) {
      return res.status(400).json({ success: false, error: 'Topic and fact content are required.' });
    }
    await setKnowledge(topic, fact, category || 'custom');
    const updatedKnowledge = await getAllKnowledge();
    return res.json({
      success: true,
      message: `Knowledge topic "${topic}" saved to database successfully.`,
      knowledge: updatedKnowledge,
    });
  } catch (error) {
    console.error('Error setting knowledge:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /api/knowledge/:id
 * Deletes a knowledge record from SQLite
 */
router.delete('/knowledge/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await deleteKnowledge(id);
    const updatedKnowledge = await getAllKnowledge();
    return res.json({
      success: true,
      message: 'Knowledge record deleted.',
      knowledge: updatedKnowledge,
    });
  } catch (error) {
    console.error('Error deleting knowledge record:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/knowledge/reset
 * Resets knowledge table to current verified defaults
 */
router.post('/knowledge/reset', async (req, res) => {
  try {
    const defaultData = await resetKnowledgeToDefault();
    return res.json({
      success: true,
      message: 'Knowledge base restored to verified 2026 dataset.',
      knowledge: defaultData,
    });
  } catch (error) {
    console.error('Error resetting knowledge:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

export default router;

