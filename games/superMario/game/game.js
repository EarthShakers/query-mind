// 主游戏逻辑
class Game {
  constructor() {
    this.canvas = document.getElementById('gameCanvas');
    this.ctx = this.canvas.getContext('2d');
    this.canvas.width = CONFIG.CANVAS_WIDTH;
    this.canvas.height = CONFIG.CANVAS_HEIGHT;
    
    this.messageEl = document.getElementById('message');
    this.coinsEl = document.getElementById('coins');
    this.levelEl = document.getElementById('level');
    this.livesEl = document.getElementById('lives');
    
    this.keys = {};
    this.gameState = 'playing';
    
    this.currentLevel = 0;
    this.totalCoins = 0;
    this.lives = 3;
    
    this.cameraX = 0;
    this.particles = [];
    this.clouds = [];
    this.bgOffset = 0;
    
    this.questionBlocks = {};
    
    this.init();
    this.setupControls();
    this.gameLoop();
  }
  
  init() {
    const level = LEVELS[this.currentLevel];
    
    this.player = {
      x: 100,
      y: 300,
      vx: 0,
      vy: 0,
      width: CONFIG.PLAYER.WIDTH,
      height: CONFIG.PLAYER.HEIGHT,
      onGround: false,
      facing: 1,
      animFrame: 0,
      animTimer: 0
    };
    
    this.map = level.map;
    this.mapWidth = level.width;
    this.bgTheme = level.bgTheme;
    
    this.questionBlocks = {};
    
    this.enemies = level.enemies.map(e => ({
      x: e.x * CONFIG.TILE_SIZE,
      y: (e.y - 1) * CONFIG.TILE_SIZE,
      vx: -CONFIG.ENEMY.SPEED,
      width: CONFIG.ENEMY.WIDTH,
      height: CONFIG.ENEMY.HEIGHT,
      type: e.type,
      alive: true,
      animFrame: 0,
      startX: e.x * CONFIG.TILE_SIZE - 4 * CONFIG.TILE_SIZE,
      endX: e.x * CONFIG.TILE_SIZE + 4 * CONFIG.TILE_SIZE
    }));
    
    this.coins = level.coins.map(c => ({
      x: c.x * CONFIG.TILE_SIZE + CONFIG.TILE_SIZE / 2,
      y: c.y * CONFIG.TILE_SIZE + CONFIG.TILE_SIZE / 2,
      rotation: 0
    }));
    
    this.flagX = this.findFlagX();
    this.cameraX = 0;
    this.generateClouds();
    
    this.levelEl.textContent = this.currentLevel + 1;
    this.livesEl.textContent = this.lives;
    this.coinsEl.textContent = this.totalCoins;
    
    this.gameState = 'playing';
    this.messageEl.classList.add('hidden');
  }
  
  findFlagX() {
    for (let y = 0; y < this.map.length; y++) {
      for (let x = 0; x < this.map[y].length; x++) {
        if (this.map[y][x] === 5) {
          return x * CONFIG.TILE_SIZE;
        }
      }
    }
    return 3000;
  }
  
  generateClouds() {
    this.clouds = [];
    for (let i = 0; i < 10; i++) {
      this.clouds.push({
        x: Math.random() * this.mapWidth * CONFIG.TILE_SIZE,
        y: 30 + Math.random() * 100,
        size: 30 + Math.random() * 40,
        speed: 0.2 + Math.random() * 0.3
      });
    }
  }
  
