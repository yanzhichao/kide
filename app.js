// 儿童发音容错：相似度阈值（越低越宽松）
const WORD_SIMILARITY = 0.36;
const SENTENCE_SIMILARITY = 0.32;
const FULL_SENTENCE_SIMILARITY = 0.28;

const CHALLENGES = [
  {
    id: 'baker',
    emoji: '\u{1F468}\u200D\u{1F373}',
    word: 'baker',
    speak: 'baker',
    sentence: '',
    type: 'word',
    accept: ['baker', 'bake', 'becker', 'backer', 'breaker', 'bacon', 'bake', 'baker', 'pay', 'bay'],
    shelfId: 'shelf-baker',
    stars: 1,
  },
  {
    id: 'donuts',
    emoji: '\u{1F369}',
    word: 'donuts',
    speak: 'donuts',
    sentence: '',
    type: 'word',
    accept: ['donut', 'donuts', 'doughnut', 'doughnuts', 'do not', 'dough nuts', 'dono', 'donor', 'do nuts'],
    shelfId: 'shelf-donuts',
    stars: 1,
  },
  {
    id: 'bread',
    emoji: '\u{1F35E}',
    word: 'bread',
    speak: 'bread',
    sentence: '',
    type: 'word',
    accept: ['bread', 'bred', 'spread', 'bed', 'braid', 'brad', 'red', 'bred'],
    shelfId: 'shelf-bread',
    stars: 1,
  },
  {
    id: 'cookies',
    emoji: '\u{1F36A}',
    word: 'cookies',
    speak: 'cookies',
    sentence: '',
    type: 'word',
    accept: ['cookie', 'cookies', 'cooky', 'cookys', 'kooky', 'kookies', 'coke', 'cokey', 'coogi', 'coo'],
    shelfId: 'shelf-cookies',
    stars: 1,
  },
  {
    id: 'sent-baker',
    emoji: '\u{1F468}\u200D\u{1F373}',
    word: 'I am a baker.',
    speak: 'I am a baker.',
    sentence: '',
    type: 'sentence',
    accept: [
      'i am a baker', 'im a baker', 'i am baker', 'am a baker', 'i m a baker',
      'i am a paper', 'i am a maker', 'i am a bake', 'i am a bay',
      'i am baker', 'am baker', 'i baker',
    ],
    shelfId: null,
    stars: 1,
  },
  {
    id: 'sent-full',
    emoji: '\u{1F973}',
    word: 'I am a baker. I like ____.',
    type: 'sentence-full',
    accept: [
      'i am a baker i like donuts',
      'i am a baker i like donut',
      'i am a baker i like bread',
      'i am a baker i like cookies',
      'i am a baker i like cookie',
      'im a baker i like',
      'i am baker i like',
      'i am a baker like',
      'a baker i like',
      'baker like donuts', 'baker like bread', 'baker like cookies',
    ],
    foods: [
      { id: 'donuts', label: 'donuts', emoji: '\u{1F369}' },
      { id: 'bread', label: 'bread', emoji: '\u{1F35E}' },
      { id: 'cookies', label: 'cookies', emoji: '\u{1F36A}' },
    ],
    shelfId: null,
    stars: 3,
  },
];

const LEVEL_6_INDEX = CHALLENGES.findIndex((c) => c.id === 'sent-full');

let selectedFoodId = 'donuts';

let currentIdx = 0;
let totalStars = 0;
let isDone = false;
let isRecording = false;
let recognition = null;
let micStream = null;
let mediaRecorder = null;
let audioChunks = [];
let lastTranscript = '';
let sessionTranscripts = [];
let level6ManualStop = false;
let level6EvalTimer = null;
let meterAnimId = null;
let audioContext = null;
let analyser = null;

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

function $(id) {
  return document.getElementById(id);
}

function checkEnvironment() {
  if (location.protocol === 'file:') {
    $('env-banner').classList.add('show');
  }
  if (!SR) {
    $('no-support').style.display = 'block';
    $('mic-btn').disabled = true;
  }
}

async function ensureMicAccess() {
  if (location.protocol === 'file:') {
    setStatus('Please run start.bat, then open http://localhost:8080');
    return false;
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    setStatus('Microphone not available in this browser.');
    return false;
  }
  if (micStream) return true;

  try {
    micStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
    });
    setupAudioMeter(micStream);
    setStatus('Mic ready! Tap to record.');
    return true;
  } catch {
    setStatus('Allow microphone access in browser settings.');
    return false;
  }
}

