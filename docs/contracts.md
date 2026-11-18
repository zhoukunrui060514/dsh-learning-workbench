# 工作台模块契约 v1

适用代码：src/core、src/host、src/ui；Node 24 ESM。本文是新增领域模块与来源的接入依据。领域代码不得导入 DSH 或修改框架文件；DSH 访问通过 setup 参数的端口和软探测服务完成。测试入口 `node scripts/test.mjs`。

## 1. 领域模块入口

在自己的目录（含子目录）放 `module.mjs`，宿主递归发现；不需要编辑根登记表或 package.json。目录中符号链接不遍历，下划线目录默认不加载，只有 includeExample=true 加载 _example。

```js
export const id = 'my-domain'; // 全局唯一、小写字母起始，只含字母数字连字符
export const client = true; // 可选；为 true 时同目录必须有 client.mjs
export const domains = [{ id:'my-domain', title:'领域名称', recordKinds:['sample'] }];
export function setup({workbench,ports,config,getService,state,registerAction}) {
  const off = workbench.registerSource(/* 下文 Source */);
  return () => off();
}
```

先登记所有模块的 domains，再运行所有 setup，因此框架已提供 `learning/module.mjs` 声明学习领域一次，`learning/sources/studyhub/module.mjs`、`learning/sources/ics/module.mjs` 和 `learning/views/module.mjs` 通过 source-settings 统一登记来源、由 views 登记指标和视图，不靠文件名顺序。每个适配器不重复声明 learning。独立模块测试在自己的测试 fixture 中登记所需领域即可。

setup 可异步，返回可选的同步/异步清理函数。整个挂载集合卸载时，先同时撤销所有模块的新操作并等待已接收操作完成；再调用 workbench.close 停止定时同步、排空来源读写；然后逆序运行模块清理函数、注销领域。核心和模块资源在操作排空期间保持可用，资源在来源排空期间保持可用。mountModules返回的卸载函数因此拥有该workbench的关闭职责，不用于单个领域的热卸载。模块启动失败会清理已挂载模块并使插件加载失败，不吞掉错误。

config 是插件配置 `modules[id]` 的对象，只在后端存在；不会序列化到面板。getService(name) 使用 ctx.get 软探测，可返回 undefined。StudyHub 缺失时来源 check 返回失败；工作台本身照常加载。模块不要把可选服务放到插件顶层 inject。

## 2. core 接口

```ts
createWorkbench({storage,clock}): Workbench
workbench.registerDomain({id,title,recordKinds:string[]}): () => void
workbench.registerSource(source: Source): () => void
workbench.registerImporter(importer: Importer): () => void
workbench.registerMetric(metric: Metric): () => void
workbench.sync(sourceId:string, range?: {from?:string,to?:string}): Promise<Snapshot>
workbench.importFile(importerId:string, file: ImportFile): Promise<Snapshot>
workbench.metric(metricId:string, options?:object): unknown | Promise<unknown>
workbench.snapshot(): {domains,metrics,sources:Snapshot[]}
workbench.close(): Promise<void>
```

来源/导入器 id 全局唯一，固定绑定 domain/kind/input 类型。更换学习库用新 id，不复用旧快照；重新配置同一来源读取位置时，模块负责身份选择。注销保留缓存但状态 unavailable。close 停止定时器，拒绝新任务，等待进行中的写入结束。

### Source 与 Importer

共同字段：`{id,domain,kind,title,capabilities():string[],check?:()=>Promise<{ok:boolean}>}`。

- Source 增加 `read(range,cursor:string|null):Promise<ReadResult>`、可选 `intervalMs` 正整数。注册定时器后经过间隔才第一次运行；可用立即同步按钮主动触发。一次同步读一次 read，不自动循环分页或重试。无 range 时来源决定默认读取范围。日期及日界线由领域定义（学习使用库时区）。同来源并发 sync 共享进行中的请求，包含当次范围；调用者应等待后再提交其他范围。
- Importer 增加 `accept?:string`（HTML 文件扩展名过滤）、`import(file:ImportFile):Promise<ReadResult>`。`ImportFile={name:string,bytes:Uint8Array}`，不提供客户端文件路径。导入不定时运行，同时导入另一个文件会拒绝 busy，不忽略第二个文件。文件格式/编码由导入器处理。

