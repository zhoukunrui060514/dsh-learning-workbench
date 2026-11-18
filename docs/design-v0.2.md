# 学习工作台 0.2 技术设计：来源设置、免填 ID 与升级兼容

状态：0.2.0 已按本设计实现，接口以 [docs/contracts.md](contracts.md) 为准；两者不一致时以契约和代码为准。
基线：0.1.1。日期：2026-11-13。第 2 节的表格描述的是设计时（0.1.1）的代码状态。

## 1. 目标与非目标

交付四视图的统一布局与学科筛选；用户选择或命名学科、添加手工考试时不填写内部 ID；在面板管理 StudyHub 库、本地 ICS、远程 ICS 和手动/定时刷新。升级保留 0.1.1 的快照、学科、映射、每日目标、手工考试、范围和去重确认。

不改学习算法、掌握度口径、ICS 分类算法；不写 StudyHub/日历；不做 OAuth、系统文件选择器、代理配置、任意动作转发、来源插件市场、历史仓库、提醒、agent 工具、财务或健康。设置页不是远程管理入口。本轮不提供学科删除/合并，也不提供自动同名映射。

## 2. 方案选择及当前代码证据

选择**学习领域内的唯一来源管理模块 + 现有 local_state + 原适配器工厂**。不重写 profile：它是用户配置，并可能同时由 DSH 管理器管理。也不让两个适配器各存一份覆盖配置：跨来源列表、配置移除、重复身份和整体恢复会出现两个所有者。只增加管理本轮两种适配器所需的生命周期入口，不建立通用配置平台。

| 当前实现（相对仓库根） | 已有能力 / 本轮必须补的缺口 |
|---|---|
| `src/core/workbench.mjs` register/run/snapshot/metric | 注册即设 interval 定时器；同步同 ID 共享 pending；注销只移除注册和定时器，保留 unavailable 快照；metric 仍收到这些旧记录。现有注销函数不等待同步，因此不能靠“注销后立即注册”热换来源。 |
| `src/core/local-modules.mjs` | 模块 state 单 key 持久化；invoke 同模块并发拒绝；卸载等待在途动作。适合管理配置，不需要另一张表。 |
| `src/host/index.mjs` | storageDomain 已是 v2，local_state 的 value 为 unknown；只有 snapshots/local_state 两表。config.modules 只在后端。 |
| `src/host/modules.mjs` | 递归发现、两遍挂载；先撤销全部动作并排空，再 close 来源，再清理模块。保留这一关闭顺序。 |
| `src/host/routes.mjs`、`access.mjs` | state/metric GET，action/sync/import POST；回环、Host/Origin、跨站和自定义请求头限制；动作失败统一422，需增加有限可识别错误。不是完整用户认证。 |
| `src/host/ports.mjs` | FilePort 只有 read；HttpPort 只有 GET；不提供文件写或 profile 修改。 |
| `sources/studyhub/module.mjs` | createSource 可复用；setup 直接注册；ID 为规范化绝对 libraryRoot 摘要；未暴露 intervalMs；check 仅检测 studyRuntime，不证明库可读。 |
| `sources/ics/module.mjs` | createIcsSource 可复用；setup 直接注册；ID 为原 config.id 和 location 的摘要；已有 intervalMs；rules、timeZone、subjectRef 需保留。 |
| `views/module.mjs`、`metrics/compute.mjs` | choices 保存全部本地选择；save-mapping/save-exam 要求用户给 ID；来源显式 subjectRef 优先于本地映射；current() 也读全部缓存，必须与指标同时修正。 |
| `views/client.mjs`、`src/ui/client.js` | 四视图已存在，外壳仅传 value/sources/refresh；目前无跨视图筛选状态、设置 DTO、结构化失败码。 |

继续固定 StudyHub 只读 action：library.context、course.list、course.get、course.focusProgress（course 用名称）；禁止 daily.plan.get。保留 v5 分片降级 warnings。

## 3. 后端配置所有权与持久模型

### 3.1 唯一注册者

新增 `src/domains/learning/source-settings/module.mjs`，id=`learning-source-settings`，拥有本轮 StudyHub/ICS 来源实例、注销句柄及设置动作。原 `studyhub`、`learning-ics` 模块仍保留工厂和模块 ID，但 setup 不再注册；设置管理者直接 import 工厂。host 挂载时通过明确的 `initialLearningSources` 参数传入原 `modules.studyhub` 和 `modules['learning-ics']` 的后端配置，不让客户端拿整个 modules。

