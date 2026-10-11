# 三国群英传 III 重制 — 架构说明

浏览器游戏（TypeScript + Vite + PixiJS 8 WebGL + Preact DOM UI），桌面/手机/平板通用。

## 资源管线

原版素材**不随源码分发**。`pnpm extract <安装包.exe | 游戏目录>` 从你自己的安装中生成 `public/assets/`（git 忽略）：

| 原版 | 产物 | 说明 |
|---|---|---|
| `sango3.pak` → `Setting/*.ini` (Big5) | `assets/data/<Name>.json` | 通用 INI→JSON，繁→简（OpenCC）。重复 section → 数组项，重复 key → 数组 |
| `Setting/Things.obd` | `assets/data/objects.json` | 精灵对象（Sequence id → 目录 + 动画）|
| `Shape/**/*.shp` (RLE RGB565) | `assets/shape/<dir>.json` + `<dir>_N.webp` | 每个原目录一个图集；大图（≥300×300）单独 `<dir>__<name>.webp` |
| `Sound/*.wav` | `assets/sound/*.wav` | 文件名小写 |
| `MUSIC.PAK` | `assets/music/*.mp3` | ffmpeg 转码 |
| `Map/MapNNN.blk` | `assets/map/mapNNN.blk` | 野战地图（原始二进制，运行时解析）|

同一套转换代码（`src/extract/`，平台无关，只依赖 Uint8Array）有两个入口：

- **Node CLI**（`tools/extract/main.ts`）：sharp 编码 WebP，ffmpeg 转 MP3，写入 `public/assets/`。
- **浏览器导入**（`src/import/`）：线上站点不带素材，生产构建启动时若 `assets/version.json` 不存在，就显示导入界面。玩家选择自己的安装包或 PAK，由 Worker 池完成解包（fflate 解 MSZIP，大文件暂存 OPFS）、图像编码（OffscreenCanvas：图集 PNG、大图 WebP）和音乐转码（lamejs），结果写入 Cache Storage 的 `sg3-assets-v1`。`public/sw.js` 从这个缓存提供 `./assets/*`（支持音频 Range 请求），所以游戏代码不需要区分两种来源。`version.json` 最后写入，作为导入完成的标记。

SHP 格式：`"TLHS" | 0 | type(2) | 0 | colorKey | w | h | anchorX | anchorY | rowOffset[h]`，每行 `{u16 x, u16 n, u16 rgb565[n]}* 0xFFFF`（x 为绝对列）。

## 源码结构

```
src/
  main.ts                 启动；?dev=<name> 进入各模块的开发测试入口；生产构建先确保素材已导入
  extract/                原版格式解码（PAK/SHP/TGA/INI/CAB/安装包）与素材转换流程，Node 与浏览器共用
  import/                 浏览器内导入：界面 + Worker 池（worker.ts）
  engine/
    core.ts               Pixi 应用、场景栈(go/push/pop)、固定步长循环(30Hz)、fit()
    assets.ts             shapes(dir) / shape(path) / frameDataUrl / imageUrl
    anim.ts               AnimSprite：播放 Things.obd 动画（tick 驱动，事件帧回调）
    audio.ts              playMusic / sfx / unlockAudio
    view.ts               Backdrop（4:3 原图在任意宽高比下的背景）
    rng.ts
  data/db.ts              静态数据库（武将/城池/剧本/道具/兵种/武将技/军师技/阵形/官职…）
  game/
    state.ts              可存档的游戏状态 G（JSON），newGame()
    contracts.ts          百人战/单挑/野战 的接口类型
    save.ts               存档槽（localStorage）
  ui/kit.tsx              Portrait, Btn, Panel, Bar, modal/alertBox/confirmBox/chooseBox, toast
  scenes/
    title.tsx newgame.tsx registry.ts
    strategy/  内政大地图（每月指令、行动点数、AI、事件、存档）
    field/     野战（回合制格子地图，早/昏/夜三回合一天）→ 调用 battle / duel
    battle/    百人战（即时横版战斗，阵形、兵种相克、武将技）
    duel/      单挑
```

## 层间接口（src/game/contracts.ts）

- `runBattle(BattleSetup): Promise<BattleResult>` / `autoBattle()` — 百人战（1 将 vs 1 将，各带兵）
- `runDuel(DuelSetup): Promise<DuelResult>` / `autoDuel()` — 单挑
- `runWar(WarSetup): Promise<WarResult>` / `autoWar()` — 一次攻城战（野战地图）
- `runX` 用 `core.push(scene)` 压栈显示，结束后 `core.pop()` 并 resolve；`autoX` 为电脑间战斗的无画面结算。

## 约定

- 逻辑时间单位：tick（1/30 s，与原版 Things.obd 的 `#n` 延时一致）。`core.speed` 可加速。
- 坐标：原版 640×480；场景自行做自适应（宽屏显示更多战场，而不是拉伸）。
- 文本一律简体中文。
