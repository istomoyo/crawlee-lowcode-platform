// 重置数据库并创建初始数据的脚本
// 运行方式：node reset-and-seed.js

const mysql = require('mysql2/promise');

async function resetDatabase() {
  let connection;

  try {
    // 连接数据库
    connection = await mysql.createConnection({
      host: 'localhost',
      user: 'root',
      password: '',
      database: 'crawlee_lowcode',
    });

    console.log('Connected to database');

    // 禁用外键检查
    await connection.execute('SET FOREIGN_KEY_CHECKS = 0');
    console.log('Disabled foreign key checks');

    // 删除表（按依赖关系倒序）
    const tables = ['system_log', 'system_setting', 'execution', 'task', 'user'];
    for (const table of tables) {
      try {
        await connection.execute(`DROP TABLE IF EXISTS \`${table}\``);
        console.log(`Dropped table: ${table}`);
      } catch (error) {
        console.log(`Table ${table} does not exist or already dropped`);
      }
    }

    // 重新启用外键检查
    await connection.execute('SET FOREIGN_KEY_CHECKS = 1');
    console.log('Re-enabled foreign key checks');

    console.log('Database reset complete!');

    // 创建一个默认管理员用户
    console.log('Creating default admin user...');

    // 注意：这里我们只是清理了数据库，TypeORM会在应用启动时重新创建表结构
    // 如果你想在这里创建初始数据，需要等待TypeORM创建表后

    console.log('Please restart the application. TypeORM will recreate all tables.');

  } catch (error) {
    console.error('Error resetting database:', error);
  } finally {
    if (connection) {
      await connection.end();
      console.log('Database connection closed');
    }
  }
}

// 只有直接运行此脚本时才执行
if (require.main === module) {
  resetDatabase();
}

module.exports = { resetDatabase };