function setupAudioMeter(stream) {
  const meter = $('audio-meter');
  if (!meter.children.length) {
    for (let i = 0; i < 8; i++) meter.appendChild(document.createElement('span'));
  }
  audioContext = audioContext || new (window.AudioContext || window.webkitAudioContext)();
  if (audioContext.state === 'suspended') audioContext.resume();
  analyser = audioContext.createAnalyser();
  analyser.fftSize = 64;
  audioContext.createMediaStreamSource(stream).connect(analyser);
  const bars = meter.querySelectorAll('span');
  const data = new Uint8Array(analyser.frequencyBinCount);

  meter._tick = function tick() {
    if (!isRecording) return;
    analyser.getByteFrequencyData(data);
    bars.forEach((bar, i) => {
      const v = data[i * 2] || 0;
      bar.style.height = Math.max(6, (v / 255) * 28) + 'px';
    });
    meterAnimId = requestAnimationFrame(tick);
  };
}

function startMeter() {
  $('audio-meter').classList.add('active');
  const meter = $('audio-meter');
  if (meter._tick) meter._tick();
}

function stopMeter() {
  $('audio-meter').classList.remove('active');
  if (meterAnimId) cancelAnimationFrame(meterAnimId);
  meterAnimId = null;
  document.querySelectorAll('#audio-meter span').forEach((b) => {
    b.style.height = '6px';
  });
}

function startAudioCapture() {
  if (!micStream) return;
  audioChunks = [];
  const mime = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '';
  try {
    mediaRecorder = mime
      ? new MediaRecorder(micStream, { mimeType: mime })
      : new MediaRecorder(micStream);
  } catch {
    mediaRecorder = new MediaRecorder(micStream);
  }
  mediaRecorder.ondataavailable = (e) => {
    if (e.data?.size) audioChunks.push(e.data);
  };
  mediaRecorder.onstop = finishAudioCapture;
  mediaRecorder.start(200);
}

function stopAudioCapture() {
  if (mediaRecorder?.state !== 'inactive') mediaRecorder.stop();
  else finishAudioCapture();
}

function finishAudioCapture() {
  if (!audioChunks.length) return;
  const blob = new Blob(audioChunks, { type: audioChunks[0].type || 'audio/webm' });
  audioChunks = [];
  const url = URL.createObjectURL(blob);
  const ch = CHALLENGES[currentIdx];

  const playback = $('last-playback');
  if (playback.src) URL.revokeObjectURL(playback.src);
  playback.src = url;
  $('playback-box').classList.add('show');
  addRecordingToList(ch.word, url);
}

function addRecordingToList(label, url) {
  $('recordings-panel').classList.add('show');
  const row = document.createElement("div");
  row.className = 'recording-item';
  const name = document.createElement('span');
  name.textContent = label;
  const audio = document.createElement('audio');
  audio.controls = true;
  audio.src = url;
  row.appendChild(name);
  row.appendChild(audio);
  $('recordings-list').appendChild(row);
}

