# 分块编辑态（focus view）调研

> 目的：把「像 Typora」从「光标进去就露源码」这一条粗规则，细化为**按块型给出不同编辑视图**的模型。
> 调研日期：2026-10-23。对应差距项：`typora-parity.md` §3.2 第 9 条。
>
> 证据来源：
> 1. 官方文档（`support.typora.io` 本机不可直连，经其镜像 `support.typoraio.cn` 取正文）：
>    Markdown Reference、Table Editing、Code Fences、Math and Academic Functions、Images in Typora、Draw Diagrams With Markdown。
> 2. Typora 官方主题工具包的 DOM 约定（`typora/typora-theme-toolkit` 的 `template.less`）：`.md-focus`、`.md-table-edit`、
>    `.md-diagram-panel`、`.md-rawblock`、`.md-meta-block`、`.md-toc-tooltip`、`.md-def-link`、`.md-def-footnote`。
> 3. Typora issue 中的真实 DOM 片段（标题编辑态 `mdlike="h2"`、`.md-block-like`）。
>
> 标「待实机」的格子是文档与 DOM 推断不出的细节，需要用 Typora 1.13 实际操作确认。

---

## 一、一句话结论

Typora 不是「聚焦就把这块退回 Markdown 源码」，而是**块的身份不变，只换它周围的编辑视图（chrome）**：

- **表格**聚焦 → 还是表格，上面多一条表格工具条；源码根本不出现。
- **代码块**聚焦 → 还是同一块高亮代码，右下角多出语言控件；围栏行不占正文。
- **公式块**聚焦 → 变成带 ✓ 的 TeX 输入区；离开后只剩公式。
- **图表**聚焦 → 源码 + 下方实时预览面板并存，边写边看。
- **图片**聚焦 → 原位展开成 `![alt](src)`；离开恢复。
- **标题**聚焦 → 按段落字号显示并露出 `#`（编辑时字号不跳）。
- **行内元素** → 只有光标触到的那个 span 展开，不是整行。

一句话：**源码是行内元素与「原始块」的编辑态，不是所有块的编辑态。**

---

## 二、分块矩阵（失焦态 → 聚焦态）

| 块型 | 失焦（阅读态） | 聚焦（编辑态） | 焦点粒度 | 退出 | 编辑期附带的 UI |
| --- | --- | --- | --- | --- | --- |
| 段落 | 正文 | 正文（无变化） | — | — | — |
| 标题 | 按层级排版 | **降级成段落字号** + 露出 `#` 标记 | 块（整行） | 移出该行 | — |
| 粗体 / 斜体 / 删除线 / 高亮 / 行内代码 / 上下标 | 只有字形 | 只展开**被触到的那个 span** 的标记 | **span** | 光标离开该 span | — |
| 链接 | 蓝色文字 | 展开成 `[文字](地址)` 全貌 | span | 离开 | ⌘/Ctrl + 单击打开；右键链接工具 |
| 行内公式 | KaTeX | 展开成 `$…$` | span | 离开 | 输入 `$` 后按 Esc 出预览浮层 |
| 块级公式 | KaTeX 居中 | **TeX 源码输入区**（不是普通正文行） | 块 | ↑/↓ 到边界、⌘/Ctrl + Enter、点 ✓、点别处 | rawblock 工具条（复制等）+ ✓ |
| 围栏代码块 | 带底色 + 语法高亮的代码，**不显示围栏行** | 仍是同一块高亮代码，**不换排版** | 块 | 移出 | 右下角语言选择器；悬停/聚焦出现复制等动作 |
| 表格 | 真表格 | **仍是真表格** + 表头上方表格工具条 | 单元格 | 移出表格 | 行列数、对齐、删除、拖拽移动行列；Tab 加行 |
| 图表（mermaid / sequence / flow） | 渲染后的图 | **源码 + 下方实时预览面板** | 块 | 移出 | 面板内可缩放/存图；右键存 SVG/PNG/JPG 或复制 |
| 图片 | `<img>` | 原位展开成 `![alt](src)` | 图片节点 | 移出 | 右键图片工具（删除/移动/复制/重命名） |
| 任务列表 | 可点的方框 | 方框 + 展开 `[ ]` / `[x]` | 行 | 离开 | — |
| 引用 | 左边竖条 | 露出 `>` | 块 | 离开 | — |
| 无序/有序列表 | 圆点 / 序号 | 露出 `-` / `1.` | 块 | 离开 | — |
| 水平线 | 一条线 | 露出 `***` | 块 | 离开 | — |
| TOC | 渲染后的目录 | 露出 `[toc]` + 目录上方小工具条（`.md-toc-tooltip`） | 块 | 离开 | 待实机：工具条具体动作 |
| YAML Front Matter | 元信息样式块（`pre.md-meta-block`） | 元信息样式块；源码只在源代码模式改 | 块 | — | — |
| HTML 块 | 渲染结果（iframe / video / div） | **rawblock**：带小工具条的源码输入区（`.md-rawblock-input`） | 块 | 离开 | 工具条（复制等） |
| 脚注定义 / 链接引用定义 | 弱化的一行 | 弱化的一行（不隐藏，避免留洞） | 行 | — | — |
| 跨块选区 | — | 选区覆盖的块展开源码 | 选区 | 取消选区 | 待实机确认（表格是否也展开） |