其他插件的 registerSource 服务不变，其来源不可在本设置页编辑。重复 sourceId（例如两条 StudyHub 指向同一规范化根）在保存前拒绝，不能有两次注册或重复统计。StudyHub 可配置多库，不自动扫描磁盘。

### 3.2 初始继承与保存优先级

管理者读取自身 `state.get('settings')`：

- **不存在该 key**：以现有 profile 配置生成完整的有效列表，GET 标记 origin=`profile`、revision=0。启动及 GET 不写存储。
- **存在 key（即使 entries=[]）**：整个持久列表优先，profile 不再参与合并。新增、保存、启停、删除的第一次成功操作把完整列表一次 put，origin 变为 `workbench`。之后重启严格恢复此列表。
- 删除继承项也保存完整剩余列表，删除全部保存空数组；因此重启不会重新继承。禁用项保留 enabled=false，不等于删除。删除只删工作台配置，不删除库/文件/缓存。
- 不提供自动“还原 profile”。面板注明“已使用工作台设置，profile 后续修改不会自动导入”；需要的来源可手工新增。避免用户误触把已删私密订阅恢复。

后端私有对象（不是 GET DTO）：

```ts
type Settings = { schemaVersion:1; revision:number; entries:Entry[] };
type Schedule = {mode:'manual'} | {mode:'interval'; intervalMs:number};
type Entry = {
  entryId:string; // 继承项为 legacy:<原sourceId>；新增由后端生成 source_<UUID>
  kind:'studyhub'|'ics'; title:string; enabled:boolean; schedule:Schedule;
  adapter: StudyHubConfig | IcsConfig; // 保留原工厂需要的全部配置
};
// StudyHubConfig: libraryRoot、原有subjectMap
// IcsConfig: 原id、path或url、timeZone、原rules、原subjectRef等
```

继承项保持原工厂配置和 sourceId，不换摘要算法，不把 config.id 换成 entryId。新 ICS 的 adapter.id 由后端生成，一生不随显示标题变化。旧 intervalMs 原值保留，无值为 manual；StudyHub 原版未支持定时，初始 manual。UI 新设置建议选项：手动、15分钟、1小时、6小时、24小时；接口接受正安全整数 intervalMs（单位毫秒），编辑继承自定义间隔时原样显示为“自定义”，不静默改成默认值。切成 manual 时不向工厂传 intervalMs。

首次导入已有不合法配置：以固定 CONFIG_INVALID 标记该条、保留其后端原值；不注册该条，不影响其他来源；允许用户修正或删除。GET 不回显原始异常。不得把非法条目静默丢弃后保存。预检须按条处理，重复原身份显示冲突并要求删除/修正，不能自行挑一个。

### 3.3 配置身份与旧数据

entryId 是设置条目身份；sourceId 是已有来源数据身份，二者不同。

- 改 title、enabled、刷新间隔：sourceId 不变；旧缓存和映射可继续使用。
- 改 StudyHub libraryRoot、ICS path/url：沿工厂现有规则产生新 sourceId。旧快照保留 unavailable；以旧 sourceId 为键的映射、考试范围与去重对保留但不自动迁到新源。不按同名课程复制映射。
- 更换到曾经使用过的**同一身份**时可以重新使用该身份的原缓存/映射，显示最后成功时间，直到同步覆盖。确认文案明确这一点。不能承诺检测同一路径下被外部替换的库内容。
- ICS 改 timeZone/rules/subjectRef 会改变数据解释：0.2设置页不开放这些旧高级字段的修改，继承值保留；新增时填写 timeZone，之后只读。需要改这些字段可删除后新建条目（新的 adapter.id）。StudyHub subjectMap 同样只继承不编辑。避免同 ID 的旧快照被解释成新配置。
- 本地学科选择只改变工作台 choices，不改变适配器的 subjectMap/subjectRef。来源已有显式 subjectRef 时沿旧优先级，UI标记“来源已指定”，不显示一个实际不会生效的重新映射按钮。

## 4. 保存与同步的互斥和失败语义

### 4.1 必要的 core 增量

新增一个明确用于来源变更的入口；不实现队列、不等正在读取的源：

```ts
workbench.changeSource({
  previousId: string|null, // null为新增；存在时必须为当前注册源
  next: Source|null,      // null为注销；可同ID替换
  commit: () => Promise<void> // 管理者的一次 state.put
}): Promise<void>
```

