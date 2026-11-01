# 知行 · 插件化AI助教 v0.5

请先阅读[验收报告](验收报告.md)。当前本机已升级；运行 platform/start.ps1，打开 http://127.0.0.1:3810 ，进入教师 → 资料与试点，即可查看56条原初审记录、修订课程和9份资料。网页默认离线，付费验证在独立进程完成。

## 文件

- course-packs：两门0.5.0草稿课包，各20条练习。
- human-review-working.csv / project-review.json：你提供的原初审与规范化副本。
- human-review-v05.csv / review-package.json：本次修订复审清单与内容，不含封存参考。
- materials / sources.json：补充资料、来源哈希和许可；原6份官方快照在bootstrap-v0.1来源目录。
- datasets：80条新候选，输入与分区参考分离；evaluator_private/holdout禁止放入助教或优化上下文。
- reports：自动检查、真实调用全部尝试、已知问题对比及验收JSON。
- screenshots：界面验收证据。
- baseline：改进前的源文件副本，用于本地旧算法比较。

## 重建

需要Node.js24、Python及pypdf/python-docx、已构建的DS-H（HARNESS_ROOT可指定）。源码包不包含上游运行时及其依赖。

1. node platform/scripts/upgrade-v05.mjs：备份、幂等导入初审、升级草稿、补充资料；不会批准新版本。
2. node platform/scripts/validate-v05.mjs：重建候选与开发检查，不打开封存参考。
3. node platform/scripts/record-checks.mjs：强制离线回归。
4. node platform/scripts/assemble-v05.mjs：导出报告与待审核包。

本轮真实调用已完成，不需要再次运行测试命令。密钥只在临时进程环境中使用，未保存到源码或交付包；预算账本跨进程保留，勿删除重置。尚未进行校园身份接入、真实学生试用和学习收益实验。
