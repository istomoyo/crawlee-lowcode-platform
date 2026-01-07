const mysql = require('mysql2/promise');

async function initDatabase() {
  let connection;

  try {
    console.log('🔄 正在检查数据库连接...');

    // 创建数据库连接（不指定数据库）
    connection = await mysql.createConnection({
      host: 'localhost',
      user: 'root',
      password: '',
    });

    console.log('✅ 数据库连接成功');

    // 创建数据库（如果不存在）
    console.log('📦 检查数据库是否存在...');
    await connection.execute('CREATE DATABASE IF NOT EXISTS crawlee_lowcode');
    console.log('✅ 数据库创建/确认完成');

    // 切换到数据库
    await connection.execute('USE crawlee_lowcode');
    console.log('🔄 已切换到 crawlee_lowcode 数据库');

    // 检查表是否存在
    console.log('📋 检查数据表...');
    const [tables] = await connection.execute('SHOW TABLES');
    const tableNames = tables.map(row => Object.values(row)[0]);

    console.log('📊 当前存在的表:', tableNames);

    // 检查必需的表
    const requiredTables = [
      'user', 'task', 'execution', 'result',
      'system_logs', 'system_settings'
    ];

    const missingTables = requiredTables.filter(table => !tableNames.includes(table));

    if (missingTables.length > 0) {
      console.log('⚠️  缺少以下表:', missingTables);
      console.log('💡 请运行后端服务器，TypeORM会自动创建这些表');
      console.log('   运行命令: npm run start:dev 或 node dist/main.js');
    } else {
      console.log('✅ 所有必需的表都存在');

      // 检查表中的数据
      console.log('\n📊 检查表中的数据:');

      // 检查用户表
      const [users] = await connection.execute('SELECT COUNT(*) as count FROM user');
      console.log(`👤 用户表: ${users[0].count} 条记录`);

      // 检查任务表
      const [tasks] = await connection.execute('SELECT COUNT(*) as count FROM task');
      console.log(`📋 任务表: ${tasks[0].count} 条记录`);

      // 检查执行表
      const [executions] = await connection.execute('SELECT COUNT(*) as count FROM execution');
      console.log(`⚙️  执行表: ${executions[0].count} 条记录`);

      // 检查系统日志表
      const [logs] = await connection.execute('SELECT COUNT(*) as count FROM system_logs');
      console.log(`📝 系统日志表: ${logs[0].count} 条记录`);

      // 检查系统设置表
      const [settings] = await connection.execute('SELECT COUNT(*) as count FROM system_settings');
      console.log(`⚙️  系统设置表: ${settings[0].count} 条记录`);

      // 显示系统设置内容
      if (settings[0].count > 0) {
        console.log('\n🔧 系统设置内容:');
        const [allSettings] = await connection.execute('SELECT * FROM system_settings');
        allSettings.forEach(setting => {
          console.log(`  ${setting.key}: ${setting.value.substring(0, 100)}...`);
        });
      }

      // 显示最近的系统日志
      if (logs[0].count > 0) {
        console.log('\n📝 最近的系统日志:');
        const [recentLogs] = await connection.execute(
          'SELECT * FROM system_logs ORDER BY createdAt DESC LIMIT 3'
        );
        recentLogs.forEach((log, index) => {
          console.log(`  ${index + 1}. [${log.level.toUpperCase()}] ${log.module}: ${log.message}`);
        });
      }

      console.log('\n🎉 数据库检查完成！数据正在正常存储。');
      console.log('💡 如果前端仍显示模拟数据，请检查：');
      console.log('   1. 后端服务器是否正在运行');
      console.log('   2. API请求是否正确发送');
      console.log('   3. 浏览器控制台是否有错误');
    }

    // 移除任务表的唯一约束（允许任务名重复）
    if (tableNames.includes('task')) {
      console.log('🔧 检查并移除任务表的唯一约束...');

      try {
        // 检查是否已有唯一约束
        const [constraints] = await connection.execute(`
          SELECT CONSTRAINT_NAME
          FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
          WHERE TABLE_NAME = 'task'
            AND CONSTRAINT_TYPE = 'UNIQUE'
            AND CONSTRAINT_NAME = 'UK_task_name_url_user'
        `);

        if (constraints.length > 0) {
          console.log('🔧 移除唯一约束...');
          await connection.execute(`
            ALTER TABLE task DROP CONSTRAINT UK_task_name_url_user
          `);
          console.log('✅ 唯一约束已移除');
        } else {
          console.log('✅ 唯一约束不存在，无需移除');
        }
      } catch (constraintError) {
        console.log('⚠️ 唯一约束处理:', constraintError.message);
      }
    }

  } catch (error) {
    console.error('❌ 数据库初始化失败:', error.message);
    console.log('\n🔧 故障排除步骤:');
    console.log('1. 确保MySQL服务正在运行');
    console.log('2. 检查数据库连接配置');
    console.log('3. 确认用户root有足够权限');
    console.log('4. 检查防火墙设置');
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.includes('--clean-duplicates')) {
    // 专门清理重复数据的模式
    cleanDuplicates();
  } else {
    initDatabase();
  }
}

async function cleanDuplicates() {
  let connection;

  try {
    console.log('🧹 开始清理重复任务数据...');

    // 创建数据库连接
    connection = await mysql.createConnection({
      host: 'localhost',
      user: 'root',
      password: '',
      database: 'crawlee_lowcode'
    });

    console.log('✅ 数据库连接成功');

    // 删除重复的任务数据（保留创建时间最早的）
    const [deleteResult] = await connection.execute(`
      DELETE t1 FROM task t1
      INNER JOIN task t2
      WHERE t1.id > t2.id
        AND t1.name = t2.name
        AND t1.url = t2.url
        AND t1.userId = t2.userId
    `);

    console.log(`✅ 已删除 ${deleteResult.affectedRows} 条重复任务数据`);

    // 检查是否还有重复数据
    const [duplicates] = await connection.execute(`
      SELECT name, url, userId, COUNT(*) as count
      FROM task
      GROUP BY name, url, userId
      HAVING COUNT(*) > 1
    `);

    if (duplicates.length > 0) {
      console.log('⚠️ 仍有重复数据:', duplicates);
    } else {
      console.log('🎉 重复数据清理完成');
    }

  } catch (error) {
    console.error('❌ 清理失败:', error.message);
  } finally {
    if (connection) {
      await connection.end();
      console.log('🔌 数据库连接已关闭');
    }
  }
}

module.exports = { initDatabase };
