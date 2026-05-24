/* ==========================================================================
   Cosmic JavaScript: "I Can Say" Interactive Logic & Game Engine
   ========================================================================== */

// App State Management
let currentSpeed = 1.0;          // Voice rate: 1.0 (Normal), 0.6 (Slow)
let activeMode = 'practice';     // 'practice' or 'quiz'
let activeVoiceStyle = 'kid';    // 'kid' (Cute child voice) or 'teacher' (Pure Online TTS)
let currentVoices = [];          // Available voices array
let isSpeaking = false;          // Speech synthesis locking
let onlineAudio = null;          // Handle for Google Translate audio player

// Quiz Game Variables
let quizQuestions = [];          // Current randomized question queue
let currentQuestionIndex = 0;    // Active question pointer
let quizScore = 0;               // User's correct count
let targetCharacter = '';        // Active character to find
let hasResponded = false;        // Answer lock per question

// Web Audio API Synthesizer Context
let audioCtx = null;

/**
 * Initializes the AudioContext lazily on user gesture.
 */
function getAudioContext() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

/* ==========================================================================
   Voice Engine: Dual-Style (Pure Online Teacher & High-pitch Cute Kid)
   ========================================================================== */

/**
 * Loads available system voices in background for local kid voice selection.
 */
function loadVoices() {
  if (typeof speechSynthesis === 'undefined') return;
  currentVoices = speechSynthesis.getVoices();
}

// Bind loadVoices to speech synthesis events
if (typeof speechSynthesis !== 'undefined') {
  if (speechSynthesis.onvoiceschanged !== undefined) {
    speechSynthesis.onvoiceschanged = loadVoices;
  }
}

// Initial voice load call
document.addEventListener('DOMContentLoaded', () => {
  loadVoices();

  // Bind Repeat button
  document.getElementById('btn-repeat').addEventListener('click', () => {
    if (activeMode === 'quiz' && targetCharacter) {
      speakQuestCommand(targetCharacter);
    }
  });

  // Setup click triggers to initialize audio context
  document.addEventListener('click', () => {
    getAudioContext();
  }, { once: true });
});

/**
 * Switch voice style between 'kid' and 'teacher'.
 * @param {string} style - 'kid' or 'teacher'
 */
function setVoiceStyle(style) {
  activeVoiceStyle = style;
  
  document.getElementById('voice-style-kid').classList.toggle('active', style === 'kid');
  document.getElementById('voice-style-teacher').classList.toggle('active', style === 'teacher');
  
  playSynthesizerSound('click');
}

/**
 * Universal Speak Function.
 * Directs speech to Google Online Teacher TTS or Cute Kid System Synthesis based on style.
 * @param {string} text - The text to speak.
 * @param {function} onEndCallback - Callback executed when speaking finishes.
 */
function speak(text, onEndCallback = null) {
  // Cancel any active speech synthesis
  if (typeof speechSynthesis !== 'undefined') {
    speechSynthesis.cancel();
  }
  // Pause any active online audio player
  if (onlineAudio) {
    onlineAudio.pause();
    onlineAudio = null;
  }

  if (activeVoiceStyle === 'teacher') {
    playOnlineTTS(text, onEndCallback);
  } else {
    speakLocalKid(text, onEndCallback);
  }
}

/**
 * Style 1: Pure Online Teacher TTS (High-fidelity, standard US accent)
 */
