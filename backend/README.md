## 🟦 1. User 用户实体（必须）

### 功能：

- ✔ 登录
- ✔ 注册
- ✔ 权限（管理员/普通用户）
- ✔ 存 token

### 字段设计：
```
id            // 用户ID
username      // 用户名
password      // 密码（加密）
role          // 角色：admin | user
createdAt
```
## 🟩 2. Task 爬虫任务实体（必须）

每创建一个任务，这里存：

- ✔ 任务名
- ✔ 要爬取的 URL
- ✔ 爬虫脚本（逻辑）
- ✔ 状态（等待、执行中、完成、失败）
- ✔ 所属用户

### 字段设计：
```
id
name          // 任务名字
url           // 爬取目标
config        // 配置(JSON) 如 headers、代理参数
script        // 用户自定义爬虫逻辑（低代码的核心）
status        // pending | running | success | failed
userId        // 创建者
createdAt
updatedAt
```
## 🟥 3. Execution 执行记录实体（推荐）

每次任务执行会生成一条记录：

- ✔ 哪个任务
- ✔ 执行开始时间
- ✔ 执行结束时间
- ✔ 是否成功
- ✔ 抓取的条数

### 字段设计：
```
id
taskId
startTime
endTime
status        // running | success | failed
log           // 错误信息、执行日志
```
## 🟨 4. Result 爬取结果实体（必须）

存爬虫抓到的数据（适合 JSON 存储）：
```
id
taskId
data          // JSON 格式的数据
createdAt
```