```ts
type RecordValue = {
  kind: string; externalId: string; observedAt: string; // ISO 时间
  subjectRef?: string; data: Record<string,unknown>;
};
type ReadResult = {
  records: RecordValue[]; fetchedAt:string;
  mode?: 'replace'|'merge'; // 默认 replace
  cursor?: string|null;
  warnings?: {code:string,message:string}[];
  removed?: {kind:string;externalId:string}[];
};
```

核心添加 domain/sourceId。唯一键 `(sourceId,kind,externalId)`；一次批次内重复键是来源错误，整批拒绝。**不同同步/导入批次中的相同键更新已有记录，不增加条数。**

replace 完整替换该来源，删除不在结果中的旧项；只返回某个时间范围意味着快照也只有该范围。merge 保留旧项、按键覆盖，再加入新项；显式 removed 删除指定键。cursor 与记录在同一个原子 put 中一起提交；省略 cursor 等于 null，增量来源要返回下一游标。失败不推进游标。

Source 和 Importer 的成功结果可附带 warnings（稳定 code 和面向用户的 message）；随快照持久化并在来源状态显示，status 仍 ready、error 仍 null。每次成功整体替换 warnings，省略等于空数组；失败保留上次成功数据及其 warnings。用于部分能力不可用，例如分片版本未适配但官方 action 仍可读；replace 同步会移除本轮未产出的旧记录。warnings 是公开信息，不得包含私密配置、路径中的凭据或原始异常。旧缓存可能没有该字段，消费者按空数组展示。

来源读取/校验失败保留最后成功数据并记录 error。任意 Error 的原文可能含私密 ICS 地址，所以公开状态只存通用 error `{code,message}`，调用方仍收到原始异常。持久化失败直接拒绝，并在当前进程公开error状态；旧记录和游标不变。不对未知写入结果补写第二次；存储失败状态不能持久化，重启后仍看到上次成功快照。

### 指标

```ts
type Metric = {id:string;domain:string;title?:string;
  compute(input:{records:NormalizedRecord[];sources:Snapshot[];now:string;options:object}):unknown|Promise<unknown>};
```

输入只来自记录库（包含尚不可用来源的缓存），不访问来源。指标自己筛选 kind、处理来源时间/可用性和计算口径；同领域可能混有其他记录种类，不能对所有记录盲算。返回 JSON 可序列化的数据，不含凭据。指标之间不自动混合掌握度或不同单位。

Snapshot 公开字段：registered（运行时计算）/id/domain/kind/title/input（source/importer）/accept/capabilities、records、status、lastSuccessAt、lastAttemptAt、fetchedAt、cursor、range、error、warnings。status 为 idle/syncing/ready/error/unavailable，数据不存在时是空列表但不得由此伪造真实指标为零。

## 3. 端口

```ts
StoragePort = {list():Snapshot[]; put(id:string,value:Snapshot):Promise<unknown>}
ClockPort = {now():string; every(ms:number, callback:()=>Promise<void>):()=>void}
FilePort = {read(path:string):Promise<Uint8Array>}
HttpPort = {get(url:string,options?:{headers?:Record<string,string>,signal?:AbortSignal}):
  Promise<{bytes:Uint8Array,contentType:string}>}
```

storage 单来源快照原子替换，put 在持久化完成后才 resolve；宿主用 storageDomain `learning_workbench` v2（compatibleVersions:[1]，保留旧快照）/ snapshots 表；独立 local_state 表存模块本地选择，不改变或混入来源快照。读返回值不可原地修改，core.snapshot 返回副本。clock.now 为 ISO 时间，every 返回停止函数，无自动重试。宿主 every 接受正安全整数毫秒；超过 Node 单次计时上限 2147483647ms 的间隔分段等待，完整间隔结束才调用回调，取消会停止当前分段及后续调用，不将长间隔交给 Node 降为1ms。FilePort 只读；HttpPort 只 GET，非2xx抛出状态错误，没有配置代理或持久环境变量。