function bindRecognitionHandlers(rec) {
  rec.onstart = () => {
    isRecording = true;
    lastTranscript = '';
    sessionTranscripts = [];
    level6ManualStop = false;
    const btn = $('mic-btn');
    btn.classList.add('recording');
    btn.textContent = '\u23F9';
    const ch = CHALLENGES[currentIdx];
    setStatus(
      ch.type === 'sentence-full'
        ? 'Say: I am a baker. I like ... then tap mic to stop.'
        : 'Listening... speak now!'
    );
    $('recognized-text').textContent = '';
    $('feedback').textContent = '';
    $('feedback').className = 'feedback';
    hide('btn-retry');
    startMeter();
  };

  rec.onresult = (e) => {
    const ch = CHALLENGES[currentIdx];
    const { finals, allTexts } = collectTranscripts(e);

    // 把所有文本存入 session
    allTexts.forEach((t) => {
      if (t && !sessionTranscripts.includes(t)) sessionTranscripts.push(t);
    });

    // 更新显示：用最新 final，没有就用最后一条
    const latest = finals[finals.length - 1] || allTexts[allTexts.length - 1] || '';
    if (latest) {
      lastTranscript = latest;
      $('recognized-text').textContent = latest;
    }

    // Level 6：只用 final 结果，检测到完整句后延迟 0.8s 给奖励
    if (ch.type === 'sentence-full') {
      if (finals.length > 0) {
        const combined = sessionTranscripts.join(' ');
        const candidates = [...new Set([...finals, combined])].filter(Boolean);
        const matched = candidates.some((t) => matchesChallenge(t));
        if (matched) {
          clearTimeout(level6EvalTimer);
          level6EvalTimer = setTimeout(() => {
            if (!isDone) {
              onCorrect();
              try { recognition?.stop(); } catch { /* ignore */ }
            }
          }, 800);
          setStatus('Almost there...');
        } else {
          setStatus('Keep going... tap mic to stop!');
        }
      } else {
        setStatus('Keep going... tap mic to stop!');
      }
      return;
    }

    // 其他关卡：有 final 就立即判
    for (const text of finals) {
      if (text.trim() && acceptIfMatch(text.trim())) return;
    }
  };

  rec.onspeechstart = () => setStatus('I hear you! Keep going...');

  rec.onerror = (e) => {
    if (e.error === 'not-allowed') setStatus('Microphone access denied.');
    else if (e.error === 'no-speech') {
      setStatus('No speech heard. Speak louder!');
      showBtn('btn-retry');
    } else if (e.error !== 'aborted') {
      setStatus('Error: ' + e.error + '. Tap mic to retry.');
      showBtn('btn-retry');
    }
  };

  rec.onend = () => endListeningSession();
}

function createRecognition() {
  if (!SR) return null;
  const rec = new SR();
  rec.continuous = true;
  rec.interimResults = true;
  rec.lang = 'en-US';
  rec.maxAlternatives = 5;
  bindRecognitionHandlers(rec);
  return rec;
}

async function startListeningSession() {
  if (isDone || isRecording) return;
  if (!SR) {
    setStatus('Use Chrome or Edge for speech recognition.');
    return;
  }
  if (!(await ensureMicAccess())) return;

  recognition = createRecognition();
  startAudioCapture();
  lastTranscript = '';
  $('playback-box').classList.remove('show');

  try {
    recognition.start();
  } catch {
    setTimeout(() => {
      try {
        recognition.start();
      } catch {
        setStatus('Could not start. Tap mic again.');
        stopAudioCapture();
      }
    }, 300);
  }
}

function endListeningSession() {
  const wasRecording = isRecording;
  isRecording = false;
  stopMeter();

  const btn = $('mic-btn');
  btn.classList.remove('recording');
  btn.textContent = '\uD83C\uDFA4';

  stopAudioCapture();
  clearTimeout(level6EvalTimer);
  level6EvalTimer = null;

  if (wasRecording && !isDone) {
    const all = [...sessionTranscripts];
    if (lastTranscript && !all.includes(lastTranscript)) all.unshift(lastTranscript);
    const combined = all.join(' ');
    const toTry = [...new Set([...all, combined])].filter(Boolean);

    if (toTry.length === 0) {
      setStatus('No words detected. Tap mic and try again!');
      showBtn('btn-retry');
    } else if (tryAllTranscripts(toTry)) {
      onCorrect();
    } else {
      onWrong();
    }
  } else if (!isDone) {
    setStatus('Tap the mic to start!');
  }

  recognition = null;
}

async function toggleRecording() {
  if (isDone) return;
  if (isRecording) {
    level6ManualStop = true;
    try {
      recognition?.stop();
    } catch {
      endListeningSession();
    }
    return;
  }
  await startListeningSession();
}

function collectTranscripts(e) {
  const variants = [];
  const finals = [];
  const allTexts = [];
  for (let i = e.resultIndex; i < e.results.length; i++) {
    const r = e.results[i];
    for (let j = 0; j < r.length; j++) {
      const t = r[j].transcript?.trim();
      if (t) {
        allTexts.push(t);
        if (!variants.includes(t)) variants.push(t);
      }
    }
    const best = r[0]?.transcript?.trim();
    if (r.isFinal && best && !finals.includes(best)) finals.push(best);
  }
  return { variants, finals, allTexts };
}

