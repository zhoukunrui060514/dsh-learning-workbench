# StudyHub 4.6.0 只读来源

模块 ID `studyhub`。0.2 起来源由来源设置页管理（`learning-source-settings` 模块用本工厂创建实例）；首次没有持久设置时，从插件配置 `modules.studyhub` 继承：

```json
{"libraryRoot":"<你的学习库路径>/.dsh-study","subjectMap":{}}
```

libraryRoot 必须绝对路径；未配置则不登记来源，不阻断其他模块。sourceId 为规范化根路径 SHA256 前24位，换库不继承旧快照。subjectMap 可将官方课程稳定 ID 显式映射为工作台学科 ID；未映射 subjectRef=null，sourceSubjectRef 保留原始课程 ID。未分类/已删除课程的历史不会猜学科，省略 sourceSubjectRef。标题不输出库路径。

## 当前实现

- 只调用 `library.context`、`course.list`、`course.get({id})`、`course.focusProgress({course:名称})`。固定调用位置见 actions.mjs；没有任意 action 转发、daily.plan.get、写来源 API。
- `check()` 每次软探测 studyRuntime，缺失返回 `{ok:false,detail:'StudyHub studyRuntime 服务未加载'}`。core 的公共失败状态仍按既有契约显示通用错误；不影响其他来源。
- deadline：exam.date 保留 date-only + 库时区，不转换成 UTC 午夜。
- weighted-level：逐重点主题输出官方 mastery（0–100），不是0–1比例。cards=0 时值为 null；没有重点主题时课程输出一条 value=null/topicRef=null 的未知记录。主题可能重叠，不把主题平均成全课程分数，不用 total/done 冒充题目量。method 写明官方权重及范围。
- review-event：每条 attempt 一条，含 retry（实际重做仍是一次事件），稳定键为 attempt.id；itemRef 是 JSON `[deckId,quiz_id]`，避免不同 deck 卡ID冲突。elapsed_ms 转秒；缺失为null。学习日按库时区。只有 graded/rubric/oral 的显式 correct 或0–5级 grade>=3 才作答对判断，self/self-report及未验证自报保留null。不复制题干、答案、assessment文本和模型评语。
- due-item：逐卡 count=1，保留全部已安排的时间（含未来，指标可据此做预测）；“现在已到期”需再过滤 due.at<=采集时间。排除 archived/system deck、官方课程 active=false、suspended 卡、无 due_at 和新卡。新卡判断对应官方 cardLevel：没有有效历史 grade 且 repetitions<=0；retry/updatedAfterOpening 不用作调度证据。作答历史不因课程停用或归档而删除。课程 action 已给出继承后的 active，不在适配器重造课程树算法。
- 每次同步是完整 replace，暂不实现增量或 range 裁剪。版本不是 study-sharded v5 时不打开分片，只返回 action 记录和 `studyhub-shards-unsupported` 警告，旧分片记录被替换移除。读取/JSON损坏抛错，不伪造零或吞错。
- 只经 FilePort.read 读索引及两类分片。名称限定在对应分片目录，防止清单指向库外；读取后再次比较索引文本，发现并发换版则拒绝本批，不重试，避免混合两个版本。core 保留上次成功快照。

## 依据

官方发布包：
https://github.com/EricWang1358/dsh-web-studyhub/releases/download/v4.6.0/ericwang1358-dsh-daily-flashcard-4.6.0.tgz
SHA256 `6938b817449235a14c26e1615df2b22ca9cc2deb3344d59813b8573f8dc545e6`，已与同 Release `SHA256SUMS-4.6.0.txt` 核对。npm registry 的该版本查询返回404，改从官方发布包读取，未安装依赖。

包内证据：
- lib/store.js:46–58、211–264、298–355：v5、shards/相对路径、deck独立对象、attempts每块数组。测试夹具照此造，不含用户学习内容。
- lib/contexts/study/operations.js:721–736、829–841：attempt.id/quiz_id/deckId/timestamp/grade/assessment/elapsed_ms；lib/rubric-grading.js:191–198、oral-exam-service.js:126–128补充评估类别。
- lib/mastery.js:1–8、62–89：原始加权等级、new判断、due规则；lib/course-active.js:90–105：排除新卡与暂停卡；lib/focus.js:30–43：排除归档/system。
- lib/courses.js:160–174：旧 course/folder 名称优先于 courseId；按官方课程和 aliases 解析来源内身份，不做跨来源同名合并。

## ratio 的公式与口径

实现位于 ratio.mjs，依据上述已校验发布包 `lib/sm2.js:137–148`（algorithm/forgettingCurve）、`:193–228`（memoryState）、`:79–88`及`:241–244`（本地日历天差）。该文件 SHA256 为 `94338040e0a7ef4853433245d78f57b142f1403eeef8b70d6b25526f05a1bdaa`；抽取的算法附有 STUDYHUB-LICENSE.txt（MIT）。

- decay = -clamp(settings.w[20] 或默认0.1542, 0.1, 0.8)。自定义 w 要21个有限数字。factor = round8(exp(log(0.9)/decay)-1)；R = round8((1+factor×elapsedDays/stability)^decay)。factor和R各保留8位，R>=0.9计入分子，固定阈值不等于用户的request_retention设置。
- 有有效stability和difficulty的FSRS状态：stability裁剪到[0.001,36500]，last_review无效/缺失时沿用官方elapsed=0。旧SM-2 interval_days>0：stability取裁剪后的间隔，lastReview=due_at减该间隔；缺due_at则从当前时间减间隔。只有新卡无记忆状态时返回null，不凭空给出概率。
- elapsedDays是主机本地日历日之差（负数归0），不是UTC天数或24小时长度。运行时取Intl的主机时区并写进method；库timeZone仍用于review-event学习日、考试日期。这复现官方调度的机器时区规则；主机与库时区不同须解释日界线差异。
- 课程按直接归属计数，不把子课程再次加到父课程；分母含新卡、排除归档/system deck和暂停卡。已停用课程仍可查看自身ratio。新卡计入分母但不计入R>=0.9的分子；分母0时value/numerator/denominator均null。与官方focusProgress主题分数并排，不混合。
- 测试的ratio-reference.json为44组虚构输入，由已校验原始调度文件直接运行生成（生成器临时导出其内部algorithm/dayDiff，不修改原文件）。覆盖默认/自定义/裁剪参数、极端稳定度、SM-2兼容、新卡、未来/缺失last_review、本地跨日。普通测试使用冻结结果，无下载/上游依赖。

## 显示名

课程显示名来自官方 `course.name`，通过可选信封字段 `sourceSubjectName` 传给所有对应课程的 action/分片记录。它只用于显示，不参与来源身份、去重或映射；改名同步后替换显示元数据，未映射不会按同名自动合并。
