// Vercel Serverless Function - Health Check

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');

    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        freeLimit: 30,
        providers: ['gemini', 'openai', 'claude']
    });
}