function acceptIfMatch(transcript) {
  if (isDone || !matchesChallenge(transcript)) return false;
  onCorrect();
  try {
    recognition?.stop();
  } catch {
    /* ignore */
  }
  return true;
}

function evaluateTranscript(transcript) {
  if (isDone) return;
  if (tryAllTranscripts([transcript, lastTranscript, ...sessionTranscripts])) {
    onCorrect();
  } else {
    onWrong();
  }
}

function tryAllTranscripts(list) {
  const seen = new Set();
  for (const t of list) {
    if (!t || seen.has(t)) continue;
    seen.add(t);
    if (matchesChallenge(t)) return true;
  }
  const combined = [...seen].join(' ');
  return combined.length > 0 && matchesChallenge(combined);
}

function matchesChallenge(transcript) {
  try {
    return matchesChallengeInner(transcript);
  } catch (err) {
    console.error('matchesChallenge error:', err);
    return false;
  }
}

function matchesChallengeInner(transcript) {
  const ch = CHALLENGES[currentIdx];
  const norm = normalize(transcript);
  const words = norm.split(' ').filter(Boolean);
  console.log('[match]', ch.id, JSON.stringify(norm));
  if (ch.type === 'word') return matchesWord(norm, words, ch);
  if (ch.type === 'sentence') return matchesSentence5(norm, words);
  if (ch.type === 'sentence-full') return matchesFullSentence(norm, words, getSelectedFood(ch));
  return false;
}

function matchesWord(norm, words, ch) {
  const targets = {
    baker:   ['baker', 'bake', 'becker', 'backer', 'breaker', 'bacon', 'maker'],
    donuts:  ['donut', 'donuts', 'doughnut', 'doughnuts', 'donor', 'dono'],
    bread:   ['bread', 'bred', 'braid', 'brad', 'red', 'bed'],
    cookies: ['cookie', 'cookies', 'cooky', 'coogi', 'kooky'],
  }[ch.id] || (ch.accept || []);
  for (const t of targets) {
    if (norm.includes(t)) return true;
    if (words.some((w) => wordClose(w, t))) return true;
  }
  return false;
}

function matchesSentence5(norm, words) {
  return norm.includes('baker') || norm.includes('bake') ||
    words.some((w) => wordClose(w, 'baker'));
}

function matchesFullSentence(norm, words, food) {
  if (!food) return false;
  const foodAliases = {
    donuts:  ['donut', 'donuts', 'doughnut', 'doughnuts', 'donor', 'dono'],
    bread:   ['bread', 'bred', 'braid', 'brad'],
    cookies: ['cookie', 'cookies', 'cooky', 'coogi'],
  };
  const aliases = foodAliases[food.id] || [normalize(food.label)];
  const hasBaker =
    norm.includes('baker') || norm.includes('bake') || norm.includes('maker') ||
    words.some((w) => wordClose(w, 'baker'));
  const hasFood =
    aliases.some((a) => norm.includes(a)) ||
    words.some((w) => aliases.some((a) => wordClose(w, a)));
  console.log('[L6]', { hasBaker, hasFood, norm });
  return hasBaker && hasFood;
}

function wordClose(a, b) {
  if (!a || !b) return false;
  if (a === b || a.includes(b) || b.includes(a)) return true;
  if (a.length >= 3 && b.length >= 3 && a.slice(0, 3) === b.slice(0, 3)) return true;
  const maxDist = Math.max(1, Math.floor(Math.max(a.length, b.length) * 0.4));
  return levenshtein(a, b) <= maxDist;
}


function getSelectedFood(ch) {
  if (!ch.foods) return null;
  return ch.foods.find((f) => f.id === selectedFoodId) || ch.foods[0];
}

function selectFood(foodId) {
  selectedFoodId = foodId;
  const ch = CHALLENGES[currentIdx];
  if (ch.type !== 'sentence-full') return;
  renderFoodPicker(ch);
  updateFullDisplay(ch);
  $('feedback').textContent = '';
  $('feedback').className = 'feedback';
  $('recognized-text').textContent = '';
  lastTranscript = '';
  setStatus('Tap Listen, then say the full sentence!');
}

