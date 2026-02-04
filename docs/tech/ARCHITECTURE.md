# httpYac 架构文档

## 1. 项目概述

**httpYac (Yet Another HTTP Client)** 是一个功能强大的 CLI 和 API 库，用于执行和测试多种协议的请求。

### 支持的协议
- HTTP/HTTPS、REST、GraphQL
- WebSocket、gRPC、SOAP
- MQTT、RabbitMQ (AMQP)、EventSource

### 核心特点
- 多协议支持，统一执行模型
- 丰富的身份认证（Basic、Digest、AWS、OAuth2、Client Certificates 等）
- 内置 JavaScript 脚本引擎
- 完整的测试和断言框架
- 灵活的环境和变量管理
- 高度可扩展的插件系统

### 技术栈
- Node.js 18+, TypeScript 5.6
- got (HTTP 客户端)
- commander (CLI)
- hookpoint (事件系统)

---

## 2. 目录结构

```
/src
├── cli/                          # CLI 命令行接口
│   ├── send/                     # send 命令实现
│   │   ├── send.ts              # 核心发送逻辑
│   │   ├── options.ts           # CLI 选项定义
│   │   ├── jsonOutput.ts        # JSON 输出格式
│   │   ├── junitUtils.ts        # JUnit XML 输出
│   │   └── plugin/              # CLI 插件配置
│   ├── oauth2/                   # OAuth2 命令
│   └── cli.ts                   # CLI 程序入口
│
├── io/                           # I/O 和提供者接口
│   ├── logger.ts                # 日志系统
│   ├── httpClientProvider.ts    # HTTP 客户端提供者
│   ├── javascriptProvider.ts    # JavaScript 执行环境
│   ├── fileProvider.ts          # 文件读取提供者
│   └── userInteractionProvider.ts # 用户交互
│
├── models/                       # 数据模型和接口定义
│   ├── httpFile.ts              # HTTP 文件接口
│   ├── httpRegion.ts            # HTTP 请求区域接口
│   ├── httpRequest.ts           # HTTP 请求数据结构
│   ├── httpResponse.ts          # HTTP 响应数据结构
│   ├── processorContext.ts      # 执行上下文
│   ├── hooks.ts                 # 事件钩子定义
│   └── httpHooksApi.ts          # 公开 API 接口
│
├── plugins/                      # 插件系统
│   ├── core/                    # 核心插件
│   │   ├── parse/               # 解析器钩子
│   │   ├── execute/             # 执行拦截器
│   │   ├── request/             # 请求处理
│   │   ├── response/            # 响应处理
│   │   ├── replacer/            # 变量替换
│   │   └── environments/        # 环境管理
│   ├── http/                    # HTTP 协议插件
│   ├── javascript/              # JavaScript 执行插件
│   ├── websocket/               # WebSocket 插件
│   ├── grpc/                    # gRPC 插件
│   ├── graphql/                 # GraphQL 插件
│   ├── mqtt/                    # MQTT 插件
│   ├── amqp/                    # RabbitMQ/AMQP 插件
│   ├── eventsource/             # EventSource 插件
│   ├── assert/                  # 测试断言插件
│   ├── oauth2/                  # OAuth2 插件
│   └── dotenv/                  # .env 文件支持
│
├── store/                        # 数据存储和解析
│   ├── httpFile.ts              # HttpFile 实现
│   ├── httpRegion.ts            # HttpRegion 实现
│   ├── pluginStore.ts           # 插件注册表
│   ├── userSessionStore.ts      # 用户会话存储
│   └── parser/                  # HTTP 文件解析器
│
├── utils/                        # 工具函数库
│
├── httpYacApi.ts               # 主 API 入口
├── registerPlugins.ts          # 插件全局注册
└── index.ts                    # 模块导出入口
```

---

## 3. 核心模块架构

### 3.1 数据模型层

```
HttpFile (*.http 文件)
  └─ HttpRegion[] (请求区域)
      ├─ HttpSymbol (代码位置)
      ├─ Request (请求配置)
      ├─ HttpResponse (响应结果)
      ├─ TestResult[] (测试结果)
      └─ Hook (事件系统)

ProcessorContext (执行上下文)
  ├─ HttpRegion
  ├─ Variables (变量字典)
  ├─ EnvironmentConfig
  ├─ RequestClient
  └─ Hooks (请求/响应处理)
```

### 3.2 关键接口

