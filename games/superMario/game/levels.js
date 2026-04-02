// 关卡数据
// 0=空, 1=地面, 2=砖块, 3=问号块, 4=管道, 5=旗杆, 6=平台
const LEVELS = [
  // 关卡 1 - 新手教程
  {
    name: "蘑菇平原",
    width: 100,
    bgTheme: 'day',
    map: generateLevel1(),
    enemies: [
      { x: 12, y: 13, type: 'goomba' },
      { x: 20, y: 13, type: 'goomba' },
      { x: 35, y: 13, type: 'goomba' },
      { x: 50, y: 13, type: 'goomba' },
      { x: 65, y: 13, type: 'goomba' },
      { x: 75, y: 13, type: 'goomba' }
    ],
    coins: [
      { x: 8, y: 11 }, { x: 9, y: 11 },
      { x: 25, y: 9 }, { x: 26, y: 9 },
      { x: 40, y: 11 }, { x: 41, y: 11 },
      { x: 55, y: 9 }, { x: 56, y: 9 },
      { x: 70, y: 11 }
    ]
  },
  // 关卡 2 - 地下世界
  {
    name: "地下洞穴",
    width: 120,
    bgTheme: 'underground',
    map: generateLevel2(),
    enemies: [
      { x: 15, y: 13, type: 'goomba' },
      { x: 25, y: 13, type: 'goomba' },
      { x: 30, y: 9, type: 'goomba' },
      { x: 45, y: 13, type: 'goomba' },
      { x: 55, y: 11, type: 'goomba' },
      { x: 70, y: 13, type: 'goomba' },
      { x: 80, y: 9, type: 'goomba' },
      { x: 95, y: 13, type: 'goomba' },
      { x: 105, y: 13, type: 'goomba' }
    ],
    coins: [
      { x: 10, y: 11 }, { x: 11, y: 11 },
      { x: 20, y: 9 }, { x: 21, y: 9 },
      { x: 35, y: 11 }, { x: 36, y: 11 }, { x: 37, y: 11 },
      { x: 50, y: 9 }, { x: 51, y: 9 },
      { x: 60, y: 11 },
      { x: 75, y: 9 }, { x: 76, y: 9 },
      { x: 90, y: 11 }, { x: 91, y: 11 },
      { x: 100, y: 9 }
    ]
  },
  // 关卡 3 - 天空之城
  {
    name: "天空城堡",
    width: 100,
    bgTheme: 'sky',
    map: generateLevel3(),
    enemies: [
      { x: 18, y: 9, type: 'goomba' },
      { x: 30, y: 13, type: 'goomba' },
      { x: 38, y: 7, type: 'goomba' },
      { x: 50, y: 11, type: 'goomba' },
      { x: 62, y: 9, type: 'goomba' },
      { x: 75, y: 13, type: 'goomba' },
      { x: 85, y: 7, type: 'goomba' }
    ],
    coins: [
      { x: 8, y: 9 }, { x: 9, y: 9 },
      { x: 22, y: 7 }, { x: 23, y: 7 },
      { x: 35, y: 5 }, { x: 36, y: 5 },
      { x: 45, y: 9 }, { x: 46, y: 9 },
      { x: 55, y: 7 }, { x: 56, y: 7 },
      { x: 68, y: 9 }, { x: 69, y: 9 },
      { x: 80, y: 5 }, { x: 81, y: 5 }
    ]
  }
];