function playOnlineTTS(text, onEndCallback) {
  try {
    // Google Translate TTS URL
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&tl=en&client=tw-ob&q=${encodeURIComponent(text)}`;
    onlineAudio = new Audio(url);
    
    // Support Normal (1.0) and Slow (0.6) speeds on online audio playback!
    onlineAudio.playbackRate = currentSpeed;
    
    onlineAudio.onplay = () => {
      isSpeaking = true;
    };
    
    onlineAudio.onended = () => {
      isSpeaking = false;
      onlineAudio = null;
      if (onEndCallback) onEndCallback();
    };
    
    onlineAudio.onerror = (e) => {
      console.warn("Online Google TTS failed, falling back to local Cute Kid voice.", e);
      isSpeaking = false;
      onlineAudio = null;
      speakLocalKid(text, onEndCallback);
    };
    
    onlineAudio.play().catch(err => {
      console.warn("Audio play blocked by browser, falling back to local Cute Kid voice.", err);
      speakLocalKid(text, onEndCallback);
    });
  } catch (error) {
    console.warn("Online Audio failed, falling back.", error);
    speakLocalKid(text, onEndCallback);
  }
}

/**
 * Style 2: High-pitch Cute Kid Voice (Emulated or Apple native kid voices)
 */
function speakLocalKid(text, onEndCallback) {
  if (typeof speechSynthesis === 'undefined') {
    if (onEndCallback) onEndCallback();
    return;
  }

  const utterance = new SpeechSynthesisUtterance(text);
  const englishVoices = currentVoices.filter(voice => voice.lang.toLowerCase().startsWith('en'));
  let matchedVoice = null;
  
  // 1st Priority: Genuine, highly realistic real human children's voices!
  // These are Apple's official high-fidelity neural child voice recordings (Sandy, Shelly, Eddy, Flo, Liam, Olivia)
  const realChildVoiceNames = [
    'Sandy',
    'Shelly',
    'Eddy',
    'Flo',
    'Liam',
    'Olivia'
  ];
  
  for (const name of realChildVoiceNames) {
    const found = englishVoices.find(voice => voice.name.includes(name));
    if (found) {
      matchedVoice = found;
      console.log(`Detected and activated genuine real child voice: ${found.name}`);
      break;
    }
  }
  
  // 2nd Priority: If no real child voice is installed, use clear, warm, natural neural voices
  if (!matchedVoice) {
    const preferredWarmVoices = [
      'Google US English',
      'Google UK English Female',
      'Samantha',
      'Microsoft Zira',
      'Siri',
      'Daniel'
    ];
    
    for (const name of preferredWarmVoices) {
      const found = englishVoices.find(voice => voice.name.includes(name));
      if (found) {
        matchedVoice = found;
        break;
      }
    }
  }
  
  if (matchedVoice) {
    utterance.voice = matchedVoice;
  } else if (englishVoices.length > 0) {
    utterance.voice = englishVoices[0];
  }

  // If a genuine child voice is used, we keep its native natural pitch (1.0).
  // If it's a fallback adult voice, we apply a gentle cheerful lift (1.08).
  const isRealChild = matchedVoice && realChildVoiceNames.some(name => matchedVoice.name.includes(name));
  utterance.pitch = isRealChild ? 1.0 : 1.08; 
  utterance.rate = currentSpeed * (isRealChild ? 0.95 : 0.90); // Adjust child speed

  utterance.onstart = () => {
    isSpeaking = true;
  };

  utterance.onend = () => {
    isSpeaking = false;
    if (onEndCallback) onEndCallback();
  };

  utterance.onerror = () => {
    isSpeaking = false;
    if (onEndCallback) onEndCallback();
  };

  speechSynthesis.speak(utterance);
}

/* ==========================================================================
   Web Audio Synthesizer: Retro and Interactive Game Sounds
   ========================================================================== */

/**
 * Generates immediate retro-synth style sounds on-the-fly using Web Audio API.
 * @param {string} type - The sound profile ID ('click', 'pop', 'success', 'error', 'victory')
 */
function playSynthesizerSound(type) {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();
    
    osc.connect(gainNode);
    gainNode.connect(ctx.destination);
    
    const now = ctx.currentTime;

    if (type === 'click') {
      // Subtle neat tactile click
      osc.type = 'sine';
      osc.frequency.setValueAtTime(600, now);
      osc.frequency.exponentialRampToValueAtTime(150, now + 0.06);
      gainNode.gain.setValueAtTime(0.08, now);
      gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
      osc.start(now);
      osc.stop(now + 0.06);
    } 
    else if (type === 'pop') {
      // Bubbly ascending pitch pop
      osc.type = 'sine';
      osc.frequency.setValueAtTime(300, now);
      osc.frequency.exponentialRampToValueAtTime(1200, now + 0.12);
      gainNode.gain.setValueAtTime(0.12, now);
      gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
      osc.start(now);
      osc.stop(now + 0.12);
    } 
    else if (type === 'success') {
      // Joyful rapid arpeggio (C5 -> E5 -> G5 -> C6)
      const notes = [523.25, 659.25, 783.99, 1046.50];
      const duration = 0.08;
      
      notes.forEach((freq, idx) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.connect(g);
        g.connect(ctx.destination);
        
        o.type = 'triangle';
        o.frequency.setValueAtTime(freq, now + idx * duration);
        g.gain.setValueAtTime(0.12, now + idx * duration);
        g.gain.exponentialRampToValueAtTime(0.001, now + idx * duration + duration);
        
        o.start(now + idx * duration);
        o.stop(now + idx * duration + duration);
      });
    } 
    else if (type === 'error') {
      // Springy sliding boing down
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(220, now);
      osc.frequency.linearRampToValueAtTime(80, now + 0.35);
      
      // Filter out high frequencies to make it smoother
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(400, now);
      
      osc.disconnect(gainNode);
      osc.connect(filter);
      filter.connect(gainNode);
      
      gainNode.gain.setValueAtTime(0.15, now);
      gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      
      osc.start(now);
      osc.stop(now + 0.35);
    }
    else if (type === 'victory') {
      // Magnificent futuristic chord cascade
      const baseFreqs = [261.63, 329.63, 392.00, 523.25]; // C major chord
      
      baseFreqs.forEach((base, chordIdx) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.connect(g);
        g.connect(ctx.destination);
        
        o.type = 'sine';
        // Pitch ramps up into a cosmic shine
        o.frequency.setValueAtTime(base * 1.5, now + chordIdx * 0.1);
        o.frequency.exponentialRampToValueAtTime(base * 3, now + chordIdx * 0.1 + 0.6);
        
        g.gain.setValueAtTime(0.08, now + chordIdx * 0.1);
        g.gain.exponentialRampToValueAtTime(0.001, now + chordIdx * 0.1 + 0.6);
        
        o.start(now + chordIdx * 0.1);
        o.stop(now + chordIdx * 0.1 + 0.6);
      });
    }
  } catch (error) {
    console.warn("AudioContext block or synthesis failed: ", error);
  }
}

/* ==========================================================================
   Visual Effects: Star Confetti & Particle Sparks
   ========================================================================== */

/**
 * Creates a circular wave ripple expanding from the clicked element coordinate.
 * @param {number} x - Page horizontal coordinate.
 * @param {number} y - Page vertical coordinate.
 */
function createSoundRipple(x, y) {
  const ripple = document.createElement('div');
  ripple.className = 'ripple-ring';
  ripple.style.left = `${x}px`;
  ripple.style.top = `${y}px`;
  document.body.appendChild(ripple);
  
  // Clean up ripple element from DOM
  setTimeout(() => ripple.remove(), 800);
}

/**
 * Spawns multicolored spark and star particles from a point.
 * @param {number} x - Center horizontal point.
 * @param {number} y - Center vertical point.
 * @param {number} count - Amount of particles to create.
 */
function spawnParticles(x, y, count = 12) {
  const colors = ['#ff2e93', '#00f0ff', '#ffd700', '#10b981', '#ff4b5c', '#c084fc'];
  
  for (let i = 0; i < count; i++) {
    const particle = document.createElement('div');
    particle.className = 'particle';
    
    // Choose random color, shape, size
    const color = colors[Math.floor(Math.random() * colors.length)];
    const size = Math.random() * 8 + 6; // 6px to 14px
    
    particle.style.width = `${size}px`;
    particle.style.height = `${size}px`;
    particle.style.background = color;
    
    // Assign visual box shadow glow
    particle.style.boxShadow = `0 0 10px ${color}`;
    
    // Place particle at coordinates
    particle.style.left = `${x}px`;
    particle.style.top = `${y}px`;
    
    // Randomize angle and speed velocity
    const angle = Math.random() * Math.PI * 2;
    const distance = Math.random() * 90 + 40; // Spreads 40px to 130px
    const targetX = Math.cos(angle) * distance;
    const targetY = Math.sin(angle) * distance;
    
    // Apply coordinates to CSS custom properties
    particle.style.setProperty('--x', `${targetX}px`);
    particle.style.setProperty('--y', `${targetY}px`);
    
    // Add particle to document body
    document.body.appendChild(particle);
    
    // Clean up from DOM after animation ends
    setTimeout(() => particle.remove(), 800);
  }
}

/**
 * Spawns full-screen falling victory confetti.
 */
function triggerScreenVictoryConfetti() {
  const colors = ['#ff2e93', '#00f0ff', '#ffd700', '#10b981', '#ff4b5c', '#c084fc'];
  const confettiCount = 80;
  
  for (let i = 0; i < confettiCount; i++) {
    const confetti = document.createElement('div');
    confetti.className = 'particle';
    
    const color = colors[Math.floor(Math.random() * colors.length)];
    const size = Math.random() * 12 + 8;
    const shapeRandom = Math.random();
    
    confetti.style.width = `${size}px`;
    confetti.style.height = shapeRandom > 0.5 ? `${size}px` : `${size * 0.4}px`; // Streamers or dots
    confetti.style.background = color;
    confetti.style.borderRadius = shapeRandom > 0.3 ? '50%' : '2px';
    
    // Spawn across top width of screen
    const spawnX = Math.random() * window.innerWidth;
    const spawnY = window.pageYOffset - 20; // Just above screen
    
    confetti.style.left = `${spawnX}px`;
    confetti.style.top = `${spawnY}px`;
    
    // Fall downwards with wind variance
    const windX = (Math.random() - 0.5) * 150;
    const dropY = window.innerHeight + Math.random() * 200 + 100;
    
    confetti.style.setProperty('--x', `${windX}px`);
    confetti.style.setProperty('--y', `${dropY}px`);
    
    // Fast falling animation
    confetti.style.animationDuration = `${Math.random() * 1.5 + 1.2}s`;
    
    document.body.appendChild(confetti);
    setTimeout(() => confetti.remove(), 2500);
  }
}

/* ==========================================================================
   Practice Mode Interactions
   ========================================================================== */

/**
 * Speech speed controller setup.
 * @param {number} rateVal - Velocity speed.
 */
function setSpeed(rateVal) {
  currentSpeed = rateVal;
  
  document.getElementById('speed-normal').classList.toggle('active', rateVal === 1);
  document.getElementById('speed-slow').classList.toggle('active', rateVal === 0.6);
  
  playSynthesizerSound('click');
}

/**
 * Main switchboard for changing practice and quiz modes.
 * @param {string} mode - Mode identity.
 */
function setMode(mode) {
  activeMode = mode;
  
  // Set UI status triggers
  document.getElementById('mode-practice').classList.toggle('active', mode === 'practice');
  document.getElementById('mode-quiz').classList.toggle('active', mode === 'quiz');
  
  const quizBanner = document.getElementById('quiz-banner');
  const rocketFuselage = document.querySelector('.rocket-fuselage');
  
  playSynthesizerSound('click');

  if (mode === 'quiz') {
    quizBanner.classList.remove('hidden');
    // Change rocket visual mode to semi-shaded to keep focus on astronaut map
    document.querySelector('.rocket-deck-section').style.opacity = '0.5';
    document.querySelector('.rocket-deck-section').style.pointerEvents = 'none';
    startQuiz();
  } else {
    quizBanner.classList.add('hidden');
    document.querySelector('.rocket-deck-section').style.opacity = '1';
    document.querySelector('.rocket-deck-section').style.pointerEvents = 'auto';
    
    // Clear speaking bubble timers and active elements
    document.querySelectorAll('.astronaut-wrapper').forEach(node => {
      node.classList.remove('active-speaking', 'correct-answer');
      const bubble = node.querySelector('.name-bubble');
      if (bubble) bubble.classList.add('hidden');
    });
    
    document.getElementById('quiz-complete-modal').classList.add('hidden');
    speechSynthesis.cancel();
  }
}

/**
 * Handles clicking character passenger windows in the yellow rocket deck.
 * @param {string} charName - Name of the character ("Zack", "Lina", etc.)
 * @param {HTMLElement} element - Clicked DOM card element.
 */
function speakCharacter(charName, element) {
  if (activeMode !== 'practice') return; // Rocket deck locked in quiz mode

  // Trigger feedback UI
  playSynthesizerSound('click');
  element.classList.add('active-voice');
  
  // Calculate coordinate center for visuals
  const rect = element.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2 + window.pageXOffset;
  const centerY = rect.top + rect.height / 2 + window.pageYOffset;
  
  createSoundRipple(centerX, centerY);
  spawnParticles(centerX, centerY, 8);

  // Pronounce character name
  speak(charName, () => {
    // Callback: turn off glowing state when TTS completes
    element.classList.remove('active-voice');
  });
}

/**
 * Handles clicking astronauts inside space helmets in the Galaxy starfield map.
 * @param {string} charName - Name of astronaut.
 * @param {HTMLElement} element - Clicked astronaut wrapper card.
 */
function clickAstronaut(charName, element) {
  // Get coordinate placement
  const rect = element.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2 + window.pageXOffset;
  const centerY = rect.top + rect.height / 2 + window.pageYOffset;

  if (activeMode === 'practice') {
    // 📚 PRACTICE MODE: Show speech bubble name and say name
    playSynthesizerSound('pop');
    
    // Create ripple and visual spark burst
    createSoundRipple(centerX, centerY);
    spawnParticles(centerX, centerY, 10);
    
    // Wiggle astronaut suit
    const suit = element.querySelector('.astronaut-suit-container');
    suit.style.animation = 'none';
    element.offsetHeight; // Trigger reflow
    suit.style.animation = 'rocketEngineShake 0.3s ease-in-out 2 alternate';

    // Highlight and show speech bubble
    document.querySelectorAll('.astronaut-wrapper').forEach(node => {
      node.classList.remove('active-speaking');
      const b = node.querySelector('.name-bubble');
      if (b) b.classList.remove('show');
    });

    element.classList.add('active-speaking');
    const bubble = element.querySelector('.name-bubble');
    if (bubble) {
      bubble.classList.remove('hidden');
      bubble.classList.add('show');
    }

    // Speak full sentence and auto hide speech bubble in 2 seconds
    const sentenceMap = {
      'Lina': "Hi, I'm Lina!",
      'Zack': "Hello, I'm Zack!",
      'Joe': "Yo, I'm Joe!",
      'Jayla': "Hey, I'm Jayla!"
    };
    const fullSentence = sentenceMap[charName] || `Hi, I'm ${charName}!`;
    
    speak(fullSentence, () => {
      element.classList.remove('active-speaking');
    });
    
    // Auto collapse speech balloon
    setTimeout(() => {
      if (bubble) bubble.classList.remove('show');
    }, 2000);

  } else {
    // 🎮 QUIZ MODE: Validate if this is the target character we are hunting
    if (hasResponded) return; // Answer locked during scoring animation delay
    
    validateQuizAnswer(charName, element, centerX, centerY);
  }
}