```typescript
// HTTP 文件
interface HttpFile {
  fileName: PathLike;
  httpRegions: Array<HttpRegion>;
  globalHttpRegions: Array<HttpRegion>;
  hooks: HttpFileHooks;
}

// 请求区域
interface HttpRegion {
  id: string;
  request?: Request;
  response?: HttpResponse;
  metaData: Record<string, any>;
  testResults?: Array<TestResult>;
  hooks: RequestClientHooks & { execute: ExecuteHook };
  execute(context: ProcessorContext): Promise<boolean>;
}

// 执行上下文
interface ProcessorContext {
  httpFile: HttpFile;
  httpRegion: HttpRegion;
  variables: Variables;
  request?: Request;
  requestClient?: RequestClient;
  hooks: RequestClientHooks;
}
```

### 3.3 Hook 系统

所有功能都通过 Hook 系统实现，基于 `hookpoint` 库的事件驱动架构：

| Hook 名称 | 类型 | 作用 |
|---------|------|------|
| `parse` | LastOutHook | 解析 HTTP 文件内容 |
| `parseMetaData` | LastOutHook | 解析元数据标签 |
| `replaceVariable` | WaterfallHook | 变量替换 |
| `provideVariables` | SeriesHook | 提供环境变量 |
| `execute` | SeriesHook | 执行 HTTP 请求 |
| `onRequest` | SeriesHook | 请求前处理 |
| `onResponse` | SeriesHook | 响应后处理 |
| `responseLogging` | SeriesHook | 响应日志记录 |

---

## 4. 数据流

### 4.1 完整执行流程

```
CLI Entry (httpyac send file.http)
        ↓
initIOProvider() - 初始化 IO 提供者
        ↓
HttpFileStore.getOrCreate() - 读取和解析 HTTP 文件
        ↓
parseHttpFile()
   ├─ for each line:
   │   └─ trigger parse hook
   │       ├─ parseMetaData (@name, @timeout 等)
   │       ├─ parseVariable (@key = value)
   │       ├─ parseHttpRequestLine (GET /path HTTP/1.1)
   │       └─ parseRequestBody
   └─ trigger parseEndRegion hook
        ↓
send(HttpFileSendContext)
   ├─ getVariables() - 获取所有可用变量
   │   └─ trigger provideVariables hook
   ├─ executeGlobalScripts() - 执行全局脚本
   └─ for each HttpRegion:
        └─ httpRegion.execute(ProcessorContext)
             ↓
        trigger execute hook (拦截器链):
        ├─ CreateRequestInterceptor - 创建 Request
        │   └─ trigger onRequest hook
        │       ├─ attachDefaultHeaders
        │       ├─ requestVariableReplacer
        │       └─ transformRequestBody
        ├─ RequestClient.send() - 发送请求
        ├─ trigger onResponse hook
        │   ├─ jsonResponseInterceptor
        │   └─ setLastResponseInVariables
        └─ TestResultInterceptor - 运行测试
             └─ trigger provideAssertValue hook
```

### 4.2 变量替换流程

```
{{variable}} 表达式
     ↓
replaceVariables(value, type, context)
     ↓
trigger replaceVariable hook (WaterfallHook)
├─ javascript hook (JS 表达式)
├─ aws hook (AWS 签名)
├─ basicAuth hook (Base64)
├─ file hook (文件内容)
├─ restClientDynamic hook (动态值)
└─ 最后在 context.variables 中查找
     ↓
替换后的最终值
```

### 4.3 变量作用域

```
全局作用域 ($global)
     ↓
环境作用域 (environments 配置)
     ↓
文件作用域 (httpFile 级别)
     ↓
区域作用域 (httpRegion 级别)
     ↓
执行临时作用域 (ProcessorContext.variables)
```

---

## 5. 插件系统

### 5.1 已注册插件

| 插件 | 功能 |
|-----|------|
| core | 基础 HTTP 解析和执行 |
| http | HTTP 协议和身份验证 |
| javascript | JavaScript 脚本执行 |
| assert | 测试断言框架 |
| websocket | WebSocket 支持 |
| grpc | gRPC 协议支持 |
| graphql | GraphQL 支持 |
| mqtt | MQTT 协议支持 |
| amqp | RabbitMQ AMQP 支持 |
| eventsource | 服务器发送事件 |
| oauth2 | OAuth2 身份验证 |
| dotenv | .env 文件支持 |
| intellij | IntelliJ 兼容性 |