### 三个容易被忽略的细节

1. **标题编辑时字号会被压成段落**（issue 里的 DOM 是 `<p class="md-focus" mdlike="h2">`）。
   目的不是好看，而是**不让光标所在的块在编辑时整体跳动**——布局稳定优先于「看起来像标题」。
2. **表格工具条是「焦点驱动」的**：官方原话是「Put the cursor inside a table and a table tooltip will show above the
   table header」，不是悬停出现。工具条上直接给行列数（可输入数字）、对齐、删除；Tab 键加行。
3. **公式块的编辑态有明确的键盘契约**：官方原话是「In input mode, use the Up/Down arrow keys or Command/Ctrl + Return
   key to finish editing, or just click the ✓ button, or somewhere else」。✓ 是「结束编辑」而不是「保存」。

---

## 三、从矩阵里抽出的六条规律

1. **块身份不变，只换 chrome。** 表格聚焦仍是表格，代码聚焦仍是代码。没有「一聚焦整块变源码」这种跳变。
2. **焦点粒度只有两级**：行内元素按 **span**，块级标记按 **block**。混用会同时犯两种错——
   整行展开（`**粗**` 的同桌 `##`、链接、脚注全露）与整块展开（表格、公式消失）。
3. **编辑态必须能就地完成编辑**，不需要退回源码才能改。源码只是「继续用 Markdown 手写」的逃生舱。
4. **逃生舱要显式**：全局源代码模式（`Ctrl+/`）、右键、菜单项。不靠「碰一下就露源码」赌用户会。
5. **编辑态不改变排版度量**：标题降成段落字号、围栏行不显示、块高度稳定。
   Typora 为此宁可牺牲「编辑时也像标题」，因为**光标跳字号的观感远差于「不像标题」**。
6. **每个编辑态都有键盘契约**：怎么进、怎么退（↑/↓ 到边界、⌘/Ctrl+Enter、Esc、点别处）、
   块内怎么导航（表格 Tab / Shift+Tab、代码块 Tab 缩进）。

---

## 四、Writara 现状 ↔ 目标

现状的两条总规则（`analyze.ts` + 四个块级 StateField）：

- 行内：`touchesLine(doc, from, to, selection)` —— **选区与该行相交，就露出这一行所有隐藏标记**。
- 块级：`overlapsSelection(state, from, to)`（表格 / 公式 / Mermaid / SVG / TOC 各抄了一份）——
  **光标进入块的任意一行，整块的 replace 装饰消失，退回源码。**

