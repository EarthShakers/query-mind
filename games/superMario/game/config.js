// 游戏配置
const CONFIG = {
  // 画布尺寸
  CANVAS_WIDTH: 800,
  CANVAS_HEIGHT: 480,
  
  // 瓦片尺寸
  TILE_SIZE: 32,
  
  // 物理参数
  GRAVITY: 0.6,
  MAX_FALL_SPEED: 12,
  
  // 玩家参数
  PLAYER: {
    WIDTH: 28,
    HEIGHT: 32,
    SPEED: 4,
    JUMP_FORCE: -12,
    ACCELERATION: 0.5,
    FRICTION: 0.85
  },
  
  // 怪物参数
  ENEMY: {
    WIDTH: 28,
    HEIGHT: 28,
    SPEED: 1.5
  },
  
  // 金币参数
  COIN: {
    SIZE: 20,
    ROTATION_SPEED: 0.1
  },
  
  // 颜色配置
  COLORS: {
    SKY: '#87ceeb',
    GROUND: '#8b4513',
    GRASS: '#228b22',
    BRICK: '#cd853f',
    BLOCK: '#daa520',
    PLAYER: '#e74c3c',
    PLAYER_DARK: '#c0392b',
    ENEMY: '#8e44ad',
    ENEMY_DARK: '#6c3483',
    COIN: '#ffd700',
    COIN_DARK: '#daa520',
    PIPE: '#2ecc71',
    PIPE_DARK: '#27ae60',
    FLAG: '#e74c3c',
    FLAG_POLE: '#7f8c8d',
    CLOUD: '#ffffff',
    MOUNTAIN: '#5d6d7e',
    BUSH: '#27ae60'
  }
};