### 5.2 插件注册模式

```typescript
export function registerXxxPlugin(api: HttpyacHooksApi) {
  // 添加解析器
  api.hooks.parse.addHook('pluginName', parserFunction, {
    before: ['request']
  });

  // 添加请求处理
  api.hooks.onRequest.addHook('pluginName', requestHandler);

  // 添加变量替换
  api.hooks.replaceVariable.addHook('pluginName', variableReplacer);
}
```

---

## 6. 模块依赖关系

```
CLI Layer (cli/)
    ↓
┌───────────────────────────────────────┐
│ httpYacApi (核心 API)                  │
└───────────────────────────────────────┘
    ↓
┌───────────────────────────────────────┐
│ Store Layer (store/)                   │
│ - HttpFileStore (缓存)                 │
│ - parseHttpFile (解析)                 │
└───────────────────────────────────────┘
    ↓
┌───────────────────────────────────────┐
│ Plugin System (plugins/)               │
│ - 15+ 协议和功能插件                   │
└───────────────────────────────────────┘
    ↓
┌───────────────────────────────────────┐
│ Models Layer (models/)                 │
│ - 数据结构和 Hook 定义                 │
└───────────────────────────────────────┘
    ↓
┌───────────────────────────────────────┐
│ IO Layer (io/)                         │
│ - httpClientProvider                   │
│ - javascriptProvider                   │
│ - fileProvider                         │
└───────────────────────────────────────┘
```

---

## 7. 扩展点

### 7.1 自定义插件

```typescript
export function registerMyPlugin(api: HttpyacHooksApi) {
  // 请求前处理
  api.hooks.onRequest.addHook('myAuth', (request, context) => {
    request.headers['X-Custom-Auth'] = 'token';
  });

  // 变量替换
  api.hooks.replaceVariable.addHook('myVar', (value, type, context) => {
    if (value === 'myCustom') {
      return 'replaced-value';
    }
    return undefined;
  });

  // 响应处理
  api.hooks.onResponse.addHook('myProcessor', (response, context) => {
    response.meta = { customField: 'value' };
  });
}

// 注册到配置
const config: EnvironmentConfig = {
  configureHooks: registerMyPlugin
};
```

### 7.2 新协议支持

```typescript
// 实现 RequestClient
class MyProtocolClient extends AbstractRequestClient<MyNativeClient> {
  async connect(obj?: MyNativeClient): Promise<MyNativeClient> {
    return new MyNativeClient();
  }

  async send(body?: unknown): Promise<void> {
    const response = await this.nativeClient.execute();
    this.onMessage('message', toMyResponse(response));
  }

  disconnect(err?: Error): void { /* 清理 */ }
}

// 注册解析器
api.hooks.parse.addHook('myProtocol', parseMyProtocolLine);
```

### 7.3 自定义断言

```typescript
api.hooks.provideAssertValue.addHook('custom',
  (assertName, assertValue, response, context) => {
    if (assertName === 'customAssert') {
      return { actual: response.body, expected: assertValue };
    }
    return false;
  }
);
```

### 7.4 IO 提供者替换

```typescript
import { httpClientProvider } from 'httpyac/io';

// 替换 HTTP 客户端
httpClientProvider.createRequestClient = (request, context) => {
  return new MyCustomHttpClient(request, context);
};

// 替换文件提供者
fileProvider.readFile = async (filePath) => { /* 自定义 */ };
```

---

## 8. 架构特点

### 优势

1. **高度模块化** - 插件系统完全解耦
2. **灵活的 Hook 系统** - 支持优先级和链式处理
3. **渐进式加载** - 按需加载协议支持
4. **强大的脚本支持** - 内置 JavaScript 引擎
5. **完整的测试框架** - 内置断言系统
6. **完全可扩展** - 所有功能都可通过配置扩展

### 关键技术决策

1. **Hook 系统而非中间件** - 更灵活，支持优先级排序
2. **Generator 用于行解析** - 高效处理大文件
3. **多层变量作用域** - 支持全局、环境、文件、区域等
4. **延迟变量计算** - `:=` 语法支持延迟求值
5. **事件驱动响应处理** - RequestClient 使用事件系统

### Hook 类型

| 类型 | 行为 |
|------|------|
| SeriesHook | 所有处理器按顺序执行 |
| LastOutHook | 返回第一个有效值 |
| WaterfallHook | 值链式传递给每个处理器 |
