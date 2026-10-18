# Storyboard · 视频内容编排器

一个本地网页小工具：在表格里按出场顺序编排视频素材（图片 / 视频 / 音频 / 网址 / 纯文字），一键导出结构化编排文档，交给任意 AI / Coding Agent 作为视频生成过程中的内容编排指导。

**零依赖、无构建、无后端**——双击 `index.html` 即可使用。

## 快速开始

```bash
open index.html   # 或在浏览器里直接打开这个文件
```

## 使用方法

1. **表头**：填视频标题（用作导出文件名）和全局说明（观众 / 风格 / 总时长 / 画幅 / 配乐等）。
2. **表格**：一行一个素材，按出场顺序从上到下排列。
   - **媒体列**：填本地绝对路径（如 `/Users/you/Movies/clip.mp4`）或网址；也可以「文件…」选择或直接拖入文件用于预览——受浏览器安全限制，拖入只能拿到文件名，完整路径请粘贴补全。
   - **描述列**：写给 Agent 看的说明——这段素材是什么、怎么用、叠加什么文字、建议时长等。
   - **只填描述、不填媒体的行**会作为「文字卡」导出（适合标题卡、结尾卡）。
   - 行支持上移 / 下移 / 插入 / 删除；序号自动重排。
3. **导出**：点 `Markdown`（默认，对 Agent 最友好）/ `JSON` / `XML`，得到编排单文件，喂给下游 Coding Agent。
4. **工程文件**：「保存工程」导出 `.storyboard.json` 全量备份，可跨机器「载入工程」恢复。页面内容还会自动存入 localStorage，刷新不丢。

## 导出格式样例

同一份编排（标题卡视频 + 本地图片 + 纯文字结尾卡）的三种导出形态：

### Markdown（默认）

```markdown
# 视频内容编排单：卡卡产品演示

> 本文件是视频生成的内容编排指导：请按素材序号顺序编排成片，结合各段描述与全局说明执行；描述中的文字、时长等要求应体现在成片里。

- 导出时间：2026-10-18 15:00
- 素材数量：3（按出场顺序）

## 全局说明

观众为潜在用户；风格轻松明快；总长约 60 秒。

## 素材清单

### 1. 视频 /Users/you/Movies/demo.mp4

开箱画面，截前 10 秒，配旁白介绍外观。

### 2. 图片 /Users/you/Pictures/spec.png

参数表全屏 5 秒，文字逐条浮现。

### 3. 文字

结尾卡：“现已在 GitHub 开源”，停留 3 秒淡出。
```

### JSON

```json
{
  "format": "storyboard-export",
  "version": 1,
  "title": "卡卡产品演示",
  "exportedAt": "2026-10-18 15:00",
  "instruction": "本文件是视频生成的内容编排指导：请按素材序号顺序编排成片，结合各段描述与全局说明执行；描述中的文字、时长等要求应体现在成片里。",
  "globalNotes": "观众为潜在用户；风格轻松明快；总长约 60 秒。",
  "items": [
    { "index": 1, "type": "video", "typeLabel": "视频", "src": "/Users/you/Movies/demo.mp4", "note": "开箱画面，截前 10 秒，配旁白介绍外观。" },
    { "index": 2, "type": "image", "typeLabel": "图片", "src": "/Users/you/Pictures/spec.png", "note": "参数表全屏 5 秒，文字逐条浮现。" },
    { "index": 3, "type": "text", "typeLabel": "文字", "src": "", "note": "结尾卡：\"现已在 GitHub 开源\"，停留 3 秒淡出。" }
  ]
}
```

### XML

```xml
<?xml version="1.0" encoding="UTF-8"?>
<storyboard title="卡卡产品演示" exportedAt="2026-10-18 15:00" count="3">
  <instruction>…同上…</instruction>
  <globalNotes>观众为潜在用户；风格轻松明快；总长约 60 秒。</globalNotes>
  <item index="1" type="video" src="/Users/you/Movies/demo.mp4">
    <note>开箱画面，截前 10 秒，配旁白介绍外观。</note>
  </item>
  <item index="2" type="image" src="/Users/you/Pictures/spec.png">
    <note>参数表全屏 5 秒，文字逐条浮现。</note>
  </item>
  <item index="3" type="text">
    <note>结尾卡："现已在 GitHub 开源"，停留 3 秒淡出。</note>
  </item>
</storyboard>
```

## 设计说明

- **导出是通用的 Agent 文档**：不绑定任何特定技能或渲染管线，序号即出场顺序，描述原样多行保留。
- **媒体类型自动识别**：按扩展名识别 视频 / 图片 / 音频，网址无扩展名时为 链接；无媒体只填描述的行为 文字。
- **导出会跳过完全空行**，并对保留行重新连续编号。
- **预览尽力而为**：拖入 / 选择的文件用内存预览；手填路径时仅当页面以 `file://` 打开才尝试加载本地文件，失败则显示类型图标。
- 导出逻辑是与 DOM 解耦的纯函数（`toMarkdown / toJSON / toXML`），可在 Node 里直接测试：

```bash
node -e "console.log(require('./app.js').toMarkdown({title:'t',globalNotes:'',items:[{src:'/a.mp4',note:'x'}]}))"
```

## 目录结构

```
storyboard/
├── index.html   # 页面骨架
├── style.css    # 样式
├── app.js       # 状态、渲染、交互与三种导出
└── README.md
```