禁用/删除未注册条目、编辑仍保持禁用的条目，只需序列化的 state.put，不注册新实例；编辑禁用条目仍须验证工厂/身份，不能制造重复配置。启用禁用条目视作新增。管理者通过动作互斥及列表 revision 校验保证自己的操作不能交错；core 负责与 timer、/sync、第三方 sync 交错的竞态。

changeSource 的实施顺序：

1. 同步检查 closed、旧实例存在性、新源 domain/kind/input/interval/重复 ID 等，检查 old/new ID 的 pending 和变更保留标记。有正在同步或变更即 BUSY，**不写配置、不注销旧实例**。
2. 在第一次 await 前为 old/new ID 保留变更标记；sync 对这些 ID 拒绝 BUSY。暂停旧 timer 的读取（保留原 timer，失败可直接解除暂停）；预备新 timer（回调在提交前不执行读取），timer 创建失败发生在持久化前。旧 source 留在 map，不改变可查询缓存。
3. await commit()。只写一个完整 settings 对象，不写快照；失败取消预备 timer，解除旧 timer 的暂停，解除保留，拒绝 STORAGE_FAILED。不得捕获失败后返回 saved=true。
4. 成功后以预验证的对象同步交换 map/注销旧源，启用新 timer，解除保留；这段无异步 IO。定时首次读取不早于本次提交后完整间隔；预备 timer 记录激活时间，首个满足该时间的 tick 才读取，因沿用 interval 节拍可晚不足一个间隔。不自动立即同步；成功时取消旧 timer。clear 停止函数必须遵守 ClockPort 无异常清理契约。
5. close 同样等待已经接收的 changeSource 完成后再清空 maps；沿模块卸载先排空 local actions 的规则，不能关闭 storage 后才完成 commit。

实现者可以用等价的小型 prepare/activate timer 实现此顺序，但不得先成功持久化再尝试可能失败的注册/创建资源。新增机制拦的是“读取完成回写已替换配置”和“配置保存后运行实例仍旧”两个真实竞态。timer 遇变更保留标记只跳过本次 tick，不排队、不写同步失败状态；手动 sync 返回409。

存储沿现有单key原子替换承诺：put resolve 才提交成功，明确未提交的失败保留旧配置和旧运行实例。后台配置GET报告当前已应用revision。若底层出现无法判断是否落盘的错误，不宣称原配置已回滚：保留旧运行实例、拒绝后续设置写入并标记 STORAGE_FAILED / reloadRequired=true，提示重新加载插件；重开从持久值恢复。这是无法确认写入结果时的明确停止点，不加补偿写或重试队列。HTTP响应丢失则不同：若put已resolve且完成切换，刷新GET就是新revision，旧revision再次保存409，不自动重试创建项。

### 4.2 检查不等于保存，不等于同步

保存做纯参数/配置校验与注册，不要求外部网络或 StudyHub 当前在线；可以保存离线来源。保存成功显示“设置已保存，尚未同步”，不能显示“连接成功”。首次注册不自动发请求。检查是用户明确点击，临时使用原工厂 read({}, null)，不注册、不写快照、不推进 cursor，只返回结果摘要；对 StudyHub 不能只用现有服务存在性 check 冒充库检查。检查也遵守模块动作互斥；未知 action 不接受。

同步按钮沿现有 sync（只读来源、replace）更新快照；失败旧快照保留。来源 read 在进行中时，编辑、禁用、删除均409 BUSY。用户在同步结束后重新点击，不自动重试。

### 4.3 当前统计的数据集合

core Snapshot 增加公开 `registered:boolean`（由内存注册状态计算，不持久化），用于区分保留缓存与有效源。学习指标和 views/module 的 current() **只取 registered=true 的学习来源**，包括 enabled 但 error 的源及其最后成功缓存；不取被禁用、被删、旧位置、未加载第三方来源的缓存。记录存在但来源报错时显示上次成功时间，不把失败当0。

GET state 仍可列出 unavailable 缓存作为诊断信息；默认来源设置列表只显示当前 entries，另以“保留缓存：N个，不参与统计”摘要提示，不增加恢复/清除功能。外壳四视图只展示有效来源的状态摘要，来源页可看保留缓存。指标既有 records 入参包含所有缓存的通用契约不改，学习指标以 sources 中 registered 集合筛选 records。

