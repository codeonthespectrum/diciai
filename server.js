// DicoAI Backend Server
// Secure proxy for AI API calls with multi-provider support

require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Default API keys from environment
const DEFAULT_GEMINI_KEY = process.env.GEMINI_API_KEY;

// System prompt - optimized for speed and reliable JSON output
const SYSTEM_PROMPT = `You are a language learning assistant. Explain words from video subtitles.

ALWAYS respond with this exact JSON structure:
{"translation":"1-3 word translation","context":"1 sentence explanation","grammar":"grammatical class","formality":"formal|informal|coloquial|vulgar","alert":null}

Rules:
- translation: Best translation for THIS context (not dictionary definition)
- context: Brief explanation of meaning in this sentence
- grammar: In user's native language (e.g., "verbo", "substantivo", "adjetivo")
- formality: One of: formal, informal, coloquial, vulgar
- alert: Warning if profanity/offensive, otherwise null

Respond in the user's native language. Be concise.`;

// Rate limiting storage
const rateLimits = new Map();
const DAILY_LIMIT = 30; // Free tier limit

// Word cache
const wordCache = new Map();
const CACHE_MAX_SIZE = 1000;

// API Endpoints
const API_ENDPOINTS = {
    gemini: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent',
    openai: 'https://api.openai.com/v1/chat/completions',
    claude: 'https://api.anthropic.com/v1/messages'
};

// Generate cache key
function getCacheKey(word, sentence, subtitleLanguage, nativeLanguage) {
    const cleanWord = word.toLowerCase().trim();
    const cleanSentence = sentence.toLowerCase().trim();
    return `${cleanWord}|${cleanSentence}|${subtitleLanguage}|${nativeLanguage}`;
}

// Call Gemini API
async function callGemini(apiKey, userPrompt) {
    const requestBody = {
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
        generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 200,
            responseMimeType: 'application/json'
        },
        safetySettings: [
            { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' }
        ]
    };

    const response = await fetch(`${API_ENDPOINTS.gemini}?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error?.message || `Gemini API error: ${response.status}`);
    }

    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text;
}

// Call OpenAI API
async function callOpenAI(apiKey, userPrompt) {
    const requestBody = {
        model: 'gpt-4o-mini',
        messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: userPrompt }
        ],
        temperature: 0.2,
        max_tokens: 200,
        response_format: { type: 'json_object' }
    };

    const response = await fetch(API_ENDPOINTS.openai, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error?.message || `OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content;
}

// Call Claude API
async function callClaude(apiKey, userPrompt) {
    const requestBody = {
        model: 'claude-3-haiku-20240307',
        max_tokens: 200,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userPrompt }]
    };

    const response = await fetch(API_ENDPOINTS.claude, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error?.message || `Claude API error: ${response.status}`);
    }

    const data = await response.json();
    return data.content?.[0]?.text;
}

// Middleware
app.use(express.json());

// CORS configuration
const allowedOrigins = process.env.ALLOWED_ORIGINS || '*';
app.use(cors({
    origin: allowedOrigins === '*' ? true : allowedOrigins.split(','),
    methods: ['POST', 'GET'],
    allowedHeaders: ['Content-Type']
}));

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        cacheSize: wordCache.size,
        freeLimit: DAILY_LIMIT
    });
});