ports 在 setup 中提供四个实现。core 本身只用 storage/clock；适配器通过 files/http 读取外部资料。`tests/support/ports.mjs` 提供 Map 存储、可手动推进时钟、内存文件和HTTP响应。新增模块单元测试不需要 DSH、网络或用户数据。

## 4. 客户端与共用图表

有 client=true 的模块在相同目录提供**自包含** `client.mjs`：

```js
export default function({React, charts, registerView, invoke}) {
  return registerView({id:'my-view',domain:'my-domain',title:'我的视图',metric:'my-metric',
    Component:({value,sources,refresh,sync,filter}) => React.createElement('p',null,String(value.total))});
}
```

客户端函数返回注销函数。不要导入后端模块；当前不使用 JSX 或打包器。共享 React 来自宿主。导航来自已注册视图，并且只列出已登记领域；切换后外壳读取对应指标并传 value。刷新/同步后重新计算。Component 的 `sync(sourceId)` 调用现有 POST /sync，调用者可随后 await refresh；`filter` 在声明筛选的视图中为当前 SubjectFilter，其他视图为 undefined。

View 可选字段：`filter:'learning-subject'` 启用统一学科筛选；`manageSources:true` 声明本视图管理来源；`subtitle:string` 显示标题说明；`metricError(error):string` 将读取指标的异常转换为界面文案。外壳在当前领域存在来源管理视图、当前视图 manageSources 或带筛选时不画通用来源卡。

`refresh():Promise<void>` 等待 state 和当前视图指标读取完成；失败拒绝，由调用方报告。切换视图或筛选后，迟到的指标结果被丢弃；已有数据不会在刷新失败时被当作新结果。学科对照为第 5 个学习视图，不带学科筛选；来源设置独立，不是学科对照的标签。

其他 DSH 客户端插件也可使用 Cordis `learningWorkbenchViews.register(view)`，返回注销函数。服务器侧其他插件使用 `learningWorkbench.registerSource(source)` 等相同服务接口。

图表（均为 React 组件，含数值文字，不能只靠颜色）：

- `charts.DayBars({points:[{date:'YYYY-MM-DD',value:number}],title?})`：按天排序、同日求和的柱图，支持负值与零，附数值表。
- `charts.HeatCalendar({month:'YYYY-MM',points,title?})`：周一开始的月日历，缺失显示—，记录零显示0。
- `charts.Proportion({items:[{label,value}],title?})`：非负占比条与百分数，合计零显示0%，不除零。

## 5. HTTP 边界与文件导入

- GET `/learning-workbench/state`：状态、缓存记录、clientModules；配置和密钥不在返回里。
- GET `/learning-workbench/metric?id=<metric>`：指标结果。
- POST `/learning-workbench/sync?source=<id>`：读取来源。
- POST `/learning-workbench/import?source=<id>&name=<filename>`：原始文件 bytes；32MiB上限避免大文件把整个DSH堆内存用完，超限413。首版用于CSV/JSON等，超大文件需后续流式导入契约。
- POST 都要求 `x-learning-workbench:1`；不存在路由404，同步失败502、导入失败422、指标失败500。原始异常不回传浏览器。
- 只服务明确登记的客户端文件和charts文件，没有按任意路径读文件的路由。

所有路由校验 socket 是回环、Host 等于宿主 origin authority、Origin 缺省或同源，且不能 Sec-Fetch-Site:cross-site。自注册路由不在 DSH token 门中，所以必须有这些边界。不是用户身份认证，同机其他进程可以访问。凭据/私密链接只在模块后端配置；记录、标题、cursor和指标不得含密钥。

## 6. 从零接入

1. 在分配的 `src/domains/<domain>/...` 下添加 module.mjs；根领域只声明一次 domains（learning 已由框架提供，学习子模块不重复声明）。
2. 选来源 read 或用户文件 import，选择稳定外部ID与replace/merge语义，提供schema验证。
3. 用 setup 的端口读数据，规范化记录；registerMetric 只从 records 计算。
4. client.mjs 注册视图，复用 charts；只要在自己目录新增文件，宿主重启后自动发现。
5. 测试放对应 `tests/domains/<domain>/...`，test.mjs 文件会被统一命令自动收集；测试全用虚构资料。
6. 配置写测试profile的 modules[id]，不要把真实路径或密钥提交Git。