## 5. 设置接口（明确 DTO，不发送秘密）

沿用 GET metric 与 POST action；不新造 `/read-file`、`/fetch-url` 或 StudyHub action 转发。

GET `/learning-workbench/metric?id=learning-source-settings` 返回：

```ts
type SourceSettingsDTO = {
  revision:number; origin:'profile'|'workbench'; reloadRequired:boolean;
  entries: {
    entryId:string; sourceId:string|null; kind:'studyhub'|'ics';
    title:string; enabled:boolean; schedule:Schedule;
    location: {type:'library'|'file'; path:string}
            | {type:'url'; configured:boolean};
    timeZone?:string; // 新增ICS必填；旧配置未指定则省略，使用日历内时区
    advancedInherited:boolean; // rules/subjectMap/subjectRef只读保留，不返实际对象
    runtime:{status:'idle'|'syncing'|'ready'|'error'|'disabled'|'invalid';
      lastSuccessAt:string|null; lastAttemptAt:string|null; recordCount:number;
      warnings:{code:string;message:string}[]; error:{code:string;message:string}|null};
  }[];
  retainedCacheCount:number;
};
```

本地绝对路径不是订阅凭据，设置页可回显；远程URL不返回 host/path/query/userinfo，也不放入 title、warning、error、日志。configured 只表示存有链接，不表示已连接。已有URL编辑控件默认空，保留显示“已配置”；用户主动选择替换才输入新URL。前端提交新URL必然暂时接触它，提交后清空表单内存，不保存 localStorage、地址栏、console 或草稿；这不要求消除浏览器开发者工具中用户自己的请求体。

所有动作：POST `/learning-workbench/action?module=learning-source-settings&name=<name>`；JSON及64KiB限制、`x-learning-workbench:1`不变。

```ts
type LocationInput = {type:'library'|'file';path:string}
  | {type:'url';operation:'replace';value:string}
  | {type:'url';operation:'keep'};
type Draft = {
  kind:'studyhub'|'ics'; title:string; location:LocationInput;
  schedule:Schedule; timeZone?:string;
};
```

| name | JSON 输入 | 成功响应 / 行为 |
|---|---|---|
| source-save | `{revision, entryId?:string, draft:Draft}` | `{saved:true,revision,entryId,sourceId,identityChanged:boolean}`。无entryId新增，后端UUID；已有entryId必须存在且kind不可改变；已有enabled保留，新建enabled=true。更换location前前端确认缓存/映射分离。 |
| source-check | `{revision,entryId?:string,draft?:Draft}` | `{ok:boolean,code:string,recordCount?:number,warnings:PublicWarning[]}`。不带draft检查已存条目；有draft检查尚未保存输入。失败固定 CHECK_FAILED，不含原异常，不写配置和记录。 |
| source-set-enabled | `{revision,entryId,enabled:boolean}` | `{saved:true,revision,entryId}`；禁用保留条目与缓存，不参与统计，启用恢复原ID。 |
| source-delete | `{revision,entryId}` | `{saved:true,revision}`；删除后不再继承profile；不清理choices/快照。 |

location keep 仅允许编辑已有 url 条目（新建/从文件切url必须replace）；file/library必须本机绝对路径，StudyHub用现有 path.resolve；ICS文件保留已有字符串身份，新建可规范化但不能在首次继承时改写旧路径。URL只接受 http/https，继续走原HttpPort，无自定义方法/头/body/代理。ICS新建timeZone为有效IANA，建议默认Asia/Shanghai；StudyHub不接受timeZone输入。旧高级字段由后端保留，不接受客户端任意覆盖adapter。未识别输入字段拒绝，不能用它绕过固定工厂。

结构化错误新增至动作路由和客户端invoke（普通未知异常继续原422通用提示）：

| HTTP / code | 场景 | UI |
|---|---|---|
| 400 INVALID_INPUT | 类型/路径/间隔/URL等输入错误 | 显示固定字段提示，不回显URL值 |
| 404 NOT_FOUND | 编辑已删除条目/对象 | 刷新列表，保留非秘密编辑内容 |
| 409 BUSY | 同模块动作或目标来源在途同步/变更 | “同步/操作进行中，请结束后再保存” |
| 409 REVISION_CONFLICT | 页面旧revision | “设置已变化，请重新打开编辑”，不覆盖新值 |
| 409 DUPLICATE_SOURCE | 新工厂ID与另一条冲突 | “此来源已经接入” |
| 500 STORAGE_FAILED | 本地持久化失败 | “未能确认保存，请重新加载设置”，不显示已保存 |

