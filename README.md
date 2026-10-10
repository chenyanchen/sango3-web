# 三国群英传 III · 重制版

宇峻奥汀《三国群英传3》（2002）的现代复刻：浏览器运行，**Windows / macOS / Linux / iPhone / iPad / Android 全平台可玩**。

- 原版全部数据（武将、城池、剧本、武将技、兵种、阵形、道具、事件）与美术、音乐直接取自你自己的游戏安装，**数值与原版一致**。
- 渲染：WebGL（PixiJS 8）+ 图集批量绘制，60 帧以上；高 DPI 清晰显示；宽屏显示更多战场而不是拉伸。
- 界面：可缩放的高清中文界面（原版为 640×480 位图字），鼠标 / 键盘 / 触屏均可操作。
- 繁体原版文本自动转换为简体。
- 存档在浏览器本地（10 个存档位 + 每月自动存档）。

## 快速开始

需要 Node.js ≥ 22、pnpm；转码音乐需要 `ffmpeg`（没有则保留 WAV）。安装包解包为纯 TypeScript 实现，无需其他工具。

```bash
pnpm install
# 1) 从你的原版资源生成游戏素材（只需一次，约 30 秒）
#    参数可以是合集安装包 .exe，或已安装的游戏目录（含 sango3.pak / MUSIC.PAK）
pnpm extract ~/Downloads/sgqyc_35612/三国群英传3合集.exe
# 2) 开始游戏
pnpm dev            # 打开 http://localhost:5173
```

### 在手机 / 平板上玩

`pnpm dev` 会同时监听局域网地址（终端里显示的 `Network: http://192.168.x.x:5173`）。手机连同一个 Wi-Fi，用浏览器打开即可；横屏游玩，可“添加到主屏幕”以全屏运行。

### 打包发布（静态网站）

```bash
pnpm build          # 产物在 dist/（含 assets，可放到任何静态服务器 / NAS）
pnpm preview --host
```

生产构建带 Service Worker，素材首次加载后离线缓存，之后秒开。

## 开发

- 架构说明见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)。
- 各模块的独立测试入口：`/?dev=battle`、`/?dev=duel`、`/?dev=field`、`/?dev=strategy`。
- 截图自检：`pnpm shot "/?dev=battle" out.png`（需要 dev server 在跑）。
- 类型检查：`pnpm typecheck`。

## 版权

本仓库只包含重制的程序代码。游戏素材版权归宇峻奥汀所有，由 `pnpm extract` 从你合法持有的游戏中本地生成，不随代码分发。