function renderFoodPicker(ch) {
  const picker = $('food-picker');
  picker.innerHTML = '';
  ch.foods.forEach((food) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'food-chip' + (food.id === selectedFoodId ? ' selected' : '');
    btn.innerHTML = `<span class="food-chip-emoji">${food.emoji}</span>${food.label}`;
    btn.addEventListener('click', () => selectFood(food.id));
    picker.appendChild(btn);
  });
}

function updateFullDisplay(ch) {
  const food = getSelectedFood(ch);
  $('challenge-word').innerHTML =
    'I am a baker.<br>I like <span class="blank">' + food.label + '</span>.';
  $('challenge-sentence').textContent =
    'Say: I am a baker. I like ' + food.label + '.';
  $('challenge-emoji').textContent = food.emoji;
}

function getFullSpeakText(ch) {
  const food = getSelectedFood(ch);
  return 'I am a baker. I like ' + food.label + '.';
}

function goToLevel1() {
  currentIdx = 0;
  isDone = false;
  $('celebration').classList.remove('show');
  $('mega-reward').classList.remove('show');
  updateLevelNav();
  loadChallenge();
}

function goToLevel6() {
  clearTimeout(level6EvalTimer);
  level6EvalTimer = null;
  currentIdx = LEVEL_6_INDEX;
  isDone = false;
  $('celebration').classList.remove('show');
  $('mega-reward').classList.remove('show');
  updateLevelNav();
  loadChallenge();
}

function updateLevelNav() {
  const onSix = currentIdx === LEVEL_6_INDEX;
  $('btn-level-6').classList.toggle('active', onSix);
  $('btn-level-1').classList.toggle('active', !onSix);
}

function phraseMatches(norm, words, target, threshold, type) {
  if (!target) return false;
  if (norm.includes(target) || target.includes(norm)) return true;

  if (type === 'word' || target.split(' ').length === 1) {
    // 每个识别词与目标相似度
    if (words.some((w) => similarity(w, target) >= threshold)) return true;
    if (similarity(norm, target) >= threshold) return true;
    // 前 3 字母匹配（适合儿童发音不完整）
    if (target.length >= 3) {
      const prefix3 = target.slice(0, 3);
      if (words.some((w) => w.startsWith(prefix3) || target.startsWith(w.slice(0, 3)))) return true;
    }
    // 目标含在识别词中（如 "baker" 识别为 "bakers"）
    if (words.some((w) => w.includes(target) || target.includes(w))) return true;
    return false;
  }

  if (similarity(norm, target) >= threshold) return true;
  const targetWords = target.split(' ').filter(Boolean);
  const hit = targetWords.filter((tw) =>
    words.some(
      (w) =>
        similarity(w, tw) >= threshold ||
        w.includes(tw) ||
        tw.includes(w) ||
        (tw.length >= 3 && w.startsWith(tw.slice(0, 3)))
    )
  );
  // 命中超过 40% 的目标词就通过（更宽松）
  return hit.length >= Math.max(1, Math.ceil(targetWords.length * 0.4));
}