| 块型 | 现在 | Typora | 差距 |
| --- | --- | --- | --- |
| 行内格式 | 整行一起展开 | 只展开被触到的 span | **大**（噪声大，光标移动时整行字宽跳动） |
| 标题 | 整行露 `#`，字号不降 | 露 `#` 且编辑态降为段落字号 | 中 |
| 表格 | 聚焦整表消失，只剩源码；点单元格落点已能映射 | 表格常驻 + 工具条 + 单元格编辑 | **大** |
| 围栏代码块 | 围栏行常显（右对齐），语言名换成 badge | 围栏不显示；语言控件在右下；代码块排版不变 | 中 |
| 块级公式 | 聚焦整块消失，退回 `$$…$$` 纯文本 | 源码输入区 + 工具条 + ✓，离开即渲染 | **大** |
| Mermaid / 图表 | 聚焦整块消失 | 源码 + 下方实时预览面板并存 | **大** |
| 图片 | 行级展开 `![]()` | 节点级展开；右键图片工具 | 中 |
| HTML 块 | 编辑器里就是源码（不渲染） | 渲染；聚焦变 rawblock 源码输入区 | **大** |
| SVG 独立块 | 聚焦整块消失（同块级规则） | 无对应能力（Typora 只当 HTML） | 自定 |
| TOC | 聚焦退回 `[toc]` | 目录 + 工具条 | 小 |
| YAML Front Matter | 弱化行（已是源码） | 元信息样式块，源码在源代码模式改 | 小 |
| 脚注 / 链接引用定义 | 弱化行、不隐藏 | 同 | 一致 |
| 块级标记（`>`、`-`、`---`） | 按行展开 | 按块展开 | 小 |

> 结论：现有实现把「只有行内元素该有的行为」推广到了所有块，于是**块级内容越复杂，体验越差**。
> 表格与公式是最明显的两处：它们恰好是最需要「编辑态保持结构」的块。

---

## 五、目标模型（CodeMirror 6 落地）

### 5.1 焦点判定：只留两级

新增 `src/editor/live-preview/focus.ts`，作为**唯一**的焦点判定入口，替掉四个块文件里各抄一份的 `overlapsSelection`：

```ts
/** 行内元素：光标/选区触到这个节点就展开（含边界）。 */
export function spanTouched(node: { from: number; to: number }, ranges: readonly Span[]): boolean {
  return ranges.some((r) => r.from <= node.to && r.to >= node.from);
}

/** 块级标记：光标在这个块里就展开（整块共享一个编辑态）。 */
export function blockTouched(state: EditorState, from: number, to: number): boolean {
  const first = state.doc.lineAt(from).from;
  const last = state.doc.lineAt(to).to;
  return state.selection.ranges.some((r) => r.from <= last && r.to >= first);
}
```

规则：

- `HIDDEN_MARKS`（强调 / 链接 / 行内代码 / 高亮 / 上下标 / 数学标记）与小部件（emoji、脚注、行内公式、图片）
  一律换成 `spanTouched`（按**标记所属的那个 span** 判定，不是按标记自身）。
- 块级标记（`HeaderMark`、`QuoteMark`、`ListMark`、`TaskMarker`、`CodeInfo`、围栏、`HorizontalRule`）用 `blockTouched`。
- **含边界**：图片 / 行内公式这类原子 widget 只有一个光标位置，点击只能落在节点的 from / to 上；
  边界不算就会「点进去却改不了」。真正的实现见 `live-preview/focus.ts`。
- 选区是范围时按交集算（跨 span 选择要能看到被选中的源码）。

预期效果：一行 `## **粗**与[链](x)` 里光标落在「粗」上，只出现 `**`，`##` 与链接保持渲染态。

### 5.2 每类块的编辑态

**表格（最难，先做保守版）**

| 方案 | 做法 | 取舍 |
| --- | --- | --- |
| **A（推荐，P0）** | 表格 widget 常驻 + 工具条；单击单元格把 CM 光标放到该格源码，同时在该格上叠一个浮层输入框；Enter/Tab 提交为**一次** transaction | 不碰 widget 内部 DOM；IME / 撤销 / 输入法全走 CM；代价是浮层要自己定位与收尾 |
| B（P2） | 单元格内直接 contenteditable，逐格同步回源码 | 观感最像 Typora；但撤销粒度、IME、跨格选区全是坑，不建议先做 |
| C（现状） | 聚焦整表退回源码 | 结构丢失，改一格要面对整张表的管道符 |

浮层提交复用 `src/markdown/table-edit.ts` 的纯变换（`TableTarget → TableChange`），
工具条直接接 `src/editor/table-menu.ts` 已有命令：插入/删除行列、对齐、删表；Tab/Shift+Tab 换格，⌘/Ctrl+Enter 下方加行。
**「看源码」应改为显式动作**（P2：右键 → 编辑表格源码），用 `StateEffect` 让某块进入 source 模式，而不是聚焦默认；
P0 先用「程序化选区进入表内」这条兜底（搜索跳转、逐字选择时源码可见）。

