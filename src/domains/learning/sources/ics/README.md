# ICS 日历来源

模块 ID：`learning-ics`。只登记 `Source`，读取经 `ports.files.read` / `ports.http.get`；不写来源，不直接访问网络或文件系统，不注册前端模块。

在后端 `modules['learning-ics']` 配置 `calendars` 数组。每项：

```js
{
  id: 'example-calendar',
  title: '课程日历',
  path: '/example/calendar.ics', // 或 url；两者只能填一个
  timeZone: 'Asia/Shanghai',
  intervalMs: 3600000,          // 可省略；省略后仅手动同步
  subjectRef: null,             // 可选，已确认的工作台本地学科 ID
}
```

私密 URL 仅放后端配置，不作为 title/id，也不放进代码仓库。公开 Source ID 是 `ics-` 加 `[id,读取位置]` 的 SHA-256 摘要前 24 位；改变读取位置会产生新来源身份，不把另一日历套进旧缓存。公开数据不包含文件路径、URL、DESCRIPTION、LOCATION、VALARM、原始 UID；externalId 使用 UID/原始重复实例槽位的 SHA-256。读取错误只抛 `ICS: READ_FAILED`，解析错误只抛固定错误码，无含地址的 cause，也不打印原始异常。失败交给框架保留最后一次成功快照，不返回伪造的空成功、不重试。

## 分类和时间

默认规则来自实际超星导出的两个 SUMMARY 前缀：

- `学习通考试：` → `deadline/exam`，due 取 DTSTART，即考试开放窗口的开始；不是作答时长或窗口关闭时间。
- `学习通作业截止：` → `deadline/assignment`，due 取 DTSTART；样本 DTEND 是截止时刻之后一分钟，不用于截止。
- 其余 → `calendar-event`。不会因标题含“考试”、VALARM 的提示或日历名称而猜成考试。

`rules` 可替换整组默认规则；`[]` 表示全部为普通日程。按数组顺序，第一条匹配生效：

```js
rules: [
  {field:'categories', equals:'EXAM', type:'exam', due:'start'},
  {field:'summary', prefix:'提交截止：', type:'assignment', due:'end'},
]
```

field 可为 summary/categories/description；equals 精确匹配、prefix 前缀匹配；type 为 exam/assignment；due 为 start/end。全日事件的 end 是排他日期，选择 due:end 时减一天。分类不能映射学科名；未配置 subjectRef 就是 null。

- DATE 输出 `{date,timeZone}`，不变成 UTC 午夜。缺 DTEND 的全日事件按 RFC 5545 取次日。
- UTC `Z` 输出瞬时时间，timeZone=UTC；TZID 使用事件时区，优先日历内 VTIMEZONE，否则用 Node ICU 的 IANA 数据。
- 浮动时间和全日日期使用配置 timeZone，其次 X-WR-TIMEZONE；缺时区或无法识别的 TZID 报错，不用服务器时区。当前契约要求 IANA 名称，不支持无法映射到 IANA 的厂商自定义 TZID。
- 直接指定的 DST 重叠时间取第一次出现；不存在的墙上时间按跳变前偏移解释（RFC 5545 §3.3.5）。
- 普通事件的结束统一到开始时区。TRANSP:TRANSPARENT 为 busy=false；OPAQUE 或省略按 RFC 默认 busy=true。
- 普通瞬时事件没有 DTEND/DURATION、显式起止相同或 DURATION 为零时，跳过该实例，不捏造持续时间。读取范围内被跳过的实例数通过 `warnings` 的 `ics-zero-duration-skipped` 提示，其他记录仍成功 replace。warning 不包含标题、UID、URL 或原始异常；每次同步重算，没有跳过时返回空数组，清除旧提示。瞬时 deadline 保留。负时长、日期类型不一致、全日事件显式结束不晚于开始等坏输入仍报错。

## 展开和快照

使用 ICAL.js 的 RRULE/RDATE/EXDATE 展开器，支持单次 RECURRENCE-ID 改期/取消及 RANGE=THISANDFUTURE。不同 UID 分组；即使覆盖实例从范围外移入也会纳入。externalId 来自 UID 和原始实例日期/瞬时值，不取新 DTSTART 或标题；UTC 和 TZID 表示的同一原始槽位得到同一 ID。非重复事件仅使用 UID。

范围为 `[from,to)`，可用带偏移 RFC3339；日期字符串解释为日历时区当天零点。默认 from 为采集时刻前 30 天，to 为后 366 天，避免无限规则无限展开。普通事件按区间重叠入选，deadline 按 due 入选。每次返回 replace 完整范围快照，范围外记录不留在当前快照；无分页 cursor。RDATE 的 PERIOD 值不在当前适配范围，返回日期解析错误，不能当成一个瞬时值悄悄接收。

## 依赖

唯一运行依赖固定 `ical.js@2.2.1`，MPL-2.0，纯 JavaScript、无传递依赖/原生构建。解析器、标准重复规则和 VTIMEZONE 复用该库；IANA 查询使用 Node 内置 Intl。来源：

- https://github.com/kewisch/ical.js （README 说明零依赖、MPL-2.0）
- https://github.com/kewisch/ical.js/releases
- https://github.com/kewisch/ical.js/wiki/Common-Use-Cases
- https://www.rfc-editor.org/rfc/rfc5545

开发时在仓库根只安装这一条固定依赖（`--legacy-peer-deps` 避免获取 DSH 的 peer 包，`--no-save` 不改清单）：

```sh
npm install --ignore-scripts --legacy-peer-deps --no-package-lock --no-save ical.js@2.2.1
node scripts/test.mjs
```

发行包通过 `bundleDependencies` 携带完整的 ical.js（含 dist、lib、package.json、LICENSE）。不要向 DSH 宿主自己的 node_modules 安装它。

HTTP 端口没有适配器级代理设置，远程链接走框架现有的 GET 路径；需要代理时应由框架提供端口能力，不在适配器内绕过。

## 检查

`node --test tests/domains/learning/sources/ics/ics.test.mjs`：虚构夹具，覆盖时间/时区、折行转义、分类、重复与覆盖、读范围、重复同步及隐私失败路径。`node scripts/test.mjs` 是仓库统一检查。

分类只依据上述两个 SUMMARY 前缀；VALARM 不生成额外事件。真实日历样本不进仓库。


## 审查修复：范围取消

`STATUS:CANCELLED` 加 `RECURRENCE-ID;RANGE=THISANDFUTURE` 按原始重复槽位确定取消边界，无需 DTSTART。展开时先判断当前生效的范围覆盖是否取消，再计算改期时间；不为取消事件捏造开始时间。非取消的改期覆盖仍要求 DTSTART。

新增两项虚构来源同步回归（有/无 DTSTART）：先同步三次每日事件，再同步从第二次起取消的日历，断言成功快照只剩首次事件且 ID 不变。修前无 DTSTART 用例以 DTSTART_REQUIRED 失败，有 DTSTART 用例通过；修后两项均通过。