function normalize(s) {
  return s.toLowerCase().replace(/[.,!?'-]/g, '').replace(/\s+/g, ' ').trim();
}

function similarity(a, b) {
  if (!a.length || !b.length) return 0;
  const longer = a.length >= b.length ? a : b;
  const shorter = a.length < b.length ? a : b;
  const dist = levenshtein(longer, shorter);
  return (longer.length - dist) / longer.length;
}

function levenshtein(s, t) {
  const d = Array.from({ length: s.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= t.length; j++) d[0][j] = j;
  for (let i = 1; i <= s.length; i++) {
    for (let j = 1; j <= t.length; j++) {
      d[i][j] =
        s[i - 1] === t[j - 1]
          ? d[i - 1][j - 1]
          : 1 + Math.min(d[i - 1][j], d[i][j - 1], d[i - 1][j - 1]);
    }
  }
  return d[s.length][t.length];
}

function onCorrect() {
  if (isDone) return;
  isDone = true;
  const ch = CHALLENGES[currentIdx];
  $('feedback').textContent = 'Excellent! Well done!';
  $('feedback').className = 'feedback correct';
  setStatus('');
  showBakingAnim(ch.emoji);
  if (ch.shelfId) {
    setTimeout(() => $(ch.shelfId).classList.add('visible'), 700);
  }
  totalStars += ch.stars;
  updateStars();

  if (ch.type === 'sentence-full') {
    document.querySelectorAll('.shelf-item').forEach((el) => el.classList.add('visible'));
    setTimeout(() => showMegaReward(ch), 1200);
  } else {
    setTimeout(() => showCelebration(ch), 1100);
  }
}

function onWrong() {
  $('feedback').textContent = 'Not quite! Try again, you can do it!';
  $('feedback').className = 'feedback wrong';
  setStatus('Tap the mic to try again!');
  showBtn('btn-retry');
}

function retryChallenge() {
  hide('btn-retry');
  $('feedback').textContent = '';
  $('feedback').className = 'feedback';
  $('recognized-text').textContent = '';
  lastTranscript = '';
  sessionTranscripts = [];
  level6ManualStop = false;
  clearTimeout(level6EvalTimer);
  level6EvalTimer = null;
  isDone = false;
  const ch = CHALLENGES[currentIdx];
  setStatus(
    ch.type === 'sentence-full'
      ? 'Tap mic, say the whole sentence, tap mic again to stop.'
      : 'Tap the mic to start!'
  );
}

function showBakingAnim(emoji) {
  const overlay = $('baking-overlay');
  const el = $('baking-anim');
  el.textContent = emoji;
  el.style.animation = 'none';
  void el.offsetWidth;
  el.style.animation = '';
  overlay.classList.add('show');
  setTimeout(() => overlay.classList.remove('show'), 1700);
}

function showMegaReward(ch) {
  const food = getSelectedFood(ch);
  const sentence = 'I am a baker. I like ' + food.label + '.';

  $('mega-emoji').textContent = '\u{1F3C6}';
  $('mega-title').textContent = 'Wonderful!';
  $('mega-sentence').textContent = sentence;
  $('mega-stars').textContent = '\u2B50'.repeat(ch.stars);
  $('mega-msg').textContent = 'Tap anywhere to play again!';
  $('mega-bakery').innerHTML =
    '\u{1F468}\u200D\u{1F373}' + food.emoji + '\u{1F35E}\u{1F36A}';

  document.querySelectorAll('.shelf-item').forEach((el) => {
    el.classList.add('visible', 'glow');
  });

  $('mega-reward').classList.add('show');
  launchConfetti();
  setTimeout(launchConfetti, 400);
}

function closeMegaReward() {
  $('mega-reward').classList.remove('show');
  goToLevel6();
}

function showCelebration(ch) {
  const isLast = currentIdx === CHALLENGES.length - 1;
  $('cel-emoji').textContent = isLast ? '\u{1F382}' : ch.emoji;
  $('cel-stars').textContent = '\u2B50'.repeat(ch.stars);

  if (isLast) {
    $('cel-title').textContent = 'Amazing! All done!';
    $('cel-msg').textContent = 'You finished the bakery! Total stars: ' + totalStars;
    $('cel-btn').textContent = 'Play Again!';
    document.querySelectorAll('.shelf-item').forEach((el) => el.classList.add('glow'));
  } else {
    $('cel-title').textContent = 'Great job!';
    $('cel-msg').textContent =
      'You earned ' + ch.stars + ' star' + (ch.stars > 1 ? 's' : '') + '!';
    $('cel-btn').textContent = 'Next Challenge!';
  }

  $('celebration').classList.add('show');
  launchConfetti();
}

function closeCelebration() {
  $('celebration').classList.remove('show');
  if (currentIdx === CHALLENGES.length - 1) resetGame();
  else {
    currentIdx++;
    loadChallenge();
  }
}

function launchConfetti() {
  const colors = ['#ff8c42', '#f4511e', '#43a047', '#1e88e5', '#fdd835', '#e91e63', '#ab47bc'];
  for (let i = 0; i < 60; i++) {
    setTimeout(() => {
      const el = document.createElement('div');
      el.className = 'confetti-piece';
      el.style.cssText = [
        'left:' + Math.random() * 100 + 'vw',
        'top:-20px',
        'background:' + colors[Math.floor(Math.random() * colors.length)],
        'animation-duration:' + (Math.random() * 2.5 + 1) + 's',
        'width:' + (Math.random() * 10 + 6) + 'px',
        'height:' + (Math.random() * 10 + 6) + 'px',
      ].join(';');
      document.body.appendChild(el);
      setTimeout(() => el.remove(), 3500);
    }, i * 30);
  }
}

let speakingUtterance = null;

function speakExample() {
  const ch = CHALLENGES[currentIdx];
  let text = ch.speak || ch.word;
  if (ch.type === 'sentence-full') {
    text = getFullSpeakText(ch);
  }
  if (!window.speechSynthesis) {
    setStatus('Example sound is not supported in this browser.');
    return;
  }

  window.speechSynthesis.cancel();
  const btn = $('listen-btn');
  btn.classList.add('speaking');

  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'en-US';
  u.rate = 0.82;
  u.pitch = 1.05;
  speakingUtterance = u;

  u.onend = () => {
    btn.classList.remove('speaking');
    speakingUtterance = null;
  };
  u.onerror = () => {
    btn.classList.remove('speaking');
    speakingUtterance = null;
  };

  window.speechSynthesis.speak(u);
}

function loadChallenge() {
  isDone = false;
  window.speechSynthesis?.cancel();
  $('listen-btn')?.classList.remove('speaking');

  const ch = CHALLENGES[currentIdx];
  $('challenge-emoji').textContent = ch.emoji;
  if (ch.type !== 'sentence-full') {
    $('challenge-word').textContent = ch.word;
  }
  const picker = $('food-picker');
  const isLevel6 = ch.type === 'sentence-full';

  const levelNum = currentIdx + 1;

  if (isLevel6) {
    $('step-badge').textContent = 'Level 6';
    if (!ch.foods.some((f) => f.id === selectedFoodId)) selectedFoodId = ch.foods[0].id;
    renderFoodPicker(ch);
    updateFullDisplay(ch);
    $('instruction').textContent =
      'Say: I am a baker. I like ... — then tap mic to stop.';
    picker.hidden = false;
  } else if (ch.type === 'sentence') {
    $('step-badge').textContent = 'Level 5';
    $('challenge-word').textContent = ch.word;
    $('challenge-sentence').textContent = '';
    $('instruction').textContent = 'Say: I am a baker.';
    picker.hidden = true;
  } else {
    $('step-badge').textContent = 'Level ' + levelNum;
    $('challenge-word').textContent = ch.word;
    $('challenge-sentence').textContent = '';
    $('instruction').textContent = 'Read the word out loud!';
    picker.hidden = true;
  }

  updateLevelNav();

  $('feedback').textContent = '';
  $('feedback').className = 'feedback';
  $('recognized-text').textContent = '';
  lastTranscript = '';
  setStatus('Tap the mic to start!');
  hide('btn-retry');
  hide('btn-next');

  const pct = ((currentIdx + 1) / CHALLENGES.length) * 100;
  $('progress-fill').style.width = pct + '%';
  $('progress-label').textContent = 'Level ' + levelNum + ' / ' + CHALLENGES.length;
}

function resetGame() {
  currentIdx = 0;
  totalStars = 0;
  isDone = false;
  selectedFoodId = 'donuts';
  updateStars();
  document.querySelectorAll('.shelf-item').forEach((el) => el.classList.remove('visible', 'glow'));
  $('recordings-list').innerHTML = '';
  $('recordings-panel').classList.remove('show');
  $('mega-reward').classList.remove('show');
  loadChallenge();
}

function updateStars() {
  $('stars-display').textContent = '\u2B50 x ' + totalStars;
}

function setStatus(msg) {
  $('mic-status').textContent = msg;
}

function showBtn(id) {
  $(id).style.display = 'inline-block';
}

function hide(id) {
  $(id).style.display = 'none';
}

document.addEventListener('DOMContentLoaded', () => {
  checkEnvironment();
  $('mic-btn').addEventListener('click', toggleRecording);
  $('listen-btn').addEventListener('click', speakExample);
  $('btn-retry').addEventListener('click', retryChallenge);
  $('cel-btn').addEventListener('click', closeCelebration);
  $('mega-btn').addEventListener('click', closeMegaReward);
  $('mega-reward').addEventListener('click', (e) => {
    if (!e.target.closest('.mega-reward-card')) closeMegaReward();
  });
  $('btn-level-1').addEventListener('click', goToLevel1);
  $('btn-level-6').addEventListener('click', goToLevel6);

  const params = new URLSearchParams(location.search);
  if (params.get('level') === '6') goToLevel6();
  else loadChallenge();
});