错误形状 `{error:{code,message,field?:string}}`，仅针对登记的安全错误码构造；禁止任意Error.message透传。invoke抛携带code的错误，同时兼容旧 `{error:string}`。POST sync busy也用409，其他失败沿原502。GET设置无写副作用，返回Cache-Control:no-store。

安全边界保持回环/精确Host/Origin；本机进程本来就能调用插件接口，因此这是一项本机配置权限，不声称是DSH登录鉴权或可信代码沙箱。用户明确提供路径/订阅后，后台仅执行固定适配器读取与解析，返回规范化记录/摘要，不返回任意文件原文。新请求体含URL不记录；底层读取异常不得写日志或序列化cause。无新增对公网监听。

## 6. 免填内部 ID：学科、映射、考试

`learning-views` 继续唯一拥有 `choices`，原数组形状不迁移。UUID生成在后端 views 模块（Node crypto.randomUUID），不放入无IO的 metrics。新增动作如下，均使用既有 action 路由的 module=learning-views；同模块串行拒绝busy、每次一份choices原子put。

```ts
type SubjectTarget = {existingId:string} | {create:{name:string}};
// 这两个分支必须二选一；名称trim后非空，不按名称查找合并。
```

| 动作 | 输入 | 结果及语义 |
|---|---|---|
| subject-create | `{name}` | `{saved:true,subject:{id:'subject_<UUID>',name}}`；同名也生成独立ID |
| subject-rename | `{subjectId,name}` | `{saved:true,subject:{id,name}}`；必须已存在本地subjects，不改ID或引用 |
| mapping-set | `{sourceId,sourceSubjectRef,target:SubjectTarget}` | `{saved:true,subjectId}`；来源课程须来自当前有效集合且未有来源显式映射；existingId须为可选学科；create时在同一次choices写入中新增学科并建立映射 |
| mapping-remove | `{sourceId,sourceSubjectRef}` | `{saved:true}`；只移除工作台映射，不删学科或来源数据；显式来源映射不可解除 |
| exam-create | `{title,subjectRef:string|null,due:When}` | `{saved:true,exam:{id:'exam_<UUID>',title,subjectRef,due}}`；无客户端id字段 |
| exam-update | `{id,title,subjectRef:string|null,due:When}` | `{saved:true,exam}`；只更新已有手工考试，未知id拒绝，保持range/pair引用 |

旧 save-mapping/save-exam 后端动作保留兼容0.1.1客户端，0.2 UI不调用，不能因升级强行改写旧任意字符串ID。已有同名对象不合并；下拉同名项增加来源/序号辅助区分，不要求用户辨认UUID。来源自带canonical subjectRef而不在local.subjects时作为只读选项展示，可用于已有目标/考试；若需要命名，可显式创建同ID的本地显示名称条目（subject-rename仅对此已在当前有效记录中出现的canonical ID允许补名称，不能接受任意新ID）。此补名称不改来源、映射和记录ID。

保留 save-goal/remove-goal/save-range/remove-exam/confirm-pair/remove-pair 行为和身份格式。手工考试计量键仍为 JSON.stringify(['local',id])；修改名称/日期不重建ID，范围和用户去重确认保持关联。删除考试继续清除其range/pair。新建失败不留半个学科/映射，也不声称成功。保存成功但响应丢失时先刷新现有列表，不自动重试create。

## 7. 学科筛选与四视图

### 7.1 统一筛选契约

在 `learning-summary` 增加 options.subject：

```ts
type SubjectFilter = {mode:'all'} | {mode:'unmapped'}
  | {mode:'subject';subjectRef:string};
// GET metric?id=learning-summary&subject=<URL编码的JSON>
// 缺省all；仅此指标识别subject，不做任意JSON options转发。
```

后台在当前有效来源集合内先解析显式subjectRef与工作台映射，再筛选记录、手工考试及可适用的目标，最后计算指标；不能只把合计行在前端隐藏。all包含未映射，unmapped只选解析后subjectRef=null，subject严格匹配ID。空结果保持既有未知/不可用语义，不伪造学习量0。旧GET不带参数与0.1.1 all计算兼容（有意排除注销缓存的改动除外）。