几类来源的接法：StudyHub/ICS 都用 Source；学习指标和视图登记 Metric/View；财务文件用 Importer、merge去重、领域自己的transaction记录；健康用Source读取导出文件、metric-sample记录。五者不需修改框架/package.json。对账、跨机构配对、FSRS、ICS复发等算法不属于框架。

已核实的宿主约束：StudyHub服务需明确libraryRoot；不调用有写入副作用的daily.plan.get；不能用focusProgress加权等级替代FSRS。客户端依赖renderer/layout，main槽必须key；不依赖不存在的runtime包。


## 7. 学习共享记录 v1（各学习来源与指标共用）

声明位置 `src/domains/learning/records.mjs`（JSDoc 类型），领域注册位置 `learning/module.mjs`。只声明形状和语义，不实现来源算法；适配器负责校验真实数据，core 不解释领域字段。以下字段除明确可选外必须提供；未知值用 null，不用0替代。缺能力时不生成该类记录，capabilities 不宣称该能力；学习视图显示“不可用/未知”，而非零。

公共外层：`kind/externalId/observedAt/subjectRef/data`。可选 `sourceSubjectName:string` 为来源课程显示名（StudyHub 使用官方 course.name），不参与身份、记录键、学科映射键或自动合并；旧缓存缺少它时显示 sourceSubjectRef。重新同步更新名称但保持 sourceId/sourceSubjectRef/externalId 不变。指标将名称传给映射页和未映射课程掌握度；已显式设置的本地学科名称优先。observedAt 是本次采集的带偏移 RFC3339 时间，不是事件发生时间。subjectRef 为工作台本地稳定学科 ID 或 null；**不是来源课程 ID，也不能凭显示名称猜合并**。来源未映射时用 null，并保留可选外层 `sourceSubjectRef:string`（各来源的原始稳定课程 ID）。学习视图模块的本地学科映射以 `[sourceId,sourceSubjectRef]` 为键，值为本地学科 ID；指标读取自己的映射状态覆盖解析未映射记录，无需改写来源或等同步。若后端已明确配置同一映射，来源可直接输出 canonical subjectRef。学科合并/考试跨源去重须用户确认，externalId 相同不表示跨来源同一事件。

时间联合类型 When 必须二选一：`{date:'YYYY-MM-DD',timeZone:'Asia/Shanghai'}` 或 `{at:'2026-12-01T09:00:00+08:00',timeZone:'Asia/Shanghai'}`。timeZone 是 IANA 时区，由学习库或日历配置提供，不能取服务器时区。日期型考试倒计时按该时区的日历日差（当天0），不是 UTC 毫秒除86400000；日期型截止指该本地日结束，日程全日结束日期则为排他上界。瞬时时间必须带偏移；不可转换的原始日期不伪造时间。以下表中的字段均在 data 内。

| kind | data 字段、单位与语义 |
|---|---|
| review-event | occurredAt:带偏移RFC3339；localDate:YYYY-MM-DD、timeZone:IANA（事件所属学习日）；itemRef:string|null（来源内题/卡ID）；correct:boolean|null；durationSeconds:number|null，非负秒。每条是一轮实际作答/复习，不是题目总数；重做是新externalId。已复习量可数事件，已复习题数需按sourceId/itemRef去重；未知题ID不计算唯一题数。 |
| due-item | due:When；count:非负整数；unit:'card'|'question'；itemRef:string|null。单项count=1；聚合桶itemRef=null且count为桶大小，同来源同一范围只能选明细或桶一种表示，不能双算。表示采集时仍待复习的量，不是学习库总量，也不表示已复习。未知到期量不生成桶。 |
| mastery-snapshot | asOf:带偏移RFC3339（测量时间）；topicRef:string|null（来源内主题ID，null=学科汇总）；value:number|null；scale:'ratio'|'weighted-level'；numerator:number|null；denominator:number|null；method:string。ratio的value在[0,1]，numerator/denominator仅在来源给出同口径计数时填写，分母必须>0，否则value未知。weighted-level保留来源原始等级值，不当成百分比/FSRS；method注明来源方法及等级范围。不同method/scale/主题不混合平均；薄弱主题只在同一口径下排序。 |
| deadline | title:string；type:'exam'|'assignment'；due:When。学科来自外层subjectRef；日期不确定时不生成虚假截止。两个来源各自保留事件，未确认前不自动合并。 |
| calendar-event | title:string；start:When；end:When，排他结束且晚于开始、类型/时区相同；busy:boolean|null。只有busy=true可扣除可用时间；未知忙闲不当作空闲，事件不自动成为考试。 |

