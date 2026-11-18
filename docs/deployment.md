# 打包、安装与升级

适用版本 0.2.0。宿主 DeepSeek Harness（DSH）0.2.2-rc.2、Node ≥24；StudyHub 来源需要官方 StudyHub 4.6.0 插件。包为 `private`，不发布到 npm，从源码自行打包。

下文的占位符：

- `<DSH_HOME>`：DSH 的数据目录（含 `profiles/`）。
- `<profile>`：要安装到的 DSH profile 名称。
- `<输出目录>`：存放打包结果的任意目录。
- `<你的学习库路径>`：官方 StudyHub 学习库所在目录（其中有 `.dsh-study`）。

## 打包

在仓库根：

```sh
npm install --ignore-scripts --legacy-peer-deps --no-package-lock --no-save ical.js@2.2.1
npm pack --ignore-scripts --pack-destination <输出目录>
node scripts/check-package.mjs <输出目录>/dsh-learning-workbench-0.2.0.tgz
sha256sum <输出目录>/dsh-learning-workbench-0.2.0.tgz
```

`--legacy-peer-deps` 避免 npm 去获取 DSH 的 peer 包；`check-package.mjs` 解开包，确认只含白名单文件、带上 ical.js 及其 LICENSE、入口和模块可加载。

包内容：

- `files` 白名单：`src/core/`、`src/host/`、`src/ui/`、`src/domains/learning/`、自动加载的 `cordis.patch.yml`、`README.md`、`LICENSE`、本文件；npm 还会自动带上 `README.en.md`。
- `ical.js@2.2.1` 通过 `bundleDependencies` 完整携带（含其 MPL-2.0 LICENSE）。
- StudyHub 衍生调度公式的 MIT 许可在 `src/domains/learning/sources/studyhub/STUDYHUB-LICENSE.txt`。
- 不带示例领域、测试、数据、映射、日历或凭据；没有安装脚本。
- 宿主依赖 `@deepseek-ai/dsh-storage-domain@0.2.2-rc.2` 与 `zod@4.x` 不打包，由宿主解析。

入口为 package exports 的 `.` 与 `./client`。`dsh.bundle.patch` 引用包内 `cordis.patch.yml`，插入 id 为 `learning-workbench` 的实例，`name` 是包名而不是开发目录路径。

## 安装

1. 先停止要安装到的 DSH 实例，并备份 `<DSH_HOME>/profiles/<profile>` 整个目录（含 package.json、lockfile、cordis.patch.yml 和依赖布局）。
2. 用 DSH 自己的插件安装入口安装，不要对宿主的 node_modules 直接运行 npm：

   ```sh
   DSH_HOME=<DSH_HOME> dsh plugin --profile <profile> add <输出目录>/dsh-learning-workbench-0.2.0.tgz --ignore-scripts --config.auto-install-peers=false
   ```

   Windows PowerShell 写作 `$env:DSH_HOME='<DSH_HOME>'` 后再运行 `dsh plugin ...`。安装器会把包加入 profile 的 dependencies 和 `dsh.profile.bundles`；不要再手工 insert 第二个同名实例。
3. pnpm 可能提示缺少 `@deepseek-ai/dsh-storage-domain` / `zod` peer：运行时由宿主解析，不要为消除这条提示向宿主安装依赖。
4. 重新启动同一 profile，打开 More → 学习工作台。

手工编辑 profile 里的 JSON 时须保存为不带 BOM 的 UTF-8：DSH 的 JSON 解析会拒绝 BOM。PowerShell 5 的 `Set-Content -Encoding UTF8` 会写入 BOM，可改用 `[IO.File]::WriteAllText(path,text,(New-Object Text.UTF8Encoding($false)))`。

## 配置来源

包默认没有任何来源，也不会扫描磁盘。推荐在面板的「来源设置」里添加 StudyHub 学习库、本地 ICS 文件或远程 ICS 链接；保存只校验配置，之后点「立即同步」才读取来源。

也可以在 profile 的 `cordis.patch.yml` 里为已有实例追加配置覆盖（保留文件其他内容），作为首次启动时的初始来源：

```yaml
- id: learning-workbench
  config:
    modules:
      studyhub:
        libraryRoot: <你的学习库路径>/.dsh-study
      learning-ics:
        calendars:
          - id: course-calendar
            title: 课程日历
            path: <你的日历文件路径>/classes.ics
            timeZone: Asia/Shanghai
```

这些配置只在后端，不会发给面板。第一次在「来源设置」里保存后，工作台改用自己存储的完整设置（包括空列表和停用状态），之后修改 profile 不会再自动导入；来源设置也不会回写 profile。

StudyHub 来源要求同一实例加载了官方 StudyHub 插件，只调用固定的只读 action（`library.context`、`course.list`、`course.get`、`course.focusProgress`）并读取学习库分片，不写学习库。

## 从 0.1.1 升级

1. 停止实例，备份 profile 及工作台的 storage（storageDomain `learning_workbench`）。
2. 按上面的安装步骤安装 0.2.0 包并重启。
3. 首次启动没有持久设置，来源设置从 profile 继承，sourceId 不变；旧快照、学科、映射、每日目标、手工考试、考试范围和去重确认都保留。
4. 核对来源设置列表后再保存。保存不会自动同步，新来源默认手动刷新。

## 禁用与回滚

- **只想禁用**：从 profile 的 `dsh.profile.bundles` 移除 `dsh-learning-workbench`，并移除本插件的配置覆盖，保留包文件，重启同一实例。
- **回滚**：停止实例，先留存当前 profile 以便排查，再把安装前的备份恢复到原 profile 路径后启动。这样同时恢复原依赖、lockfile、启用列表和 patch；不要用删除宿主包代替回滚。工作台自己的缓存与设置可以保留。
- **回退到 0.1.1**：先备份当前 storage 与 profile。0.1.1 会忽略 0.2 的来源设置并按 profile 启动来源，因此不保证保留 0.2 的启停状态；要恢复旧的运行状态，使用升级前的匹配备份。

无论哪种操作，都不要删除 StudyHub 学习库或原始日历文件。

## 宿主集成测试

`tests/integration/` 是在真实 DSH 宿主上验证 0.1.1 → 0.2.0 升级的脚本，不在 `node scripts/test.mjs` 里运行，只用虚构数据。须在一个新的空目录 `<目录>` 中进行，不要指向日常使用的 DSH home：

1. `node tests/integration/prepare.mjs <目录>`：生成虚构学习库、ICS 和 profile patch（profile 名 `v02-rc1`，需先在 `<目录>/home/profiles/v02-rc1` 建好 manifest 并安装 0.1.1）。
2. 启动该 profile，运行 `node tests/integration/upgrade.mjs baseline <目录>`。
3. 停止、备份、安装 0.2.0 并重启后，运行 `node tests/integration/upgrade.mjs upgrade <目录>`。
4. 受控的远程 ICS 服务：`node tests/integration/calendar-server.mjs <目录>/data/remote.ics`（监听 127.0.0.1:3111）。
5. 再次重启后，设置 `WORKBENCH_UPGRADE_ROOT=<目录>`，运行 `node --test tests/integration/dsh-module.test.mjs`。

脚本默认访问 `http://127.0.0.1:3110`，测试实例用别的端口时设置 `WORKBENCH_ORIGIN`。

测试实例的登录值和日志可能含 Web token，不要提交到 Git。结束时按进程号停止自己启动的进程，不要按名称结束 DSH。
