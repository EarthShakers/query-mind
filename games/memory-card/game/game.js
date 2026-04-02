// 游戏状态
const GameState = {
    IDLE: 'idle',
    PREVIEW: 'preview',
    FLIPPING: 'flipping',
    CHECKING: 'checking',
    GAME_OVER: 'game_over'
};

// 游戏配置
const CONFIG = {
    GRID_COLS: 6,
    GRID_ROWS: 4,
    FLIP_DELAY: 800,
    PREVIEW_DURATION: 2000,
    HINT_PENALTY: 50,
    BASE_SCORE: 100,
    COMBO_MULTIPLIER: 1.5
};

// 游戏变量
let cards = [];
let flippedCards = [];
let matchedPairs = 0;
let totalPairs = 0;
let moves = 0;
let score = 0;
let combo = 0;
let gameState = GameState.IDLE;
let timerInterval = null;
let seconds = 0;
let hintUsed = false;
let gameStarted = false;

// DOM 元素
const gameBoard = document.getElementById('gameBoard');
const timerDisplay = document.getElementById('timer');
const scoreDisplay = document.getElementById('score');
const movesDisplay = document.getElementById('moves');
const pairsDisplay = document.getElementById('pairs');
const totalPairsDisplay = document.getElementById('totalPairs');
const victoryOverlay = document.getElementById('victoryOverlay');
const startOverlay = document.getElementById('startOverlay');
const finalTimeDisplay = document.getElementById('finalTime');
const finalScoreDisplay = document.getElementById('finalScore');
const finalMovesDisplay = document.getElementById('finalMoves');

// 初始化游戏（不开始，只生成卡牌）
function initGame() {
    // 重置状态
    cards = [];
    flippedCards = [];
    matchedPairs = 0;
    moves = 0;
    score = 0;
    combo = 0;
    seconds = 0;
    gameState = GameState.IDLE;
    hintUsed = false;
    gameStarted = false;
    
    // 清除计时器
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
    
    // 计算卡牌数量
    const totalCards = CONFIG.GRID_COLS * CONFIG.GRID_ROWS;
    totalPairs = totalCards / 2;
    
    // 生成卡牌对
    const patternCount = getPatternCount();
    const selectedPatterns = [];
    
    // 随机选择图案
    const availablePatterns = [...Array(patternCount).keys()];
    for (let i = 0; i < totalPairs; i++) {
        const randomIndex = Math.floor(Math.random() * availablePatterns.length);
        selectedPatterns.push(availablePatterns[randomIndex]);
        availablePatterns.splice(randomIndex, 1);
    }
    
    // 创建卡牌数组（每个图案两张）
    const cardData = [];
    selectedPatterns.forEach((patternIndex, pairId) => {
        cardData.push({ patternIndex, pairId });
        cardData.push({ patternIndex, pairId });
    });
    
    // 洗牌
    shuffleArray(cardData);
    
    // 创建卡牌 DOM
    gameBoard.innerHTML = '';
    cardData.forEach((data, index) => {
        const card = createCardElement(index, data.patternIndex, data.pairId);
        cards.push({
            element: card,
            patternIndex: data.patternIndex,
            pairId: data.pairId,
            isFlipped: false,
            isMatched: false
        });
        gameBoard.appendChild(card);
    });
    
    // 更新显示
    updateDisplay();
    totalPairsDisplay.textContent = totalPairs;
    
    // 隐藏胜利弹窗
    victoryOverlay.classList.remove('show');
    
    // 显示开始遮罩
    startOverlay.classList.remove('hidden');
}

// 创建卡牌元素
function createCardElement(index, patternIndex, pairId) {
    const card = document.createElement('div');
    card.className = 'card';
    card.dataset.index = index;
    
    card.innerHTML = `
        <div class="card-face card-back"></div>
        <div class="card-face card-front">
            <canvas width="70" height="70"></canvas>
        </div>
    `;
    
    // 绘制图案
    const canvas = card.querySelector('canvas');
    drawCardPattern(canvas, patternIndex);
    
    // 点击事件
    card.addEventListener('click', () => handleCardClick(index));
    
    return card;
}

// 洗牌算法
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

// 开始游戏（预览所有卡牌）
function startGame() {
    // 隐藏开始遮罩
    startOverlay.classList.add('hidden');
    
    // 设置预览状态
    gameState = GameState.PREVIEW;
    
    // 禁用所有卡牌点击
    setCardsDisabled(true);
    
    // 翻开所有卡牌
    cards.forEach((card, index) => {
        setTimeout(() => {
            flipCard(index);
        }, index * 30); // 依次翻开，形成波浪效果
    });
    
    // 显示预览提示
    showPreviewHint();
    
    // 2秒后翻回所有卡牌并开始游戏
    setTimeout(() => {
        // 翻回所有未配对的卡牌
        cards.forEach((card, index) => {
            if (!card.isMatched) {
                unflipCard(index);
            }
        });
        
        // 启用卡牌点击
        setCardsDisabled(false);
        
        // 开始游戏
        gameState = GameState.IDLE;
        gameStarted = true;
        startTimer();
    }, CONFIG.PREVIEW_DURATION + cards.length * 30);
}