每日“需要量”还需要用户本地每日目标/考试范围，不能仅凭deadline猜出题量或用掌握度当题数。学习视图模块用本地 state 保存目标、映射和手工考试，再与指标输入记录合并计算；这些是用户选择，不写回 StudyHub 或 ICS。测试夹具 `tests/fixtures/parallel-learning` 中三个学习子模块各占一个目录，独立发现后共用框架的 learning 声明并消费一致的 deadline 字段。

## 8. 模块本地状态与显式交互

setup 新增两个参数，宿主按 module.id 隔离命名空间：

```ts
state.get(key:string): JsonValue | undefined
state.put(key:string, value:JsonValue): Promise<unknown>
registerAction(name:string, run:(input:JsonValue)=>Promise<JsonValue>): () => void
```

JsonValue 为 JSON 可序列化数据。get 返回副本；put 成功才表示持久化，失败原样抛给模块。单 key 原子替换，无跨 key 事务；一次确认相关字段应保存在同一个对象。模块自行校验输入（例如配对ID必须存在），从闭包使用state。不同模块不直接读取彼此私有状态；学习交互由 learning-views 一个模块拥有映射/目标/手工考试，多个指标共享同一闭包。状态不自动进入GET state或前端，只有模块明确返回的指标/操作结果才公开，勿返回凭据。config仍仅后端。来源read只读且GET metric无写入副作用。

客户端入口新增 `invoke(name,input):Promise<JsonValue>`，已绑定自己的 module.id。点击确认时 `await invoke('confirm-pair',{pairId}); await refresh()`；保存失败会reject，不能显示成功。后端必须预先 registerAction，只能调用已安装模块明确登记的名称，不接受文件路径、URL或StudyHub任意action转发。其他客户端插件若调用本地API同样受以下边界约束，不是可信代码的沙箱。

POST `/learning-workbench/action?module=<id>&name=<action>`，body JSON，最多64KiB（限制小型本地选择载荷的内存）；沿用回环、Host/Origin和`x-learning-workbench:1`要求。JSON错误400，超限413，未登记/普通校验及保存异常422；同模块操作进行中409 BUSY（0.2，安全错误见§10），成功200返回模块结果；错误不透传可能含配置的原文。同一模块操作并发拒绝busy，不自动重试，防止读取旧状态后覆盖用户另一选择。插件关闭先移除HTTP路由；整个模块集合同时撤销操作并等待所有在途操作结束，再排空core来源同步、运行模块清理，最后关闭存储。不会先清理其他模块导致尚在执行的操作失去依赖。插件关闭后不会遗留本地写入。重开模块仍能读取state，操作必须重新注册。

实现边界：core/local-modules.mjs只接受 `{get(key),put(key,value)}` 存储端口；host映射到storageDomain的local_state表（行`{value:JsonValue}`），不使用Snapshot表。测试中的虚构财务确认经过POST保存、重建模块实例、GET只读指标取回选择；无真实账单数据。

## 9. 0.2 来源设置与生命周期

`learning-source-settings` 是内置 StudyHub/ICS 的唯一注册者，声明 `client=true`。原 `studyhub` / `learning-ics` 模块仅提供工厂。host 显式将旧配置作为 `initialLearningSources:{studyhub:modules.studyhub,ics:modules['learning-ics']}` 传给管理模块；客户端不会收到 modules 配置。第三方 registerSource 服务不变。

