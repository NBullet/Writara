import { Fragment, useEffect, useRef, useState } from "react";

import { CloseIcon, SearchIcon } from "./icons";

const SHORTCUT_GROUPS: Array<{ title: string; items: Array<[string, string]> }> = [
  {
    title: "文件",
    items: [
      ["新建", "Ctrl N"],
      ["打开", "Ctrl O"],
      ["保存", "Ctrl S"],
      ["另存为", "Ctrl Shift S"],
      ["打印 / PDF", "Ctrl Shift P"],
      ["命令面板", "Ctrl P"],
      ["偏好设置", "Ctrl ,"],
    ],
  },
  {
    title: "编辑",
    items: [
      ["撤销 / 重做", "Ctrl Z / Ctrl Y"],
      ["复制为 Markdown", "Ctrl Shift C"],
      ["粘贴为纯文本", "Ctrl Shift V"],
      ["查找和替换", "Ctrl F"],
      ["在全文中搜索", "Ctrl Shift F"],
    ],
  },
  {
    title: "段落",
    items: [
      ["一级 ~ 六级标题", "Ctrl 1 … Ctrl 6"],
      ["正文段落", "Ctrl 0"],
      ["提升 / 降低标题", "Ctrl = / Ctrl -"],
      ["代码块", "Ctrl Shift K"],
      ["公式块", "Ctrl Shift M"],
      ["引用", "Ctrl Shift Q"],
      ["有序 / 无序列表", "Ctrl Shift [ / ]"],
    ],
  },
  {
    title: "格式",
    items: [
      ["加粗", "Ctrl B"],
      ["斜体", "Ctrl I"],
      ["下划线", "Ctrl U"],
      ["行内代码", "Ctrl Shift `"],
      ["删除线", "Alt Shift 5"],
      ["超链接", "Ctrl K"],
      ["清除样式", "Ctrl \\"],
    ],
  },
  {
    title: "视图",
    items: [
      ["侧边栏", "Ctrl Shift L"],
      ["大纲 / 文档 / 文件树", "Ctrl Shift 1 / 2 / 3"],
      ["源代码模式", "Ctrl /"],
      ["专注模式", "F8"],
      ["打字机模式", "F9"],
      ["全屏", "F11"],
      ["缩放", "Ctrl Shift = / -"],
    ],
  },
];

interface Props {
  mode: "about" | "shortcuts" | null;
  onClose: () => void;
}

function Keys({ value }: { value: string }) {
  const alternatives = value.split(" / ");
  return (
    <span className="wr-keys">
      {alternatives.map((alternative, index) => (
        <Fragment key={`${alternative}-${index}`}>
          {index > 0 ? <span className="wr-keys-or">/</span> : null}
          {alternative.split(" ").map((token, position) =>
            token === "…" ? (
              <span key={position} className="wr-keys-ellipsis">
                …
              </span>
            ) : (
              <kbd key={position}>{token}</kbd>
            ),
          )}
        </Fragment>
      ))}
    </span>
  );
}

export function HelpDialog({ mode, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (mode && !dialog.open) {
      setQuery("");
      dialog.showModal();
      if (mode === "shortcuts") {
        window.setTimeout(() => searchRef.current?.focus(), 30);
      }
    }
    if (!mode && dialog.open) dialog.close();
  }, [mode]);

  const needle = query.trim().toLowerCase();
  const groups = SHORTCUT_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter(
      ([label, keys]) =>
        !needle || label.toLowerCase().includes(needle) || keys.toLowerCase().includes(needle),
    ),
  })).filter((group) => group.items.length > 0);

  return (
    <dialog
      ref={ref}
      className="wr-dialog wr-help"
      onClose={onClose}
      aria-label={mode === "about" ? "关于 Writara" : "键盘快捷键"}
    >
      <div className="wr-help-shell">
        <header className="wr-help-head">
          <div className="wr-help-title">
            {mode === "shortcuts" ? (
              <span className="wr-help-mark" aria-hidden="true">
                W
              </span>
            ) : null}
            <div>
              <h2>{mode === "about" ? "关于 Writara" : "键盘快捷键"}</h2>
              <p>
                {mode === "about"
                  ? "Write naturally, render instantly."
                  : "按分组查找；Windows 用 Ctrl，macOS 用 ⌘。"}
              </p>
            </div>
          </div>
          <button type="button" className="wr-icon-button" onClick={onClose} aria-label="关闭">
            <CloseIcon size={16} />
          </button>
        </header>

        {mode === "about" ? (
          <div className="wr-about">
            <span className="wr-about-mark" aria-hidden="true">
              W
            </span>
            <h3>Writara｜文叙</h3>
            <p className="wr-about-slogan">自然书写，即刻呈现。</p>
            <p>
              源码与渲染同层的 Markdown 编辑器：文件直接读写本地磁盘，打印与导出的排版和屏幕一致。
            </p>
            <p className="wr-about-tech">React · CodeMirror 6 · Lezer · KaTeX · Mermaid</p>
            <dl className="wr-about-meta">
              <div>
                <dt>作者</dt>
                <dd>NBullet</dd>
              </div>
              <div>
                <dt>邮箱</dt>
                <dd>
                  <a href="mailto:nbullet@126.com">nbullet@126.com</a>
                </dd>
              </div>
              <div>
                <dt>代码</dt>
                <dd>
                  <a href="https://github.com/NBullet/Writara" target="_blank" rel="noreferrer">
                    github.com/NBullet/Writara
                  </a>
                </dd>
              </div>
              <div>
                <dt>版本</dt>
                <dd>{__WRITARA_VERSION__}</dd>
              </div>
            </dl>
            <button type="button" className="wr-button wr-button-primary" onClick={onClose}>
              关闭
            </button>
          </div>
        ) : (
          <>
            <div className="wr-help-search">
              <SearchIcon size={15} />
              <input
                ref={searchRef}
                value={query}
                placeholder="搜索快捷键或功能…"
                aria-label="搜索快捷键"
                onChange={(event) => setQuery(event.target.value)}
              />
              <kbd>Esc</kbd>
            </div>

            <div className="wr-help-body">
              {groups.length === 0 ? (
                <p className="wr-help-empty">没有匹配的快捷键</p>
              ) : (
                groups.map((group) => (
                  <section key={group.title} className="wr-shortcut-group">
                    <h3>{group.title}</h3>
                    <dl>
                      {group.items.map(([label, keys]) => (
                        <div key={label} className="wr-shortcut-row">
                          <dt>{label}</dt>
                          <dd>
                            <Keys value={keys} />
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </section>
                ))
              )}
            </div>

            <footer className="wr-help-foot">
              <span>
                <kbd>Esc</kbd> 关闭
              </span>
              <button type="button" className="wr-button" onClick={onClose}>
                关闭
              </button>
            </footer>
          </>
        )}
      </div>
    </dialog>
  );
}