// Main query endpoint
app.post('/api/query', async (req, res) => {
    try {
        const {
            word,
            sentence,
            subtitleLanguage,
            nativeLanguage,
            userApiKey,    // User's own API key (optional)
            provider       // 'gemini', 'openai', or 'claude' (default: 'gemini')
        } = req.body;

        // Validate input
        if (!word || !sentence) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: word, sentence'
            });
        }

        const isUsingOwnKey = !!userApiKey;
        const selectedProvider = provider || 'gemini';
        const apiKey = isUsingOwnKey ? userApiKey : DEFAULT_GEMINI_KEY;

        // Validate API key exists
        if (!apiKey) {
            return res.status(500).json({
                success: false,
                error: isUsingOwnKey
                    ? 'Invalid API key provided'
                    : 'Free tier not available. Please add your own API key.'
            });
        }

        // Rate limiting only for free tier (not using own key)
        if (!isUsingOwnKey) {
            const clientIP = req.ip || req.connection.remoteAddress || 'unknown';
            const today = new Date().toDateString();
            const rateKey = `${clientIP}-${today}`;

            const currentCount = rateLimits.get(rateKey) || 0;
            if (currentCount >= DAILY_LIMIT) {
                return res.status(429).json({
                    success: false,
                    error: 'RATE_LIMIT_EXCEEDED',
                    message: 'Você atingiu o limite de 30 consultas grátis hoje. Volte amanhã ou adicione sua própria chave de API nas configurações!',
                    remaining: 0
                });
            }
        }

        // Check cache first
        const cacheKey = getCacheKey(word, sentence, subtitleLanguage || 'English', nativeLanguage || 'Brazilian Portuguese');
        const cachedResult = wordCache.get(cacheKey);

        if (cachedResult) {
            console.log(`Cache hit for: ${word}`);
            return res.json({
                success: true,
                data: cachedResult,
                cached: true
            });
        }

        // Build user prompt
        const userPrompt = `Word: "${word}"
Subtitle: "${sentence}"
Subtitle language: ${subtitleLanguage || 'English'}
User's native language: ${nativeLanguage || 'Brazilian Portuguese'}`;

        // Call appropriate API
        let text;
        try {
            if (selectedProvider === 'openai') {
                text = await callOpenAI(apiKey, userPrompt);
            } else if (selectedProvider === 'claude') {
                text = await callClaude(apiKey, userPrompt);
            } else {
                text = await callGemini(apiKey, userPrompt);
            }
        } catch (apiError) {
            console.error('API call error:', apiError.message);
            return res.status(500).json({
                success: false,
                error: apiError.message
            });
        }

        if (!text) {
            return res.status(500).json({
                success: false,
                error: 'Empty response from AI'
            });
        }

        // Parse JSON response
        let parsed;
        try {
            parsed = JSON.parse(text);
        } catch (parseError) {
            let fixedText = text
                .replace(/[\x00-\x1F\x7F]/g, '')
                .replace(/,\s*}/g, '}')
                .replace(/,\s*]/g, ']');

            try {
                parsed = JSON.parse(fixedText);
            } catch (e) {
                console.error('JSON parse error:', text);
                return res.status(500).json({
                    success: false,
                    error: 'Erro ao processar resposta da IA. Tente novamente.'
                });
            }
        }

        // Only increment rate limit for free tier on success
        if (!isUsingOwnKey) {
            const clientIP = req.ip || req.connection.remoteAddress || 'unknown';
            const today = new Date().toDateString();
            const rateKey = `${clientIP}-${today}`;
            const currentCount = rateLimits.get(rateKey) || 0;
            rateLimits.set(rateKey, currentCount + 1);

            // Clean old entries
            for (const [key] of rateLimits) {
                if (!key.endsWith(today)) {
                    rateLimits.delete(key);
                }
            }
        }

        // Save to cache
        if (wordCache.size >= CACHE_MAX_SIZE) {
            const keysToDelete = Array.from(wordCache.keys()).slice(0, 100);
            keysToDelete.forEach(k => wordCache.delete(k));
        }
        wordCache.set(cacheKey, parsed);

        // Calculate remaining for free tier
        let remaining = null;
        if (!isUsingOwnKey) {
            const clientIP = req.ip || req.connection.remoteAddress || 'unknown';
            const today = new Date().toDateString();
            const rateKey = `${clientIP}-${today}`;
            const count = rateLimits.get(rateKey) || 0;
            remaining = Math.max(0, DAILY_LIMIT - count);
        }

        res.json({
            success: true,
            data: parsed,
            cached: false,
            remaining: remaining,
            usingOwnKey: isUsingOwnKey
        });

    } catch (error) {
        console.error('Server error:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Internal server error'
        });
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`
╔═══════════════════════════════════════════╗
║         DicoAI Backend Server             ║
╠═══════════════════════════════════════════╣
║  Status: Running                          ║
║  Port: ${PORT.toString().padEnd(36)}║
║  Free Tier: ${DAILY_LIMIT} words/day                    ║
║  Providers: Gemini, OpenAI, Claude        ║
║  Cache: Enabled (max 1000 words)          ║
╚═══════════════════════════════════════════╝
  `);
});
