# GitHub 发布指南

本次整理以 2026-11-01 的 `知行_公开源码与部署脚本.zip` 为基础，保留师兄最终版业务代码、课程种子、演示网页、使用手册与第三方说明。

仓库额外补齐旧版回归测试与导入脚本引用的 `output/pilot-v0.5/project-review.json`，来自项目已有的规范化初审文件，仍标记为项目组初审、不代表正式教师批准。两个 Release ZIP 保持师兄原件，仓库中的发布文档与这项补齐更新不会反写到原便携包。

## 源码与下载包

推荐仓库名称：`zhixing-ai-teaching-assistant`。

推荐描述：`知行：面向师生的插件化 AI 助教平台，支持课程备课、班级作业、问答辅导、教师复核与课程质量检查。`

```text
11.1/
├── zhixing-github/                  此目录的内容作为仓库根目录
├── zhixing-dsh-runtime.zip          Release 资产，约 227 MiB
└── zhixing-portable-v1.zip          Release 资产，约 238 MiB
```

保留源码内的 `.github/`、`.gitignore` 和 `.env.example` 隐藏项目。`output/` 包含课包与种子，不能整目录删除。两个大 ZIP 不提交到源码仓库；原始公开源码包留在本地归档。

## 使用脚本发布

安装 Git、GitHub CLI、Python 和 PowerShell 7。由账号本人完成 `gh auth login`，在 `zhixing-github/` 根目录运行：

```powershell
# 本地检查源码、配套包和哈希，不创建仓库或上传
pwsh -NoProfile -File deploy/publish-github.ps1 -CheckOnly

# 创建当前登录账号下的公共仓库、推送源码并发布下载包
pwsh -NoProfile -File deploy/publish-github.ps1 -RepositoryName zhixing-ai-teaching-assistant
```

脚本默认从源码目录的上一级查找两个大 ZIP。目录不同时使用 `-AssetsDirectory 'D:\path\to\assets'`。先检查两个包，再执行网络写入；不覆盖同名 Release 资产。

脚本会创建公共仓库，请在决定公开后执行。目标仓库如已存在而本地未绑定，脚本会停止；更新已有仓库时，先核对并绑定正确的 `origin`，不要强制推送。

若 Git 提示缺少作者身份，请配置自己的 `git config user.name` 和 `git config user.email` 后重试。

## 手动上传

1. 在 GitHub 新建仓库，上传 `zhixing-github/` 内的文件与目录。使用 Git 提交可保留隐藏文件；ZIP 文件本身不会自动展开成仓库源码。
2. 进入 Releases，创建标签 **`runtime-v0.8`**。
3. 上传 **`zhixing-dsh-runtime.zip`** 和 **`zhixing-portable-v1.zip`**，名称保持一致。该标签供依赖下载脚本使用，便携包界面仍是前端易用版 v1。
4. Release 标题可填写“知行 v1：完整便携包与 DS-H 运行依赖”。依赖包供克隆源码使用，便携包包含运行依赖；系统运行环境需自行安装。

## 启用在线演示

1. Settings → Pages → Build and deployment → Source 选择 **GitHub Actions**。
2. Actions → **Publish browser demo to Pages** → **Run workflow**，选择已推送的分支运行。
3. 工作流完成后，从 Pages 设置页或部署结果复制链接，填入仓库 About 的 Website。

工作流只部署 `web/`。完整平台的账号、数据库、模型调用和 Docker 执行需要独立后端。

## 发布后检查

- 仓库首页能显示项目说明和教师工作台截图。
- Release 中两个文件名称与标签正确，克隆后的 `prepare-runtime.ps1` 能下载并通过哈希校验。
- Pages 首页、三种角色演示及使用手册可以打开。
- 新部署运行在 `http://127.0.0.1:4180/`，首次要求初始化管理员。

这次整理没有替项目指定开源许可证；项目及第三方许可见根目录 `THIRD_PARTY_NOTICES.md`。
