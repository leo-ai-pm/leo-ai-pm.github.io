# Leo 的 AI 日报

网页地址：[https://leo-ai-pm.github.io/](https://leo-ai-pm.github.io/)。访客无需登录。

这里部署 Leo 日报的阅读页面和公开资讯摘要。界面、旋转封面、栏目筛选和手机主屏幕功能沿用原日报。可复用的演示框架在 [ai-daily-framework](https://github.com/leo-ai-pm/ai-daily-framework)。

GitHub Actions 的 cron 写的是每 15 分钟（`7,22,37,52 * * * *`）。仓库里实际创建的 schedule 运行间隔中位数大约 3.8 小时，最近两个月最短也有 1.9 小时，而且运行记录里几乎没有被 concurrency 取消的排队。单次任务本身大约一分钟就结束。延迟发生在 GitHub 创建 schedule 运行之前，属于 Actions 定时调度的已知限制，不是“内容没变所以不提交”，也不是工作流把自己推上去之后互相堵住。因此没有改 cron。页面显示最近一次成功检查的时间；某个 AIHOT 接口失败时，其余栏目仍用上次内容。

连接配置保存在仓库的 `NEWS_SOURCES_JSON` Secret 中，不进入公开文件。这个 Secret 继续只提供 `hot.baseUrl`、`hot.people`、`creators` 和 `research`，改版不要求修改它。关注方向、分类和 AIHOT 页面链接在 `scripts/aihot-config.json`，可以直接改 `watchTopics`。若 Secret 里另外带了 `hot.watchTopics`，会覆盖文件里的名单。网页只读取本域名下的图片和 JSON。没有 ChatGPT 登录依赖，也不从原 ChatGPT 站点加载数据。

公开页面只保留 AIHOT 的标题、一句话摘要或推荐理由、来源和回链，不保存正文。事件链接同时接受 `aihot.news` 和 `aihot.virxact.com`。条目没有发布时间或摘要时，改用 AIHOT 的收录时间，并仍然留下这一条。

发布目录为 `public/`，Pages 的发布来源为 GitHub Actions。`Update and publish daily` 工作流支持手动运行；运行结果在 Actions 页面查看。GitHub 可能暂停长期无仓库活动的定时工作流，也可能调整免费服务规则，不能保证永久无故障。

文章、头像及商标用于来源识别，权利归各自作者或机构。这里只保留标题、短摘要和原文链接。
