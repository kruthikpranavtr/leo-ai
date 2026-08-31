/**
 * ============================================================================
 * L.E.O. // AI VOICE & TEXT ASSISTANT CLIENT ENGINE
 * Logical Executive Operator (Mark VIII)
 * ============================================================================
 */

(function () {
  'use strict';

  const LANGUAGE_MAP = {
    'en-US': 'English (United States)',
    'es-ES': 'Español (Spanish)',
    'fr-FR': 'Français (French)',
    'de-DE': 'Deutsch (German)',
    'it-IT': 'Italiano (Italian)',
    'pt-BR': 'Português (Portuguese)',
    'hi-IN': 'हिन्दी (Hindi)',
    'ta-IN': 'தமிழ் (Tamil)',
    'te-IN': 'తెలుగు (Telugu)',
    'ja-JP': '日本語 (Japanese)',
    'zh-CN': '中文 (Simplified Chinese)',
    'ar-SA': 'العربية (Arabic)',
    'ru-RU': 'Русский (Russian)',
    'ko-KR': '한국어 (Korean)',
  };

  // --- APPLICATION STATE ---
  const state = {
    currentStatus: 'idle', // 'idle' | 'listening' | 'thinking' | 'speaking' | 'error'
    isRecording: false,
    selectedLanguage: localStorage.getItem('leo_language') || 'en-US',
    selectedTheme: localStorage.getItem('leo_theme') || 'amber',
    spherePreset: localStorage.getItem('leo_sphere_preset') || 'chakra',
    speechOutputEnabled: true,
    selectedVoiceURI: null,
    speechRate: 1.15,
    speechPitch: 1.0,
    soundEffectsEnabled: true,
    voices: [],
    audioCtx: null,
    reminders: [], // In-memory scheduled reminders
    knowledgeRecords: [], // Cached SQLite knowledge facts
  };

  // --- DOM ELEMENTS ---
  const DOM = {
    appContainer: document.getElementById('appContainer'),
    arcSection: document.getElementById('arcSection'),
    hudStatusBadge: document.getElementById('hudStatusBadge'),
    statusText: document.getElementById('statusText'),
    reactorWrapper: document.getElementById('reactorWrapper'),
    energySphereCanvas: document.getElementById('energySphereCanvas'),
    sphereGlowAura: document.getElementById('sphereGlowAura'),
    spherePaletteBar: document.getElementById('spherePaletteBar'),
    selectSpherePresetModal: document.getElementById('selectSpherePresetModal'),
    hudClock: document.getElementById('hudClock'),
    hudLanguageSelect: document.getElementById('hudLanguageSelect'),
    hudThemeSelect: document.getElementById('hudThemeSelect'),
    selectLanguageModal: document.getElementById('selectLanguageModal'),
    selectThemeModal: document.getElementById('selectThemeModal'),
    audioSpectrum: document.getElementById('audioSpectrum'),
    specBars: document.querySelectorAll('.spec-bar'),
    readoutContent: document.getElementById('readoutContent'),
    readoutIndicator: document.getElementById('readoutIndicator'),
    chatPanel: document.getElementById('chatPanel'),
    chatMessages: document.getElementById('chatMessages'),
    btnToggleChat: document.getElementById('btnToggleChat'),
    btnCloseChat: document.getElementById('btnCloseChat'),
    btnClearChat: document.getElementById('btnClearChat'),
    chatForm: document.getElementById('chatForm'),
    textInput: document.getElementById('textInput'),
    btnSend: document.getElementById('btnSend'),
    btnMic: document.getElementById('btnMic'),
    micBtnLabel: document.getElementById('micBtnLabel'),
    btnClearInput: document.getElementById('btnClearInput'),
    settingsModal: document.getElementById('settingsModal'),
    btnOpenSettings: document.getElementById('btnOpenSettings'),
    btnCloseSettings: document.getElementById('btnCloseSettings'),
    btnSaveSettings: document.getElementById('btnSaveSettings'),
    toggleSpeechOutput: document.getElementById('toggleSpeechOutput'),
    selectVoice: document.getElementById('selectVoice'),
    rangeRate: document.getElementById('rangeRate'),
    rateValue: document.getElementById('rateValue'),
    rangePitch: document.getElementById('rangePitch'),
    pitchValue: document.getElementById('pitchValue'),
    toggleSfx: document.getElementById('toggleSfx'),
    btnTestVoice: document.getElementById('btnTestVoice'),
    btnClearDbHistory: document.getElementById('btnClearDbHistory'),
    hudToast: document.getElementById('hudToast'),
    toastMsg: document.getElementById('toastMsg'),

    // Database & Knowledge Core DOM Elements
    databaseModal: document.getElementById('databaseModal'),
    btnOpenDatabase: document.getElementById('btnOpenDatabase'),
    btnCloseDatabase: document.getElementById('btnCloseDatabase'),
    btnCloseDbBottom: document.getElementById('btnCloseDbBottom'),
    chipOpenDbModal: document.getElementById('chipOpenDbModal'),
    knowledgeCountBadge: document.getElementById('knowledgeCountBadge'),
    knowledgeForm: document.getElementById('knowledgeForm'),
    inputKnowledgeTopic: document.getElementById('inputKnowledgeTopic'),
    selectKnowledgeCat: document.getElementById('selectKnowledgeCat'),
    inputKnowledgeFact: document.getElementById('inputKnowledgeFact'),
    btnResetKnowledgeForm: document.getElementById('btnResetKnowledgeForm'),
    knowledgeCardsContainer: document.getElementById('knowledgeCardsContainer'),
    recordCountBadge: document.getElementById('recordCountBadge'),
    btnResetDefaultDataset: document.getElementById('btnResetDefaultDataset'),
    btnClearMessagesOnly: document.getElementById('btnClearMessagesOnly'),
  };

  // --- THEME MANAGEMENT ---
  function applyTheme(themeName) {
    if (!themeName) themeName = 'amber';
    state.selectedTheme = themeName;
    document.documentElement.setAttribute('data-theme', themeName);
    document.body.setAttribute('data-theme', themeName);
    document.body.className = `theme-dark theme-${themeName}`;

    if (DOM.hudThemeSelect) DOM.hudThemeSelect.value = themeName;
    if (DOM.selectThemeModal) DOM.selectThemeModal.value = themeName;

    try {
      localStorage.setItem('leo_theme', themeName);
    } catch (e) {
      console.warn('Could not save theme:', e);
    }
  }

  // --- LANGUAGE MANAGEMENT ---
  function applyLanguage(langCode) {
    if (!langCode || !LANGUAGE_MAP[langCode]) langCode = 'en-US';
    state.selectedLanguage = langCode;

    if (recognition) {
      recognition.lang = langCode;
    }

    if (DOM.hudLanguageSelect) DOM.hudLanguageSelect.value = langCode;
    if (DOM.selectLanguageModal) DOM.selectLanguageModal.value = langCode;

    try {
      localStorage.setItem('leo_language', langCode);
    } catch (e) {
      console.warn('Could not save language:', e);
    }

    populateVoiceList();
  }

  // --- SPEECH RECOGNITION SETUP ---
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition || null;
  let recognition = null;
  let currentTurnTranscript = '';
  let hasDispatchedTurn = false;

  if (SpeechRecognition) {
    recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.lang = state.selectedLanguage || 'en-US';

    recognition.onstart = () => {
      state.isRecording = true;
      currentTurnTranscript = '';
      hasDispatchedTurn = false;
      setSystemState('listening', 'LISTENING // AUDIO RECEPTOR ACTIVE');
      playTone(600, 0.08, 'sine');
      DOM.btnMic.classList.add('recording');
      DOM.micBtnLabel.textContent = 'LISTENING';
      DOM.readoutIndicator.textContent = 'TRANSCRIBING AUDIO...';
    };

    recognition.onresult = (event) => {
      let interimTranscript = '';
      let finalTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        } else {
          interimTranscript += event.results[i][0].transcript;
        }
      }

      const activeText = (finalTranscript || interimTranscript).trim();
      if (activeText) {
        currentTurnTranscript = activeText;
        DOM.readoutContent.textContent = `"${activeText}"`;
        DOM.textInput.value = activeText;
        DOM.btnClearInput.style.display = 'block';
      }

      if (finalTranscript && finalTranscript.trim()) {
        hasDispatchedTurn = true;
        const textToHandle = finalTranscript.trim();
        try {
          recognition.stop();
        } catch (e) {}
        handleUserCommand(textToHandle);
      }
    };

    recognition.onerror = (event) => {
      console.warn('Speech Recognition Event Error:', event.error);
      state.isRecording = false;
      DOM.btnMic.classList.remove('recording');
      DOM.micBtnLabel.textContent = 'SPEAK';

      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        showToast('Microphone permission blocked. Please allow microphone access or type your query.');
        setSystemState('error', 'PERMISSION DENIED // MIC OFFLINE');
      } else if (event.error === 'no-speech') {
        if (!hasDispatchedTurn && currentTurnTranscript) {
          hasDispatchedTurn = true;
          handleUserCommand(currentTurnTranscript);
        } else {
          setSystemState('idle', 'SYSTEM IDLE // STANDBY');
        }
      } else {
        showToast(`Voice receptor note: ${event.error}`);
        setSystemState('idle', 'SYSTEM IDLE // STANDBY');
      }
    };

    recognition.onend = () => {
      state.isRecording = false;
      DOM.btnMic.classList.remove('recording');
      DOM.micBtnLabel.textContent = 'SPEAK';

      // If speech ended and transcript was captured but not yet dispatched, process it now
      if (!hasDispatchedTurn && currentTurnTranscript && currentTurnTranscript.trim().length > 0) {
        hasDispatchedTurn = true;
        const pendingQuery = currentTurnTranscript.trim();
        currentTurnTranscript = '';
        handleUserCommand(pendingQuery);
      } else if (state.currentStatus === 'listening') {
        setSystemState('idle', 'SYSTEM IDLE // STANDBY');
      }
    };
  }

  // --- AUDIO SYNTHESIS SFX ---
  function initAudioContext() {
    if (!state.audioCtx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        state.audioCtx = new AudioCtx();
      }
    }
    if (state.audioCtx && state.audioCtx.state === 'suspended') {
      state.audioCtx.resume();
    }
  }

  function playTone(freq, duration = 0.1, type = 'sine') {
    if (!state.soundEffectsEnabled) return;
    try {
      initAudioContext();
      if (!state.audioCtx) return;

      const osc = state.audioCtx.createOscillator();
      const gain = state.audioCtx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(freq, state.audioCtx.currentTime);

      gain.gain.setValueAtTime(0.06, state.audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, state.audioCtx.currentTime + duration);

      osc.connect(gain);
      gain.connect(state.audioCtx.destination);

      osc.start();
      osc.stop(state.audioCtx.currentTime + duration);
    } catch (e) {
      // Ignore audio policy restrictions
    }
  }

  function playChirp(tones = [440, 660, 880]) {
    if (!state.soundEffectsEnabled) return;
    tones.forEach((freq, idx) => {
      setTimeout(() => playTone(freq, 0.08, 'triangle'), idx * 70);
    });
  }

  // Synthesized harmonic arpeggio for music preview
  function playSynthMusicPreview() {
    if (!state.soundEffectsEnabled) return;
    try {
      initAudioContext();
      if (!state.audioCtx) return;
      const notes = [261.63, 329.63, 392.0, 523.25, 659.25, 783.99]; // C4, E4, G4, C5, E5, G5
      const now = state.audioCtx.currentTime;
      notes.forEach((freq, i) => {
        const osc = state.audioCtx.createOscillator();
        const gain = state.audioCtx.createGain();
        osc.type = i % 2 === 0 ? 'sine' : 'triangle';
        osc.frequency.setValueAtTime(freq, now + i * 0.09);
        gain.gain.setValueAtTime(0.09, now + i * 0.09);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.09 + 0.3);
        osc.connect(gain);
        gain.connect(state.audioCtx.destination);
        osc.start(now + i * 0.09);
        osc.stop(now + i * 0.09 + 0.35);
      });
    } catch (e) {
      // Audio context policies
    }
  }

  // ==========================================================================
  // 3D DUAL-LAYER ENERGY SPHERE ENGINE (RASENGAN / COSMIC CHAKRA VORTEX)
  // Inner Core Sphere nested inside Outer Vortex Sphere with distinct colors
  // ==========================================================================
  const SPHERE_PRESETS = {
    chakra: {
      name: 'Chakra Vortex',
      outerColors: ['#22d3ee', '#06b6d4', '#38bdf8', '#bae6fd', '#ffffff'],
      outerSpark: '#e0f2fe',
      innerColors: ['#fbbf24', '#f59e0b', '#fde047', '#ffedd5', '#ea580c'],
      innerSpark: '#fef08a',
      coreGrad: ['#ffffff', '#fef08a', '#f59e0b', 'rgba(234, 88, 12, 0)'],
      auraGradient: 'radial-gradient(circle at center, rgba(6, 182, 212, 0.35) 0%, rgba(245, 158, 11, 0.2) 40%, rgba(2, 6, 23, 0) 72%)',
    },
    solar: {
      name: 'Solar Flare',
      outerColors: ['#f59e0b', '#fbbf24', '#f97316', '#ffedd5', '#ffffff'],
      outerSpark: '#fef3c7',
      innerColors: ['#06b6d4', '#22d3ee', '#38bdf8', '#e0f2fe', '#0284c7'],
      innerSpark: '#67e8f9',
      coreGrad: ['#ffffff', '#bae6fd', '#06b6d4', 'rgba(2, 132, 199, 0)'],
      auraGradient: 'radial-gradient(circle at center, rgba(245, 158, 11, 0.35) 0%, rgba(6, 182, 212, 0.22) 42%, rgba(2, 6, 23, 0) 72%)',
    },
    nebula: {
      name: 'Ultraviolet Nebula',
      outerColors: ['#a855f7', '#c084fc', '#e879f9', '#f3e8ff', '#ffffff'],
      outerSpark: '#f5d0fe',
      innerColors: ['#10b981', '#34d399', '#6ee7b7', '#a7f3d0', '#059669'],
      innerSpark: '#6ee7b7',
      coreGrad: ['#ffffff', '#a7f3d0', '#10b981', 'rgba(5, 150, 105, 0)'],
      auraGradient: 'radial-gradient(circle at center, rgba(168, 85, 247, 0.35) 0%, rgba(16, 185, 129, 0.22) 42%, rgba(2, 6, 23, 0) 72%)',
    },
    nova: {
      name: 'Crimson Nova',
      outerColors: ['#ef4444', '#f87171', '#fb7185', '#fee2e2', '#ffffff'],
      outerSpark: '#fecdd3',
      innerColors: ['#ffffff', '#e0f2fe', '#bae6fd', '#38bdf8', '#0284c7'],
      innerSpark: '#ffffff',
      coreGrad: ['#ffffff', '#e0f2fe', '#bae6fd', 'rgba(56, 189, 248, 0)'],
      auraGradient: 'radial-gradient(circle at center, rgba(239, 68, 68, 0.35) 0%, rgba(255, 255, 255, 0.22) 42%, rgba(2, 6, 23, 0) 72%)',
    },
    matrix: {
      name: 'Plasma Matrix',
      outerColors: ['#10b981', '#34d399', '#059669', '#d1fae5', '#ffffff'],
      outerSpark: '#a7f3d0',
      innerColors: ['#f59e0b', '#fbbf24', '#ea580c', '#fef08a', '#ffffff'],
      innerSpark: '#fde047',
      coreGrad: ['#ffffff', '#fef08a', '#f59e0b', 'rgba(234, 88, 12, 0)'],
      auraGradient: 'radial-gradient(circle at center, rgba(16, 185, 129, 0.35) 0%, rgba(245, 158, 11, 0.22) 42%, rgba(2, 6, 23, 0) 72%)',
    },
  };

  const EnergySphereEngine = {
    canvas: null,
    ctx: null,
    width: 320,
    height: 320,
    dpr: 1,
    outerFilaments: [],
    innerFilaments: [],
    sparks: [],
    rotX: 0.2,
    rotY: 0.4,
    rotZ: 0.1,
    velX: 0,
    velY: 0.009,
    velZ: 0.003,
    isDragging: false,
    lastMouseX: 0,
    lastMouseY: 0,
    targetAudioLevel: 0.1,
    currentAudioLevel: 0.1,
    pulseRipples: [],
    animationFrameId: null,

    init(canvasEl) {
      if (!canvasEl) return;
      this.canvas = canvasEl;
      this.ctx = canvasEl.getContext('2d');
      if (!this.ctx) return;

      this.resize();
      this.buildFilaments();
      this.bindControls();
      this.applyPreset(state.spherePreset || 'chakra');
      this.startLoop();
    },

    resize() {
      if (!this.canvas) return;
      const rect = this.canvas.getBoundingClientRect();
      this.width = rect.width || 320;
      this.height = rect.height || 320;
      this.dpr = Math.min(window.devicePixelRatio || 1, 2);

      this.canvas.width = this.width * this.dpr;
      this.canvas.height = this.height * this.dpr;
      this.ctx.scale(this.dpr, this.dpr);
    },

    buildFilaments() {
      this.outerFilaments = [];
      this.innerFilaments = [];
      this.sparks = [];

      // 1. Build Outer Sphere Filaments (~140 energy loops)
      const outerCount = 140;
      for (let i = 0; i < outerCount; i++) {
        const phi = Math.acos(-1 + (2 * i) / outerCount); // Sphere polar angle
        const theta = Math.sqrt(outerCount * Math.PI) * phi; // Azimuthal angle
        const radius = 125 + (Math.random() - 0.5) * 16;
        const tiltX = (Math.random() - 0.5) * Math.PI * 1.5;
        const tiltY = (Math.random() - 0.5) * Math.PI * 1.5;
        const tiltZ = (Math.random() - 0.5) * Math.PI * 1.5;
        const orbitSpeed = (Math.random() * 0.015 + 0.008) * (Math.random() > 0.5 ? 1 : -1);
        const colorIdx = i % 5;
        const width = Math.random() * 1.6 + 0.6;
        const points = [];
        const numPts = 32;

        for (let p = 0; p < numPts; p++) {
          const t = (p / numPts) * Math.PI * 2;
          const px = Math.cos(t) * radius;
          const py = Math.sin(t) * radius;
          const pz = Math.sin(t * 2 + i) * 12; // Wavy perturbation
          points.push({ x: px, y: py, z: pz, baseZ: pz });
        }

        this.outerFilaments.push({
          radius,
          tiltX,
          tiltY,
          tiltZ,
          orbitSpeed,
          colorIdx,
          width,
          points,
          currentAngle: Math.random() * Math.PI * 2,
        });
      }

      // 2. Build Inner Core Sphere Filaments (~90 dense swirling energy loops)
      const innerCount = 90;
      for (let i = 0; i < innerCount; i++) {
        const radius = 64 + (Math.random() - 0.5) * 12;
        const tiltX = (Math.random() - 0.5) * Math.PI * 2;
        const tiltY = (Math.random() - 0.5) * Math.PI * 2;
        const tiltZ = (Math.random() - 0.5) * Math.PI * 2;
        const orbitSpeed = (Math.random() * 0.028 + 0.016) * (Math.random() > 0.5 ? 1 : -1);
        const colorIdx = i % 5;
        const width = Math.random() * 2.0 + 0.8;
        const points = [];
        const numPts = 24;

        for (let p = 0; p < numPts; p++) {
          const t = (p / numPts) * Math.PI * 2;
          const px = Math.cos(t) * radius;
          const py = Math.sin(t) * radius;
          const pz = Math.cos(t * 3) * 8;
          points.push({ x: px, y: py, z: pz, baseZ: pz });
        }

        this.innerFilaments.push({
          radius,
          tiltX,
          tiltY,
          tiltZ,
          orbitSpeed,
          colorIdx,
          width,
          points,
          currentAngle: Math.random() * Math.PI * 2,
        });
      }

      // 3. Build Orbiting Sparks
      for (let s = 0; s < 60; s++) {
        this.sparks.push({
          isInner: s < 25,
          angle: Math.random() * Math.PI * 2,
          speed: Math.random() * 0.04 + 0.02,
          radiusRatio: s < 25 ? 0.5 + Math.random() * 0.1 : 0.95 + Math.random() * 0.15,
          size: Math.random() * 2.5 + 1.2,
          planeTilt: Math.random() * Math.PI,
        });
      }
    },

    bindControls() {
      if (!this.canvas) return;

      const onPointerDown = (e) => {
        this.isDragging = true;
        this.lastMouseX = e.clientX || (e.touches && e.touches[0].clientX) || 0;
        this.lastMouseY = e.clientY || (e.touches && e.touches[0].clientY) || 0;
      };

      const onPointerMove = (e) => {
        const cx = e.clientX || (e.touches && e.touches[0].clientX) || 0;
        const cy = e.clientY || (e.touches && e.touches[0].clientY) || 0;

        if (this.isDragging) {
          const dx = cx - this.lastMouseX;
          const dy = cy - this.lastMouseY;
          this.velY = dx * 0.005;
          this.velX = -dy * 0.005;
          this.lastMouseX = cx;
          this.lastMouseY = cy;
        } else {
          // Subtle hover parallax
          const rect = this.canvas.getBoundingClientRect();
          const normX = (cx - rect.left - rect.width / 2) / (rect.width / 2);
          const normY = (cy - rect.top - rect.height / 2) / (rect.height / 2);
          this.rotX += (normY * 0.2 - this.rotX) * 0.05;
          this.rotY += (normX * 0.2 - this.rotY) * 0.05;
        }
      };

      const onPointerUp = () => {
        this.isDragging = false;
      };

      this.canvas.addEventListener('mousedown', onPointerDown);
      window.addEventListener('mousemove', onPointerMove);
      window.addEventListener('mouseup', onPointerUp);

      this.canvas.addEventListener('touchstart', onPointerDown, { passive: true });
      window.addEventListener('touchmove', onPointerMove, { passive: true });
      window.addEventListener('touchend', onPointerUp);

      window.addEventListener('resize', () => {
        this.resize();
      });
    },

    triggerPulse(scale = 1.0) {
      this.pulseRipples.push({
        radius: 30,
        maxRadius: 150 * scale,
        opacity: 0.9,
        speed: 4.5 * scale,
      });
    },

    applyPreset(presetKey) {
      if (!SPHERE_PRESETS[presetKey]) presetKey = 'chakra';
      state.spherePreset = presetKey;
      try {
        localStorage.setItem('leo_sphere_preset', presetKey);
      } catch (e) {}

      const preset = SPHERE_PRESETS[presetKey];
      if (DOM.sphereGlowAura) {
        DOM.sphereGlowAura.style.background = preset.auraGradient;
      }

      // Update active button on palette bar
      if (DOM.spherePaletteBar) {
        DOM.spherePaletteBar.querySelectorAll('.palette-btn').forEach((btn) => {
          btn.classList.toggle('active', btn.getAttribute('data-preset') === presetKey);
        });
      }
      if (DOM.selectSpherePresetModal) {
        DOM.selectSpherePresetModal.value = presetKey;
      }

      this.triggerPulse(1.3);
    },

    rotate3D(x, y, z, rx, ry, rz) {
      // Rotate around X
      let cos = Math.cos(rx);
      let sin = Math.sin(rx);
      let y1 = y * cos - z * sin;
      let z1 = y * sin + z * cos;

      // Rotate around Y
      cos = Math.cos(ry);
      sin = Math.sin(ry);
      let x2 = x * cos + z1 * sin;
      let z2 = -x * sin + z1 * cos;

      // Rotate around Z
      cos = Math.cos(rz);
      sin = Math.sin(rz);
      let x3 = x2 * cos - y1 * sin;
      let y3 = x2 * sin + y1 * cos;

      return { x: x3, y: y3, z: z2 };
    },

    render() {
      if (!this.ctx) return;
      const ctx = this.ctx;
      const w = this.width;
      const h = this.height;
      const cx = w / 2;
      const cy = h / 2;
      const focal = 380;
      const preset = SPHERE_PRESETS[state.spherePreset || 'chakra'] || SPHERE_PRESETS.chakra;

      // Clear canvas
      ctx.clearRect(0, 0, w, h);

      // Smooth state speed adjustments
      let speedMult = 1.0;
      let audioGain = 0.1;

      if (state.currentStatus === 'listening') {
        speedMult = 1.8;
        audioGain = 0.5 + Math.random() * 0.35;
      } else if (state.currentStatus === 'thinking') {
        speedMult = 3.2;
        audioGain = 0.7;
      } else if (state.currentStatus === 'speaking') {
        speedMult = 2.0;
        audioGain = 0.85 + Math.sin(Date.now() * 0.015) * 0.25;
      }

      this.currentAudioLevel += (audioGain - this.currentAudioLevel) * 0.15;

      // Continuous rotation
      this.rotX += this.velX * speedMult;
      this.rotY += this.velY * speedMult;
      this.rotZ += this.velZ * speedMult;

      if (!this.isDragging) {
        this.velX *= 0.95;
        this.velY = this.velY * 0.95 + 0.008 * 0.05;
        this.velZ = this.velZ * 0.95 + 0.003 * 0.05;
      }

      // Additive blend mode for ultra luminous energy effect
      ctx.globalCompositeOperation = 'lighter';

      // -------------------------------------------------------------
      // 1. Draw Inner Singularity Core
      // -------------------------------------------------------------
      const corePulse = 28 + Math.sin(Date.now() * 0.005) * 4 + this.currentAudioLevel * 14;
      const coreGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, corePulse * 1.8);
      coreGrad.addColorStop(0, preset.coreGrad[0]);
      coreGrad.addColorStop(0.3, preset.coreGrad[1]);
      coreGrad.addColorStop(0.7, preset.coreGrad[2]);
      coreGrad.addColorStop(1, preset.coreGrad[3]);

      ctx.fillStyle = coreGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, corePulse * 1.8, 0, Math.PI * 2);
      ctx.fill();

      // -------------------------------------------------------------
      // 2. Draw Nested Inner Sphere Filaments (Golden / Core Color)
      // -------------------------------------------------------------
      const innerRadiusBase = 66 + this.currentAudioLevel * 6;

      for (let i = 0; i < this.innerFilaments.length; i++) {
        const fil = this.innerFilaments[i];
        fil.currentAngle += fil.orbitSpeed * speedMult;

        const color = preset.innerColors[fil.colorIdx];
        ctx.strokeStyle = color;
        ctx.lineWidth = fil.width * (1 + this.currentAudioLevel * 0.6);

        ctx.beginPath();
        let firstPt = true;

        for (let p = 0; p < fil.points.length; p++) {
          const pt = fil.points[p];
          const localRot = this.rotate3D(pt.x, pt.y, pt.z, fil.tiltX, fil.tiltY + fil.currentAngle, fil.tiltZ);
          const worldRot = this.rotate3D(localRot.x, localRot.y, localRot.z, this.rotX, this.rotY, this.rotZ);

          const zDepth = worldRot.z + innerRadiusBase;
          const scale = focal / (focal + worldRot.z);
          const projX = cx + worldRot.x * scale;
          const projY = cy + worldRot.y * scale;

          if (firstPt) {
            ctx.moveTo(projX, projY);
            firstPt = false;
          } else {
            ctx.lineTo(projX, projY);
          }
        }
        ctx.closePath();
        ctx.globalAlpha = Math.min(1.0, 0.4 + this.currentAudioLevel * 0.4);
        ctx.stroke();
      }

      // -------------------------------------------------------------
      // 3. Draw Outer Sphere Filaments (Electric Cyan / Outer Color)
      // -------------------------------------------------------------
      const outerRadiusBase = 126 + this.currentAudioLevel * 10;

      for (let i = 0; i < this.outerFilaments.length; i++) {
        const fil = this.outerFilaments[i];
        fil.currentAngle += fil.orbitSpeed * speedMult;

        const color = preset.outerColors[fil.colorIdx];
        ctx.strokeStyle = color;
        ctx.lineWidth = fil.width * (1 + this.currentAudioLevel * 0.5);

        ctx.beginPath();
        let firstPt = true;

        for (let p = 0; p < fil.points.length; p++) {
          const pt = fil.points[p];
          const localRot = this.rotate3D(pt.x, pt.y, pt.z, fil.tiltX, fil.tiltY + fil.currentAngle, fil.tiltZ);
          const worldRot = this.rotate3D(localRot.x, localRot.y, localRot.z, this.rotX, this.rotY, this.rotZ);

          const scale = focal / (focal + worldRot.z);
          const projX = cx + worldRot.x * scale;
          const projY = cy + worldRot.y * scale;

          if (firstPt) {
            ctx.moveTo(projX, projY);
            firstPt = false;
          } else {
            ctx.lineTo(projX, projY);
          }
        }
        ctx.closePath();
        ctx.globalAlpha = Math.min(1.0, 0.35 + this.currentAudioLevel * 0.45);
        ctx.stroke();
      }

      // -------------------------------------------------------------
      // 4. Draw Orbiting Energy Sparks & Plasma Particles
      // -------------------------------------------------------------
      for (let s = 0; s < this.sparks.length; s++) {
        const spark = this.sparks[s];
        spark.angle += spark.speed * speedMult;

        const r = (spark.isInner ? innerRadiusBase : outerRadiusBase) * spark.radiusRatio;
        const sx = Math.cos(spark.angle) * r;
        const sy = Math.sin(spark.angle) * r;
        const sz = Math.sin(spark.angle * 2) * (spark.isInner ? 20 : 40);

        const worldRot = this.rotate3D(sx, sy, sz, this.rotX + spark.planeTilt, this.rotY, this.rotZ);
        const scale = focal / (focal + worldRot.z);
        const projX = cx + worldRot.x * scale;
        const projY = cy + worldRot.y * scale;

        ctx.fillStyle = spark.isInner ? preset.innerSpark : preset.outerSpark;
        ctx.globalAlpha = 0.85;
        ctx.beginPath();
        ctx.arc(projX, projY, spark.size * scale * (1 + this.currentAudioLevel), 0, Math.PI * 2);
        ctx.fill();
      }

      // -------------------------------------------------------------
      // 5. Draw Expanding Shockwave Kinetic Ripples
      // -------------------------------------------------------------
      for (let i = this.pulseRipples.length - 1; i >= 0; i--) {
        const rip = this.pulseRipples[i];
        rip.radius += rip.speed;
        rip.opacity -= 0.025;

        if (rip.opacity <= 0 || rip.radius > rip.maxRadius) {
          this.pulseRipples.splice(i, 1);
          continue;
        }

        ctx.strokeStyle = preset.outerColors[0];
        ctx.lineWidth = 2.0;
        ctx.globalAlpha = rip.opacity;
        ctx.beginPath();
        ctx.arc(cx, cy, rip.radius, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.globalAlpha = 1.0;
      ctx.globalCompositeOperation = 'source-over';
    },

    startLoop() {
      const loop = () => {
        this.render();
        this.animationFrameId = requestAnimationFrame(loop);
      };
      this.animationFrameId = requestAnimationFrame(loop);
    },

    stopLoop() {
      if (this.animationFrameId) {
        cancelAnimationFrame(this.animationFrameId);
        this.animationFrameId = null;
      }
    },
  };

  // --- SYSTEM STATE MANAGEMENT ---
  function setSystemState(status, message) {
    state.currentStatus = status;
    DOM.arcSection.className = `arc-section state-${status}`;
    DOM.statusText.textContent = message || `SYSTEM ${status.toUpperCase()}`;

    if (EnergySphereEngine) {
      if (status === 'listening') {
        EnergySphereEngine.triggerPulse(1.5);
      } else if (status === 'speaking') {
        EnergySphereEngine.triggerPulse(1.8);
      } else if (status === 'thinking') {
        EnergySphereEngine.triggerPulse(1.2);
      }
    }

    if (status === 'thinking') {
      DOM.readoutIndicator.textContent = 'PROCESSING QUERY...';
      playTone(330, 0.1, 'sawtooth');
    } else if (status === 'speaking') {
      DOM.readoutIndicator.textContent = 'AUDIO SYNTHESIS TRANSMITTING';
    } else if (status === 'idle') {
      DOM.readoutIndicator.textContent = 'AWAITING INPUT';
    }
  }

  // --- SIMULATED AUDIO SPECTRUM BARS ---
  let spectrumInterval = null;
  function startSpectrumAnimation(intensity = 1.0) {
    stopSpectrumAnimation();
    spectrumInterval = setInterval(() => {
      DOM.specBars.forEach((bar) => {
        const height = Math.floor(Math.random() * 28 * intensity) + 4;
        bar.style.height = `${height}px`;
      });
    }, 90);
  }

  function stopSpectrumAnimation() {
    if (spectrumInterval) {
      clearInterval(spectrumInterval);
      spectrumInterval = null;
    }
    DOM.specBars.forEach((bar) => {
      bar.style.height = '4px';
    });
  }

  // --- MARKDOWN & CODE PARSER ---
  function escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function parseMarkdown(text) {
    if (!text) return '';

    // 1. Extract multi-line code blocks
    const codeBlocks = [];
    let processed = text.replace(/```([a-zA-Z0-9_\-\+]*)\n([\s\S]*?)```/g, (match, lang, code) => {
      const id = `___CODE_BLOCK_${codeBlocks.length}___`;
      codeBlocks.push({
        lang: (lang || 'code').trim().toUpperCase(),
        code: code.replace(/\r\n/g, '\n'),
      });
      return id;
    });

    // 2. Extract inline code
    const inlineCodes = [];
    processed = processed.replace(/`([^`\n]+)`/g, (match, code) => {
      const id = `___INLINE_CODE_${inlineCodes.length}___`;
      inlineCodes.push(escapeHtml(code));
      return id;
    });

    // 3. Escape HTML on the remaining text
    processed = escapeHtml(processed);

    // 4. Headers (# H1, ## H2, ### H3)
    processed = processed.replace(/^### (.*$)/gim, '<h3 class="markdown-h3">$1</h3>');
    processed = processed.replace(/^## (.*$)/gim, '<h2 class="markdown-h2">$1</h2>');
    processed = processed.replace(/^# (.*$)/gim, '<h1 class="markdown-h1">$1</h1>');

    // 5. Blockquotes (> quote)
    processed = processed.replace(/^&gt; (.*$)/gim, '<blockquote class="markdown-quote">$1</blockquote>');

    // 6. Horizontal rules (---)
    processed = processed.replace(/^---$/gim, '<hr class="markdown-hr">');

    // 7. Bold & Italic & Strikethrough
    processed = processed.replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>');
    processed = processed.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    processed = processed.replace(/__(.*?)__/g, '<strong>$1</strong>');
    processed = processed.replace(/\*(.*?)\*/g, '<em>$1</em>');
    processed = processed.replace(/_(.*?)_/g, '<em>$1</em>');
    processed = processed.replace(/~~(.*?)~~/g, '<del>$1</del>');

    // 8. Links [text](url)
    processed = processed.replace(/\[(.*?)\]\((https?:\/\/[^\s\)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="hud-link">$1</a>');

    // 9. Lists
    processed = processed.replace(/^[\*\-] (.+)$/gim, '<li class="markdown-li">$1</li>');
    processed = processed.replace(/^\d+\. (.+)$/gim, '<li class="markdown-li ordered">$1</li>');
    processed = processed.replace(/(<li class="markdown-li.*">.*?<\/li>(\s*<li class="markdown-li.*">.*?<\/li>)*)/gim, '<ul class="markdown-list">$1</ul>');

    // 10. Split into paragraphs
    const paragraphs = processed.split(/\n\n+/);
    processed = paragraphs
      .map((p) => {
        p = p.trim();
        if (!p) return '';
        if (
          p.startsWith('<h1') ||
          p.startsWith('<h2') ||
          p.startsWith('<h3') ||
          p.startsWith('<ul') ||
          p.startsWith('<blockquote') ||
          p.startsWith('<hr') ||
          p.startsWith('___CODE_BLOCK_')
        ) {
          return p;
        }
        return `<p class="markdown-p">${p.replace(/\n/g, '<br>')}</p>`;
      })
      .join('\n');

    // 11. Restore Inline Codes
    inlineCodes.forEach((code, idx) => {
      processed = processed.replace(new RegExp(`___INLINE_CODE_${idx}___`, 'g'), `<code class="inline-code">${code}</code>`);
    });

    // 12. Restore Code Blocks with HUD headers and copy buttons
    codeBlocks.forEach((block, idx) => {
      const escapedCode = escapeHtml(block.code);
      const rawAttr = encodeURIComponent(block.code);
      const htmlBlock = `
        <div class="code-block-container">
          <div class="code-block-header">
            <span class="code-lang-tag">${block.lang || 'CODE'}</span>
            <button type="button" class="btn-copy-code" data-code="${rawAttr}" title="Copy code to clipboard">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
              <span>COPY CODE</span>
            </button>
          </div>
          <pre><code class="language-${(block.lang || 'text').toLowerCase()}">${escapedCode}</code></pre>
        </div>
      `;
      processed = processed.replace(new RegExp(`___CODE_BLOCK_${idx}___`, 'g'), htmlBlock);
    });

    return processed;
  }

  // --- SMART SPOKEN TEXT EXTRACTOR ---
  function extractSpokenText(text) {
    if (!text) return '';

    const hasCode = /```[\s\S]*?```/.test(text);
    let speech = text.replace(/```[\s\S]*?```/g, ' [Code generated on screen] ');

    speech = speech
      .replace(/[*#_`~\[\]]/g, '')
      .replace(/\(https?:\/\/[^\)]+\)/g, '')
      .replace(/https?:\/\/\S+/g, 'online link')
      .replace(/<[^>]+>/g, '')
      .replace(/&[a-z]+;/g, ' ')
      .replace(/\n+/g, '. ')
      .trim();

    if (speech.length > 280) {
      const sentences = speech.match(/[^.!?]+[.!?]+/g);
      if (sentences && sentences.length >= 1) {
        speech = sentences.slice(0, 2).join(' ').trim();
        if (hasCode) {
          speech += ' The full code is ready for you in the transcript, sir.';
        }
      } else {
        speech = speech.substring(0, 260).trim() + '... Full response generated, sir.';
      }
    } else if (hasCode && !speech.toLowerCase().includes('code')) {
      speech += ' The complete code implementation is ready in your transcript, sir.';
    }

    return speech;
  }

  // --- TEXT TO SPEECH (TTS) ---
  function speakResponse(text, onComplete) {
    if (!state.speechOutputEnabled || !('speechSynthesis' in window)) {
      if (onComplete) onComplete();
      return;
    }

    try {
      window.speechSynthesis.cancel(); // Stop any previous speech
      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      }
    } catch (e) {}

    // Extract clean, voice-friendly summary for narration
    const cleanSpeechText = extractSpokenText(text);

    if (!cleanSpeechText) {
      if (onComplete) onComplete();
      return;
    }

    const utterance = new SpeechSynthesisUtterance(cleanSpeechText);
    utterance.rate = state.speechRate || 1.0;
    utterance.pitch = state.speechPitch || 1.0;

    // Pick selected voice or match current language
    if (state.selectedVoiceURI) {
      const foundVoice = state.voices.find((v) => v.voiceURI === state.selectedVoiceURI);
      if (foundVoice) {
        utterance.voice = foundVoice;
      }
    } else {
      const langPrefix = (state.selectedLanguage || 'en').split('-')[0].toLowerCase();
      // First try to match current selected language voice
      let preferred = state.voices.find((v) =>
        v.lang.toLowerCase().startsWith(langPrefix) &&
        (v.name.includes('Natural') || v.name.includes('Google') || v.name.includes('Neural') || v.name.includes('Male') || v.name.includes('UK'))
      );
      if (!preferred) {
        preferred = state.voices.find((v) => v.lang.toLowerCase().startsWith(langPrefix));
      }
      if (!preferred && langPrefix === 'en') {
        preferred = state.voices.find((v) => v.lang.startsWith('en'));
      }
      if (preferred) utterance.voice = preferred;
    }

    let speakingSafetyTimer = null;

    utterance.onstart = () => {
      setSystemState('speaking', 'SPEAKING // VOCAL OUTPUT TRANSMITTING');
      startSpectrumAnimation(1.3);
      
      // Safety timer in case browser fails to trigger onend
      const approxDurationMs = Math.max(3000, (cleanSpeechText.length / 15) * 1000);
      speakingSafetyTimer = setTimeout(() => {
        stopSpectrumAnimation();
        if (state.currentStatus === 'speaking') {
          setSystemState('idle', 'SYSTEM IDLE // STANDBY');
        }
      }, approxDurationMs + 2000);
    };

    const cleanupSpeaking = () => {
      if (speakingSafetyTimer) clearTimeout(speakingSafetyTimer);
      stopSpectrumAnimation();
      setSystemState('idle', 'SYSTEM IDLE // STANDBY');
      if (onComplete) onComplete();
    };

    utterance.onend = cleanupSpeaking;
    utterance.onerror = (e) => {
      console.warn('SpeechSynthesis error:', e);
      cleanupSpeaking();
    };

    try {
      window.speechSynthesis.speak(utterance);
    } catch (err) {
      console.warn('speechSynthesis.speak failed:', err);
      cleanupSpeaking();
    }
  }

  // --- POPULATE AVAILABLE VOICES ---
  function populateVoiceList() {
    if (!('speechSynthesis' in window)) return;
    state.voices = window.speechSynthesis.getVoices();

    if (!DOM.selectVoice) return;
    DOM.selectVoice.innerHTML = '<option value="">Default Voice for Selected Language</option>';

    const langPrefix = (state.selectedLanguage || 'en').split('-')[0].toLowerCase();

    // Sort matching language voices first
    const sorted = [...state.voices].sort((a, b) => {
      const aMatch = a.lang.toLowerCase().startsWith(langPrefix);
      const bMatch = b.lang.toLowerCase().startsWith(langPrefix);
      if (aMatch && !bMatch) return -1;
      if (!aMatch && bMatch) return 1;
      return a.name.localeCompare(b.name);
    });

    sorted.forEach((voice) => {
      const opt = document.createElement('option');
      opt.value = voice.voiceURI;
      const isCurrentLang = voice.lang.toLowerCase().startsWith(langPrefix);
      opt.textContent = `${isCurrentLang ? '⭐ ' : ''}${voice.name} (${voice.lang})${voice.default ? ' [Default]' : ''}`;
      if (state.selectedVoiceURI && state.selectedVoiceURI === voice.voiceURI) {
        opt.selected = true;
      }
      DOM.selectVoice.appendChild(opt);
    });
  }

  if ('speechSynthesis' in window) {
    populateVoiceList();
    window.speechSynthesis.onvoiceschanged = populateVoiceList;
  }

  // --- PERSIST TURN TO SQLITE ---
  async function recordTurn(userMessage, assistantReply) {
    try {
      await fetch('/api/record', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userMessage, assistantReply }),
      });
    } catch (e) {
      console.warn('Could not record turn to SQLite:', e);
    }
  }

  // ==========================================================================
  // IN-MEMORY REMINDERS SCHEDULER
  // ==========================================================================
  function scheduleReminder(taskText, delayMs, timeDisplay) {
    const id = 'rem_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
    const targetDate = new Date(Date.now() + delayMs);
    const timeFormatted = targetDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    const timeoutId = setTimeout(() => {
      playChirp([880, 1174, 880, 1174, 1320]);
      showToast(`⏰ REMINDER ALERT: ${taskText}`);

      const reminderAlertSpeech = `Sir, pardon the interruption. This is your scheduled reminder to ${taskText}.`;
      DOM.readoutContent.textContent = reminderAlertSpeech;

      const alertCard = document.createElement('div');
      alertCard.className = 'reminder-trigger-card';
      alertCard.innerHTML = `
        <div class="reminder-header-tag">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          SCHEDULED REMINDER TRIGGERED
        </div>
        <div class="reminder-task-body">"${taskText}"</div>
      `;

      appendChatMessage('assistant', `Pardon the interruption, sir. This is your reminder to ${taskText}.`, undefined, alertCard);
      speakResponse(reminderAlertSpeech);
      recordTurn(`[Reminder Triggered]`, `Sir, this is your reminder to ${taskText}.`);

      state.reminders = state.reminders.filter((r) => r.id !== id);
    }, delayMs);

    state.reminders.push({
      id,
      task: taskText,
      delayMs,
      targetDate,
      timeDisplay,
      timeoutId,
    });

    return `Reminder set for ${timeDisplay} (${timeFormatted}), sir: "${taskText}". I will notify you promptly.`;
  }

  function parseReminderCommand(query) {
    const q = query.trim();

    if (/^(?:list|show|view|get)\s+(?:all\s+)?reminders$/i.test(q)) {
      if (state.reminders.length === 0) {
        return { reply: 'You have no pending reminders scheduled in memory, sir.' };
      }
      const listStr = state.reminders
        .map((r, i) => {
          const remainingSec = Math.max(1, Math.round((r.targetDate.getTime() - Date.now()) / 1000));
          const min = Math.floor(remainingSec / 60);
          const sec = remainingSec % 60;
          const timeRemaining = min > 0 ? `${min}m ${sec}s` : `${sec}s`;
          return `${i + 1}. "${r.task}" (in ${timeRemaining})`;
        })
        .join('; ');
      return { reply: `Active scheduled reminders in memory: ${listStr}, sir.` };
    }

    if (/^(?:cancel|clear|delete|remove)\s+(?:all\s+)?reminders$/i.test(q)) {
      const count = state.reminders.length;
      state.reminders.forEach((r) => clearTimeout(r.timeoutId));
      state.reminders = [];
      return { reply: `All ${count} scheduled in-memory reminders have been cancelled, sir.` };
    }

    const patternToIn = q.match(/^remind\s+me\s+to\s+(.+?)\s+in\s+([\d.]+)\s*(s|sec|secs|second|seconds|m|min|mins|minute|minutes|h|hr|hrs|hour|hours)$/i);
    if (patternToIn) {
      const task = patternToIn[1].trim();
      const val = parseFloat(patternToIn[2]);
      const unit = patternToIn[3].toLowerCase();
      const ms = parseUnitToMs(val, unit);
      return { reply: scheduleReminder(task, ms, `${val} ${unit}`) };
    }

    const patternIn = q.match(/^(?:set\s+(?:a\s+)?reminder|remind\s+me)\s+(?:in|for)?\s*([\d.]+)\s*(s|sec|secs|second|seconds|m|min|mins|minute|minutes|h|hr|hrs|hour|hours)\s*(?:to|for|that)?\s*(.+)$/i);
    if (patternIn) {
      const val = parseFloat(patternIn[1]);
      const unit = patternIn[2].toLowerCase();
      const task = patternIn[3].trim();
      const ms = parseUnitToMs(val, unit);
      return { reply: scheduleReminder(task, ms, `${val} ${unit}`) };
    }

    const patternAt = q.match(/^(?:set\s+(?:a\s+)?reminder|remind\s+me)\s+at\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s*(?:to|for)?\s*(.+)$/i);
    if (patternAt) {
      const timeStr = patternAt[1].trim();
      const task = patternAt[2].trim();
      const ms = parseTimeToMs(timeStr);
      if (ms > 0) {
        return { reply: scheduleReminder(task, ms, `at ${timeStr}`) };
      }
    }

    const patternGeneric = q.match(/^(?:set\s+(?:a\s+)?reminder|remind\s+me)\s+(.+)$/i);
    if (patternGeneric) {
      const rest = patternGeneric[1].trim();
      const timeLeading = rest.match(/^([\d.]+)\s*(s|sec|secs|second|seconds|m|min|mins|minute|minutes|h|hr|hrs|hour|hours)\s*(?:to|for)?\s*(.+)$/i);
      if (timeLeading) {
        const val = parseFloat(timeLeading[1]);
        const unit = timeLeading[2].toLowerCase();
        const task = timeLeading[3].trim();
        const ms = parseUnitToMs(val, unit);
        return { reply: scheduleReminder(task, ms, `${val} ${unit}`) };
      }
    }

    return null;
  }

  function parseUnitToMs(val, unit) {
    if (unit.startsWith('s')) return Math.round(val * 1000);
    if (unit.startsWith('m')) return Math.round(val * 60 * 1000);
    if (unit.startsWith('h')) return Math.round(val * 3600 * 1000);
    return Math.round(val * 1000);
  }

  function parseTimeToMs(timeStr) {
    try {
      const now = new Date();
      const match = timeStr.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
      if (!match) return 0;

      let hours = parseInt(match[1], 10);
      const minutes = match[2] ? parseInt(match[2], 10) : 0;
      const meridiem = match[3] ? match[3].toLowerCase() : null;

      if (meridiem === 'pm' && hours < 12) hours += 12;
      if (meridiem === 'am' && hours === 12) hours = 0;

      const target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes, 0);
      if (target.getTime() <= now.getTime()) {
        target.setDate(target.getDate() + 1);
      }
      return target.getTime() - now.getTime();
    } catch (e) {
      return 0;
    }
  }

  // ==========================================================================
  // MATH EXPRESSION PARSER
  // ==========================================================================
  function evaluateMath(expressionStr) {
    let clean = expressionStr
      .replace(/×/g, '*')
      .replace(/÷/g, '/')
      .replace(/\\times/gi, '*')
      .replace(/\\div/gi, '/')
      .replace(/,/g, '')
      .trim();

    clean = clean
      .replace(/\bplus\b/gi, '+')
      .replace(/\bminus\b/gi, '-')
      .replace(/\btimes\b/gi, '*')
      .replace(/\bmultiplied\s+by\b/gi, '*')
      .replace(/\bdivided\s+by\b/gi, '/')
      .replace(/\bover\b/gi, '/')
      .replace(/\bmodulo\b|\bmod\b/gi, '%')
      .replace(/\bto\s+the\s+power\s+of\b|\braised\s+to\b|\bpower\b/gi, '**')
      .replace(/\^/g, '**')
      .replace(/\bsquared\b/gi, '**2')
      .replace(/\bcubed\b/gi, '**3')
      .replace(/\bsquare\s+root\s+of\b/gi, 'sqrt')
      .replace(/\bcube\s+root\s+of\b/gi, 'cbrt');

    const pctMatch = clean.match(/^([\d.]+)\s*(?:%|\s*percent)\s*(?:of|\*)\s*([\d.]+)$/i);
    if (pctMatch) {
      const p = parseFloat(pctMatch[1]);
      const total = parseFloat(pctMatch[2]);
      if (!isNaN(p) && !isNaN(total)) {
        return (p / 100) * total;
      }
    }

    let sanitized = clean
      .replace(/\bpi\b/gi, 'Math.PI')
      .replace(/\be\b/gi, 'Math.E')
      .replace(/\bsqrt\s*\(([^)]+)\)/gi, 'Math.sqrt($1)')
      .replace(/\bsqrt\s+([\d.]+)/gi, 'Math.sqrt($1)')
      .replace(/\bcbrt\s*\(([^)]+)\)/gi, 'Math.cbrt($1)')
      .replace(/\bcbrt\s+([\d.]+)/gi, 'Math.cbrt($1)')
      .replace(/\bsin\s*\(([^)]+)\)/gi, 'Math.sin($1)')
      .replace(/\bcos\s*\(([^)]+)\)/gi, 'Math.cos($1)')
      .replace(/\btan\s*\(([^)]+)\)/gi, 'Math.tan($1)')
      .replace(/\babs\s*\(([^)]+)\)/gi, 'Math.abs($1)')
      .replace(/\bround\s*\(([^)]+)\)/gi, 'Math.round($1)')
      .replace(/\bfloor\s*\(([^)]+)\)/gi, 'Math.floor($1)')
      .replace(/\bceil\s*\(([^)]+)\)/gi, 'Math.ceil($1)')
      .replace(/\bln\s*\(([^)]+)\)/gi, 'Math.log($1)')
      .replace(/\blog\s*\(([^)]+)\)/gi, 'Math.log10($1)');

    const isValid = /^[0-9+\-*/%().,\sMath.PIEsqrtcbrtsincostanabsroundfloorceillog]+$/.test(sanitized);
    if (!isValid) {
      throw new Error('Unrecognized syntax in math expression');
    }

    const evaluated = Function(`"use strict"; return (${sanitized})`)();
    if (typeof evaluated !== 'number' || isNaN(evaluated) || !isFinite(evaluated)) {
      throw new Error('Computation resulted in an invalid or infinite value');
    }

    return Number(evaluated.toFixed(8));
  }

  function parseMathCommand(query) {
    const q = query.trim();

    const match = q.match(/^(?:calculate|compute|calc|eval|evaluate)\s+(.+)$/i);
    if (match) {
      const rawExpr = match[1].replace(/\?+$/, '').trim();
      try {
        const result = evaluateMath(rawExpr);
        return {
          reply: `The calculated result of ${rawExpr} is ${result}, sir.`,
        };
      } catch (err) {
        return null;
      }
    }

    const whatIsMath = q.match(/^(?:what\s+is|what's|how\s+much\s+is)\s+([\d\s+\-*/%^().,Math.PIEsqrtcbrt]+)\??$/i);
    if (whatIsMath && /[\d]/.test(whatIsMath[1]) && /[+\-*/%^]/.test(whatIsMath[1])) {
      try {
        const result = evaluateMath(whatIsMath[1]);
        return {
          reply: `The calculated result is ${result}, sir.`,
        };
      } catch (e) {
        return null;
      }
    }

    if (/^[0-9\s+\-*/%^().,Math.PIEsqrtcbrt]+$/.test(q) && /[\d]/.test(q) && /[+\-*/%^]/.test(q)) {
      try {
        const result = evaluateMath(q);
        return {
          reply: `The calculated value is ${result}, sir.`,
        };
      } catch (e) {
        return null;
      }
    }

    return null;
  }

  // ==========================================================================
  // MUSIC PLAYER SIMULATION
  // ==========================================================================
  function parseMusicCommand(query) {
    const q = query.trim();
    const match = q.match(/^play\s+(?:song|music|track)?\s*(.+)$/i);
    if (match) {
      const rawSong = match[1].trim();
      if (!rawSong) return null;

      const ytSearchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(rawSong)}`;
      const ytMusicUrl = `https://music.youtube.com/search?q=${encodeURIComponent(rawSong)}`;

      try {
        window.open(ytSearchUrl, '_blank');
      } catch (e) {
        console.warn('Popup blocked:', e);
      }

      playSynthMusicPreview();

      const mediaCard = document.createElement('div');
      mediaCard.className = 'music-playback-card';
      mediaCard.innerHTML = `
        <div class="music-card-header">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
          SIMULATED AUDIO STREAM // UPLINK READY
        </div>
        <div class="music-track-name">
          <span>🎵</span> <span>${rawSong}</span>
        </div>
        <div class="music-card-actions">
          <a href="${ytSearchUrl}" target="_blank" rel="noopener noreferrer" class="hud-btn-link">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
            Open in YouTube
          </a>
          <a href="${ytMusicUrl}" target="_blank" rel="noopener noreferrer" class="hud-btn-secondary">
            YouTube Music
          </a>
          <button class="hud-btn-secondary btn-replay-synth">
            Play Synth Preview
          </button>
        </div>
      `;

      mediaCard.querySelector('.btn-replay-synth').onclick = () => {
        playSynthMusicPreview();
      };

      return {
        reply: `Initiating audio playback for '${rawSong}', sir. Opening YouTube audio stream.`,
        customNode: mediaCard,
      };
    }

    return null;
  }

  // --- LOCAL COMMAND PROCESSOR ---
  function checkLocalCommand(query) {
    const q = query.toLowerCase().trim();

    // Identity fast path
    if (
      q === 'who are you' ||
      q === 'who are you?' ||
      q === 'what is your name' ||
      q === 'what is your name?' ||
      q === 'who is leo' ||
      q === 'who is leo?' ||
      q === 'introduce yourself'
    ) {
      return {
        reply: 'I am L.E.O., your Logical Executive Operator AI assistant. All neural telemetry and multi-language capabilities are fully operational at your command, sir.',
      };
    }

    // 1. Math calculation command (calculate / compute / what is)
    const mathRes = parseMathCommand(query);
    if (mathRes) {
      return mathRes;
    }

    // 2. Reminder scheduler command (set reminder / remind me / list reminders)
    const reminderRes = parseReminderCommand(query);
    if (reminderRes) {
      return reminderRes;
    }

    // 3. Music playback simulation (play [song])
    const musicRes = parseMusicCommand(query);
    if (musicRes) {
      return musicRes;
    }

    // 4. Time query
    if (q === "what's the time" || q === 'what time is it' || q === 'time' || q === 'current time' || q === 'what is the current time?') {
      const now = new Date();
      const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      return { reply: `The current time is ${timeStr}, sir.` };
    }

    // 5. Date query
    if (q === "what's the date" || q === "what's today's date" || q === 'date' || q === 'today date' || q === "what is today's date?") {
      const now = new Date();
      const dateStr = now.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
      return { reply: `Today is ${dateStr}, sir.` };
    }

    // 6. Open website command (e.g. "open youtube", "open google", "open github")
    const openMatch = q.match(/^open\s+([a-z0-9\.\-]+)/i);
    if (openMatch) {
      let target = openMatch[1].toLowerCase();
      let url = '';

      if (target === 'youtube') url = 'https://www.youtube.com';
      else if (target === 'google') url = 'https://www.google.com';
      else if (target === 'github') url = 'https://www.github.com';
      else if (target === 'reddit') url = 'https://www.reddit.com';
      else if (target === 'wikipedia') url = 'https://www.wikipedia.org';
      else if (target === 'gmail') url = 'https://mail.google.com';
      else if (target.includes('.')) url = `https://${target}`;
      else url = `https://www.google.com/search?q=${encodeURIComponent(target)}`;

      try {
        window.open(url, '_blank');
        return { reply: `Opening ${target} in a new viewport, sir.` };
      } catch (e) {
        return { reply: `Attempted to open ${target}, sir. Please check browser popup settings.` };
      }
    }

    // 7. Open Data Core / Knowledge Base modal
    if (q === 'open database' || q === 'open data core' || q === 'show database' || q === 'data core' || q === 'knowledge base') {
      openDatabaseModal();
      return { reply: 'Opening SQLite Data Core and knowledge management panel, sir.' };
    }

    // 8. Dynamic Knowledge Base & Direct CM Query matching
    if (
      (q.includes('tamil nadu') && (q.includes('cm') || q.includes('chief minister') || q.includes('leader') || q.includes('who is'))) ||
      q.includes('chief minister of tamil nadu') ||
      q.includes('cm of tamil nadu') ||
      q === 'who is the cm of tamil nadu?' ||
      q === 'who is the cm of tamil nadu'
    ) {
      const tnRecord = (state.knowledgeRecords || []).find((r) => r.topic && r.topic.toLowerCase().includes('tamil nadu'));
      const fact = tnRecord ? tnRecord.fact : 'The Chief Minister of Tamil Nadu is Joseph Vijay.';
      return { reply: `${fact} All telemetry is current, sir.` };
    }

    // Dynamic search across all active knowledge records
    if (state.knowledgeRecords && state.knowledgeRecords.length > 0) {
      for (const rec of state.knowledgeRecords) {
        const topLower = rec.topic.toLowerCase();
        if (topLower.length > 3 && (q.includes(topLower) || topLower.includes(q))) {
          return { reply: `According to verified SQLite Data Core: ${rec.fact}, sir.` };
        }
      }
    }

    // 9. Clear chat / purge memory
    if (q === 'clear chat' || q === 'clear history' || q === 'clear memory' || q === 'purge memory') {
      clearChatHistory();
      return { reply: 'Memory banks cleared successfully, sir.' };
    }

    return null; // Fallback to backend Gemini
  }

  // --- PROCESS USER COMMAND ---
  async function handleUserCommand(rawText) {
    if (!rawText || !rawText.trim()) return;
    const text = rawText.trim();

    DOM.textInput.value = '';
    DOM.btnClearInput.style.display = 'none';

    // 1. Append User message to UI
    appendChatMessage('user', text);
    DOM.readoutContent.textContent = `"${text}"`;

    // 2. Check for local fast-path commands (Math, Reminder, Music, System)
    const localResult = checkLocalCommand(text);
    if (localResult) {
      const replyText = typeof localResult === 'string' ? localResult : localResult.reply;
      const customNode = localResult.customNode || null;

      DOM.readoutContent.textContent = replyText;
      appendChatMessage('assistant', replyText, undefined, customNode);
      speakResponse(replyText);

      // Record interaction turn to SQLite database
      recordTurn(text, replyText);
      return;
    }

    // 3. Query Backend /api/chat with Gemini & SQLite Memory & Language Context
    setSystemState('thinking', 'PROCESSING // QUERYING GEMINI NEURAL NET');
    startSpectrumAnimation(0.6);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          language: state.selectedLanguage,
          languageName: LANGUAGE_MAP[state.selectedLanguage] || 'English',
        }),
      });

      const data = await response.json();
      stopSpectrumAnimation();

      if (data.success && data.reply) {
        DOM.readoutContent.textContent = data.reply;
        appendChatMessage('assistant', data.reply);
        speakResponse(data.reply);
      } else {
        const errMsg = data.error || 'Diagnostic error: Unable to compute neural response.';
        DOM.readoutContent.textContent = errMsg;
        appendChatMessage('assistant', errMsg);
        setSystemState('error', 'NEURAL TRANSMISSION FAILED');
        speakResponse(errMsg);
      }
    } catch (err) {
      stopSpectrumAnimation();
      console.error('Fetch /api/chat error:', err);
      const networkErrMsg = 'Communication link offline. Please verify server connectivity, sir.';
      DOM.readoutContent.textContent = networkErrMsg;
      appendChatMessage('assistant', networkErrMsg);
      setSystemState('error', 'SERVER CONNECTION ERROR');
      showToast('Network error: Unable to reach LEO backend');
      speakResponse(networkErrMsg);
    }
  }

  // --- CHAT LOG UI HELPERS ---
  function appendChatMessage(role, content, timeStr, customNode) {
    const item = document.createElement('div');
    item.className = `msg-item ${role}-msg`;

    const now = timeStr || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const meta = document.createElement('div');
    meta.className = 'msg-meta';

    const senderTag = document.createElement('span');
    senderTag.className = `sender-tag ${role === 'user' ? 'tag-user' : 'tag-jarvis'}`;
    senderTag.textContent = role === 'user' ? 'USER' : 'L.E.O.';

    const timeElem = document.createElement('span');
    timeElem.className = 'msg-time';
    timeElem.textContent = now;

    meta.appendChild(senderTag);
    meta.appendChild(timeElem);

    const bubble = document.createElement('div');
    bubble.className = `msg-bubble ${role === 'user' ? 'user-bubble' : 'jarvis-bubble'}`;

    if (role === 'assistant') {
      bubble.innerHTML = parseMarkdown(content);
      // Bind copy code buttons inside this bubble
      bubble.querySelectorAll('.btn-copy-code').forEach((btn) => {
        btn.onclick = (e) => {
          e.stopPropagation();
          const rawCode = decodeURIComponent(btn.getAttribute('data-code') || '');
          if (navigator.clipboard) {
            navigator.clipboard.writeText(rawCode).then(() => {
              btn.classList.add('copied');
              btn.innerHTML = `
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
                <span>COPIED!</span>
              `;
              showToast('Code copied to clipboard!');
              playTone(750, 0.06);
              setTimeout(() => {
                btn.classList.remove('copied');
                btn.innerHTML = `
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                  <span>COPY CODE</span>
                `;
              }, 2000);
            });
          }
        };
      });
    } else {
      bubble.textContent = content;
    }

    if (customNode) {
      bubble.appendChild(customNode);
    }

    item.appendChild(meta);
    item.appendChild(bubble);

    if (role === 'assistant') {
      const controls = document.createElement('div');
      controls.className = 'msg-controls';

      const replayBtn = document.createElement('button');
      replayBtn.className = 'msg-replay-btn';
      replayBtn.innerHTML = `
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
          <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
        </svg> Replay Audio
      `;
      replayBtn.onclick = () => speakResponse(content);

      controls.appendChild(replayBtn);
      item.appendChild(controls);
    }

    DOM.chatMessages.appendChild(item);
    DOM.chatMessages.scrollTop = DOM.chatMessages.scrollHeight;
  }

  // --- LOAD CONVERSATION HISTORY FROM SQLITE ---
  async function loadHistory() {
    try {
      const res = await fetch('/api/history');
      const data = await res.json();

      if (data.success && Array.isArray(data.messages) && data.messages.length > 0) {
        DOM.chatMessages.innerHTML = '';
        data.messages.forEach((msg) => {
          const time = msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
          appendChatMessage(msg.role, msg.content, time);
        });
      }
    } catch (e) {
      console.warn('Could not load history from SQLite:', e);
    }
  }

  // --- CLEAR CHAT HISTORY ---
  async function clearChatHistory() {
    try {
      await fetch('/api/history', { method: 'DELETE' });
      DOM.chatMessages.innerHTML = `
        <div class="msg-item system-intro">
          <div class="msg-meta">
            <span class="sender-tag tag-jarvis">L.E.O.</span>
            <span class="msg-time">PURGED</span>
          </div>
          <div class="msg-bubble jarvis-bubble">
            Memory archives purged, sir. Ready for fresh operational instructions.
          </div>
        </div>
      `;
      showToast('SQLite memory purged.');
      playTone(440, 0.15, 'sine');
    } catch (e) {
      console.error('Error clearing history:', e);
    }
  }

  // ============================================================================
  // SQLITE KNOWLEDGE CORE & DATASET MANAGEMENT
  // ============================================================================

  function openDatabaseModal() {
    if (!DOM.databaseModal) return;
    DOM.databaseModal.style.display = 'flex';
    loadKnowledgeRecords();
    playTone(480, 0.08);
  }

  function closeDatabaseModal() {
    if (!DOM.databaseModal) return;
    DOM.databaseModal.style.display = 'none';
  }

  async function loadKnowledgeRecords() {
    try {
      if (DOM.knowledgeCardsContainer) {
        DOM.knowledgeCardsContainer.innerHTML = '<div class="knowledge-loading">Querying SQLite database knowledge records...</div>';
      }
      const res = await fetch('/api/knowledge');
      const data = await res.json();

      if (data.success && Array.isArray(data.knowledge)) {
        state.knowledgeRecords = data.knowledge;
        renderKnowledgeRecords(data.knowledge);
        updateKnowledgeBadge(data.knowledge.length);
      }
    } catch (e) {
      console.warn('Error fetching knowledge records:', e);
      if (DOM.knowledgeCardsContainer) {
        DOM.knowledgeCardsContainer.innerHTML = '<div class="knowledge-loading">Failed to load knowledge records from server.</div>';
      }
    }
  }

  function updateKnowledgeBadge(count) {
    if (DOM.knowledgeCountBadge) {
      DOM.knowledgeCountBadge.textContent = count;
    }
    if (DOM.recordCountBadge) {
      DOM.recordCountBadge.textContent = `${count} ${count === 1 ? 'Record' : 'Records'}`;
    }
  }

  function renderKnowledgeRecords(records) {
    if (!DOM.knowledgeCardsContainer) return;
    DOM.knowledgeCardsContainer.innerHTML = '';

    if (!records || records.length === 0) {
      DOM.knowledgeCardsContainer.innerHTML = '<div class="knowledge-loading">No custom knowledge records stored in SQLite yet.</div>';
      return;
    }

    records.forEach((item) => {
      const card = document.createElement('div');
      card.className = 'knowledge-card';

      const body = document.createElement('div');
      body.className = 'knowledge-card-body';

      const meta = document.createElement('div');
      meta.className = 'knowledge-card-meta';

      const topicSpan = document.createElement('span');
      topicSpan.className = 'knowledge-card-topic';
      topicSpan.textContent = item.topic;

      const catSpan = document.createElement('span');
      catSpan.className = 'knowledge-card-cat';
      catSpan.textContent = item.category || 'general';

      meta.appendChild(topicSpan);
      meta.appendChild(catSpan);

      const factP = document.createElement('p');
      factP.className = 'knowledge-card-fact';
      factP.textContent = item.fact;

      body.appendChild(meta);
      body.appendChild(factP);

      const actions = document.createElement('div');
      actions.className = 'knowledge-card-actions';

      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'btn-card-action';
      editBtn.textContent = 'EDIT';
      editBtn.onclick = () => {
        if (DOM.inputKnowledgeTopic) DOM.inputKnowledgeTopic.value = item.topic;
        if (DOM.inputKnowledgeFact) DOM.inputKnowledgeFact.value = item.fact;
        if (DOM.selectKnowledgeCat) DOM.selectKnowledgeCat.value = item.category || 'general';
        if (DOM.inputKnowledgeFact) DOM.inputKnowledgeFact.focus();
        showToast(`Loaded "${item.topic}" into editor`);
      };

      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'btn-card-action btn-del';
      delBtn.textContent = 'DELETE';
      delBtn.onclick = () => deleteKnowledgeRecord(item.id, item.topic);

      actions.appendChild(editBtn);
      actions.appendChild(delBtn);

      card.appendChild(body);
      card.appendChild(actions);

      DOM.knowledgeCardsContainer.appendChild(card);
    });
  }

  async function commitKnowledgeFact(topic, fact, category) {
    try {
      const res = await fetch('/api/knowledge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic, fact, category }),
      });
      const data = await res.json();
      if (data.success) {
        state.knowledgeRecords = data.knowledge;
        renderKnowledgeRecords(data.knowledge);
        updateKnowledgeBadge(data.knowledge.length);
        showToast(`Stored in SQLite: "${topic}"`);
        playTone(600, 0.08);

        if (DOM.inputKnowledgeTopic) DOM.inputKnowledgeTopic.value = '';
        if (DOM.inputKnowledgeFact) DOM.inputKnowledgeFact.value = '';
      } else {
        showToast(data.error || 'Failed to save knowledge record');
      }
    } catch (e) {
      console.error('Error committing knowledge fact:', e);
      showToast('Network error while saving knowledge.');
    }
  }

  async function deleteKnowledgeRecord(id, topic) {
    if (!confirm(`Delete knowledge record for "${topic}"?`)) return;
    try {
      const res = await fetch(`/api/knowledge/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        state.knowledgeRecords = data.knowledge;
        renderKnowledgeRecords(data.knowledge);
        updateKnowledgeBadge(data.knowledge.length);
        showToast(`Deleted knowledge record for "${topic}"`);
        playTone(350, 0.08);
      }
    } catch (e) {
      console.error('Error deleting knowledge record:', e);
    }
  }

  async function restoreDefaultKnowledgeDataset() {
    if (!confirm('Restore SQLite knowledge base to verified 2026 dataset (including Joseph Vijay as CM of Tamil Nadu)?')) return;
    try {
      const res = await fetch('/api/knowledge/reset', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        state.knowledgeRecords = data.knowledge;
        renderKnowledgeRecords(data.knowledge);
        updateKnowledgeBadge(data.knowledge.length);
        showToast('Restored 2026 verified SQLite dataset.');
        playTone(640, 0.12);
      }
    } catch (e) {
      console.error('Error resetting knowledge dataset:', e);
    }
  }

  // --- TOAST NOTIFICATIONS ---
  let toastTimer = null;
  function showToast(msg) {
    if (toastTimer) clearTimeout(toastTimer);
    DOM.toastMsg.textContent = msg;
    DOM.hudToast.style.display = 'flex';
    toastTimer = setTimeout(() => {
      DOM.hudToast.style.display = 'none';
    }, 4000);
  }

  // --- SETTINGS PERSISTENCE ---
  function loadSettings() {
    try {
      const savedTheme = localStorage.getItem('leo_theme') || 'amber';
      applyTheme(savedTheme);

      const savedLang = localStorage.getItem('leo_language') || 'en-US';
      applyLanguage(savedLang);

      const savedPreset = localStorage.getItem('leo_sphere_preset') || 'chakra';
      state.spherePreset = savedPreset;
      if (DOM.selectSpherePresetModal) DOM.selectSpherePresetModal.value = savedPreset;

      const saved = localStorage.getItem('leo_config');
      if (saved) {
        const cfg = JSON.parse(saved);
        state.speechOutputEnabled = cfg.speechOutputEnabled ?? true;
        state.selectedVoiceURI = cfg.selectedVoiceURI || null;
        state.speechRate = cfg.speechRate || 1.0;
        state.speechPitch = cfg.speechPitch || 1.0;
        state.soundEffectsEnabled = cfg.soundEffectsEnabled ?? true;

        if (DOM.toggleSpeechOutput) DOM.toggleSpeechOutput.checked = state.speechOutputEnabled;
        if (DOM.rangeRate) DOM.rangeRate.value = state.speechRate;
        if (DOM.rateValue) DOM.rateValue.textContent = `${state.speechRate}x`;
        if (DOM.rangePitch) DOM.rangePitch.value = state.speechPitch;
        if (DOM.pitchValue) DOM.pitchValue.textContent = `${state.speechPitch}x`;
        if (DOM.toggleSfx) DOM.toggleSfx.checked = state.soundEffectsEnabled;
      }
    } catch (e) {
      console.warn('Settings load error:', e);
    }
  }

  function saveSettings() {
    state.speechOutputEnabled = DOM.toggleSpeechOutput.checked;
    state.selectedVoiceURI = DOM.selectVoice.value || null;
    state.speechRate = parseFloat(DOM.rangeRate.value);
    state.speechPitch = parseFloat(DOM.rangePitch.value);
    state.soundEffectsEnabled = DOM.toggleSfx.checked;

    if (DOM.selectThemeModal) {
      applyTheme(DOM.selectThemeModal.value);
    }
    if (DOM.selectLanguageModal) {
      applyLanguage(DOM.selectLanguageModal.value);
    }
    if (DOM.selectSpherePresetModal) {
      const chosenPreset = DOM.selectSpherePresetModal.value;
      if (EnergySphereEngine) {
        EnergySphereEngine.applyPreset(chosenPreset);
      }
    }

    try {
      localStorage.setItem('leo_config', JSON.stringify({
        speechOutputEnabled: state.speechOutputEnabled,
        selectedVoiceURI: state.selectedVoiceURI,
        speechRate: state.speechRate,
        speechPitch: state.speechPitch,
        soundEffectsEnabled: state.soundEffectsEnabled,
      }));
      showToast('Settings synced to local registry.');
    } catch (e) {
      console.warn('Settings save error:', e);
    }
  }

  // --- HUD CLOCK ---
  function startClock() {
    function updateClock() {
      const now = new Date();
      DOM.hudClock.textContent = now.toTimeString().split(' ')[0];
    }
    updateClock();
    setInterval(updateClock, 1000);
  }

  // --- EVENT LISTENERS ---
  function bindEvents() {
    // 1. Central Sphere Click / Mic Toggle
    function toggleVoiceRecognition() {
      initAudioContext();
      if (!SpeechRecognition) {
        showToast('Speech Recognition not supported in this browser. Please use text input or Google Chrome.');
        return;
      }

      if (state.isRecording) {
        try {
          recognition.stop();
        } catch (e) {}

        const pendingText = (currentTurnTranscript || DOM.textInput.value || '').trim();
        if (!hasDispatchedTurn && pendingText) {
          hasDispatchedTurn = true;
          currentTurnTranscript = '';
          handleUserCommand(pendingText);
        }
      } else {
        try {
          currentTurnTranscript = '';
          hasDispatchedTurn = false;
          recognition.lang = state.selectedLanguage || 'en-US';
          recognition.start();
        } catch (err) {
          console.warn('Recognition start issue:', err);
          if (err.name === 'InvalidStateError') {
            try {
              recognition.stop();
              setTimeout(() => {
                recognition.lang = state.selectedLanguage || 'en-US';
                recognition.start();
              }, 150);
            } catch (retryErr) {}
          } else {
            showToast('Voice receptor unavailable. Please check microphone permissions.');
          }
        }
      }
    }

    DOM.reactorWrapper.addEventListener('click', toggleVoiceRecognition);
    DOM.btnMic.addEventListener('click', toggleVoiceRecognition);

    // Keyboard trigger on reactor wrapper
    DOM.reactorWrapper.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggleVoiceRecognition();
      }
    });

    // Sphere Dual-Color Palette Bar Clicks
    if (DOM.spherePaletteBar) {
      DOM.spherePaletteBar.addEventListener('click', (e) => {
        const btn = e.target.closest('.palette-btn');
        if (btn) {
          const presetKey = btn.getAttribute('data-preset');
          if (presetKey && EnergySphereEngine) {
            EnergySphereEngine.applyPreset(presetKey);
            playTone(720, 0.08, 'sine');
            showToast(`Energy Sphere calibrated to ${SPHERE_PRESETS[presetKey]?.name || presetKey.toUpperCase()}`);
          }
        }
      });
    }

    // Modal Preset Selector
    if (DOM.selectSpherePresetModal) {
      DOM.selectSpherePresetModal.addEventListener('change', (e) => {
        if (EnergySphereEngine) {
          EnergySphereEngine.applyPreset(e.target.value);
        }
      });
    }

    // 2. Chat Form Submit
    DOM.chatForm.addEventListener('submit', (e) => {
      e.preventDefault();
      initAudioContext();
      const val = DOM.textInput.value.trim();
      if (val) {
        handleUserCommand(val);
      }
    });

    // Text Input typing
    DOM.textInput.addEventListener('input', () => {
      DOM.btnClearInput.style.display = DOM.textInput.value ? 'block' : 'none';
    });

    DOM.btnClearInput.addEventListener('click', () => {
      DOM.textInput.value = '';
      DOM.btnClearInput.style.display = 'none';
      DOM.textInput.focus();
    });

    // Header Quick Language Select
    if (DOM.hudLanguageSelect) {
      DOM.hudLanguageSelect.addEventListener('change', (e) => {
        applyLanguage(e.target.value);
        playTone(520, 0.08);
        showToast(`Language updated to ${LANGUAGE_MAP[e.target.value] || e.target.value}`);
      });
    }

    // Header Quick Theme Select
    if (DOM.hudThemeSelect) {
      DOM.hudThemeSelect.addEventListener('change', (e) => {
        applyTheme(e.target.value);
        playTone(680, 0.08);
        showToast(`Hologram color theme set to ${e.target.value.toUpperCase()}`);
      });
    }

    // 3. Quick Command Chips
    document.querySelectorAll('.cmd-chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        initAudioContext();
        const cmd = chip.getAttribute('data-cmd');
        if (cmd) {
          handleUserCommand(cmd);
        }
      });
    });

    // 4. Transcript Panel Toggles
    DOM.btnToggleChat.addEventListener('click', () => {
      DOM.chatPanel.classList.toggle('collapsed');
      playTone(500, 0.05);
    });

    DOM.btnCloseChat.addEventListener('click', () => {
      DOM.chatPanel.classList.add('collapsed');
    });

    DOM.btnClearChat.addEventListener('click', () => {
      if (confirm('Purge all conversation transcripts from SQLite memory?')) {
        clearChatHistory();
      }
    });

    // 5. Settings Modal Controls
    DOM.btnOpenSettings.addEventListener('click', () => {
      populateVoiceList();
      if (DOM.selectThemeModal) DOM.selectThemeModal.value = state.selectedTheme;
      if (DOM.selectLanguageModal) DOM.selectLanguageModal.value = state.selectedLanguage;
      if (DOM.selectSpherePresetModal) DOM.selectSpherePresetModal.value = state.spherePreset || 'chakra';
      DOM.settingsModal.style.display = 'flex';
      playTone(400, 0.06);
    });

    DOM.btnCloseSettings.addEventListener('click', () => {
      DOM.settingsModal.style.display = 'none';
    });

    DOM.btnSaveSettings.addEventListener('click', () => {
      saveSettings();
      DOM.settingsModal.style.display = 'none';
    });

    DOM.rangeRate.addEventListener('input', () => {
      DOM.rateValue.textContent = `${DOM.rangeRate.value}x`;
    });

    DOM.rangePitch.addEventListener('input', () => {
      DOM.pitchValue.textContent = `${DOM.rangePitch.value}x`;
    });

    DOM.btnTestVoice.addEventListener('click', () => {
      saveSettings();
      speakResponse('Vocal output test initiated. All L.E.O. neural synthesizers operational, sir.');
    });

    DOM.btnClearDbHistory.addEventListener('click', () => {
      if (confirm('Are you certain you wish to purge SQLite memory records, sir?')) {
        clearChatHistory();
      }
    });

    // 6. Database & Knowledge Core Modal Controls
    if (DOM.btnOpenDatabase) {
      DOM.btnOpenDatabase.addEventListener('click', () => {
        openDatabaseModal();
      });
    }

    if (DOM.chipOpenDbModal) {
      DOM.chipOpenDbModal.addEventListener('click', () => {
        openDatabaseModal();
      });
    }

    if (DOM.btnCloseDatabase) {
      DOM.btnCloseDatabase.addEventListener('click', () => {
        closeDatabaseModal();
      });
    }

    if (DOM.btnCloseDbBottom) {
      DOM.btnCloseDbBottom.addEventListener('click', () => {
        closeDatabaseModal();
      });
    }

    if (DOM.databaseModal) {
      DOM.databaseModal.addEventListener('click', (e) => {
        if (e.target === DOM.databaseModal) {
          closeDatabaseModal();
        }
      });
    }

    // Knowledge Form submission
    if (DOM.knowledgeForm) {
      DOM.knowledgeForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const topic = DOM.inputKnowledgeTopic.value.trim();
        const fact = DOM.inputKnowledgeFact.value.trim();
        const category = DOM.selectKnowledgeCat.value;
        if (topic && fact) {
          commitKnowledgeFact(topic, fact, category);
        }
      });
    }

    if (DOM.btnResetKnowledgeForm) {
      DOM.btnResetKnowledgeForm.addEventListener('click', () => {
        if (DOM.inputKnowledgeTopic) DOM.inputKnowledgeTopic.value = '';
        if (DOM.inputKnowledgeFact) DOM.inputKnowledgeFact.value = '';
      });
    }

    if (DOM.btnResetDefaultDataset) {
      DOM.btnResetDefaultDataset.addEventListener('click', () => {
        restoreDefaultKnowledgeDataset();
      });
    }

    if (DOM.btnClearMessagesOnly) {
      DOM.btnClearMessagesOnly.addEventListener('click', () => {
        if (confirm('Purge past chat conversation logs so old answers do not linger?')) {
          clearChatHistory();
        }
      });
    }

    // Click outside modal to close
    DOM.settingsModal.addEventListener('click', (e) => {
      if (e.target === DOM.settingsModal) {
        DOM.settingsModal.style.display = 'none';
      }
    });
  }

  // --- INITIALIZATION ---
  function init() {
    startClock();
    loadSettings();
    bindEvents();
    loadHistory();
    loadKnowledgeRecords();

    // Initialize 3D Dual-Layer Energy Sphere Engine
    if (DOM.energySphereCanvas && EnergySphereEngine) {
      EnergySphereEngine.init(DOM.energySphereCanvas);
    }

    // Initial audio boot chime on first click
    window.addEventListener(
      'click',
      () => {
        initAudioContext();
      },
      { once: true }
    );

    console.log('[L.E.O.] System MK-VIII initialized with 3D Dual-Layer Energy Sphere.');
  }

  // Run when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
