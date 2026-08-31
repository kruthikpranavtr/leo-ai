# J.A.R.V.I.S. // AI Voice & Text Assistant

An intelligent, full-stack voice and text AI assistant inspired by Iron Man's JARVIS (Stark Industries Mark VII protocol), powered by **Google Gemini API**, browser **Web Speech API**, **Node.js/Express**, and persistent **SQLite** memory storage.

---

## ⚡ Key Features

1. **Arc Reactor Holographic HUD**:
   - Multi-layer animated concentric HUD rings with rotating tick marks.
   - Dynamic real-time state visualization (`IDLE` -> `LISTENING` -> `THINKING` -> `SPEAKING` -> `ERROR`).
   - Sound-reactive audio equalizer spectrum and pulsing glowing waveforms.
2. **Dual Voice & Text Interaction**:
   - Wake-word style activation button ("Click to speak" mic icon & central Arc Reactor touch target).
   - Real-time Speech-to-Text via Web Speech API (`SpeechRecognition`).
   - Natural Text-to-Speech playback of AI responses with customizable voice, cadence, and pitch.
3. **Cognitive AI Brain (Google Gemini)**:
   - High-speed natural language processing powered by the official `@google/genai` SDK (`gemini-3.7-flash`).
   - Custom Stark Industries persona: articulate, witty, polite, and concise for voice narration.
4. **Persistent SQLite Conversation Memory**:
   - Zero-configuration file-based SQLite database (`jarvis.sqlite`).
   - Automatically stores every interaction with timestamps.
   - Multi-turn conversational memory: queries include recent context so JARVIS remembers previous exchanges.
5. **Local Fast-Path Command System**:
   - Instant local parsing for frequent commands (e.g., *"What is the time?"*, *"What is today's date?"*, *"Open YouTube"*, *"Open GitHub"*).
   - Instant web application launcher without AI latency.
6. **Customization & Protocol Settings**:
   - Audio output toggle (enable/disable speech synthesis).
   - Voice selector dropdown (lists all installed neural and system voices).
   - Speech rate & pitch fine-tuning sliders.
   - Web Audio API synthesizer sound effects.
   - Memory purge protocol.

---

## 📁 File Structure

```text
/jarvis-ai
├── public/
│   ├── index.html        # Futuristic HUD interface layout
│   ├── style.css         # Arc Reactor glowing animations & Stark dark theme
│   └── app.js            # Client engine (SpeechRecognition, TTS, State, API)
├── routes/
│   └── chat.js           # Express API router for Gemini AI & SQLite history
├── db.js                 # SQLite database engine (file-backed persistence)
├── server.js             # Express server entry point & static asset serving
├── .env.example          # Template for environment configuration
├── package.json          # Node dependencies and execution scripts
└── README.md             # Documentation and setup guide
```

---

## 🚀 Quick Start & Installation

### Step 1: Clone or Navigate to the Project
```bash
cd jarvis-ai
```

### Step 2: Install Dependencies
```bash
npm install
```

### Step 3: Configure Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Open `.env` and add your **Google Gemini API key**:
```env
GEMINI_API_KEY="AIzaSy..."
PORT=3000
```
> *You can obtain a free Gemini API key from [Google AI Studio](https://aistudio.google.com/).*

### Step 4: Start the Application Server
```bash
npm run dev
# or
node server.js
```

### Step 5: Open in Your Browser
Visit [http://localhost:3000](http://localhost:3000) in **Google Chrome** or **Microsoft Edge** (for full Web Speech API support). Allow microphone permissions when prompted, and tap the Arc Reactor or click **SPEAK** to start talking!

---

## 🛡️ API Endpoints

- `POST /api/chat`: Receives `{ message: string }`, incorporates recent SQLite context, queries Gemini API, stores turn to SQLite, and returns AI reply.
- `GET /api/history`: Retrieves the last 50 conversation messages from SQLite.
- `DELETE /api/history`: Purges all messages from the SQLite database.
- `GET /api/health`: Diagnostics endpoint confirming server and Gemini connectivity.