/* ==========================================================================
   Quiz Mode Logic ("Space Quest" Game)
   ========================================================================== */

/**
 * Launches the quiz: resets variables, shuffles characters queue, asks first question.
 */
function startQuiz() {
  quizScore = 0;
  currentQuestionIndex = 0;
  hasResponded = false;
  
  document.getElementById('score-current').textContent = quizScore;
  document.getElementById('quiz-complete-modal').classList.add('hidden');
  
  // Clear any existing victory glowing states
  document.querySelectorAll('.astronaut-wrapper').forEach(node => {
    node.classList.remove('correct-answer', 'active-speaking');
    const b = node.querySelector('.name-bubble');
    if (b) b.classList.remove('show');
  });

  // Load and randomize the 4 character names
  quizQuestions = ['Zack', 'Lina', 'Joe', 'Jayla'];
  shuffleArray(quizQuestions);

  // Small delay for beautiful entrance flow, then ask question
  setTimeout(() => {
    askQuizQuestion();
  }, 400);
}

/**
 * Asks the active randomized question from the queue.
 */
function askQuizQuestion() {
  if (currentQuestionIndex >= quizQuestions.length) {
    // Quiz completed!
    showQuizVictory();
    return;
  }

  targetCharacter = quizQuestions[currentQuestionIndex];
  hasResponded = false;

  // Visual text prompt update
  const promptText = `Find ${targetCharacter}! 🔍`;
  document.getElementById('quiz-question').innerHTML = `Where is <span class="highlight-target">${targetCharacter}</span>?`;
  
  // Highlighting styled target text in CSS
  const span = document.querySelector('.highlight-target');
  if (span) {
    if (targetCharacter === 'Lina') span.style.color = 'var(--accent-pink)';
    if (targetCharacter === 'Zack') span.style.color = 'var(--accent-cyan)';
    if (targetCharacter === 'Joe') span.style.color = 'var(--accent-green)';
    if (targetCharacter === 'Jayla') span.style.color = 'var(--accent-orange)';
  }

  // Voice command ask
  speakQuestCommand(targetCharacter);
}