**块级公式**

- 聚焦：不做 replace；块内行加 `cm-md-math-edit`（等宽 + 左侧色条，`$$` 行弱化），块末尾挂一个 preview widget（KaTeX 同步渲染，靠 `updateDOM` 就地换公式）。
- 退出：↑ 在第一行 / ↓ 在最后一行由 CodeMirror 默认移出；⌘/Ctrl+Enter、Esc 显式移出；✓ 按钮 = 把选区 dispatch 到块后。
- 预览 widget 必须进高度表（别用 absolute 定位），`estimatedHeight` 取偏小值（沿用已有约定）。

**图表（Mermaid / sequence / flow）**

- 聚焦：源码 + 下方 `cm-md-diagram-panel` 预览；失焦：只留图。
- 复用 `export/mermaid.ts` 与 `refreshPreviewEffect`；聚焦时 debounce 300ms 重渲染，错误只显示在面板里（`suppressErrorRendering` 保持不变）。

**围栏代码块**

- 失焦：围栏行文本用 replace 换成空小部件，**保留行盒高度**（别用 CSS 隐藏，否则高度表坏、滚动会缩）。
- 聚焦：露出围栏行（或保留右下角 badge，点开语言菜单）+ 工具条（语言 / 复制 / 行号）。
- 代码本身的字号、行高不变（`consistency.test.ts` 已有约束）。

**图片**

- 节点级展开：`spanFocused(image)` 时露 `![alt](src)`，离开恢复。
- 「已选中但未编辑」的浮条（尺寸 25% / 50% / 100%、替换、复制路径）放 P2，用 fixed 定位叠层，不进高度表。

**HTML 块**

- 失焦渲染（与打印同一条 `sanitize` 管线）；聚焦变 rawblock：源码行 + 顶部工具条。
- iframe / video 的白名单单独定，P3 再开；`script` 永远不执行。

**TOC / Front Matter / 定义类**

- TOC：失焦渲染目录；聚焦露 `[toc]` + 工具条（刷新 / 移除）。
- Front Matter：保持 `cm-md-frontmatter` 弱化块，可选折叠摘要（title / date / tags），P3。
- 脚注定义、链接引用定义：保持「弱化但不隐藏」（隐藏会留一个洞，已有结论）。

### 5.3 交互契约（要写进实现与测试）

| 场景 | 进入 | 退出 | 块内导航 |
| --- | --- | --- | --- |
| 普通块 | 点 / 方向键 | 点别处 | — |
| 表格 | 单击单元格 | Esc / 点表格外 | Tab、Shift+Tab、⌘/Ctrl+Enter |
| 公式块 | 点源码区 | ↑↓ 到边界、⌘/Ctrl+Enter、Esc、✓ | 行内正常编辑 |
| 图表 | 点源码区 | 点图外 | 行内正常编辑 |
| 代码块 | 点 / ↓ | ↑↓ 到边界 | Tab 缩进、⌘/Ctrl+A 选中整块 |
| 图片 | 点图片 | 移出 | — |

### 5.4 与两条管线的关系

- 这轮只改**编辑器视图**，`render.ts` / 打印 / 导出不动；编辑态样式绝不进打印（打印只认 `renderArticle`）。
- 但要守住「屏幕与纸面同版式」：块编辑态的行高 == 正文行高，`consistency.test.ts` 加一条比对。

### 5.5 约束与性能（都是已有结论，别踩回去）

- 块级装饰只能来自 `StateField`（`ViewPlugin` 会抛错）。
- 只分析 `visibleRanges`；焦点判定不得引入全文扫描（SVG 的「无 `<svg` 零开销」必须保住）。
- 组合期（`view.composing`）不重建装饰；浮层提交只在 `compositionend` 之后。
- 新加的工具条 / 浮层一律 `position: fixed` 叠加层，不进 CodeMirror 高度表。
- 表格 / 公式的 HTML 或 KaTeX 结果按块位置缓存，selection 变化时只重建受影响的块。