返回保留现字段并增加 `filter:SubjectFilter`、`subjectOptions:[{id,name,origin:'local'|'source'}]`。选项来自**全体当前有效数据和local.subjects**，不被当前筛选截断；名称本地优先，旧来源无名称仍有ID回退。mappings/unmapped/localExams/goals/pairs等编辑目录提供完整集合，不让筛选误删或隐藏持久对象；视图呈现时按filter筛展示清单，但编辑器下拉始终完整。sources同步状态和来源设置不随学科筛选改变。

| 内容 | all | subject | unmapped |
|---|---|---|---|
| 今日到期/欠账/已复习/连续天数 | 全体有效数据，按单位/时区分开 | 重算选中学科 | 重算null学科 |
| 14天合计图 + 分学科小图、热力日历 | 现有合计及全部小图 | 合计为选中学科，小图仅该学科 | 合计及未映射小图 |
| 掌握度/薄弱主题/趋势 | 全体，scale/method仍分开 | 该学科各来源口径 | null学科，保留来源课程名 |
| 最近考试/考试时间线/每日需要量 | 全部 | 该学科 | 未指定学科考试 |
| 每日目标实际与差值 | 全局目标及各学科目标 | 仅该学科目标，不把全局目标当该科目标 | 无专属目标（现有null表示全局，不是未映射） |
| 去重候选 | 当前可见考试候选 | 两考试均在筛选集合才展示 | 同左 |

确认的去重关系先在完整有效考试集合解析，再取筛选结果，不能因筛选隐藏一端而把已确认重复项重新计入。编辑完整目录保留不可用来源的引用，但标记“不参与当前统计”；它不进入候选或当前指标。本轮不改变不同学科考试的既有去重算法。

编辑数据新增明确公开字段（由B后端提供，C不从原始records重做解析）：

```ts
// learning-summary附加；这些目录不随subject筛选截断
mappingRows: {sourceId:string; sourceTitle:string; sourceSubjectRef:string;
  sourceSubjectName:string|null; subjectRef:string|null;
  origin:'unmapped'|'local'|'source'; active:boolean; editable:boolean}[];
// origin=source不可重新映射；不活跃的旧local映射只读保留。
// 来源没有sourceSubjectRef（例如整份ICS只有canonical subjectRef）不造课程行。
subjectOptions: {id:string;name:string;origin:'local'|'source'}[];
pairDetails: {ids:[string,string];same:boolean;active:boolean;
  exams:({id:string;title:string;due:When}|null)[]}[];
```

pairDetails中缺失/不活跃端用“来源不可用（保留确认）”显示，不把裸JSON ID当用户标题；原pairs数组仍保留以兼容旧客户端。所有内部ID可随DTO返回供按钮回传，不在普通表单中要求用户填写。

### 7.2 UI流与外壳接口

默认进入总览，保留总览/复习进度/掌握度/考试计划四导航；“来源设置”作为独立管理视图。不把设置字段塞进四视图每个卡片。顶栏同一个学科选择器，切四视图保持选择，刷新页面回到all（不新增持久偏好）；来源设置不受它影响。

外壳新增 View 可选 `filter:'learning-subject'`；模块client注册四视图时声明它。外壳用后端subjectOptions绘制筛选控件，把subject序列化到metric GET；不同视图复用当前选择，切换设置不清空。POST操作后refresh同时刷新数据和选项；如果选中来源学科消失且不在本地subjects，重置all并提示。UI只做选择/渲染，不自己聚合或重新解释时区。

总览使用今日统计卡及最近考试；进度上方合计图、下方分科小图；掌握度保留两口径并列、下方薄弱主题；计划页考试/范围和每日目标分区。窄屏单列，宽屏卡片网格；继续用DSH字体与颜色变量，不另引组件库。图表保留文字数值与“未知”，不靠颜色单独表达。

映射流：显示来源标题+课程名 → 选择已有学科/“新建学科” → 新建只填名称 → 确认；名称不会自动合并。已映射可改名、换目标、取消映射。来源显式映射只读提示。手工考试新建只填名称、学科/未指定、日期/时区；编辑器隐藏ID并原样回传；瞬时时间的旧考试保留at编辑能力，不能载入后擅自转换date。

