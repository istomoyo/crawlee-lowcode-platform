@echo off
REM 移除任务表唯一约束的批处理脚本
echo 正在移除任务表的唯一约束...

REM 使用 Node.js 执行
node -e "
const mysql = require('mysql2/promise');

async function removeConstraint() {
  let connection;
  try {
    connection = await mysql.createConnection({
      host: 'localhost',
      user: 'root',
      password: '',
      database: 'crawlee_lowcode'
    });

    console.log('连接数据库成功');

    // 检查约束是否存在
    const [constraints] = await connection.execute(\`
      SELECT CONSTRAINT_NAME
      FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
      WHERE TABLE_NAME = 'task'
        AND CONSTRAINT_TYPE = 'UNIQUE'
        AND CONSTRAINT_NAME = 'UK_task_name_url_user'
    \`);

    if (constraints.length > 0) {
      // 删除唯一约束
      await connection.execute(\`
        ALTER TABLE task DROP CONSTRAINT UK_task_name_url_user
      \`);
      console.log('唯一约束已移除');
    } else {
      console.log('唯一约束不存在，无需移除');
    }

  } catch (e) {
    console.error('错误:', e.message);
  } finally {
    if (connection) await connection.end();
  }
}

removeConstraint();
"

echo 处理完成！
pause