### 5.6 两个边界

- **表格单元格里的行内标记**：渲染态由 `renderInlineMarkdown` 负责（已经支持 `**` / 链接）。
  浮层编辑时是纯文本，不再渲染——这是可接受的取舍，但要保证「提交前后单元格内容一致」有测试。
- **跨块选区**：选区从段落拖进表格时，按 §5.1 的 `blockFocused` 表格会进入编辑态。
  Typora 这里到底是「展开源码」还是「保持表格」待实机确认；建议先保持表格，避免大范围选区把整表替换掉导致滚动跳。

---

## 六、分期

| 期 | 范围 | 主要文件 | 能否单测 |
| --- | --- | --- | --- |
| **P0 ✅** | 行内 span 级展开；表格「聚焦不再消失」+ 最小工具条；围栏失焦折叠 | `focus.ts`（新）、`analyze.ts`、`table-blocks.ts`、`table-focus.ts`（新）、`language-widget.ts`、`theme.ts` | 能（`analyze.test.ts` / `view.test.ts`） |
| **P1 ✅** | 公式块编辑态（源码 + 预览 + ✓）；Mermaid 源码 + 预览面板；键盘契约 | `block-edit.ts`（新）、`math-blocks.ts`、`mermaid-blocks.ts`、`math-widget.ts`、`modes.ts`、`theme.ts` | 能（jsdom 验装饰与面板，渲染细节靠 Electron） |
| **P2 ✅** | 表格单元格浮层编辑（Tab/Enter/撤销粒度）；图片浮条；HTML rawblock | `table-blocks.ts`、`table-edit.ts`、`image-widget.ts`、`html-blocks.ts`（新） | 浮层交互靠 Electron，变换逻辑可单测 |
| **P3 ✅** | TOC 工具条；Front Matter 摘要；跨块选区策略；SVG 编辑态 | `toc-blocks.ts`、`svg-blocks.ts`、`theme.ts` | 能 |

P0 之所以先做行内 + 表格：一处是噪声最大的，一处是结构丢失最严重的，而且都不需要新的交互层。

### P0 落地记录（2026-10-23）

- `live-preview/focus.ts`：新增 `spanTouched` / `blockTouched` / `linesTouched`，四个块文件不再各写一份 `overlapsSelection`。
- `analyze.ts`：行内标记（强调 / 链接 / 行内代码 / 高亮 / 上下标 / emoji / 脚注 / 行内公式 / 图片）改为
  **按所属 span** 判定；标题 `#`、引用 `>`、列表符号、任务框、围栏仍按块/行判定。
- 表格：`table-blocks.ts` 常驻渲染态；单击单元格叠输入框编辑（Enter/Tab 提交、Esc 取消、竖线自动转义）；
  表头上方悬浮工具条（对齐 / 增删行列 / 删表），命令复用 `markdown/table-edit.ts`；
  `table-focus.ts` 记住当前格，右键菜单按它定位。
- 围栏：原先 ``` 与语言名**已经**被 `CodeMark` / `CodeInfo` 隐藏，缺的只是视觉——补成
  「空白行盒 + 代码底色 + 上下圆角」，闭合围栏行也加类；行高不变（`editing-bugs.md` #22）。
- 未做（留 P2）：Tab 连跳下一格（现在 Tab 是提交并退出）；表格源码入口（右键菜单已有结构命令，
  但「编辑整表源码」还没有显式开关）。
- 已知边界：程序化把选区送进表内（搜索跳转、逐字选择）时仍退回源码——块级 replace 里放不下光标，
  否则光标会「看不见」。

### P1 落地记录（2026-10-23）

- `live-preview/block-edit.ts`：`exitBlock`、`blockEditingKeys`（`Prec.high` 的 Mod-Enter / Esc，
  不在块里返回 false）、`createPreviewPanel`（标题 / 状态 / ✓ / 内容区，纵向只用 padding）。
- 公式块：编辑态不再 replace 整块——源码留在原位（`$$` 行弱化，TeX 行等宽 + 左侧色条），
  块末尾挂 `MathPreviewWidget`；TeX 每变一次走 `updateDOM` 就地重渲染，不重建面板。
  文档末尾的块在 ✓ 时会补一个换行：光标需要一个真正「块外」的位置，否则块仍算被聚焦。
- Mermaid：编辑态 = 源码（已有的代码块样式）+ 块后 `MermaidPreviewWidget`；300ms 防抖，
  改的时候保留上一版 SVG（只降透明度 + 状态字），渲染完成 `requestMeasure`。
  点击图表进入编辑态时把光标放到**代码首行**，不是围栏行——否则 ``` 会露出来。
