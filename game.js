(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const scoreEl = document.getElementById('score');
  const highScoreEl = document.getElementById('high-score');
  const overlay = document.getElementById('overlay');
  const overlayTitle = document.getElementById('overlay-title');
  const overlayMsg = document.getElementById('overlay-msg');
  const startBtn = document.getElementById('start-btn');

  const GRID = 20;
  const TILE = canvas.width / GRID;

  let snake, dir, nextDir, food, score, highScore, speed, loop;

  // Load high score from localStorage
  highScore = parseInt(localStorage.getItem('snake-high-score')) || 0;
  highScoreEl.textContent = highScore;

  function init() {
    snake = [
      { x: 10, y: 10 },
      { x: 9, y: 10 },
      { x: 8, y: 10 },
    ];
    dir = { x: 1, y: 0 };
    nextDir = { x: 1, y: 0 };
    score = 0;
    speed = 150;
    scoreEl.textContent = score;
    placeFood();
  }

  function placeFood() {
    while (true) {
      food = {
        x: Math.floor(Math.random() * GRID),
        y: Math.floor(Math.random() * GRID),
      };
      // Make sure food doesn't land on the snake
      if (!snake.some(s => s.x === food.x && s.y === food.y)) break;
    }
  }

  function update() {
    dir = { ...nextDir };

    const head = {
      x: snake[0].x + dir.x,
      y: snake[0].y + dir.y,
    };

    // Wall collision
    if (head.x < 0 || head.x >= GRID || head.y < 0 || head.y >= GRID) {
      return gameOver();
    }

    // Self collision
    if (snake.some(s => s.x === head.x && s.y === head.y)) {
      return gameOver();
    }

    snake.unshift(head);

    if (head.x === food.x && head.y === food.y) {
      score += 10;
      scoreEl.textContent = score;
      placeFood();
      // Speed up slightly
      if (speed > 60) speed -= 2;
    } else {
      snake.pop();
    }
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw grid lines (subtle)
    ctx.strokeStyle = 'rgba(255,255,255,0.03)';
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

    // Draw food
    ctx.fillStyle = '#e94560';
    ctx.beginPath();
    ctx.arc(
      food.x * TILE + TILE / 2,
      food.y * TILE + TILE / 2,
      TILE / 2 - 2,
      0,
      Math.PI * 2
    );
    ctx.fill();

    // Draw snake
    snake.forEach((seg, i) => {
      const ratio = 1 - i / snake.length;
      ctx.fillStyle = `hsl(153, 100%, ${30 + ratio * 30}%)`;
      ctx.fillRect(seg.x * TILE + 1, seg.y * TILE + 1, TILE - 2, TILE - 2);

      // Eyes on head
      if (i === 0) {
        ctx.fillStyle = '#fff';
        const eyeSize = 3;
        const offsetX = dir.x !== 0 ? dir.x * 3 : -3;
        const offsetY = dir.y !== 0 ? dir.y * 3 : -3;
        const cx = seg.x * TILE + TILE / 2;
        const cy = seg.y * TILE + TILE / 2;
        ctx.beginPath();
        ctx.arc(cx + offsetX, cy + (dir.x !== 0 ? -3 : 0), eyeSize, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(cx + (dir.y !== 0 ? 3 : 0), cy + offsetY, eyeSize, 0, Math.PI * 2);
        ctx.fill();
      }
    });
  }

  function tick() {
    update();
    draw();
    loop = setTimeout(tick, speed);
  }

  function start() {
    init();
    overlay.classList.add('hidden');
    draw();
    loop = setTimeout(tick, speed);
  }

  function gameOver() {
    clearTimeout(loop);
    if (score > highScore) {
      highScore = score;
      localStorage.setItem('snake-high-score', highScore);
      highScoreEl.textContent = highScore;
    }
    overlayTitle.textContent = 'Game Over';
    overlayMsg.textContent = `Score: ${score}`;
    startBtn.textContent = 'Play Again';
    overlay.classList.remove('hidden');
  }

  // Keyboard controls
  document.addEventListener('keydown', (e) => {
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

    // Prevent reversing into yourself
    if (newDir.x + dir.x === 0 && newDir.y + dir.y === 0) return;

    nextDir = newDir;
  });

  // Mobile touch controls
  document.querySelectorAll('.ctrl-btn').forEach(btn => {
    btn.addEventListener('click', () => {
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

  // Swipe support
  let touchStartX = 0;
  let touchStartY = 0;

  canvas.addEventListener('touchstart', (e) => {
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
  }, { passive: true });

  canvas.addEventListener('touchend', (e) => {
    const dx = e.changedTouches[0].clientX - touchStartX;
    const dy = e.changedTouches[0].clientY - touchStartY;

    if (Math.abs(dx) < 30 && Math.abs(dy) < 30) return;

    let newDir;
    if (Math.abs(dx) > Math.abs(dy)) {
      newDir = dx > 0 ? { x: 1, y: 0 } : { x: -1, y: 0 };
    } else {
      newDir = dy > 0 ? { x: 0, y: 1 } : { x: 0, y: -1 };
    }

    if (newDir.x + dir.x === 0 && newDir.y + dir.y === 0) return;
    nextDir = newDir;
  });

  startBtn.addEventListener('click', start);
})();
