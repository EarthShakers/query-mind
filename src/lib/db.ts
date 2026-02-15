import Database from 'better-sqlite3';

const g = globalThis as unknown as { _db: Database.Database };
if (!g._db) {
  const db = new Database(':memory:');
  db.exec(`
    -- 部门表
    CREATE TABLE departments (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      manager_id INTEGER,
      budget INTEGER,
      location TEXT
    );
    INSERT INTO departments (id, name, manager_id, budget, location) VALUES
      (1, '工程部', 1, 500000, '北京'),
      (2, '产品部', 5, 300000, '北京'),
      (3, '市场部', 8, 400000, '上海'),
      (4, '销售部', 12, 350000, '广州'),
      (5, '人事部', 16, 200000, '北京'),
      (6, '财务部', 18, 250000, '上海');

    -- 员工表
    CREATE TABLE employees (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      department_id INTEGER REFERENCES departments(id),
      title TEXT,
      salary INTEGER,
      hire_date TEXT,
      gender TEXT
    );
    INSERT INTO employees (id, name, department_id, title, salary, hire_date, gender) VALUES
      (1,  '张三',  1, '技术总监',   35000, '2019-03-15', '男'),
      (2,  '李四',  1, '高级工程师', 28000, '2020-06-01', '男'),
      (3,  '王五',  1, '工程师',     22000, '2021-09-10', '男'),
      (4,  '刘芳',  1, '工程师',     23000, '2021-11-20', '女'),
      (5,  '陈明',  2, '产品总监',   32000, '2019-07-01', '男'),
      (6,  '赵丽',  2, '产品经理',   26000, '2020-04-15', '女'),
      (7,  '孙伟',  2, '产品经理',   24000, '2021-01-10', '男'),
      (8,  '周杰',  3, '市场总监',   33000, '2018-12-01', '男'),
      (9,  '吴敏',  3, '市场经理',   25000, '2020-08-20', '女'),
      (10, '郑强',  3, '市场专员',   18000, '2022-03-01', '男'),
      (11, '冯婷',  3, '市场专员',   17000, '2022-06-15', '女'),
      (12, '何涛',  4, '销售总监',   34000, '2019-01-10', '男'),
      (13, '林佳',  4, '销售经理',   27000, '2020-05-01', '女'),
      (14, '黄磊',  4, '销售代表',   19000, '2021-07-20', '男'),
      (15, '许静',  4, '销售代表',   18500, '2022-01-15', '女'),
      (16, '韩梅',  5, '人事总监',   30000, '2019-04-01', '女'),
      (17, '杨帆',  5, '人事专员',   16000, '2022-09-01', '男'),
      (18, '宋洁',  6, '财务总监',   31000, '2019-06-15', '女'),
      (19, '唐亮',  6, '会计',       20000, '2021-03-10', '男'),
      (20, '曹颖',  6, '会计',       19500, '2021-08-20', '女');

    -- 产品表
    CREATE TABLE products (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT,
      unit_price INTEGER
    );
    INSERT INTO products (id, name, category, unit_price) VALUES
      (1, '智能手表',   '电子产品', 1299),
      (2, '无线耳机',   '电子产品', 599),
      (3, '办公椅',     '办公用品', 899),
      (4, '机械键盘',   '电子产品', 499),
      (5, '显示器支架', '办公用品', 299);

    -- 销售记录表
    CREATE TABLE sales (
      id INTEGER PRIMARY KEY,
      product_id INTEGER REFERENCES products(id),
      employee_id INTEGER REFERENCES employees(id),
      quantity INTEGER,
      amount INTEGER,
      sale_date TEXT,
      region TEXT
    );
    INSERT INTO sales (product_id, employee_id, quantity, amount, sale_date, region) VALUES
      (1, 12, 5,  6495,  '2024-01-08', '华南'),
      (2, 13, 10, 5990,  '2024-01-12', '华东'),
      (3, 14, 3,  2697,  '2024-01-20', '华南'),
      (1, 15, 8,  10392, '2024-02-05', '华东'),
      (4, 12, 15, 7485,  '2024-02-14', '华南'),
      (2, 13, 20, 11980, '2024-02-28', '华北'),
      (5, 14, 12, 3588,  '2024-03-03', '华南'),
      (1, 15, 6,  7794,  '2024-03-15', '华东'),
      (3, 12, 8,  7192,  '2024-03-22', '华北'),
      (2, 14, 18, 10782, '2024-04-01', '华南'),
      (4, 13, 25, 12475, '2024-04-10', '华东'),
      (1, 12, 10, 12990, '2024-04-18', '华北'),
      (5, 15, 20, 5980,  '2024-05-02', '华东'),
      (3, 13, 6,  5394,  '2024-05-15', '华南'),
      (2, 12, 30, 17970, '2024-05-25', '华北'),
      (1, 14, 12, 15588, '2024-06-05', '华东'),
      (4, 15, 20, 9980,  '2024-06-12', '华南'),
      (2, 13, 15, 8985,  '2024-06-20', '华北'),
      (3, 12, 10, 8990,  '2024-07-01', '华东'),
      (1, 13, 7,  9093,  '2024-07-15', '华南'),
      (5, 14, 15, 4485,  '2024-07-22', '华北'),
      (4, 12, 30, 14970, '2024-08-05', '华东'),
      (2, 15, 25, 14975, '2024-08-18', '华南'),
      (1, 14, 9,  11691, '2024-08-28', '华北'),
      (3, 13, 5,  4495,  '2024-09-10', '华东'),
      (2, 12, 22, 13178, '2024-09-20', '华南'),
      (4, 15, 18, 8982,  '2024-10-05', '华北'),
      (1, 13, 15, 19485, '2024-10-18', '华东'),
      (5, 12, 25, 7475,  '2024-11-02', '华南'),
      (2, 14, 28, 16772, '2024-11-15', '华北'),
      (1, 15, 11, 14289, '2024-12-01', '华东'),
      (3, 12, 9,  8091,  '2024-12-12', '华南'),
      (4, 13, 22, 10978, '2024-12-20', '华北');

    -- 成本支出表
    CREATE TABLE expenses (
      id INTEGER PRIMARY KEY,
      department_id INTEGER REFERENCES departments(id),
      category TEXT,
      amount INTEGER,
      month TEXT,
      description TEXT
    );
    INSERT INTO expenses (department_id, category, amount, month, description) VALUES
      (1, '人力成本',   108000, '2024-01', '1月工资'),
      (1, '设备采购',   25000,  '2024-01', '开发机采购'),
      (1, '云服务',     15000,  '2024-01', '服务器费用'),
      (2, '人力成本',   82000,  '2024-01', '1月工资'),
      (2, '软件订阅',   8000,   '2024-01', '设计工具'),
      (3, '人力成本',   93000,  '2024-01', '1月工资'),
      (3, '广告投放',   50000,  '2024-01', '线上广告'),
      (3, '活动费用',   20000,  '2024-01', '展会参展'),
      (4, '人力成本',   98500,  '2024-01', '1月工资'),
      (4, '差旅费',     12000,  '2024-01', '客户拜访'),
      (5, '人力成本',   46000,  '2024-01', '1月工资'),
      (6, '人力成本',   70500,  '2024-01', '1月工资'),
      (1, '人力成本',   108000, '2024-02', '2月工资'),
      (1, '培训费用',   10000,  '2024-02', '技术培训'),
      (2, '人力成本',   82000,  '2024-02', '2月工资'),
      (3, '人力成本',   93000,  '2024-02', '2月工资'),
      (3, '广告投放',   65000,  '2024-02', '春节营销'),
      (4, '人力成本',   98500,  '2024-02', '2月工资'),
      (4, '差旅费',     18000,  '2024-02', '客户拜访'),
      (5, '人力成本',   46000,  '2024-02', '2月工资'),
      (6, '人力成本',   70500,  '2024-02', '2月工资'),
      (1, '人力成本',   108000, '2024-03', '3月工资'),
      (1, '云服务',     18000,  '2024-03', '扩容'),
      (2, '人力成本',   82000,  '2024-03', '3月工资'),
      (3, '人力成本',   93000,  '2024-03', '3月工资'),
      (3, '广告投放',   45000,  '2024-03', '线上广告'),
      (4, '人力成本',   98500,  '2024-03', '3月工资'),
      (5, '人力成本',   46000,  '2024-03', '3月工资'),
      (5, '培训费用',   5000,   '2024-03', '新员工培训'),
      (6, '人力成本',   70500,  '2024-03', '3月工资');
  `);
  g._db = db;
}

export const db = g._db;

export function query(sql: string): Record<string, unknown>[] {
  const normalized = sql.trim().toLowerCase();

  // Defense-in-depth: only allow SELECT statements
  if (!normalized.startsWith("select")) {
    throw new Error("Only SELECT queries are allowed.");
  }

  // Block semicolons to prevent statement chaining
  if (sql.includes(";")) {
    throw new Error("Multiple statements are not allowed.");
  }

  return db.prepare(sql).all() as Record<string, unknown>[];
}

export function getSchema(): string {
  return `Table: departments (id INTEGER PK, name TEXT, manager_id INTEGER FK->employees, budget INTEGER, location TEXT)
Table: employees (id INTEGER PK, name TEXT, department_id INTEGER FK->departments, title TEXT, salary INTEGER, hire_date TEXT, gender TEXT)
Table: products (id INTEGER PK, name TEXT, category TEXT, unit_price INTEGER)
Table: sales (id INTEGER PK, product_id INTEGER FK->products, employee_id INTEGER FK->employees, quantity INTEGER, amount INTEGER, sale_date TEXT, region TEXT)
Table: expenses (id INTEGER PK, department_id INTEGER FK->departments, category TEXT, amount INTEGER, month TEXT, description TEXT)`;
}