- 键位：`Mod-Enter` / `Esc` 退出；↑/↓ 到边界照旧直接移出（CodeMirror 默认行为）。
- 未做（留 P2）：面板内的存图 / 缩放（Typora 右键存 SVG/PNG）；TeX 源码的 LaTeX 语法高亮。
  公式自动编号已做（「Markdown → 公式 → 自动编号」）；`\label` / `\ref` 交叉引用仍未做。

### P2 落地记录（2026-10-23）

- 表格 **Tab 连跳**：`Tab` / `Shift+Tab` 按阅读顺序换格（表头 → 正文各行，分隔行不参与）；
  末格 `Tab` 追加一行再进新行第一格；首格 `Shift+Tab` 提交并退出。
  换格时先记下目标格（`table-focus.ts` 的 `PendingTableCell`）再提交：提交会重建 widget，
  由新 widget 取走并重新打开输入框；文档没变（widget 不重建）时直接在当前 DOM 上换格。
- 空单元格：`|  |  |  |` 在语法树里**不生成 TableCell 节点**，原来渲染成一行没有格子的 `<tr>`，
  也点不进去。`readTable` 按表头列数补齐；`table-blocks` 的单元格区间在列数不足时
  改用「两个 `|` 之间」的位置（一样准）。
- 图片浮条（`image-toolbar.ts`）：光标触到图片（源码露出的时刻）在图片上方浮出
  `25% / 50% / 75% / 100% / 原始 / 复制路径`；尺寸按**正文宽度**换算成 `=宽`，
  与打印栏宽一致。带 `title` 的图片只给复制路径——尺寸语法与标题互斥。
- HTML 块（`html-blocks.ts`）：失焦渲染（与打印同一条 `sanitizeHtml`）；聚焦变源码 + 块后实时预览；
  独立 `<svg>` 交给 `svg-blocks.ts`；清洗后为空（例如只有 `<script>`）保留源码，不制造空块。
- 修掉三个「功能写了却像没做」的 bug：
  1. 图片浮条在 `update()` 里同步读布局（`coordsAtPos` / `getBoundingClientRect`），
     CodeMirror 抛 `Reading the editor layout isn't allowed during an update` 并**销毁插件**，
     浮条只出现一次。改为在更新周期外定位；用 `setTimeout` 而非 `requestAnimationFrame`——
     窗口被遮挡时 Chromium 会把 rAF 完全暂停（实测 400ms 内一次都不触发）。
  2. `.cm-md-image-toolbar` 一直没有样式，会作为普通块把编辑器撑高；补上 `position: fixed` 的浮条样式。
  3. 点击图片时 `posAtCoords` 落在**下一行**（行内原子 widget 的行盒高于正文），光标进不了图片，
     浮条也就出不来。改为图片自己接管 mousedown，把光标放到节点起点（与表格单元格同一套做法）。
- 已知边界：`<details>` 这类跨空行的 HTML 块会被 CommonMark 拆成多个 HTMLBlock，
  现在由 `mergeHtmlBlocks`（按标签配对）接回一段再渲染；没写完的标签不会吞掉后文。
  HTML 块里的 `<ul>` 用浏览器默认列表样式，与 `.wr-doc` 的列表规则不完全一致。

### P2 补齐（2026-10-23 晚）

- 表格「编辑整表源码」：工具条末尾的「源码」按钮 / 右键菜单 → 编辑表格源码。
  实现是把光标放进表内（`from + 1`），走既有的「表内选区 → 退回源码」通道；
  移出表格自动恢复成表格，不引入额外状态。
- `<details>` 跨空行：新增 `unclosedTag` / `mergeHtmlBlocks`，把因空行被劈开的同一个容器
  （details / div / section …）接回一段再渲染；只有后面确实存在闭合标签时才合并，
  避免一个没写完的 `<div>` 把整篇吞进去。
