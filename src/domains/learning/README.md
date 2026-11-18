# 学习领域共享入口

框架维护 module.mjs（learning 领域声明）和 records.mjs（五种公共记录类型），语义以 docs/contracts.md §7–8 为准。

- `sources/studyhub/`、`sources/ics/`：两个只读来源适配器的工厂。
- `source-settings/`：来源设置模块，唯一登记内置来源，并提供来源设置视图。
- `metrics/`、`views/`：学习指标计算和学习视图；`learning-views` 一个模块拥有本地学科、映射、目标与手工考试状态，并在模块闭包登记相关指标和显式操作。

各子目录可独立提供 module.mjs，不重复声明 learning 领域。
