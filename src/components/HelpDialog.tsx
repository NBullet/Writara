// Lucian UX/UI Prompt #001 · MIT License (c) 2026 Seokwoooo · https://lucianlabs.dev/uxui-prompt/#001
import { Fragment, useEffect, useRef, useState } from "react";

import type { UpdateStatus } from "../updates/types";
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

export interface UpdateControls {
  status: UpdateStatus;
  check: () => Promise<void> | void;
  download: () => void;
  install: () => void;
}

interface Props {
  mode: "about" | "shortcuts" | null;
  onClose: () => void;
  update?: UpdateControls;
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

export function HelpDialog({ mode, onClose, update }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [justChecked, setJustChecked] = useState(false);

  // 检查成功后在胶囊上停留一会儿打勾，再回到「检查更新」。
  useEffect(() => {
    if (update?.status.state !== "none") {
      setJustChecked(false);
      return;
    }
    setJustChecked(true);
    const timer = window.setTimeout(() => setJustChecked(false), 3600);
    return () => window.clearTimeout(timer);
  }, [update?.status.state]);

  const status: UpdateStatus = update?.status ?? { state: "idle" };
  const busy = status.state === "checking" || status.state === "downloading";
  const checkState = busy ? "load" : justChecked ? "ok" : "idle";
  const updateLabel =
    status.state === "available"
      ? `下载 v${status.version}`
      : status.state === "downloaded"
        ? "重启并安装"
        : "检查更新";
  const updateText =
    status.state === "checking"
      ? "正在检查更新…"
      : status.state === "none"
        ? "已是最新版本"
        : status.state === "available"
          ? `发现新版本 v${status.version}`
          : status.state === "downloading"
            ? `正在下载 v${status.version} · ${status.percent}%`
            : status.state === "downloaded"
              ? `v${status.version} 已下载，重启后安装`
              : status.state === "error"
                ? `检查失败：${status.message}`
                : "检查是否有新版本";

  const runUpdate = (): void => {
    if (!update || busy) return;
    if (status.state === "available") update.download();
    else if (status.state === "downloaded") update.install();
    else void update.check();
  };

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
            <div className="wr-about-main">
              <div className="wr-about-brand">
                <span className="wr-about-mark" aria-hidden="true">
                  W
                </span>
                <div>
                  <h3>Writara｜文叙</h3>
                  <p className="wr-about-slogan">自然书写，即刻呈现。</p>
                </div>
              </div>
              <p>
                源码与渲染同层的 Markdown 编辑器：文件直接读写本地磁盘，打印与导出的排版和屏幕一致。
              </p>
              <ul className="wr-about-tech" aria-label="技术栈">
                {["React", "CodeMirror 6", "Lezer", "KaTeX", "Mermaid"].map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>

            <aside className="wr-about-card" aria-label="项目信息">
              <div className="wr-about-row">
                <span>作者</span>
                <b>NBullet</b>
              </div>
              <div className="wr-about-row">
                <span>邮箱</span>
                <a href="mailto:nbullet@126.com">nbullet@126.com</a>
              </div>
              <div className="wr-about-row">
                <span>代码</span>
                <a href="https://github.com/NBullet/Writara" target="_blank" rel="noreferrer">
                  github.com/NBullet/Writara
                </a>
              </div>
              <div className="wr-about-row">
                <span>版本</span>
                <b>{__WRITARA_VERSION__}</b>
              </div>
            </aside>

            <footer className="wr-about-foot">
              <span className="wr-about-update-text" aria-live="polite">
                {update ? updateText : "桌面端支持在线更新"}
              </span>
              {update ? (
                <div className="lx-check" data-state={checkState}>
                  <button
                    type="button"
                    className="lx-check-btn"
                    aria-busy={busy}
                    onClick={runUpdate}
                  >
                    <span className="lx-check-sheen" aria-hidden="true" />
                    <span className="lx-check-txt">{updateLabel}</span>
                    <span className="lx-check-spin" aria-hidden="true">
                      <svg viewBox="0 0 30 30">
                        <circle cx="15" cy="15" r="10" />
                      </svg>
                    </span>
                    <span className="lx-check-done" aria-hidden="true">
                      <b>
                        <svg viewBox="0 0 16 16">
                          <path d="M3.5 8.4l3 3 6-6.4" />
                        </svg>
                      </b>
                      已是最新
                    </span>
                  </button>
                </div>
              ) : null}
            </footer>
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