- 顺手修了一个**会写坏文件**的会话恢复竞态：恢复上次文件时要先异步读盘，这期间如果用户
  从命令行 / 文件关联打开了另一个文件，原来的代码会用「上次会话的草稿」把新文件覆盖掉
  （实测把一个文件写成了另一个文件的内容）。现在 `adopt` 之前会再确认一次 `shouldRestore`，
  并且不再提前 `setRef/setName`（身份只在最终 adopt 时一次性生效）。

### P3 落地记录（2026-10-23 晚）

- **TOC 工具条**：目录块右上角悬浮「刷新 / 移除」（与表格工具条同一套样式，hover / focus-within 出现）。
  「刷新」用一次空选区事务触发重建（目录内容在 build 时从文档算出来）；「移除」删掉 `[TOC]` 整行。
- **Front Matter 摘要**（`live-preview/front-matter.ts`）：阅读态折叠成一行
  「属性 · title · date · author」（最多 3 项，其余 +N）；点击摘要把光标放回开头，
  露出可编辑的原始 YAML（仍是 `cm-md-frontmatter` 弱化样式）。空 front matter 显示「（空）」。
- **跨块选区策略**：定了两条并写了测试 —— 选区**跨越**块（从块外开始）时保持渲染态；
  选区**完全落在**块内才退回源码（块级 replace 里放不下光标，否则看不见）。
- **SVG 编辑态**：光标进入后不再是「整块消失」——源码留在原位（等宽 + 左侧色条），
  块后挂 `SVG 预览`（同步渲染，不需要防抖）；Esc / Ctrl+Enter / ✓ 退出（复用 `block-edit.ts`）。

---

## 七、验收标准

1. 光标在 `**粗**` 里：只出现这一对 `**`；同一行的 `##`、链接、脚注保持渲染态。
2. 光标移进表格：表格仍在，表头上方出现工具条；`|` 与分隔行不出现；按 Tab 到下一格，末格 Tab 加一行。
3. 光标移进公式块：出现 TeX 源码与下方预览；⌘/Ctrl+Enter 后只剩公式；撤销一次能回到编辑态前的文本。
4. 光标移进 Mermaid 块：源码与图同时可见；改一行后 300ms 内图更新；语法错只在面板里报错，不撑坏布局。
5. 代码块：失焦看不到围栏，聚焦能看到；切换聚焦前后**行高与块高不变**（对照 `editing-bugs.md` #22 的回归口径）。
6. 图片：点击图片出现 `![]()`；移出恢复；`Ctrl+Z` 只回退这一次编辑。
7. 任何编辑态下横向不抖动、滚动条长度不跳。
8. 打印 / 导出与编辑态无关：`npm test` 里 `consistency` 与 `print` 两组全绿。

---

## 八、待实机确认（Typora 1.13）

1. 表格在**跨块选区**下是否展开源码（决定 §5.6 的默认策略）。
2. 图片聚焦是「原位展开」还是「整行展开」；是否有悬停浮条。
3. 代码围栏在聚焦时是否也不显示（本文按「不显示」写）。
4. TOC 的 `.md-toc-tooltip` 具体动作（更新 / 移除 / 仅提示）。
5. HTML rawblock 的工具条内容与是否提供「预览」切换。
6. 标题编辑态的字号到底是降到段落，还是仅去掉上间距（issue DOM 显示是 `mdlike` 段落化）。

---

## 九、参考

- Markdown Reference（镜像）：https://support.typoraio.cn/zh/Markdown-Reference/
- Table Editing：https://support.typoraio.cn/Table-Editing/
- Code Fences：https://support.typoraio.cn/Code-Fences/
- Math and Academic Functions：https://support.typoraio.cn/Math/
- Images in Typora：https://support.typoraio.cn/Images/
- Draw Diagrams With Markdown：https://support.typoraio.cn/Draw-Diagrams-With-Markdown/
- 主题工具包（DOM 类名约定）：https://github.com/typora/typora-theme-toolkit
- 数学编辑的社区复刻讨论（ProseMirror，行为描述与 Typora 一致）：https://discuss.prosemirror.net/t/replicating-typoras-inline-display-math-editing/2906