/**
 * Plays standard child-friendly voice instructions asking the kid to find the character.
 * @param {string} char - Target character name.
 */
function speakQuestCommand(char) {
  const introPhrases = [
    `Where is ${char}?`,
    `Can you find ${char}?`,
    `Click on ${char}!`,
    `Where is our friend ${char}?`
  ];
  
  // Choose random phrase to make it engaging and diverse!
  const phrase = introPhrases[currentQuestionIndex % introPhrases.length];
  speak(phrase);
}

/**
 * Validates the user's clicked answer in Quiz Mode.
 * @param {string} clickedName - Clicked astronaut name.
 * @param {HTMLElement} element - Clicked astronaut wrapper card.
 * @param {number} x - Click coordinate x.
 * @param {number} y - Click coordinate y.
 */
function validateQuizAnswer(clickedName, element, x, y) {
  hasResponded = true;

  if (clickedName === targetCharacter) {
    // === SUCCESS / CORRECT! ===
    playSynthesizerSound('success');
    createSoundRipple(x, y);
    spawnParticles(x, y, 18);
    
    // Add success glow class
    element.classList.add('correct-answer');
    
    // Shake/Float up correct astronaut
    const suit = element.querySelector('.astronaut-suit-container');
    suit.style.animation = 'none';
    element.offsetHeight; // Force layout recalculation
    suit.style.animation = 'floatSuit 0.4s ease-in-out infinite alternate';

    // Show name speech bubble
    const bubble = element.querySelector('.name-bubble');
    if (bubble) {
      bubble.classList.remove('hidden');
      bubble.classList.add('show');
    }

    // Award point
    quizScore++;
    document.getElementById('score-current').textContent = quizScore;

    // Say positive confirmation
    const praisePhrases = ["Great job!", "You found me!", "Excellent!", "Awesome!"];
    const praise = praisePhrases[Math.floor(Math.random() * praisePhrases.length)];
    
    speak(`${praise} This is ${targetCharacter}!`, () => {
      // Advance to next question after TTS completes
      setTimeout(() => {
        if (bubble) bubble.classList.remove('show');
        currentQuestionIndex++;
        askQuizQuestion();
      }, 800);
    });

  } else {
    // === FAILURE / INCORRECT! ===
    playSynthesizerSound('error');
    
    // Shake incorrect astronaut
    const suit = element.querySelector('.astronaut-suit-container');
    suit.style.animation = 'none';
    element.offsetHeight;
    suit.style.animation = 'rocketEngineShake 0.3s ease-in-out 3 alternate';

    // Say gentle learning reminder/feedback: "That's Lina! Can you find Joe?"
    speak(`That is ${clickedName}! Let's try again to find ${targetCharacter}!`, () => {
      // Release lock so they can guess again
      setTimeout(() => {
        hasResponded = false;
      }, 500);
    });
  }
}

/**
 * Handles completing the game: sounds victory chime, confetti explosion, triggers victory screen.
 */
function showQuizVictory() {
  playSynthesizerSound('victory');
  
  // Confetti bursts
  triggerScreenVictoryConfetti();
  setTimeout(triggerScreenVictoryConfetti, 300);
  setTimeout(triggerScreenVictoryConfetti, 650);

  // Show complete modal
  const modal = document.getElementById('quiz-complete-modal');
  modal.classList.remove('hidden');
}

/**
 * Resets the game and returns to active quiz.
 */
function resetQuiz() {
  playSynthesizerSound('click');
  document.getElementById('quiz-complete-modal').classList.add('hidden');
  startQuiz();
}

/* ==========================================================================
   Utility Helpers
   ========================================================================== */

/**
 * standard array random shuffler (Fisher-Yates)
 * @param {Array} array - Array to shuffle.
 */
function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}
