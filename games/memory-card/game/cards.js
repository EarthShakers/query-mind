// 卡牌图案配置 - 使用 Canvas 绘制的各种图形符号
const CARD_PATTERNS = [
    // 1. 红心
    {
        name: 'heart',
        color: '#e74c3c',
        draw: (ctx, size) => {
            ctx.fillStyle = '#e74c3c';
            ctx.beginPath();
            const s = size * 0.3;
            ctx.moveTo(size/2, size * 0.7);
            ctx.bezierCurveTo(size/2 - s, size * 0.5, size * 0.2, size * 0.3, size/2, size * 0.25);
            ctx.bezierCurveTo(size * 0.8, size * 0.3, size/2 + s, size * 0.5, size/2, size * 0.7);
            ctx.fill();
        }
    },
    // 2. 星星
    {
        name: 'star',
        color: '#f1c40f',
        draw: (ctx, size) => {
            ctx.fillStyle = '#f1c40f';
            ctx.beginPath();
            const cx = size / 2, cy = size / 2;
            const spikes = 5, outerR = size * 0.35, innerR = size * 0.15;
            for (let i = 0; i < spikes * 2; i++) {
                const r = i % 2 === 0 ? outerR : innerR;
                const angle = (i * Math.PI / spikes) - Math.PI / 2;
                const x = cx + Math.cos(angle) * r;
                const y = cy + Math.sin(angle) * r;
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.closePath();
            ctx.fill();
        }
    },
    // 3. 月亮
    {
        name: 'moon',
        color: '#9b59b6',
        draw: (ctx, size) => {
            ctx.fillStyle = '#9b59b6';
            ctx.beginPath();
            ctx.arc(size/2, size/2, size * 0.35, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#2c3e50';
            ctx.beginPath();
            ctx.arc(size * 0.6, size * 0.4, size * 0.25, 0, Math.PI * 2);
            ctx.fill();
        }
    },
    // 4. 太阳
    {
        name: 'sun',
        color: '#f39c12',
        draw: (ctx, size) => {
            const cx = size / 2, cy = size / 2;
            ctx.fillStyle = '#f39c12';
            ctx.beginPath();
            ctx.arc(cx, cy, size * 0.2, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#f39c12';
            ctx.lineWidth = 3;
            for (let i = 0; i < 8; i++) {
                const angle = (i * Math.PI / 4);
                ctx.beginPath();
                ctx.moveTo(cx + Math.cos(angle) * size * 0.25, cy + Math.sin(angle) * size * 0.25);
                ctx.lineTo(cx + Math.cos(angle) * size * 0.38, cy + Math.sin(angle) * size * 0.38);
                ctx.stroke();
            }
        }
    },
    // 5. 钻石
    {
        name: 'diamond',
        color: '#3498db',
        draw: (ctx, size) => {
            ctx.fillStyle = '#3498db';
            ctx.beginPath();
            ctx.moveTo(size/2, size * 0.15);
            ctx.lineTo(size * 0.8, size/2);
            ctx.lineTo(size/2, size * 0.85);
            ctx.lineTo(size * 0.2, size/2);
            ctx.closePath();
            ctx.fill();
            ctx.fillStyle = 'rgba(255,255,255,0.3)';
            ctx.beginPath();
            ctx.moveTo(size/2, size * 0.15);
            ctx.lineTo(size * 0.5, size/2);
            ctx.lineTo(size * 0.35, size/2);
            ctx.closePath();
            ctx.fill();
        }
    },
    // 6. 闪电
    {
        name: 'lightning',
        color: '#f1c40f',
        draw: (ctx, size) => {
            ctx.fillStyle = '#f1c40f';
            ctx.beginPath();
            ctx.moveTo(size * 0.55, size * 0.1);
            ctx.lineTo(size * 0.35, size * 0.5);
            ctx.lineTo(size * 0.5, size * 0.5);
            ctx.lineTo(size * 0.45, size * 0.9);
            ctx.lineTo(size * 0.65, size * 0.5);
            ctx.lineTo(size * 0.5, size * 0.5);
            ctx.closePath();
            ctx.fill();
        }
    },
    // 7. 花朵
    {
        name: 'flower',
        color: '#e91e63',
        draw: (ctx, size) => {
            const cx = size / 2, cy = size / 2;
            ctx.fillStyle = '#e91e63';
            for (let i = 0; i < 5; i++) {
                const angle = (i * Math.PI * 2 / 5) - Math.PI / 2;
                ctx.beginPath();
                ctx.arc(cx + Math.cos(angle) * size * 0.15, cy + Math.sin(angle) * size * 0.15, size * 0.15, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.fillStyle = '#f1c40f';
            ctx.beginPath();
            ctx.arc(cx, cy, size * 0.1, 0, Math.PI * 2);
            ctx.fill();
        }
    },
    // 8. 树
    {
        name: 'tree',
        color: '#27ae60',
        draw: (ctx, size) => {
            ctx.fillStyle = '#27ae60';
            ctx.beginPath();
            ctx.moveTo(size/2, size * 0.1);
            ctx.lineTo(size * 0.75, size * 0.55);
            ctx.lineTo(size * 0.25, size * 0.55);
            ctx.closePath();
            ctx.fill();
            ctx.beginPath();
            ctx.moveTo(size/2, size * 0.3);
            ctx.lineTo(size * 0.8, size * 0.65);
            ctx.lineTo(size * 0.2, size * 0.65);
            ctx.closePath();
            ctx.fill();
            ctx.fillStyle = '#8b4513';
            ctx.fillRect(size * 0.4, size * 0.65, size * 0.2, size * 0.2);
        }
    },
    // 9. 云
    {
        name: 'cloud',
        color: '#ecf0f1',
        draw: (ctx, size) => {
            ctx.fillStyle = '#ecf0f1';
            ctx.beginPath();
            ctx.arc(size * 0.35, size * 0.5, size * 0.15, 0, Math.PI * 2);
            ctx.arc(size * 0.5, size * 0.4, size * 0.18, 0, Math.PI * 2);
            ctx.arc(size * 0.65, size * 0.5, size * 0.15, 0, Math.PI * 2);
            ctx.fill();
        }
    },
    // 10. 雪花
    {
        name: 'snowflake',
        color: '#00bcd4',
        draw: (ctx, size) => {
            ctx.strokeStyle = '#00bcd4';
            ctx.lineWidth = 2;
            const cx = size / 2, cy = size / 2;
            for (let i = 0; i < 6; i++) {
                const angle = (i * Math.PI / 3);
                ctx.beginPath();
                ctx.moveTo(cx, cy);
                ctx.lineTo(cx + Math.cos(angle) * size * 0.35, cy + Math.sin(angle) * size * 0.35);
                ctx.stroke();
                const midX = cx + Math.cos(angle) * size * 0.2;
                const midY = cy + Math.sin(angle) * size * 0.2;
                ctx.beginPath();
                ctx.moveTo(midX, midY);
                ctx.lineTo(midX + Math.cos(angle + 0.5) * size * 0.1, midY + Math.sin(angle + 0.5) * size * 0.1);
                ctx.moveTo(midX, midY);
                ctx.lineTo(midX + Math.cos(angle - 0.5) * size * 0.1, midY + Math.sin(angle - 0.5) * size * 0.1);
                ctx.stroke();
            }
        }
    },
    // 11. 苹果
    {
        name: 'apple',
        color: '#e74c3c',
        draw: (ctx, size) => {
            ctx.fillStyle = '#e74c3c';
            ctx.beginPath();
            ctx.arc(size/2, size * 0.55, size * 0.28, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#27ae60';
            ctx.beginPath();
            ctx.ellipse(size * 0.55, size * 0.28, size * 0.05, size * 0.1, 0.3, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#8b4513';
            ctx.fillRect(size * 0.48, size * 0.2, size * 0.04, size * 0.12);
        }
    },
    // 12. 樱桃
    {
        name: 'cherry',
        color: '#c0392b',
        draw: (ctx, size) => {
            ctx.fillStyle = '#c0392b';
            ctx.beginPath();
            ctx.arc(size * 0.35, size * 0.6, size * 0.15, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(size * 0.65, size * 0.65, size * 0.15, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#27ae60';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(size * 0.35, size * 0.45);
            ctx.quadraticCurveTo(size * 0.5, size * 0.2, size * 0.65, size * 0.5);
            ctx.stroke();
        }
    },
    // 13. 蘑菇
    {
        name: 'mushroom',
        color: '#e74c3c',
        draw: (ctx, size) => {
            ctx.fillStyle = '#e74c3c';
            ctx.beginPath();
            ctx.arc(size/2, size * 0.45, size * 0.32, Math.PI, 0);
            ctx.fill();
            ctx.fillStyle = '#ecf0f1';
            ctx.beginPath();
            ctx.arc(size * 0.35, size * 0.35, size * 0.08, 0, Math.PI * 2);
            ctx.arc(size * 0.6, size * 0.4, size * 0.06, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#f5deb3';
            ctx.fillRect(size * 0.38, size * 0.45, size * 0.24, size * 0.35);
        }
    },
    // 14. 西瓜
    {
        name: 'watermelon',
        color: '#27ae60',
        draw: (ctx, size) => {
            ctx.fillStyle = '#27ae60';
            ctx.beginPath();
            ctx.arc(size/2, size/2, size * 0.35, 0, Math.PI);
            ctx.fill();
            ctx.fillStyle = '#e74c3c';
            ctx.beginPath();
            ctx.arc(size/2, size/2, size * 0.28, 0, Math.PI);
            ctx.fill();
            ctx.fillStyle = '#2c3e50';
            for (let i = 0; i < 5; i++) {
                ctx.beginPath();
                ctx.arc(size * 0.25 + i * size * 0.12, size * 0.55, 2, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    },
    // 15. 柠檬
    {
        name: 'lemon',
        color: '#f1c40f',
        draw: (ctx, size) => {
            ctx.fillStyle = '#f1c40f';
            ctx.beginPath();
            ctx.ellipse(size/2, size/2, size * 0.3, size * 0.22, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#f39c12';
            ctx.beginPath();
            ctx.ellipse(size * 0.25, size/2, size * 0.08, size * 0.05, 0, 0, Math.PI * 2);
            ctx.fill();
        }
    },
    // 16. 葡萄
    {
        name: 'grape',
        color: '#8e44ad',
        draw: (ctx, size) => {
            ctx.fillStyle = '#8e44ad';
            const positions = [
                [0.4, 0.3], [0.6, 0.3],
                [0.3, 0.45], [0.5, 0.45], [0.7, 0.45],
                [0.35, 0.6], [0.55, 0.6], [0.75, 0.6],
                [0.45, 0.75], [0.65, 0.75]
            ];
            positions.forEach(([px, py]) => {
                ctx.beginPath();
                ctx.arc(size * px, size * py, size * 0.1, 0, Math.PI * 2);
                ctx.fill();
            });
            ctx.fillStyle = '#27ae60';
            ctx.fillRect(size * 0.48, size * 0.15, size * 0.04, size * 0.12);
        }
    },
    // 17. 草莓
    {
        name: 'strawberry',
        color: '#e74c3c',
        draw: (ctx, size) => {
            ctx.fillStyle = '#e74c3c';
            ctx.beginPath();
            ctx.moveTo(size/2, size * 0.8);
            ctx.quadraticCurveTo(size * 0.2, size * 0.5, size * 0.35, size * 0.3);
            ctx.quadraticCurveTo(size/2, size * 0.2, size * 0.65, size * 0.3);
            ctx.quadraticCurveTo(size * 0.8, size * 0.5, size/2, size * 0.8);
            ctx.fill();
            ctx.fillStyle = '#f1c40f';
            for (let i = 0; i < 6; i++) {
                ctx.beginPath();
                ctx.arc(size * 0.3 + (i % 3) * size * 0.2, size * 0.4 + Math.floor(i / 3) * size * 0.2, 2, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.fillStyle = '#27ae60';
            ctx.beginPath();
            ctx.moveTo(size * 0.4, size * 0.3);
            ctx.lineTo(size/2, size * 0.15);
            ctx.lineTo(size * 0.6, size * 0.3);
            ctx.fill();
        }
    },
    // 18. 橙子
    {
        name: 'orange',
        color: '#e67e22',
        draw: (ctx, size) => {
            ctx.fillStyle = '#e67e22';
            ctx.beginPath();
            ctx.arc(size/2, size/2, size * 0.32, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#27ae60';
            ctx.beginPath();
            ctx.ellipse(size * 0.52, size * 0.22, size * 0.06, size * 0.08, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#f39c12';
            ctx.beginPath();
            ctx.arc(size * 0.4, size * 0.4, size * 0.05, 0, Math.PI * 2);
            ctx.fill();
        }
    },
    // 19. 胡萝卜
    {
        name: 'carrot',
        color: '#e67e22',
        draw: (ctx, size) => {
            ctx.fillStyle = '#e67e22';
            ctx.beginPath();
            ctx.moveTo(size/2, size * 0.85);
            ctx.lineTo(size * 0.35, size * 0.25);
            ctx.lineTo(size * 0.65, size * 0.25);
            ctx.closePath();
            ctx.fill();
            ctx.fillStyle = '#27ae60';
            ctx.beginPath();
            ctx.moveTo(size * 0.4, size * 0.25);
            ctx.lineTo(size * 0.3, size * 0.1);
            ctx.lineTo(size * 0.5, size * 0.25);
            ctx.fill();
            ctx.beginPath();
            ctx.moveTo(size * 0.5, size * 0.25);
            ctx.lineTo(size * 0.5, size * 0.1);
            ctx.lineTo(size * 0.55, size * 0.25);
            ctx.fill();
            ctx.beginPath();
            ctx.moveTo(size * 0.55, size * 0.25);
            ctx.lineTo(size * 0.7, size * 0.1);
            ctx.lineTo(size * 0.6, size * 0.25);
            ctx.fill();
        }
    },
    // 20. 玉米
    {
        name: 'corn',
        color: '#f1c40f',
        draw: (ctx, size) => {
            ctx.fillStyle = '#f1c40f';
            ctx.beginPath();
            ctx.ellipse(size/2, size * 0.5, size * 0.18, size * 0.32, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#f39c12';
            ctx.lineWidth = 1;
            for (let i = 0; i < 6; i++) {
                ctx.beginPath();
                ctx.moveTo(size * 0.35, size * (0.25 + i * 0.1));
                ctx.lineTo(size * 0.65, size * (0.25 + i * 0.1));
                ctx.stroke();
            }
            ctx.fillStyle = '#27ae60';
            ctx.beginPath();
            ctx.moveTo(size * 0.35, size * 0.2);
            ctx.quadraticCurveTo(size * 0.2, size * 0.1, size * 0.4, size * 0.05);
            ctx.lineTo(size * 0.4, size * 0.2);
            ctx.fill();
            ctx.beginPath();
            ctx.moveTo(size * 0.6, size * 0.2);
            ctx.quadraticCurveTo(size * 0.8, size * 0.1, size * 0.6, size * 0.05);
            ctx.lineTo(size * 0.6, size * 0.2);
            ctx.fill();
        }
    },
    // 21. 南瓜
    {
        name: 'pumpkin',
        color: '#e67e22',
        draw: (ctx, size) => {
            ctx.fillStyle = '#e67e22';
            ctx.beginPath();
            ctx.ellipse(size * 0.35, size * 0.55, size * 0.2, size * 0.28, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.ellipse(size * 0.65, size * 0.55, size * 0.2, size * 0.28, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.ellipse(size/2, size * 0.55, size * 0.18, size * 0.3, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#27ae60';
            ctx.fillRect(size * 0.47, size * 0.18, size * 0.06, size * 0.12);
        }
    },
    // 22. 茄子
    {
        name: 'eggplant',
        color: '#8e44ad',
        draw: (ctx, size) => {
            ctx.fillStyle = '#8e44ad';
            ctx.beginPath();
            ctx.moveTo(size * 0.3, size * 0.75);
            ctx.quadraticCurveTo(size * 0.15, size * 0.4, size * 0.4, size * 0.3);
            ctx.quadraticCurveTo(size/2, size * 0.25, size * 0.6, size * 0.3);
            ctx.quadraticCurveTo(size * 0.85, size * 0.4, size * 0.7, size * 0.75);
            ctx.quadraticCurveTo(size/2, size * 0.85, size * 0.3, size * 0.75);
            ctx.fill();
            ctx.fillStyle = '#27ae60';
            ctx.beginPath();
            ctx.moveTo(size * 0.4, size * 0.3);
            ctx.lineTo(size * 0.45, size * 0.15);
            ctx.lineTo(size * 0.55, size * 0.15);
            ctx.lineTo(size * 0.6, size * 0.3);
            ctx.fill();
        }
    },
    // 23. 铃铛
    {
        name: 'bell',
        color: '#f1c40f',
        draw: (ctx, size) => {
            ctx.fillStyle = '#f1c40f';
            ctx.beginPath();
            ctx.moveTo(size * 0.25, size * 0.7);
            ctx.quadraticCurveTo(size * 0.1, size * 0.4, size/2, size * 0.2);
            ctx.quadraticCurveTo(size * 0.9, size * 0.4, size * 0.75, size * 0.7);
            ctx.lineTo(size * 0.25, size * 0.7);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(size/2, size * 0.78, size * 0.08, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#e67e22';
            ctx.beginPath();
            ctx.arc(size/2, size * 0.18, size * 0.06, 0, Math.PI * 2);
            ctx.fill();
        }
    },
    // 24. 礼物
    {
        name: 'gift',
        color: '#e74c3c',
        draw: (ctx, size) => {
            ctx.fillStyle = '#e74c3c';
            ctx.fillRect(size * 0.2, size * 0.4, size * 0.6, size * 0.45);
            ctx.fillStyle = '#f1c40f';
            ctx.fillRect(size * 0.45, size * 0.4, size * 0.1, size * 0.45);
            ctx.fillRect(size * 0.2, size * 0.55, size * 0.6, size * 0.1);
            ctx.fillStyle = '#e74c3c';
            ctx.beginPath();
            ctx.moveTo(size * 0.3, size * 0.4);
            ctx.quadraticCurveTo(size/2, size * 0.2, size * 0.7, size * 0.4);
            ctx.lineTo(size * 0.3, size * 0.4);
            ctx.fill();
            ctx.fillStyle = '#f1c40f';
            ctx.beginPath();
            ctx.arc(size/2, size * 0.32, size * 0.06, 0, Math.PI * 2);
            ctx.fill();
        }
    }
];

// 生成卡牌图案到 Canvas
function drawCardPattern(canvas, patternIndex) {
    const ctx = canvas.getContext('2d');
    const size = canvas.width;
    ctx.clearRect(0, 0, size, size);
    
    if (patternIndex >= 0 && patternIndex < CARD_PATTERNS.length) {
        CARD_PATTERNS[patternIndex].draw(ctx, size);
    }
}

// 获取卡牌数量
function getPatternCount() {
    return CARD_PATTERNS.length;
}
