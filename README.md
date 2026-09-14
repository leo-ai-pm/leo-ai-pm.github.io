# Leo 的 AI 日报

网页地址：[https://leo-ai-pm.github.io/](https://leo-ai-pm.github.io/)。访客无需登录。

这里部署 Leo 日报的阅读页面和公开资讯摘要。界面、旋转封面、栏目筛选和手机主屏幕功能沿用原日报。可复用的演示框架在 [ai-daily-framework](https://github.com/leo-ai-pm/ai-daily-framework)。

GitHub Actions 计划每 15 分钟检查热点与创作者内容，产品研究每小时检查。任务排队和来源故障可能造成延迟；页面显示最近检查时间。读取失败时保留上次内容，外部原文是否可访问取决于原网站。

连接配置保存在仓库的 `NEWS_SOURCES_JSON` Secret 中，不进入公开文件。网页只读取本域名下的图片和 JSON。没有 ChatGPT 登录依赖，也不从原 ChatGPT 站点加载数据。

发布目录为 `public/`，Pages 的发布来源为 GitHub Actions。`Update and publish daily` 工作流支持手动运行；运行结果在 Actions 页面查看。GitHub 可能暂停长期无仓库活动的定时工作流，也可能调整免费服务规则，不能保证永久无故障。

文章、头像及商标用于来源识别，权利归各自作者或机构。这里只保留标题、短摘要和原文链接。