// 生成关卡1地图
function generateLevel1() {
  const map = [];
  const height = 15;
  const width = 100;
  
  for (let y = 0; y < height; y++) {
    map[y] = [];
    for (let x = 0; x < width; x++) {
      // 地面
      if (y >= 13) {
        map[y][x] = 1;
      } else {
        map[y][x] = 0;
      }
    }
  }
  
  // 添加平台和砖块
  // 第一组平台
  for (let x = 7; x <= 10; x++) map[10][x] = 2;
  
  // 问号块
  map[10][9] = 3;
  
  // 第二组平台
  for (let x = 18; x <= 21; x++) map[10][x] = 2;
  map[10][19] = 3;
  
  // 管道
  for (let y = 11; y < 13; y++) map[y][28] = 4;
  for (let y = 10; y < 13; y++) map[y][45] = 4;
  
  // 第三组平台
  for (let x = 38; x <= 42; x++) map[10][x] = 2;
  map[10][40] = 3;
  
  // 阶梯
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j <= i; j++) {
      map[12 - j][55 + i] = 2;
    }
  }
  
  // 第四组平台
  for (let x = 65; x <= 68; x++) map[10][x] = 2;
  map[10][66] = 3;
  
  // 旗杆位置
  map[12][95] = 5;
  map[11][95] = 5;
  map[10][95] = 5;
  map[9][95] = 5;
  map[8][95] = 5;
  map[7][95] = 5;
  map[6][95] = 5;
  map[5][95] = 5;
  
  return map;
}

// 生成关卡2地图
function generateLevel2() {
  const map = [];
  const height = 15;
  const width = 120;
  
  for (let y = 0; y < height; y++) {
    map[y] = [];
    for (let x = 0; x < width; x++) {
      if (y >= 13) {
        map[y][x] = 1;
      } else {
        map[y][x] = 0;
      }
    }
  }
  
  // 地下洞穴风格 - 更多平台
  // 第一组
  for (let x = 8; x <= 13; x++) map[10][x] = 2;
  map[10][10] = 3;
  
  // 高台
  for (let x = 18; x <= 22; x++) map[8][x] = 2;
  map[8][20] = 3;
  
  // 第二组
  for (let x = 28; x <= 32; x++) map[10][x] = 2;
  
  // 阶梯上升
  for (let i = 0; i < 5; i++) {
    for (let j = 0; j <= i; j++) {
      if (12 - j >= 0) map[12 - j][40 + i] = 2;
    }
  }
  
  // 高处平台
  for (let x = 48; x <= 53; x++) map[6][x] = 2;
  map[6][50] = 3;
  
  // 中间平台
  for (let x = 58; x <= 63; x++) map[10][x] = 2;
  map[10][60] = 3;
  
  // 下降阶梯
  for (let i = 0; i < 5; i++) {
    for (let j = 0; j <= i; j++) {
      if (12 - j >= 0) map[12 - j][70 + i] = 2;
    }
  }
  
  // 最后平台组
  for (let x = 85; x <= 90; x++) map[10][x] = 2;
  map[10][87] = 3;
  
  for (let x = 95; x <= 100; x++) map[8][x] = 2;
  
  // 旗杆
  for (let y = 5; y <= 12; y++) map[y][115] = 5;
  
  return map;
}

// 生成关卡3地图
function generateLevel3() {
  const map = [];
  const height = 15;
  const width = 100;
  
  for (let y = 0; y < height; y++) {
    map[y] = [];
    for (let x = 0; x < width; x++) {
      if (y >= 13) {
        map[y][x] = 1;
      } else {
        map[y][x] = 0;
      }
    }
  }
  
  // 天空城堡 - 分散的平台
  // 起始平台
  for (let x = 5; x <= 12; x++) map[10][x] = 2;
  map[10][8] = 3;
  
  // 浮空平台
  for (let x = 16; x <= 20; x++) map[8][x] = 6;
  for (let x = 24; x <= 28; x++) map[10][x] = 6;
  
  // 高台
  for (let x = 32; x <= 40; x++) map[6][x] = 2;
  map[6][36] = 3;
  
  // 中间平台
  for (let x = 44; x <= 48; x++) map[10][x] = 6;
  for (let x = 52; x <= 58; x++) map[8][x] = 2;
  map[8][55] = 3;
  
  // 上升阶梯
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j <= i; j++) {
      map[12 - j][62 + i] = 2;
    }
  }
  
  // 高空平台
  for (let x = 70; x <= 78; x++) map[6][x] = 6;
  map[6][74] = 3;
  
  // 下降
  for (let x = 82; x <= 88; x++) map[10][x] = 2;
  
  // 旗杆
  for (let y = 5; y <= 12; y++) map[y][95] = 5;
  
  return map;
}
