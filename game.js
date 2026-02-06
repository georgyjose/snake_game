(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const scoreEl = document.getElementById('score');
  const highScoreEl = document.getElementById('high-score');
  const levelEl = document.getElementById('level');
  const comboEl = document.getElementById('combo');
  const overlay = document.getElementById('overlay');
  const overlayTitle = document.getElementById('overlay-title');
  const overlayMsg = document.getElementById('overlay-msg');
  const startBtn = document.getElementById('start-btn');
  const pauseBtn = document.getElementById('pause-btn');

  const GRID = 20;
  const TILE = canvas.width / GRID;
  const FOODS_PER_LEVEL = 10;
  const BASE_SPEED = 150;
  const SPEED_DROP_PER_LEVEL = 15;
  const MIN_SPEED = 50;
  const COMBO_WINDOW = 2000; // ms to keep combo alive
  const MAX_COMBO = 5;

  // ── Level themes ──
  const LEVEL_THEMES = [
    { snakeHue: 153, bg: '#16213e', border: '#0f3460', food: '#e94560', grid: 'rgba(255,255,255,0.03)', name: 'Deep Sea' },
    { snakeHue: 270, bg: '#1a1025', border: '#3d1f5c', food: '#ff6bcb', grid: 'rgba(200,150,255,0.04)', name: 'Neon Purple' },
    { snakeHue: 30,  bg: '#1f1206', border: '#5c3a0f', food: '#ff4444', grid: 'rgba(255,180,100,0.04)', name: 'Lava' },
    { snakeHue: 190, bg: '#0a1a20', border: '#0d4f5c', food: '#ffdd57', grid: 'rgba(100,220,255,0.04)', name: 'Arctic' },
    { snakeHue: 340, bg: '#200a10', border: '#5c0f2a', food: '#00ff88', grid: 'rgba(255,100,150,0.04)', name: 'Crimson' },
    { snakeHue: 80,  bg: '#0f1a06', border: '#3a5c0f', food: '#ff7744', grid: 'rgba(150,255,100,0.04)', name: 'Forest' },
    { snakeHue: 210, bg: '#0a0f20', border: '#1a3a6e', food: '#ffa500', grid: 'rgba(100,150,255,0.04)', name: 'Midnight' },
  ];

  // ── Sound system ──
  let audioCtx = null;

  function ensureAudio() {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
  }

  function playTone(freq, duration, type = 'square', vol = 0.15) {
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + duration);
  }

  function soundEat(comboLevel) {
    playTone(520 + comboLevel * 80, 0.08, 'square', 0.12);
  }

  function soundLevelUp() {
    playTone(400, 0.12, 'sine', 0.15);
    setTimeout(() => playTone(600, 0.15, 'sine', 0.15), 120);
  }

  function soundDeath() {
    playTone(200, 0.3, 'sawtooth', 0.12);
    setTimeout(() => playTone(120, 0.4, 'sawtooth', 0.1), 150);
  }

  // ── Particle system ──
  let particles = [];

  function spawnParticles(x, y, color, count = 10) {
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
      const spd = 40 + Math.random() * 80;
      particles.push({
        x: x * TILE + TILE / 2,
        y: y * TILE + TILE / 2,
        vx: Math.cos(angle) * spd,
        vy: Math.sin(angle) * spd,
        life: 1,
        decay: 1.5 + Math.random() * 1.5,
        color,
        size: 2 + Math.random() * 3,
      });
    }
  }

  function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= p.decay * dt;
      if (p.life <= 0) particles.splice(i, 1);
    }
  }

  function drawParticles() {
    particles.forEach(p => {
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
  }

  // ── Game state ──
  let snake, prevSnake, dir, nextDir, food, score, highScore, speed;
  let loop, level, foodEaten, running, paused;
  let obstacles, combo, lastEatTime, comboTextTimer;
  let levelFlash, prevLevel;

  // Smooth animation state
  let lastTime, accumulated;

  highScore = parseInt(localStorage.getItem('snake-high-score')) || 0;
  highScoreEl.textContent = highScore;
  running = false;
  paused = false;

  function getTheme() {
    return LEVEL_THEMES[(level - 1) % LEVEL_THEMES.length];
  }

  function getSpeedForLevel(lvl) {
    return Math.max(MIN_SPEED, BASE_SPEED - (lvl - 1) * SPEED_DROP_PER_LEVEL);
  }

  function init() {
    cancelAnimationFrame(loop);
    snake = [
      { x: 10, y: 10 },
      { x: 9, y: 10 },
      { x: 8, y: 10 },
    ];
    prevSnake = snake.map(s => ({ ...s }));
    dir = { x: 1, y: 0 };
    nextDir = { x: 1, y: 0 };
    score = 0;
    level = 1;
    foodEaten = 0;
    speed = getSpeedForLevel(level);
    running = false;
    paused = false;
    obstacles = [];
    combo = 1;
    lastEatTime = 0;
    comboTextTimer = 0;
    levelFlash = 0;
    prevLevel = 1;
    particles = [];
    accumulated = 0;
    lastTime = 0;
    scoreEl.textContent = score;
    levelEl.textContent = level;
    comboEl.textContent = '';
    pauseBtn.textContent = 'Pause';
    placeFood();
  }

  function isOccupied(x, y) {
    if (snake.some(s => s.x === x && s.y === y)) return true;
    if (obstacles.some(o => o.x === x && o.y === y)) return true;
    if (food && food.x === x && food.y === y) return true;
    return false;
  }

  function placeFood() {
    let attempts = 0;
    while (attempts < 500) {
      food = {
        x: Math.floor(Math.random() * GRID),
        y: Math.floor(Math.random() * GRID),
      };
      if (!snake.some(s => s.x === food.x && s.y === food.y) &&
          !obstacles.some(o => o.x === food.x && o.y === food.y)) {
        break;
      }
      attempts++;
    }
  }

  function addObstacles() {
    const count = 2 + Math.floor(Math.random() * 2); // 2-3 per level
    for (let i = 0; i < count; i++) {
      let attempts = 0;
      while (attempts < 200) {
        const ox = Math.floor(Math.random() * GRID);
        const oy = Math.floor(Math.random() * GRID);
        // Keep clear zone around snake head (3 tiles)
        const head = snake[0];
        const dist = Math.abs(ox - head.x) + Math.abs(oy - head.y);
        if (!isOccupied(ox, oy) && dist > 3) {
          obstacles.push({ x: ox, y: oy });
          break;
        }
        attempts++;
      }
    }
  }

  function update() {
    dir = { ...nextDir };

    // Save previous positions for interpolation
    prevSnake = snake.map(s => ({ ...s }));

    const head = {
      x: snake[0].x + dir.x,
      y: snake[0].y + dir.y,
    };

    // Wall collision
    if (head.x < 0 || head.x >= GRID || head.y < 0 || head.y >= GRID) {
      gameOver();
      return;
    }

    // Self collision
    if (snake.some(s => s.x === head.x && s.y === head.y)) {
      gameOver();
      return;
    }

    // Obstacle collision
    if (obstacles.some(o => o.x === head.x && o.y === head.y)) {
      gameOver();
      return;
    }

    snake.unshift(head);

    if (head.x === food.x && head.y === food.y) {
      const now = Date.now();
      // Combo logic
      if (lastEatTime > 0 && (now - lastEatTime) < COMBO_WINDOW) {
        combo = Math.min(combo + 1, MAX_COMBO);
      } else {
        combo = 1;
      }
      lastEatTime = now;

      const points = 10 * combo;
      score += points;
      foodEaten++;
      scoreEl.textContent = score;
      comboEl.textContent = combo > 1 ? `x${combo}` : '';
      comboTextTimer = 1.5; // seconds to show combo text on canvas

      if (score > highScore) {
        highScore = score;
        highScoreEl.textContent = highScore;
      }

      // Particles + sound
      const theme = getTheme();
      spawnParticles(food.x, food.y, theme.food, 10);
      soundEat(combo);

      // Level up
      if (foodEaten % FOODS_PER_LEVEL === 0) {
        level++;
        levelEl.textContent = level;
        speed = getSpeedForLevel(level);
        soundLevelUp();
        addObstacles();

        // Extra particles for level up
        const newTheme = getTheme();
        for (let i = 0; i < 3; i++) {
          const rx = Math.floor(Math.random() * GRID);
          const ry = Math.floor(Math.random() * GRID);
          spawnParticles(rx, ry, `hsl(${newTheme.snakeHue}, 100%, 60%)`, 6);
        }
      }

      placeFood();
      // Add a copy to prevSnake for the new head so interpolation works
      prevSnake.unshift({ ...prevSnake[0] });
    } else {
      snake.pop();
    }
  }

  function draw(interpol) {
    const theme = getTheme();
    const t = interpol; // 0..1 interpolation factor

    // Background
    ctx.fillStyle = theme.bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Grid lines
    ctx.strokeStyle = theme.grid;
    for (let i = 0; i <= GRID; i++) {
      ctx.beginPath();
      ctx.moveTo(i * TILE, 0);
      ctx.lineTo(i * TILE, canvas.height);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i * TILE);
      ctx.lineTo(canvas.width, i * TILE);
      ctx.stroke();
    }

    // Obstacles
    obstacles.forEach(o => {
      ctx.fillStyle = '#3a3a4a';
      ctx.fillRect(o.x * TILE + 1, o.y * TILE + 1, TILE - 2, TILE - 2);
      // X pattern
      ctx.strokeStyle = '#ff4444';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(o.x * TILE + 4, o.y * TILE + 4);
      ctx.lineTo(o.x * TILE + TILE - 4, o.y * TILE + TILE - 4);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(o.x * TILE + TILE - 4, o.y * TILE + 4);
      ctx.lineTo(o.x * TILE + 4, o.y * TILE + TILE - 4);
      ctx.stroke();
      ctx.lineWidth = 1;
    });

    // Food (pulsing)
    const pulse = 1 + Math.sin(Date.now() / 200) * 0.15;
    ctx.fillStyle = theme.food;
    ctx.beginPath();
    ctx.arc(
      food.x * TILE + TILE / 2,
      food.y * TILE + TILE / 2,
      (TILE / 2 - 2) * pulse,
      0,
      Math.PI * 2
    );
    ctx.fill();

    // Snake (interpolated)
    const len = snake.length;
    for (let i = 0; i < len; i++) {
      const cur = snake[i];
      const prev = prevSnake[i] || cur;

      // Lerp position
      const drawX = (prev.x + (cur.x - prev.x) * t) * TILE;
      const drawY = (prev.y + (cur.y - prev.y) * t) * TILE;

      const ratio = 1 - i / len;
      ctx.fillStyle = `hsl(${theme.snakeHue}, 100%, ${30 + ratio * 30}%)`;
      ctx.fillRect(drawX + 1, drawY + 1, TILE - 2, TILE - 2);

      // Eyes on head
      if (i === 0) {
        ctx.fillStyle = '#fff';
        const eyeSize = 3;
        const offsetX = dir.x !== 0 ? dir.x * 3 : -3;
        const offsetY = dir.y !== 0 ? dir.y * 3 : -3;
        const cx = drawX + TILE / 2;
        const cy = drawY + TILE / 2;
        ctx.beginPath();
        ctx.arc(cx + offsetX, cy + (dir.x !== 0 ? -3 : 0), eyeSize, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(cx + (dir.y !== 0 ? 3 : 0), cy + offsetY, eyeSize, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Particles
    drawParticles();

    // Level-up flash
    if (levelFlash > 0) {
      ctx.fillStyle = `rgba(0, 217, 126, ${levelFlash})`;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 32px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`Level ${level} — ${theme.name}`, canvas.width / 2, canvas.height / 2);
      levelFlash -= 0.015;
    }

    // Combo text on canvas
    if (comboTextTimer > 0 && combo > 1) {
      ctx.globalAlpha = Math.min(1, comboTextTimer);
      ctx.fillStyle = '#ffdd57';
      ctx.font = 'bold 24px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`x${combo}!`, canvas.width / 2, 30);
      ctx.globalAlpha = 1;
    }

    // Canvas border color matches theme
    canvas.style.borderColor = theme.border;
  }

  // ── Game loop (requestAnimationFrame) ──
  function gameLoop(timestamp) {
    if (!running) return;

    if (lastTime === 0) lastTime = timestamp;
    const delta = timestamp - lastTime;
    lastTime = timestamp;

    if (!paused) {
      accumulated += delta;

      // Update particles even between game ticks
      updateParticles(delta / 1000);
      if (comboTextTimer > 0) comboTextTimer -= delta / 1000;

      // Advance game logic when enough time has passed
      while (accumulated >= speed) {
        // Detect level change for flash effect
        if (level !== prevLevel) {
          levelFlash = 0.7;
          prevLevel = level;
        }

        update();
        if (!running) return; // gameOver called
        accumulated -= speed;
      }

      draw(accumulated / speed);
    } else {
      // Still draw when paused (for static display)
      draw(0);

      // Draw pause overlay on canvas
      ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 36px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('PAUSED', canvas.width / 2, canvas.height / 2);
      ctx.font = '16px sans-serif';
      ctx.fillText('Press Space or P to resume', canvas.width / 2, canvas.height / 2 + 35);
    }

    loop = requestAnimationFrame(gameLoop);
  }

  function start() {
    ensureAudio();
    init();
    running = true;
    prevLevel = 1;
    levelFlash = 0;
    overlay.classList.add('hidden');
    draw(0);
    lastTime = 0;
    accumulated = 0;
    loop = requestAnimationFrame(gameLoop);
  }

  function togglePause() {
    if (!running) return;
    paused = !paused;
    pauseBtn.textContent = paused ? 'Resume' : 'Pause';
    if (!paused) {
      // Reset lastTime so delta doesn't include paused duration
      lastTime = 0;
    }
  }

  function gameOver() {
    running = false;
    cancelAnimationFrame(loop);
    soundDeath();

    if (score > highScore) {
      highScore = score;
      localStorage.setItem('snake-high-score', highScore);
      highScoreEl.textContent = highScore;
    }
    overlayTitle.textContent = 'Game Over';
    overlayMsg.textContent = `Score: ${score}  |  Level: ${level}`;
    startBtn.textContent = 'Play Again';
    pauseBtn.textContent = 'Pause';
    overlay.classList.remove('hidden');
  }

  // ── Keyboard controls ──
  document.addEventListener('keydown', (e) => {
    // Pause toggle
    if (e.key === ' ' || e.key === 'p' || e.key === 'P') {
      if (running) {
        e.preventDefault();
        togglePause();
        return;
      }
    }

    if (paused) return;

    const keyMap = {
      ArrowUp: { x: 0, y: -1 },
      ArrowDown: { x: 0, y: 1 },
      ArrowLeft: { x: -1, y: 0 },
      ArrowRight: { x: 1, y: 0 },
      w: { x: 0, y: -1 },
      s: { x: 0, y: 1 },
      a: { x: -1, y: 0 },
      d: { x: 1, y: 0 },
    };

    const newDir = keyMap[e.key];
    if (!newDir) return;

    e.preventDefault();

    if (newDir.x + dir.x === 0 && newDir.y + dir.y === 0) return;

    nextDir = newDir;
  });

  // ── Mobile touch controls ──
  document.querySelectorAll('.ctrl-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (paused) return;
      const dirMap = {
        up: { x: 0, y: -1 },
        down: { x: 0, y: 1 },
        left: { x: -1, y: 0 },
        right: { x: 1, y: 0 },
      };
      const newDir = dirMap[btn.dataset.dir];
      if (newDir.x + dir.x === 0 && newDir.y + dir.y === 0) return;
      nextDir = newDir;
    });
  });

  // ── Swipe support (continuous touchmove) ──
  let touchAnchorX = 0;
  let touchAnchorY = 0;
  const SWIPE_THRESHOLD = 15;

  canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    touchAnchorX = e.touches[0].clientX;
    touchAnchorY = e.touches[0].clientY;
  });

  canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    if (paused) return;

    const dx = e.touches[0].clientX - touchAnchorX;
    const dy = e.touches[0].clientY - touchAnchorY;

    if (Math.abs(dx) < SWIPE_THRESHOLD && Math.abs(dy) < SWIPE_THRESHOLD) return;

    let newDir;
    if (Math.abs(dx) > Math.abs(dy)) {
      newDir = dx > 0 ? { x: 1, y: 0 } : { x: -1, y: 0 };
    } else {
      newDir = dy > 0 ? { x: 0, y: 1 } : { x: 0, y: -1 };
    }

    if (newDir.x + dir.x === 0 && newDir.y + dir.y === 0) return;

    nextDir = newDir;
    // Re-anchor so the next swipe gesture starts from here
    touchAnchorX = e.touches[0].clientX;
    touchAnchorY = e.touches[0].clientY;
  });

  // ── Gyroscope controls ──
  const gyroBtn = document.getElementById('gyro-btn');
  let gyroEnabled = false;
  let gyroReceived = false;
  const GYRO_DEAD_ZONE = 12;

  // Show button on touch-capable devices
  if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
    gyroBtn.classList.remove('hidden');
  }

  function handleOrientation(e) {
    gyroReceived = true;
    if (!gyroEnabled || paused || !running) return;

    const beta = e.beta;
    const gamma = e.gamma;

    if (beta === null || gamma === null) return;

    const absBeta = Math.abs(beta);
    const absGamma = Math.abs(gamma);

    if (absBeta < GYRO_DEAD_ZONE && absGamma < GYRO_DEAD_ZONE) return;

    let newDir;
    if (absGamma > absBeta) {
      newDir = gamma > 0 ? { x: 1, y: 0 } : { x: -1, y: 0 };
    } else {
      newDir = beta > 0 ? { x: 0, y: 1 } : { x: 0, y: -1 };
    }

    if (newDir.x + dir.x === 0 && newDir.y + dir.y === 0) return;

    nextDir = newDir;
  }

  function disableGyro() {
    gyroEnabled = false;
    window.removeEventListener('deviceorientation', handleOrientation);
    gyroBtn.textContent = 'Gyro: Off';
    gyroBtn.classList.remove('active');
  }

  function enableGyro() {
    gyroEnabled = true;
    gyroReceived = false;
    window.addEventListener('deviceorientation', handleOrientation);
    gyroBtn.textContent = 'Gyro: On';
    gyroBtn.classList.add('active');

    // Verify sensor is actually sending data
    setTimeout(() => {
      if (gyroEnabled && !gyroReceived) {
        disableGyro();
        gyroBtn.textContent = 'No Gyro';
        setTimeout(() => { gyroBtn.textContent = 'Gyro: Off'; }, 2000);
      }
    }, 1000);
  }

  async function toggleGyro() {
    if (gyroEnabled) {
      disableGyro();
      return;
    }

    // iOS 13+ requires explicit permission from a user gesture
    if (typeof DeviceOrientationEvent !== 'undefined' &&
        typeof DeviceOrientationEvent.requestPermission === 'function') {
      try {
        const permission = await DeviceOrientationEvent.requestPermission();
        if (permission === 'granted') {
          enableGyro();
        } else {
          gyroBtn.textContent = 'Denied';
          setTimeout(() => { gyroBtn.textContent = 'Gyro: Off'; }, 2000);
        }
      } catch (err) {
        gyroBtn.textContent = 'Error';
        setTimeout(() => { gyroBtn.textContent = 'Gyro: Off'; }, 2000);
      }
      return;
    }

    // Android / other browsers — no permission needed
    enableGyro();
  }

  gyroBtn.addEventListener('click', toggleGyro);

  // ── Button handlers ──
  startBtn.addEventListener('click', start);
  pauseBtn.addEventListener('click', togglePause);
})();
