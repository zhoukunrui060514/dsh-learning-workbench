# 学习指标与视图

`views/module.mjs` 是唯一模块入口（`learning-views`），登记 `learning-summary`；四个客户端视图共享同一指标。指标只读记录与 `choices` 本地状态，不调用来源或写状态。显式 action 才写 `choices`；宿主负责串行化和持久化。

## 计算口径

- **每日到期**：来源快照中，到期日等于该记录时区今日的 `due-item.count` 之和。单位 card/question、时区分别汇总，学科可拆分；这是仍待复习的数量，不是原始计划数。
- **欠账**：到期日早于该记录时区今日的 count 之和。同一天已过具体时刻的任务仍列今日到期，不重复列欠账。到期量不减复习次数。
- **14 天预测**：从各时区今天起的 14 个日历日，逐日 Σcount；按单位、时区给出总图，学科给出同区间小图。快照中的桶和同来源、来源学科、本地学科、日期、单位、时区的明细重叠时只取桶。源契约本身应保证只提供一种表示。
- **已复习**：事件 localDate 等于对应时区今日的记录数，一次重做也是一次事件。唯一题／卡数 = 不同 (sourceId,itemRef) 的数目；有未知 itemRef 时唯一数为未知。热力图按 localDate 汇总，不从 occurredAt 或 observedAt 重算学习日。
- **连续天数**：分别按时区统计已发生事件的 localDate 集合，从今天（今天无事件则昨天）向前逐日计数，遇缺日停止。不同学习日时区不合成一个连续天数。
- **掌握度**：按来源、来源学科、本地学科、scale、method 分组，每个 topicRef 取最新 asOf；topicRef=null 才是学科汇总。ratio 显示 value×100%，weighted-level 显示原等级及 method；不算组间平均。薄弱主题是该组非空主题 value 升序；趋势保留各主题各次测量，不把多主题相加。
- **考试倒计时**：日期型 = due.date − 当前时刻在 due.timeZone 的本地日期（日历日差）；瞬时型 = ceil((due.at − now)/86400000)。日期型当天 0；过期状态按本地日期是否已过判断。瞬时型按 due.at < now 判断过期，不用取整后的天数判断（刚过期不足一天会取整为 0）。总览仅列未过期考试。
- **考试每日需要量**：有用户明确输入的剩余范围 N 且未过期时，ceil(N / max(1,倒计时))，当天安排 N；缺范围或已过期则未知。剩余范围由用户更新，不用复习事件推测范围完成量。
- **每日目标**：用户填写的复习次数 T，按目标时区和学科（或全部）取今日事件数 A；还需 max(0,T−A)，实际减计划 A−T。没有对应复习记录时 A、差额和还需为未知。题／卡范围与复习次数不互相充当。

没有某类记录时，该类指标为 null，界面显示不可用；测量值 null 显示未知。有该类记录后，某天无事件或待复习量才计 0。数据覆盖止于来源提供的快照；热力图未出现的日期不补零。来源同步状态由面板外壳展示。

## 本地选择

`choices` 保存 subjects、mappings、goals、exams、examRanges、pairs。映射以 (sourceId,sourceSubjectRef) 为键，来源已有 canonical subjectRef 时保持它。来源课程名来自 sourceSubjectName；旧缓存缺名称时才使用原始 ID。0.2 用户选择或命名学科，后端生成新 ID，不按同名合并。

手工考试支持日期或带偏移瞬时时间，界面表单提供日期型输入。每日目标以 (subjectRef,timeZone) 为键。考试范围以 JSON 编码的 [sourceId,externalId] 为键。

跨源同日且同标题或已映射为同学科的考试列为候选，不自动合并。确认相同后，以按身份排序的第一条作为显示记录，完整来源记录仍保留；确认不同则两场均显示。确认可撤销。对方从来源中消失时不再隐藏唯一剩余记录。不同来源的具体时间冲突由用户在候选内容中判断；本模块不改外部考试时间。

显式操作：subject-create、subject-rename、mapping-set、mapping-remove、exam-create、exam-update；旧 save-mapping、save-exam 保留兼容，save-goal、remove-goal、remove-exam、save-range、confirm-pair、remove-pair 继续使用。保存失败不显示成功。所有操作只写模块本地状态，不修改来源快照，不调用 StudyHub 或日历写入接口。

## 验证

测试全部使用虚构记录与内存端口。`node scripts/test.mjs` 验证纯计算、重新挂载后的映射/目标、GET 无写入、操作失败、四视图图表渲染和关键数值、表单 action。客户端测试使用宿主 React 元素/钩子接口的轻量替身与真实共用图表，不代表 DSH 浏览器整体验收。

## 0.2 筛选与编辑目录

computeLearning 只计算 sources 中 domain=learning 且 registered=true 的记录；未注册缓存保留在 core，但不参与指标。enabled 且同步失败的来源仍使用最后成功数据。纯计算调用也必须提供 sources 元数据，不根据 records 猜测注册状态。

options.subject 缺省 `{mode:'all'}`，也支持 `{mode:'unmapped'}` 和 `{mode:'subject',subjectRef}`；路由负责校验。先应用显式来源学科和本地映射，再按学科重算到期、复习、热力/连续、掌握和考试；单位、时区和算法不变。subject 仅计算该学科目标，不套用全局目标；unmapped 不计算目标。去重隐藏集合先按完整有效考试计算，再筛选；候选要求两端都在筛选集合中。

返回 filter 和 subjectOptions（全部本地学科、当前有效来源记录学科及手工考试引用的学科，本地名称优先；仅由手工考试保留的选项 origin=local、名称回退到学科 ID，不读取已注销来源缓存补名），以及 mappingRows、pairDetails。subjects、mappings、unmapped、localExams、goals、pairs、allExams 和来源状态不随筛选截断；plans、exams 和 candidates 随筛选重算。mappingRows 的 origin 为 source/local/unmapped，来源显式映射只读；已失效本地映射保留，active=false、editable=false。没有 sourceSubjectRef 不生成课程行。pairDetails 以完整有效考试解析两端，失效端为 null，active=false；原 pairs 保留。

新增学科和考试 ID 分别为 subject_<UUID> 和 exam_<UUID>，由 views 模块生成。mapping-set 的 target 为 existingId 或 create.name 两者之一，新建学科与映射在同一个 choices put 完成。subject-rename 也允许给有效记录中已出现的 canonical ID 补本地名称。exam-update 保持 id，引用和日期/瞬时时间类型由输入原样保留；不重建范围或去重关系。新动作成功返回 saved:true 和相应 subject、subjectId 或 exam；mapping-remove 只返回 saved:true。所有动作仍抛普通 Error，由路由返回422通用消息。
