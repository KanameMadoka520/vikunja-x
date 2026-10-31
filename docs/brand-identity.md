# vikunja-x 品牌素材

应用名统一为 **vikunja-x**；中文版本标识为 **-x 版**，英文为 **-x edition**。源码位于 [KanameMadoka520/vikunja-x](https://github.com/KanameMadoka520/vikunja-x)。这是独立维护的 Vikunja 分支，上游版权、AGPL-3.0-or-later 许可证和致谢保持不变；内部 API、配置键与 `v2.7.1-tcymc.N` 版本序列不因视觉更名而迁移。

## 素材与使用

- [透明 Logo PNG](../frontend/public/images/brand/logo.png)、[Logo SVG 容器](../frontend/public/images/brand/logo.svg)
- [浅色背景字标](../frontend/public/images/brand/wordmark.svg)、[深色背景字标](../frontend/public/images/brand/wordmark-dark.svg)
- [品牌头像 PNG](../frontend/public/images/brand/avatar.png)、[登录页 WebP](../frontend/public/images/brand/avatar.webp)
- [头像原图](../frontend/originalMedia/brand/avatar-source.png)、[Logo 原图](../frontend/originalMedia/brand/logo-source.png)

Logo 为蓝色交织 X 与轨道意象，代表项目、日程和助手协作。头像是原创蓝白色数字伙伴，用于项目头像、README 和登录页。它不替换用户的个人头像，也不改变阿罗娜的名称、人设或现有角色素材。导航使用 X 字标，避免人物头像与账户入口混淆。

Logo 原图为透明 PNG，SVG 文件嵌入优化后的 PNG 标识并保留文字；它不是自动描摹的纯矢量图。单色通知标识和 Safari 图标使用简化 X 路径，小尺寸更清晰。手机 maskable 图标有独立底色和安全边距。计时状态仍使用带红点的独立 favicon。

这些新品牌原图由维护者使用内置 `image_gen` 生成，不是下载的第三方游戏素材；随本仓库公开，按本仓库许可证提供维护者能够授予的使用权限。既有阿罗娜素材仍遵循其[单独来源说明](../frontend/src/assets/arona/README.md)。

## 重新生成发布尺寸

```sh
cd frontend
pnpm install --frozen-lockfile
pnpm brand:assets
```

脚本 `scripts/brand-assets.mjs` 使用锁定的 Sharp 版本从两张原图离线生成 Logo、字标、头像、ICO、PWA、Apple、Safari 与通知图标。仅调整发布尺寸、编码、图标背景和安全边距；不重新请求模型。静态图标 URL 带品牌版本标识，帮助已安装客户端识别图标更新；系统桌面仍可能按自己的周期刷新图标缓存。

## 生成方式与提示词

2026-10-31 使用内置 **image_gen**，不是 CLI/API 回退。头像为不透明方图；Logo 开启 `transparent_background: true`。完整提示词如下，便于以后复用和迭代。

### 头像

> Use case: logo-brand. Create an ORIGINAL avatar mascot for the open-source app Vikunja-X, a personal project planning app with an AI companion. A polished square anime-inspired avatar, close-up bust of a friendly and quietly capable young adult female digital assistant, icy white hair with pale sky-blue tips, a short neat bob with a small asymmetrical fringe, expressive clear blue eyes, subtle smile, clean white and navy futuristic jacket. Distinctive tiny cobalt X-shaped hair clip, an abstract orbit arc behind her, subtle geometric X motif. Palette white, cobalt #2878ff, pale cyan, tiny lavender accent. Flat elegant cel shading, restrained detail, crisp silhouette readable as 40px circular avatar. Center face in middle, keep generous safe margins for circular crop. Full-bleed pale blue background with a very subtle circular gradient. No text, no letters except the small geometric X symbol, no watermark, no animal ears, no complicated scenery. Original character, not a copy of any existing anime/game character. Professional charming calm visual identity, not childish, not glossy plastic 3D. Output one single square avatar image, not a contact sheet.

### Logo

> Use case: logo-brand. Asset: production logo icon for Vikunja-X, open-source personal project manager with an anime-inspired AI companion, blue-white visual identity. Create one beautifully restrained geometric X mark with a distinctive cut: two broad rounded diagonal ribbons crossing, one cobalt blue #2878ff, the other icy cyan-blue, a small clean negative-space diamond at their center. A very subtle short orbit arc can echo planning/time but must not clutter the X. Compact, balanced symmetrical silhouette, smooth vector-like crisp edges, mostly flat colors with only extremely subtle tonal variation. The mark occupies 70 percent of the square canvas, centered, generous padding. Must read immediately at favicon size; no thin decorative fragments. Transparent background, no white plate or backdrop, no cast shadow. No text, no wordmark, no labels, no mockup, no watermark, no multiple alternatives. Original logo, sophisticated friendly open-source product design, not a game badge, not glossy plastic. Single square logo mark only.
