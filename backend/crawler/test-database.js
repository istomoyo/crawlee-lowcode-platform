const mysql = require('mysql2/promise');

async function testDatabase() {
  let connection;

  try {
    // 创建数据库连接
    connection = await mysql.createConnection({
      host: 'localhost',
      user: 'root',
      password: '',
      database: 'crawlee_lowcode'
    });

    console.log('✅ 数据库连接成功');

    // 检查表是否存在
    const [tables] = await connection.execute('SHOW TABLES');
    console.log('📋 数据库中的表:', tables.map(row => Object.values(row)[0]));

    // 检查是否有system_logs表
    const hasSystemLogs = tables.some(table =>
      Object.values(table)[0] === 'system_logs'
    );

    if (hasSystemLogs) {
      console.log('✅ system_logs表存在');

      // 检查表中的数据
      const [logs] = await connection.execute('SELECT COUNT(*) as count FROM system_logs');
      console.log(`📊 system_logs表中有 ${logs[0].count} 条记录`);

      // 显示最近5条日志
      const [recentLogs] = await connection.execute(
        'SELECT * FROM system_logs ORDER BY createdAt DESC LIMIT 5'
      );
      console.log('🗒️  最近5条日志:');
      recentLogs.forEach((log, index) => {
        console.log(`  ${index + 1}. [${log.level}] ${log.module}: ${log.message}`);
      });
    } else {
      console.log('❌ system_logs表不存在');
    }

    // 检查是否有system_settings表
    const hasSystemSettings = tables.some(table =>
      Object.values(table)[0] === 'system_settings'
    );

    if (hasSystemSettings) {
      console.log('✅ system_settings表存在');

      // 检查表中的数据
      const [settings] = await connection.execute('SELECT COUNT(*) as count FROM system_settings');
      console.log(`⚙️  system_settings表中有 ${settings[0].count} 条记录`);

      // 显示所有设置
      const [allSettings] = await connection.execute('SELECT * FROM system_settings');
      console.log('🔧 系统设置:');
      allSettings.forEach((setting, index) => {
        console.log(`  ${index + 1}. ${setting.key}: ${setting.value.substring(0, 100)}...`);
      });
    } else {
      console.log('❌ system_settings表不存在');
    }

  } catch (error) {
    console.error('❌ 数据库测试失败:', error.message);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

testDatabase();
