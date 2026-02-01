# Privacy Policy for DiciAI

**Last Updated:** February 1, 2026

## 1. Introduction
DiciAI ("we", "our", or "us") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, and safeguard your information when you use our Chrome Extension.

## 2. Information We Collect

### 2.1. User Content
When you interact with the extension (e.g., clicking on a word in a subtitle), the following data is processed:
- The clicked word
- The sentence containing the word
- The subtitle language
- Your native language setting

This data is sent to our backend and then to the selected AI provider (Google Gemini, OpenAI, or Anthropic) solely for the purpose of generating the translation and explanation.

### 2.2. API Keys
If you choose to provide your own API Key (Gemini, OpenAI, or Claude), it is stored **locally** on your device using Chrome's Storage API (`chrome.storage.local`). We do not collect, store on our servers, or share your personal API keys.

### 2.3. Usage Data
We track the number of daily queries for the purpose of enforcing the free tier limit (30 queries/day). This is done using an hashed IP identifier.

## 3. How We Use Your Information
- **To provide the service:** Translating and explaining words in context.
- **To limit abuse:** Enforcing daily free limits.
- **To improve the extension:** Analyzing usage patterns (anonymously).

## 4. Data Sharing
We do not sell your personal data. Data is shared only with:
- **AI Providers (Google, OpenAI, Anthropic):** Only the text content (word/sentence) is sent to generate the explanation. No personal identifiers are sent.

## 5. Security
We implement reasonable security measures to protect your information. Communication between the extension and our backend is encrypted via HTTPS.

## 6. Your Rights
You can delete your stored data (API keys, saved words) at any time by uninstalling the extension or clearing the extension data.

## 7. Contact
If you have any questions about this Privacy Policy, please contact us at: https://github.com/codeonthespectrum