  setupControls() {
    window.addEventListener('keydown', (e) => {
      this.keys[e.code] = true;
      if (e.code === 'KeyR') this.restart();
      if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') e.preventDefault();
    });
    
    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
    });
  }
  
  restart() {
    this.currentLevel = 0;
    this.totalCoins = 0;
    this.lives = 3;
    this.init();
  }
  
  nextLevel() {
    this.currentLevel++;
    if (this.currentLevel >= LEVELS.length) {
      this.showMessage('🎉 恭喜通关！\n\n你收集了 ' + this.totalCoins + ' 个金币！\n\n<span class="sub">按 R 重新开始</span>');
      this.gameState = 'victory';
    } else {
      this.init();
    }
  }
  
  showMessage(text) {
    this.messageEl.innerHTML = text;
    this.messageEl.classList.remove('hidden');
  }
  
  update() {
    if (this.gameState !== 'playing') return;
    
    this.updatePlayer();
    this.updateEnemies();
    this.updateCoins();
    this.updateParticles();
    this.updateCamera();
    this.checkCollisions();
    this.checkWinCondition();
  }
  
  updatePlayer() {
    const p = this.player;
    
    if (this.keys['ArrowLeft'] || this.keys['KeyA']) {
      p.vx -= CONFIG.PLAYER.ACCELERATION;
      p.facing = -1;
    }
    if (this.keys['ArrowRight'] || this.keys['KeyD']) {
      p.vx += CONFIG.PLAYER.ACCELERATION;
      p.facing = 1;
    }
    
    p.vx *= CONFIG.PLAYER.FRICTION;
    p.vx = Math.max(-CONFIG.PLAYER.SPEED, Math.min(CONFIG.PLAYER.SPEED, p.vx));
    
    if ((this.keys['Space'] || this.keys['ArrowUp'] || this.keys['KeyW']) && p.onGround) {
      p.vy = CONFIG.PLAYER.JUMP_FORCE;
      p.onGround = false;
      this.addParticles(p.x + p.width / 2, p.y + p.height, 3, '#aaa');
    }
    
    p.vy += CONFIG.GRAVITY;
    p.vy = Math.min(p.vy, CONFIG.MAX_FALL_SPEED);
    
    p.x += p.vx;
    this.handleHorizontalCollision();
    
    p.y += p.vy;
    this.handleVerticalCollision();
    
    if (p.x < 0) p.x = 0;
    if (p.x > this.mapWidth * CONFIG.TILE_SIZE - p.width) {
      p.x = this.mapWidth * CONFIG.TILE_SIZE - p.width;
    }
    
    if (p.y > CONFIG.CANVAS_HEIGHT + 100) this.playerDie();
    
    if (Math.abs(p.vx) > 0.5) {
      p.animTimer++;
      if (p.animTimer > 6) {
        p.animFrame = (p.animFrame + 1) % 4;
        p.animTimer = 0;
      }
    } else {
      p.animFrame = 0;
    }
  }
  
  handleHorizontalCollision() {
    const p = this.player;
    const tileSize = CONFIG.TILE_SIZE;
    
    const left = Math.floor(p.x / tileSize);
    const right = Math.floor((p.x + p.width) / tileSize);
    const top = Math.floor(p.y / tileSize);
    const bottom = Math.floor((p.y + p.height - 1) / tileSize);
    
    for (let y = top; y <= bottom; y++) {
      for (let x = left; x <= right; x++) {
        if (this.isSolid(x, y)) {
          if (p.vx > 0) p.x = x * tileSize - p.width;
          else if (p.vx < 0) p.x = (x + 1) * tileSize;
          p.vx = 0;
        }
      }
    }
  }
  
  handleVerticalCollision() {
    const p = this.player;
    const tileSize = CONFIG.TILE_SIZE;
    
    const left = Math.floor(p.x / tileSize);
    const right = Math.floor((p.x + p.width - 1) / tileSize);
    const top = Math.floor(p.y / tileSize);
    const bottom = Math.floor((p.y + p.height) / tileSize);
    
    p.onGround = false;
    
    for (let y = top; y <= bottom; y++) {
      for (let x = left; x <= right; x++) {
        if (this.isSolid(x, y)) {
          if (p.vy > 0) {
            p.y = y * tileSize - p.height;
            p.onGround = true;
          } else if (p.vy < 0) {
            p.y = (y + 1) * tileSize;
            this.hitQuestionBlock(x, y);
          }
          p.vy = 0;
        }
      }
    }
  }
  
  hitQuestionBlock(tileX, tileY) {
    if (tileY < 0 || tileY >= this.map.length || tileX < 0 || tileX >= this.map[0].length) return;
    
    const tile = this.map[tileY][tileX];
    if (tile !== 3) return;
    
    const blockKey = `${tileX},${tileY}`;
    if (this.questionBlocks[blockKey]) return;
    
    this.questionBlocks[blockKey] = true;
    this.map[tileY][tileX] = 2;
    
    const coinX = tileX * CONFIG.TILE_SIZE + CONFIG.TILE_SIZE / 2;
    const coinY = tileY * CONFIG.TILE_SIZE - CONFIG.TILE_SIZE / 2;
    
    // 弹出的金币直接添加到数组，会被自动收集
    this.coins.push({
      x: coinX,
      y: coinY,
      rotation: 0,
      popping: true,
      popVy: -8,
      popTargetY: tileY * CONFIG.TILE_SIZE + CONFIG.TILE_SIZE / 2
    });
    
    this.addParticles(coinX, tileY * CONFIG.TILE_SIZE + CONFIG.TILE_SIZE, 4, CONFIG.COLORS.COIN);
  }
  
  isSolid(x, y) {
    if (y < 0 || y >= this.map.length || x < 0 || x >= this.map[0].length) return false;
    const tile = this.map[y][x];
    return tile === 1 || tile === 2 || tile === 3 || tile === 4 || tile === 6;
  }
  
  updateEnemies() {
    const tileSize = CONFIG.TILE_SIZE;
    
    for (const enemy of this.enemies) {
      if (!enemy.alive) continue;
      
      enemy.x += enemy.vx;
      enemy.animFrame = (enemy.animFrame + 0.15) % 2;
      
      const checkWallX = enemy.vx > 0 
        ? Math.floor((enemy.x + enemy.width + 4) / tileSize) 
        : Math.floor((enemy.x - 4) / tileSize);
      const enemyBodyY = Math.floor((enemy.y + enemy.height / 2) / tileSize);
      
      if (this.isSolid(checkWallX, enemyBodyY)) {
        enemy.vx *= -1;
        enemy.x += enemy.vx * 2;
        continue;
      }
      
      const checkGroundX = enemy.vx > 0 
        ? Math.floor((enemy.x + enemy.width) / tileSize) 
        : Math.floor(enemy.x / tileSize);
      const feetY = Math.floor((enemy.y + enemy.height + 2) / tileSize);
      
      if (!this.isSolid(checkGroundX, feetY)) {
        enemy.vx *= -1;
        enemy.x += enemy.vx * 2;
        continue;
      }
      
      if (enemy.x <= enemy.startX) {
        enemy.vx = CONFIG.ENEMY.SPEED;
        enemy.x = enemy.startX + 1;
      } else if (enemy.x >= enemy.endX) {
        enemy.vx = -CONFIG.ENEMY.SPEED;
        enemy.x = enemy.endX - 1;
      }
    }
  }
  
  updateCoins() {
    for (let i = this.coins.length - 1; i >= 0; i--) {
      const coin = this.coins[i];
      coin.rotation += CONFIG.COIN.ROTATION_SPEED;
      
      if (coin.popping) {
        coin.y += coin.popVy;
        coin.popVy += 0.5;
        if (coin.y >= coin.popTargetY) {
          coin.y = coin.popTargetY;
          coin.popping = false;
        }
      }
    }
  }
  
  updateParticles() {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.2;
      p.life--;
      if (p.life <= 0) this.particles.splice(i, 1);
    }
  }
  
  updateCamera() {
    const targetX = this.player.x - CONFIG.CANVAS_WIDTH / 3;
    this.cameraX += (targetX - this.cameraX) * 0.1;
    this.cameraX = Math.max(0, Math.min(this.cameraX, this.mapWidth * CONFIG.TILE_SIZE - CONFIG.CANVAS_WIDTH));
    this.bgOffset = this.cameraX * 0.3;
  }
  
  checkCollisions() {
    const p = this.player;
    
    for (const enemy of this.enemies) {
      if (!enemy.alive) continue;
      
      if (this.rectCollision(p, enemy)) {
        if (p.vy > 0 && p.y + p.height - enemy.y < 20) {
          enemy.alive = false;
          p.vy = -8;
          this.addParticles(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2, 5, CONFIG.COLORS.ENEMY);
        } else {
          this.playerDie();
          return;
        }
      }
    }
    
    // 金币碰撞 - 收集后立即从数组移除
    for (let i = this.coins.length - 1; i >= 0; i--) {
      const coin = this.coins[i];
      
      const coinRect = {
        x: coin.x - CONFIG.COIN.SIZE / 2,
        y: coin.y - CONFIG.COIN.SIZE / 2,
        width: CONFIG.COIN.SIZE,
        height: CONFIG.COIN.SIZE
      };
      
      if (this.rectCollision(p, coinRect)) {
        // 立即移除金币
        this.coins.splice(i, 1);
        this.totalCoins++;
        this.coinsEl.textContent = this.totalCoins;
        this.addParticles(coin.x, coin.y, 4, CONFIG.COLORS.COIN);
      }
    }
  }
  
  rectCollision(a, b) {
    return a.x < b.x + b.width &&
           a.x + a.width > b.x &&
           a.y < b.y + b.height &&
           a.y + a.height > b.y;
  }
  
  playerDie() {
    this.lives--;
    this.livesEl.textContent = this.lives;
    
    if (this.lives <= 0) {
      this.showMessage('💀 游戏结束\n\n收集了 ' + this.totalCoins + ' 个金币\n\n<span class="sub">按 R 重新开始</span>');
      this.gameState = 'gameOver';
    } else {
      this.showMessage('💔 剩余生命: ' + this.lives + '\n\n<span class="sub">按 R 重新开始本关</span>');
      this.gameState = 'paused';
      setTimeout(() => {
        if (this.gameState === 'paused') this.init();
      }, 1500);
    }
  }
  
  checkWinCondition() {
    if (this.player.x >= this.flagX - 20) {
      this.showMessage('🏁 关卡完成！\n\n<span class="sub">进入下一关...</span>');
      this.gameState = 'levelComplete';
      setTimeout(() => this.nextLevel(), 1500);
    }
  }
  
  addParticles(x, y, count, color) {
    if (this.particles.length > 50) return;
    
    for (let i = 0; i < count; i++) {
      this.particles.push({
        x, y,
        vx: (Math.random() - 0.5) * 6,
        vy: (Math.random() - 0.5) * 6 - 2,
        size: 3 + Math.random() * 3,
        color,
        life: 15 + Math.random() * 15
      });
    }
  }
  
  render() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, CONFIG.CANVAS_WIDTH, CONFIG.CANVAS_HEIGHT);
    
    this.drawBackground();
    this.drawMap();
    this.drawCoins();
    this.drawEnemies();
    this.drawPlayer();
    this.drawParticles();
    this.drawFlag();
  }
  
  drawBackground() {
    const ctx = this.ctx;
    
    let gradient;
    if (this.bgTheme === 'underground') {
      gradient = ctx.createLinearGradient(0, 0, 0, CONFIG.CANVAS_HEIGHT);
      gradient.addColorStop(0, '#1a1a2e');
      gradient.addColorStop(1, '#2d2d44');
    } else if (this.bgTheme === 'sky') {
      gradient = ctx.createLinearGradient(0, 0, 0, CONFIG.CANVAS_HEIGHT);
      gradient.addColorStop(0, '#ff9a9e');
      gradient.addColorStop(0.5, '#fecfef');
      gradient.addColorStop(1, '#87ceeb');
    } else {
      gradient = ctx.createLinearGradient(0, 0, 0, CONFIG.CANVAS_HEIGHT);
      gradient.addColorStop(0, '#87ceeb');
      gradient.addColorStop(1, '#e0f6ff');
    }
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, CONFIG.CANVAS_WIDTH, CONFIG.CANVAS_HEIGHT);
    
    if (this.bgTheme !== 'underground') {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
      for (const cloud of this.clouds) {
        const cx = (cloud.x - this.bgOffset * 0.5) % (CONFIG.CANVAS_WIDTH + 200) - 100;
        this.drawCloud(cx, cloud.y, cloud.size);
      }
    }
    
    if (this.bgTheme === 'day') {
      ctx.fillStyle = '#6b8e9f';
      for (let i = 0; i < 5; i++) {
        const mx = (i * 300 - this.bgOffset * 0.2) % (CONFIG.CANVAS_WIDTH + 400) - 200;
        this.drawMountain(mx, 350, 200, 150);
      }
    }
  }
  
  drawCloud(x, y, size) {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.arc(x, y, size * 0.5, 0, Math.PI * 2);
    ctx.arc(x + size * 0.4, y - size * 0.2, size * 0.4, 0, Math.PI * 2);
    ctx.arc(x + size * 0.8, y, size * 0.5, 0, Math.PI * 2);
    ctx.arc(x + size * 0.4, y + size * 0.1, size * 0.35, 0, Math.PI * 2);
    ctx.fill();
  }
  
  drawMountain(x, baseY, width, height) {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(x, baseY);
    ctx.lineTo(x + width / 2, baseY - height);
    ctx.lineTo(x + width, baseY);
    ctx.closePath();
    ctx.fill();
  }
  
  drawMap() {
    const ctx = this.ctx;
    const tileSize = CONFIG.TILE_SIZE;
    
    const startX = Math.floor(this.cameraX / tileSize);
    const endX = Math.min(startX + Math.ceil(CONFIG.CANVAS_WIDTH / tileSize) + 2, this.map[0].length);
    
    for (let y = 0; y < this.map.length; y++) {
      for (let x = startX; x < endX; x++) {
        const tile = this.map[y][x];
        if (tile === 0) continue;
        
        const screenX = x * tileSize - this.cameraX;
        const screenY = y * tileSize;
        
        switch (tile) {
          case 1: this.drawGround(screenX, screenY, tileSize); break;
          case 2: this.drawBrick(screenX, screenY, tileSize, x, y); break;
          case 3: this.drawQuestionBlock(screenX, screenY, tileSize, x, y); break;
          case 4: this.drawPipe(screenX, screenY, tileSize, y); break;
          case 6: this.drawPlatform(screenX, screenY, tileSize); break;
        }
      }
    }
  }
  
  drawGround(x, y, size) {
    const ctx = this.ctx;
    ctx.fillStyle = CONFIG.COLORS.GRASS;
    ctx.fillRect(x, y, size, 8);
    ctx.fillStyle = CONFIG.COLORS.GROUND;
    ctx.fillRect(x, y + 8, size, size - 8);
    ctx.fillStyle = 'rgba(0,0,0,0.1)';
    ctx.fillRect(x + 4, y + 12, 4, 4);
    ctx.fillRect(x + 20, y + 20, 4, 4);
  }
  
  drawBrick(x, y, size, tileX, tileY) {
    const ctx = this.ctx;
    const blockKey = `${tileX},${tileY}`;
    const wasQuestion = this.questionBlocks[blockKey];
    
    if (wasQuestion) {
      ctx.fillStyle = '#8b7355';
      ctx.fillRect(x, y, size, size);
      ctx.strokeStyle = 'rgba(0,0,0,0.4)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 1, y + 1, size - 2, size - 2);
    } else {
      ctx.fillStyle = CONFIG.COLORS.BRICK;
      ctx.fillRect(x, y, size, size);
      ctx.strokeStyle = 'rgba(0,0,0,0.3)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 1, y + 1, size - 2, size - 2);
      ctx.beginPath();
      ctx.moveTo(x, y + size / 2);
      ctx.lineTo(x + size, y + size / 2);
      ctx.moveTo(x + size / 2, y);
      ctx.lineTo(x + size / 2, y + size / 2);
      ctx.stroke();
    }
  }
  
  drawQuestionBlock(x, y, size, tileX, tileY) {
    const ctx = this.ctx;
    const blockKey = `${tileX},${tileY}`;
    const wasHit = this.questionBlocks[blockKey];
    
    if (wasHit) {
      ctx.fillStyle = '#8b7355';
      ctx.fillRect(x, y, size, size);
      ctx.strokeStyle = 'rgba(0,0,0,0.4)';
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 2, y + 2, size - 4, size - 4);
    } else {
      ctx.fillStyle = CONFIG.COLORS.BLOCK;
      ctx.fillRect(x, y, size, size);
      ctx.strokeStyle = '#b8860b';
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 2, y + 2, size - 4, size - 4);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 20px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('?', x + size / 2, y + size / 2);
    }
  }
  
  drawPipe(x, y, size, tileY) {
    const ctx = this.ctx;
    const isTop = tileY === 0 || this.map[tileY - 1] && this.map[tileY - 1][Math.floor((x + this.cameraX) / size)] !== 4;
    
    if (isTop) {
      ctx.fillStyle = CONFIG.COLORS.PIPE;
      ctx.fillRect(x - 4, y, size + 8, size);
      ctx.fillStyle = CONFIG.COLORS.PIPE_DARK;
      ctx.fillRect(x - 4, y, 8, size);
      ctx.fillRect(x + size - 4, y, 8, size);
    } else {
      ctx.fillStyle = CONFIG.COLORS.PIPE;
      ctx.fillRect(x, y, size, size);
      ctx.fillStyle = CONFIG.COLORS.PIPE_DARK;
      ctx.fillRect(x, y, 6, size);
      ctx.fillRect(x + size - 6, y, 6, size);
    }
  }
  
  drawPlatform(x, y, size) {
    const ctx = this.ctx;
    ctx.fillStyle = '#8b7355';
    ctx.fillRect(x, y, size, size);
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.fillRect(x, y, size, 4);
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.fillRect(x, y + size - 4, size, 4);
  }
  
  drawCoins() {
    const ctx = this.ctx;
    
    for (const coin of this.coins) {
      const screenX = coin.x - this.cameraX;
      if (screenX < -50 || screenX > CONFIG.CANVAS_WIDTH + 50) continue;
      
      const scaleX = Math.cos(coin.rotation);
      
      ctx.save();
      ctx.translate(screenX, coin.y);
      ctx.scale(scaleX, 1);
      
      ctx.fillStyle = CONFIG.COLORS.COIN;
      ctx.beginPath();
      ctx.arc(0, 0, CONFIG.COIN.SIZE / 2, 0, Math.PI * 2);
      ctx.fill();
      
      ctx.strokeStyle = CONFIG.COLORS.COIN_DARK;
      ctx.lineWidth = 2;
      ctx.stroke();
      
      if (Math.abs(scaleX) > 0.3) {
        ctx.fillStyle = CONFIG.COLORS.COIN_DARK;
        ctx.font = 'bold 12px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('$', 0, 0);
      }
      
      ctx.restore();
    }
  }
  
  drawEnemies() {
    const ctx = this.ctx;
    
    for (const enemy of this.enemies) {
      if (!enemy.alive) continue;
      
      const screenX = enemy.x - this.cameraX;
      if (screenX < -50 || screenX > CONFIG.CANVAS_WIDTH + 50) continue;
      
      ctx.fillStyle = CONFIG.COLORS.ENEMY;
      ctx.beginPath();
      ctx.arc(screenX + enemy.width / 2, enemy.y + enemy.height / 2, enemy.width / 2, 0, Math.PI * 2);
      ctx.fill();
      
      ctx.fillStyle = CONFIG.COLORS.ENEMY_DARK;
      ctx.fillRect(screenX + 6, enemy.y + 6, 6, 3);
      ctx.fillRect(screenX + enemy.width - 12, enemy.y + 6, 6, 3);
      
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(screenX + 10, enemy.y + 12, 4, 0, Math.PI * 2);
      ctx.arc(screenX + enemy.width - 10, enemy.y + 12, 4, 0, Math.PI * 2);
      ctx.fill();
      
      ctx.fillStyle = '#000';
      const pupilOffset = enemy.vx > 0 ? 1 : -1;
      ctx.beginPath();
      ctx.arc(screenX + 10 + pupilOffset, enemy.y + 13, 2, 0, Math.PI * 2);
      ctx.arc(screenX + enemy.width - 10 + pupilOffset, enemy.y + 13, 2, 0, Math.PI * 2);
      ctx.fill();
      
      const footOffset = Math.floor(enemy.animFrame) * 3;
      ctx.fillStyle = CONFIG.COLORS.ENEMY_DARK;
      ctx.fillRect(screenX + 4, enemy.y + enemy.height - 6 + footOffset, 8, 6);
      ctx.fillRect(screenX + enemy.width - 12, enemy.y + enemy.height - 6 - footOffset, 8, 6);
    }
  }
  
  drawPlayer() {
    const ctx = this.ctx;
    const p = this.player;
    const screenX = p.x - this.cameraX;
    
    ctx.save();
    ctx.translate(screenX + p.width / 2, p.y + p.height / 2);
    ctx.scale(p.facing, 1);
    ctx.translate(-p.width / 2, -p.height / 2);
    
    ctx.fillStyle = CONFIG.COLORS.PLAYER;
    ctx.fillRect(2, 8, p.width - 4, p.height - 8);
    
    ctx.beginPath();
    ctx.arc(p.width / 2, 8, 10, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.fillStyle = '#e74c3c';
    ctx.fillRect(2, 0, p.width - 4, 8);
    ctx.fillRect(0, 4, p.width, 4);
    
    ctx.fillStyle = '#fff';
    ctx.fillRect(p.width - 10, 6, 4, 4);
    ctx.fillStyle = '#000';
    ctx.fillRect(p.width - 8, 7, 2, 2);
    
    ctx.fillStyle = '#3498db';
    ctx.fillRect(4, 14, p.width - 8, 10);
    
    const legOffset = p.onGround ? Math.sin(p.animFrame * Math.PI / 2) * 3 : 0;
    ctx.fillStyle = CONFIG.COLORS.PLAYER_DARK;
    ctx.fillRect(4, p.height - 10 + legOffset, 8, 10);
    ctx.fillRect(p.width - 12, p.height - 10 - legOffset, 8, 10);
    
    ctx.restore();
  }
  
  drawParticles() {
    const ctx = this.ctx;
    for (const p of this.particles) {
      const screenX = p.x - this.cameraX;
      ctx.fillStyle = p.color;
      ctx.globalAlpha = p.life / 30;
      ctx.fillRect(screenX - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;
  }
  
  drawFlag() {
    const ctx = this.ctx;
    const screenX = this.flagX - this.cameraX;
    if (screenX < -50 || screenX > CONFIG.CANVAS_WIDTH + 50) return;
    
    ctx.fillStyle = CONFIG.COLORS.FLAG_POLE;
    ctx.fillRect(screenX + 14, 100, 4, CONFIG.CANVAS_HEIGHT - 100 - CONFIG.TILE_SIZE);
    
    ctx.fillStyle = CONFIG.COLORS.FLAG;
    ctx.beginPath();
    ctx.moveTo(screenX + 18, 100);
    ctx.lineTo(screenX + 50, 120);
    ctx.lineTo(screenX + 18, 140);
    ctx.closePath();
    ctx.fill();
    
    ctx.fillStyle = '#ffd700';
    ctx.beginPath();
    ctx.arc(screenX + 16, 95, 6, 0, Math.PI * 2);
    ctx.fill();
  }
  
  gameLoop() {
    this.update();
    this.render();
    requestAnimationFrame(() => this.gameLoop());
  }
}

window.addEventListener('load', () => new Game());