管理模块的私有 `settings` key 保存 `{schemaVersion:1,revision,entries}`；Entry 为 `{entryId,kind,title,enabled,schedule,adapter}`。schedule 为 `{mode:'manual'}` 或 `{mode:'interval',intervalMs:<正安全整数>}`。adapter 保留旧 id、位置和高级字段。不存在 key 时只在内存继承 profile，origin=profile、revision=0，启动和 GET 不写存储；持久值存在（包括空列表）时完整覆盖 profile。首次成功修改原子写完整列表，revision 加一、origin=workbench。未知 schema 不注册来源，设置 GET/动作返回固定 INVALID_INPUT，不回退到 profile。

继承条目 entryId=`legacy:<原sourceId>`；重复身份的额外条目加 UUID 后缀以便逐条修正，无法生成原身份的非法条目使用 `legacy:invalid_<UUID>`。新条目为 `source_<UUID>`，新 ICS 的 adapter.id 独立生成且终生不随标题变化。StudyHub 身份仍按规范化 libraryRoot 摘要；ICS 保留旧 id/location 摘要。改位置产生新身份，旧快照、choices、映射、范围和配对不迁移。旧高级 rules/subjectMap/subjectRef 只继承不编辑；新增 ICS 必须有效 IANA timeZone，编辑不能更改旧 timeZone。新来源默认手动；继承 ICS intervalMs 原样保留，StudyHub 初始手动。

重复或非法继承配置逐条显示 invalid，不注册，不丢弃原值。初始重复条目都不注册；删除一条或改走另一位置后，剩余未注册条目显示 `CONFIG_INVALID` / “重复已解除，重新保存或启用后生效”。它仍不参与统计，保存或启用该条才注册；重载后唯一且启用的条目正常注册。

```ts
workbench.changeSource({previousId:string|null,next:Source|null,commit:()=>Promise<void>}):Promise<void>
```

changeSource 在第一次 await 前验证身份/interval、检查 old/new pending 并保留两侧 ID；在途同步或变更拒绝 BUSY。旧实例在 commit 期间保留，旧 timer 跳过，手动 sync 返回409；新 timer 在持久化前预备。commit 失败取消新 timer，恢复旧源及旧 timer，返回 STORAGE_FAILED。成功后同步交换实例、取消旧 timer；新 timer 首次读取不得早于提交后完整间隔。不自动同步、不排队、不重试。ClockPort.every 返回的停止函数必须无异常。close 拒绝新操作并等待已接收变更及同步，再清空来源与定时器。

模块对未注册条目的删除/保持停用编辑只做单次 state.put。put resolve 表示持久提交完成；明确未提交的失败可带 `committed:false`，旧配置和实例保持可继续操作。其他失败结果不明时设置 reloadRequired=true，保留旧运行实例、拒绝后续设置写入，重新加载后读取持久值；没有补偿写或自动重试。已成功提交但 HTTP 响应丢失时 GET 看到新 revision，旧 revision 重提返回409。

Snapshot 新增 `registered:boolean`，仅从内存注册状态计算，不写存储；GET state 仍包含 unavailable 旧缓存。通用 Metric.records 仍包含全部领域缓存，学习指标和视图必须通过 sources 的 registered 集合选取有效记录。启用但失败的来源仍 registered=true，保留最后成功数据。更换位置、停用、删除的旧缓存 registered=false。

GET `metric?id=learning-source-settings` 返回以下白名单 DTO，Cache-Control:no-store：

```ts
{
 revision:number, origin:'profile'|'workbench', reloadRequired:boolean,
 entries:{entryId:string,sourceId:string|null,kind:'studyhub'|'ics',title:string,
   enabled:boolean,schedule:Schedule,
   location:{type:'library'|'file',path:string}|{type:'url',configured:boolean},
   timeZone?:string,advancedInherited:boolean,
   runtime:{status:'idle'|'syncing'|'ready'|'error'|'disabled'|'invalid',
     lastSuccessAt:string|null,lastAttemptAt:string|null,recordCount:number,
     warnings:{code:string,message:string}[],error:{code:string,message:string}|null}}[],
 retainedCacheCount:number
}
```

URL 不出现在 location、标题、异常、日志或保存响应中；本地绝对路径可回显。配置非法时 DTO 只显示安全字段和固定错误，原始配置只留后端。URL 编辑 keep 不清空，replace 才替换。