设置流：列表 → 新增/编辑 → 输入路径或替换URL、刷新方式 → 可选检查 → 保存 → 明确点击立即同步。同步与保存是两个状态提示；检查失败不阻止合法离线配置保存。禁用/删除先确认“数据保留但不参与统计”；位置变更提示“旧映射不会套给新库”。busy时保留表单，不自动重提。

## 8. 升级、恢复与数据兼容

不变更 storageDomain v2：local_state现有unknown value可容纳settings；只在管理模块内部标记schemaVersion=1。choices结构和Snapshot记录结构保留，registered运行时计算。没有批量重写快照/ID或算法迁移。

首次0.2启动没有settings时按原profile恢复相同sourceId；旧choices不写也能用。第一次用户修改来源才固化完整设置。新增字段缺省要适配0.1.1缓存；未知settings.schemaVersion停止该管理模块来源注册并显示固定错误，不能忽略而退回profile复活订阅。

回退0.1.1前备份整个工作台storage与profile；旧版忽略新模块settings，会重新按profile启动旧来源，因此回退不保证保留0.2启停状态。部署说明必须明说，回退由部署者确认原profile来源仍可用；不要让0.2修改profile来“修复”此差异。0.2重装恢复读取settings，保留所有choices。

## 9. 测试与验收矩阵

全部使用虚构路径/URL/数据；真实配置/私密链接不进fixtures、日志、截图和Git。

1. **初始/持久优先级**：0.1.1 profile有StudyHub+两个ICS、无settings，GET列3条且storage未写；首保存后profile新增一项不被合并；删除一项/删除全部/禁用重启仍保持。原ID、旧缓存和所有choices字节语义不变。
2. **唯一所有权**：递归发现全模块后每源只注册一次，每定时源仅一个timer；同一规范化StudyHub根重复配置拒绝；ICS原id/location不变则ID不变。其他插件来源保持服务兼容。
3. **忙与生命周期**：挂起source.read，分别save/disable/delete均409且旧配置/实例不变；暂停commit后手动sync409，timer无读，释放commit后只读新配置；定时器创建失败、state.put确定失败保留旧源；close等待commit再关storage。多次刷新不建重复timer。
4. **不明结果**：存储已提交但HTTP响应丢失，GET新revision可见；旧revision再次保存409。注入明确未提交的put失败，不能saved=true；检查失败不修改配置/快照/游标。
5. **换库与统计**：A库同步且映射 → 换B库 → 未同步时不能显示A数；B成功后只B参与，A快照及映射仍在存储。禁用/删除排除缓存，启用相同ID恢复；启用但读取失败继续显示最后成功数据和错误。
6. **秘密与边界**：URL含虚构token，GET state/设置/metric、保存响应、读取/解析错误与捕获日志均不出现URL/token；keep不擦空；replace更新；新建keep400。非回环、不合法Host/Origin/跨站/缺POST头仍403；无任意文件原文或StudyHub action入口。
7. **定时**：StudyHub和ICS都覆盖manual/interval；启动或保存不立即读，第一间隔后读一次；manual无timer；busy不重试、不排队。旧自定义interval准确保留，非法间隔拒绝。
8. **本地身份**：新学科/考试由后端生成ID；同名创建两项不合并；映射+新学科一次写入失败无半成品；已有旧ID改名、考试改日期保留goal/range/pair引用；来源已有显式映射不被假覆盖；旧客户端动作仍可用。
9. **筛选口径**：两学科+未映射、混合card/question和时区，all/subject/unmapped各自重算到期/热力/连续/掌握/考试；subject不拿全局目标当本科目标；筛选后下拉仍完整；失效来源缓存不混入；未知不变0；确认去重不因筛选消失。旧手工at考试编辑后仍at。
10. **宿主集成**：在隔离的 DSH home 安装 0.1.1 并保存虚构 choices/来源快照，再升级 0.2，验证来源 GET、免 ID 操作、重启恢复、四视图及设置页；导入一份本地小 ICS 和受控 HTTP 测试 ICS，检查不写来源文件。脚本见 `tests/integration/`。

验收标准是状态和数据语义正确，而非仅按钮可点。前后端错误场景须真实走POST，不以直接调用纯函数替代路由边界测试。不为通过测试加重试或放宽断言。

## 10. 采用的默认决定

- 完整工作台配置优先，不自动重新导入 profile。
- 保存不自动同步；新来源默认手动刷新。
- 停用、删除的来源不参与统计，缓存保留。
- ICS 的高级 rules 与来源显式学科映射只继承、不在设置页编辑。