// 显示预览提示
function showPreviewHint() {
    const hint = document.createElement('div');
    hint.className = 'preview-hint';
    hint.textContent = '👀 记住位置！';
    document.body.appendChild(hint);
    
    setTimeout(() => {
        hint.remove();
    }, CONFIG.PREVIEW_DURATION - 500);
}

// 禁用/启用卡牌点击
function setCardsDisabled(disabled) {
    cards.forEach(card => {
        if (disabled) {
            card.element.classList.add('disabled');
        } else {
            card.element.classList.remove('disabled');
        }
    });
}

// 处理卡牌点击
function handleCardClick(index) {
    const card = cards[index];
    
    // 检查是否可以翻牌
    if (gameState !== GameState.IDLE) return;
    if (!gameStarted) return;
    if (card.isFlipped || card.isMatched) return;
    if (flippedCards.length >= 2) return;
    
    // 翻牌
    flipCard(index);
    flippedCards.push(index);
    
    // 检查是否翻了两张
    if (flippedCards.length === 2) {
        moves++;
        updateDisplay();
        checkMatch();
    }
}

// 翻牌
function flipCard(index) {
    const card = cards[index];
    card.isFlipped = true;
    card.element.classList.add('flipped');
}

// 翻回卡牌
function unflipCard(index) {
    const card = cards[index];
    card.isFlipped = false;
    card.element.classList.remove('flipped');
}

// 检查配对
function checkMatch() {
    gameState = GameState.CHECKING;
    
    const [index1, index2] = flippedCards;
    const card1 = cards[index1];
    const card2 = cards[index2];
    
    if (card1.pairId === card2.pairId) {
        // 配对成功
        setTimeout(() => {
            card1.isMatched = true;
            card2.isMatched = true;
            card1.element.classList.add('matched');
            card2.element.classList.add('matched');
            
            matchedPairs++;
            combo++;
            
            // 计算分数（带连击加成）
            const comboBonus = Math.floor(CONFIG.BASE_SCORE * Math.pow(CONFIG.COMBO_MULTIPLIER, combo - 1));
            score += comboBonus;
            
            updateDisplay();
            
            flippedCards = [];
            gameState = GameState.IDLE;
            
            // 检查游戏是否结束
            if (matchedPairs === totalPairs) {
                endGame();
            }
        }, 300);
    } else {
        // 配对失败
        combo = 0;
        
        setTimeout(() => {
            unflipCard(index1);
            unflipCard(index2);
            flippedCards = [];
            gameState = GameState.IDLE;
        }, CONFIG.FLIP_DELAY);
    }
}

// 开始计时
function startTimer() {
    if (timerInterval) return;
    timerInterval = setInterval(() => {
        seconds++;
        updateTimerDisplay();
    }, 1000);
}

// 更新计时显示
function updateTimerDisplay() {
    const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
    const secs = (seconds % 60).toString().padStart(2, '0');
    timerDisplay.textContent = `${mins}:${secs}`;
}

// 更新显示
function updateDisplay() {
    scoreDisplay.textContent = score;
    movesDisplay.textContent = moves;
    pairsDisplay.textContent = matchedPairs;
}

// 结束游戏
function endGame() {
    gameState = GameState.GAME_OVER;
    
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
    
    // 时间奖励
    const timeBonus = Math.max(0, 500 - seconds * 2);
    score += timeBonus;
    
    // 提示惩罚
    if (hintUsed) {
        score = Math.max(0, score - CONFIG.HINT_PENALTY);
    }
    
    // 更新最终显示
    const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
    const secs = (seconds % 60).toString().padStart(2, '0');
    finalTimeDisplay.textContent = `${mins}:${secs}`;
    finalScoreDisplay.textContent = score;
    finalMovesDisplay.textContent = moves;
    
    // 显示胜利弹窗
    setTimeout(() => {
        victoryOverlay.classList.add('show');
    }, 500);
}

// 提示功能
function showHint() {
    if (gameState !== GameState.IDLE || !gameStarted) return;
    
    // 找到未配对的卡牌
    const unmatchedCards = cards.filter(c => !c.isMatched && !c.isFlipped);
    if (unmatchedCards.length < 2) return;
    
    // 找到一对相同的卡牌
    const pairMap = {};
    for (const card of unmatchedCards) {
        if (pairMap[card.pairId] !== undefined) {
            // 找到配对，闪烁提示
            const index1 = cards.indexOf(pairMap[card.pairId]);
            const index2 = cards.indexOf(card);
            
            cards[index1].element.classList.add('hint');
            cards[index2].element.classList.add('hint');
            
            setTimeout(() => {
                cards[index1].element.classList.remove('hint');
                cards[index2].element.classList.remove('hint');
            }, 1500);
            
            hintUsed = true;
            break;
        }
        pairMap[card.pairId] = card;
    }
}

// 重新开始游戏
function restartGame() {
    initGame();
    startGame();
}

// 事件监听
document.getElementById('startBtn').addEventListener('click', startGame);
document.getElementById('restartBtn').addEventListener('click', restartGame);
document.getElementById('hintBtn').addEventListener('click', showHint);
document.getElementById('playAgainBtn').addEventListener('click', restartGame);

// 启动游戏（初始化但不开始）
initGame();