POST action 的 module=`learning-source-settings`：

| name | 输入 | 成功结果 |
|---|---|---|
| source-save | `{revision,entryId?,draft}` | `{saved:true,revision,entryId,sourceId,identityChanged}` |
| source-check | `{revision,entryId?,draft?}` | `{ok,code,recordCount?,warnings}`，成功 CHECK_OK，本地 ICS 文件读取 ENOENT 为 PATH_NOT_FOUND，其他读取失败 CHECK_FAILED |
| source-set-enabled | `{revision,entryId,enabled}` | `{saved:true,revision,entryId}` |
| source-delete | `{revision,entryId}` | `{saved:true,revision}` |

Draft 为 `{kind,title,location,schedule,timeZone?}`。location 仅接受 `{type:'library'|'file',path:<绝对路径>}`、`{type:'url',operation:'replace',value:<http/https URL>}` 或 `{type:'url',operation:'keep'}`；keep 只用于已有远程条目。拒绝未识别字段、kind 变更、任意 adapter 覆盖；StudyHub 不接受 timeZone。保存只验证配置，不检查外部可读性；检查用临时工厂 read({},null)，不注册、不写快照/配置、不推进 cursor；同步仍显式调用现有 /sync。

## 10. 0.2 HTTP 错误与学科筛选接缝

动作路由及 /sync 仅对内部 SafeError 返回 `{error:{code,message,field?}}`，消息固定，不透传任意异常或 cause：

| HTTP | code |
|---|---|
| 400 | INVALID_INPUT |
| 404 | NOT_FOUND |
| 409 | BUSY / REVISION_CONFLICT / DUPLICATE_SOURCE |
| 500 | STORAGE_FAILED |

同模块动作互斥返回409 BUSY；未知动作和普通动作异常仍422 `{error:string}`；普通 sync 异常仍502。客户端 invoke 须支持结构化错误并兼容旧 `{error:string}`，不自动重试。learning-views 本轮仍抛普通 Error，继续用422通用提示。JSON解析、大小、回环/Host/Origin及自定义请求头边界保持原样。

仅当 GET metric 的 id=`learning-summary` 且提供 subject 参数时，路由解析 JSON 并严格校验为 `{mode:'all'}`、`{mode:'unmapped'}` 或 `{mode:'subject',subjectRef:<非空字符串>}`，然后调用 `workbench.metric(id,{subject})`。无参数保持旧调用；其他指标不接收任何查询 options。解析或形状错误返回400 INVALID_INPUT。compute 直接读取 options.subject，不重复校验。


## 11. 学习指标目录与编辑兼容

`learning-summary` 的 `allExams` 始终为完整有效考试目录；`exams`、`candidates`、`plans` 随学科筛选重算。`subjects/mappings/unmapped/localExams/goals/pairs/subjectOptions/mappingRows/pairDetails/sources` 均不被筛选截断。registered=false 的来源缓存不参与统计或有效考试目录。

`subjectOptions` 优先使用 local.subjects 的名称和 origin=local，其次有效来源的名称和 origin=source。仅由手工考试支撑的选项是 `{id,name:id,origin:'local'}`：不代表存在本地学科，不允许仅凭此项给 canonical 学科改名。旧考试仍可保留该引用编辑和筛选，不迁移 choices，不在 GET 写存储。`pairDetails` 缺失端为 null，且 active=false；原 pairs 保留。

`PATH_NOT_FOUND` 仅适用于本地 ICS（`location.type='file'`）通过 FilePort 读取抛出 `ENOENT`。
`source-check` 此时返回 `{ok:false,code:'PATH_NOT_FOUND',warnings:[]}`，不写配置或快照。
同步失败保留上次成功数据；设置指标的 `runtime.error`（及来源快照 error）为
`{code:'PATH_NOT_FOUND',message:'找不到该文件，请确认路径'}`，不包含路径或原始异常。
`/sync` 的失败 HTTP 响应仍为原有通用 502。权限、目录、解析失败、远程 URL 和 StudyHub 失败不使用此码；远程错误不暴露 URL。
