# 飞书产品反馈适配层

这层适配器把 Cofound Investment Office 的产品反馈发件箱同步到一张**独立**的飞书多维表格“产品改进台账”。它不复用 BP 原件索引表，不创建表格，也不会猜测表格位置。

## 配置边界

在本机私有的 `feishu-internal-storage.json` 中显式加入：

```json
{
  "driveRootFolderToken": "<既有内部资料目录>",
  "baseToken": "<既有内部资料索引 Base>",
  "baseTableId": "<既有内部资料索引表>",
  "feedbackBaseToken": "<产品反馈 Base，可省略并回退到 baseToken>",
  "feedbackTableId": "<产品改进台账的准确 table id>",
  "storageScope": "enterprise_shared"
}
```

`feedbackTableId` 没有配置、配置无效或配置文件不可解析时，服务返回 `not_configured`，且不会调用飞书 CLI。正式环境应与文件索引一起指向企业共享目录中的 `Cofound 企业内部数据中枢`，不再使用个人云盘里的旧 Base。运行时复用用户态飞书认证，不保存或打印访问凭据。

## 产品改进台账字段

适配器在只读预检中要求下列字段名称和类型完全匹配。字段不完整时返回 `schema_mismatch`，不会尝试自动建表或改表。

| 字段           | 类型     | 所有者  | 说明                                                           |
| -------------- | -------- | ------- | -------------------------------------------------------------- |
| 协作键         | text     | Cofound | 同一反馈跨设备协作的稳定业务键                                 |
| 反馈编号       | text     | Cofound | 本机反馈编号                                                   |
| 最近发件箱 ID  | text     | Cofound | 幂等发送标识                                                   |
| 冻结内容指纹   | text     | Cofound | 用于检查冻结上报内容是否被替换                                 |
| 冻结上报内容   | text     | Cofound | 经过安全契约校验的结构化交接内容                               |
| 上报类型       | text     | Cofound | initial_submission / diagnosis_update / maintenance_update     |
| 应用版本       | text     | Cofound | 产生本次上报的应用版本                                         |
| 能力包版本     | text     | Cofound | 产生本次上报的 Codex 能力包版本                                |
| 上报序号       | number   | Cofound | 同一协作键下单调递增                                           |
| 上报轮次       | number   | Cofound | Codex 诊断轮次                                                 |
| 提交人         | text     | Cofound | 反馈者昵称                                                     |
| 问题标题       | text     | Cofound | 非技术问题标题                                                 |
| 问题描述       | text     | Cofound | 非技术问题描述                                                 |
| 期望结果       | text     | Cofound | 用户希望看到的结果                                             |
| 功能分类       | text     | Cofound | 产品功能分类                                                   |
| 影响程度       | text     | Cofound | minor / inconvenient / blocked                                 |
| 提交时间       | datetime | Cofound | 首次创建时间，后续更新不改变                                   |
| Codex 诊断摘要 | text     | Cofound | 诊断结论                                                       |
| 建议处理动作   | text     | Cofound | 建议动作列表                                                   |
| 诊断检查       | text     | Cofound | 经过的检查及结果                                               |
| 诊断风险       | text     | Cofound | 风险列表                                                       |
| 仍需补充信息   | text     | Cofound | 开放问题列表                                                   |
| 试行修复状态   | text     | Cofound | 本机试行修复结果                                               |
| 来源更新时间   | datetime | Cofound | 本次上报内容生成时间                                           |
| 处理状态       | text     | 维护端  | new / needs_info / duplicate / deferred / accepted / completed |
| 维护者回复     | text     | 维护端  | 给反馈者的非技术回复                                           |
| 处理人         | text     | 维护端  | 维护者昵称                                                     |
| 维护任务编号   | text     | 维护端  | accepted / completed 状态对应的维护任务                        |
| 处理更新时间   | datetime | 维护端  | 维护状态最近更新时间                                           |

所有写入飞书 datetime 字段的时间会明确转换为 `Asia/Shanghai` 的 `YYYY-MM-DD HH:mm:ss`；例如 `2026-08-24T16:30:00Z` 写为 `2026-08-25 00:30:00`。

## 数据流

### 本机反馈上报

`syncPendingFeedback(service, { feedbackId? })` 读取本机待发送发件箱，先按协作键精确查找远端记录，再创建或更新，并在写入后回读验证。

- 传 `feedbackId`：仅同步该反馈，供单条“重试同步”使用；
- 不传 `feedbackId`：批量处理维护端的待发送项；
- 同一 `<Base>:<协作键>` 在进程内串行；
- 同一发件箱 ID 与相同冻结内容会跳过；同一 ID 对应不同内容会 fail closed；
- `submittedAt` 必须保持不变；`sourceUpdatedAt` 随上报更新；
- 原始 CLI 错误只映射为安全错误码，运维日志只记录方向、编号、计数和状态，不记录正文、Base token 或冻结内容。

### 维护端收件箱

`refreshMaintenanceInbox(service)` 是维护端专用的全量分页读取。它只把 `initial_submission` 和 `diagnosis_update` 交给 `ingestRemote`；遇到 `maintenance_update` 会计为 ignored，避免维护回写重新进入维护收件箱。

### 同事端维护状态刷新

`refreshReporterMaintenanceUpdates(service)` 先从本机服务取得本机创建的 `originKey`，然后对每个键执行远端精确查询，只把匹配的 `maintenance_update` 交给 `applyRemoteMaintenanceUpdate`。

同事端路径**不会先读取整张表再过滤**，因此不会把其他同事的反馈下载到本机。

## 建议的路由接入

适配层本身不注册路由。上层可在完成认证和本机模式检查后接入三个很薄的入口：

- 单条发送或重试：调用 `syncPendingFeedback(..., { feedbackId })`；
- 维护端批量收件：调用 `refreshMaintenanceInbox(...)`；
- 同事端状态刷新：调用 `refreshReporterMaintenanceUpdates(...)`。

路由层不应接受 Base token、table id、任意 originKey 或冻结 payload；这些都由本机配置和本机反馈服务提供。真实表格在人工完成数据治理、字段核对和明确启用路由前不会被访问。
