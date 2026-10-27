import { useEffect, useMemo, useRef, useState } from "react";

import { matchRows, SECTIONS, type SectionId, type SettingRow } from "../settings/schema";
import { DEFAULT_SETTINGS, type Settings } from "../storage/settings";
import { previewFor, previewHeadingFont } from "../settings/theme-preview";
import { AiAgents } from "./AiAgents";
import { AiContext } from "./AiContext";

export type PreferenceAction = "import-css" | "clear-css" | "set-image-root" | "restore-draft";
interface Props {
  open: boolean;
  settings: Settings;
  onChange: (settings: Settings) => void;
  onAction: (action: PreferenceAction) => void;
  onClose: () => void;
  /** 打开时定位到某一页（从 AI 对话点「设置」应直接进 AI 页）。 */
  initialSection?: SectionId;
}

/**
 * 偏好设置：左侧分类 + 右侧分组 + 顶部搜索。
 *
 * 结构照着 Typora 走，但条目只保留我们真正有能力的那些；
 * 具体字段全部来自 `src/settings/schema.ts`，这里不认识任何具体设置项。
 */
export function Preferences({ open, settings, onChange, onAction, onClose, initialSection }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const [section, setSection] = useState<SectionId>("general");
  const [query, setQuery] = useState("");
  const [spellLanguages, setSpellLanguages] = useState<string[]>([]);

  useEffect(() => {
    void window.writara?.spell
      ?.languages()
      .then((list) => setSpellLanguages(list))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) {
      if (initialSection) setSection(initialSection);
      element.showModal();
      setQuery("");
      window.setTimeout(() => search.current?.focus(), 30);
    }
    if (!open && element.open) element.close();
  }, [open, initialSection]);

  const update = (field: keyof Settings, value: unknown) => {
    onChange({ ...settings, [field]: value } as Settings);
  };

  /**
   * 恢复当前分区的默认值：只改这一节里绑定到字段的条目。
   * `customCss` 是用户内容，不在「恢复默认」的范围内（清空要单独点「清除」）。
   */
  const resetSection = (id: SectionId) => {
    const entry = SECTIONS.find((section) => section.id === id);
    if (!entry) return;
    const patch: Partial<Settings> = {};
    for (const group of entry.groups) {
      for (const row of group.rows) {
        if (!row.field || row.field === "customCss") continue;
        (patch as Record<string, unknown>)[row.field] = DEFAULT_SETTINGS[row.field];
      }
    }
    onChange({ ...settings, ...patch });
  };

  const searching = query.trim().length > 0;

  const visible = useMemo(() => {
    if (!searching) {
      const current = SECTIONS.find((entry) => entry.id === section) ?? SECTIONS[0]!;
      return [{ ...current, groups: matchRows(current, "", settings) }];
    }
    return SECTIONS.map((entry) => ({ ...entry, groups: matchRows(entry, query, settings) })).filter(
      (entry) => entry.groups.length > 0,
    );
  }, [query, section, searching, settings]);

  const counts = useMemo(() => {
    const map = new Map<SectionId, number>();
    for (const entry of SECTIONS) {
      map.set(
        entry.id,
        matchRows(entry, query, settings).reduce((sum, group) => sum + group.rows.length, 0),
      );
    }
    return map;
  }, [query, settings]);

  return (
    <dialog
      ref={dialog}
      className="wr-dialog wr-prefs-dialog"
      onClose={onClose}
      onKeyDown={(event) => {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f") {
          event.preventDefault();
          search.current?.focus();
        }
      }}
      aria-label="偏好设置"
    >
      <div className="wr-prefs">
        <aside className="wr-prefs-nav">
          <h2>偏好设置</h2>
          <input
            ref={search}
            className="wr-prefs-search"
            type="search"
            value={query}
            placeholder="查找…"
            aria-label="查找设置项"
            onChange={(event) => setQuery(event.target.value)}
          />
          <nav>
            {SECTIONS.map((entry) => {
              const hits = counts.get(entry.id) ?? 0;
              const dimmed = searching && hits === 0;
              return (
                <button
                  key={entry.id}
                  type="button"
                  className={!searching && entry.id === section ? "is-active" : undefined}
                  aria-current={!searching && entry.id === section ? "page" : undefined}
                  disabled={dimmed}
                  onClick={() => {
                    setQuery("");
                    setSection(entry.id);
                  }}
                >
                  {entry.title}
                  {searching && hits > 0 ? <span className="wr-prefs-count">{hits}</span> : null}
                </button>
              );
            })}
          </nav>
        </aside>

        <div className="wr-prefs-body">
          {visible.map((entry) => (
            <section key={entry.id} className="wr-prefs-section">
              <div className="wr-prefs-section-head">
                <h3>{entry.title}</h3>
                {searching ? null : (
                  <button
                    type="button"
                    className="wr-prefs-reset"
                    onClick={() => resetSection(entry.id)}
                  >
                    恢复默认
                  </button>
                )}
              </div>
              {entry.groups.map((group, index) => (
                <div key={`${entry.id}-${index}`} className="wr-prefs-group">
                  {group.title ? <div className="wr-prefs-group-title">{group.title}</div> : null}
                  {group.rows.map((row, rowIndex) => (
                    <Row
                      key={`${entry.id}-${index}-${rowIndex}`}
                      row={row}
                      settings={settings}
                      update={update}
                      onAction={onAction}
                      spellLanguages={spellLanguages}
                      onChange={onChange}
                    />
                  ))}
                </div>
              ))}
            </section>
          ))}
          {visible.length === 0 ? <p className="wr-prefs-empty">没有匹配的设置项</p> : null}
        </div>

        <div className="wr-prefs-footer">
          <span className="wr-prefs-footer-hint">设置即时生效 · Esc 关闭</span>
          <button type="button" className="wr-button wr-button-primary" onClick={onClose}>
            完成
          </button>
        </div>
      </div>
    </dialog>
  );
}

function Row({
  row,
  settings,
  update,
  onAction,
  spellLanguages,
  onChange,
}: {
  row: SettingRow;
  settings: Settings;
  update: (field: keyof Settings, value: unknown) => void;
  onAction: (action: PreferenceAction) => void;
  spellLanguages: string[];
  onChange: (settings: Settings) => void;
}) {
  return (
    <div className="wr-prefs-row">
      <div className="wr-prefs-label">
        {row.label}
        {row.hint ? <span className="wr-prefs-hint">{row.hint}</span> : null}
      </div>
      <div className="wr-prefs-control">
        {renderControl(row, settings, update, onAction, spellLanguages, onChange)}
      </div>
    </div>
  );
}

function languageLabel(code: string): string {
  try {
    return new Intl.DisplayNames(["zh-CN"], { type: "language" }).of(code) ?? code;
  } catch {
    return code;
  }
}

function renderControl(
  row: SettingRow,
  settings: Settings,
  update: (field: keyof Settings, value: unknown) => void,
  onAction: (action: PreferenceAction) => void,
  spellLanguages: string[],
  onChange: (settings: Settings) => void,
) {
  const control = row.control;
  const field = row.field;
  const value = field ? (settings[field] as unknown) : undefined;

  switch (control.type) {
    case "toggle":
      if (!field) return null;
      return (
        <label className="wr-switch">
          <input
            type="checkbox"
            role="switch"
            checked={Boolean(value)}
            onChange={(event) => update(field, event.target.checked)}
          />
          <span className="wr-switch-track" aria-hidden="true" />
          <span className="wr-switch-text">{value ? "开启" : "关闭"}</span>
        </label>
      );

    case "style":
      if (!field) return null;
      return (
        <div className="wr-theme-grid" role="radiogroup" aria-label={row.label}>
          {control.choices.map((choice) => {
            const preview = previewFor(choice.value);
            const active = String(value) === choice.value;
            return (
              <button
                key={choice.value}
                type="button"
                role="radio"
                aria-checked={active}
                aria-label={choice.label}
                className={active ? "wr-theme-card is-active" : "wr-theme-card"}
                onClick={() => update(field, choice.value)}
              >
                <span
                  className="wr-theme-paper"
                  style={{
                    background: preview.bg,
                    color: preview.text,
                    borderColor: active ? preview.accent : preview.border,
                  }}
                >
                  <span
                    className="wr-theme-heading"
                    style={{ fontFamily: previewHeadingFont(preview) }}
                  >
                    Aa 标题
                  </span>
                  <span className="wr-theme-line" style={{ background: preview.muted }} />
                  <span className="wr-theme-line is-short" style={{ background: preview.muted }} />
                  <span className="wr-theme-link" style={{ color: preview.accent }}>
                    链接
                  </span>
                </span>
                <span className="wr-theme-name">{choice.label}</span>
              </button>
            );
          })}
        </div>
      );

    case "select":
      if (!field) return null;
      return (
        <select
          value={String(value ?? "")}
          onChange={(event) => update(field, event.target.value)}
        >
          {control.choices.map((choice) => (
            <option key={choice.value} value={choice.value}>
              {choice.label}
            </option>
          ))}
        </select>
      );

    case "radio":
      if (!field) return null;
      return (
        <div className="wr-segmented" role="radiogroup" aria-label={row.label}>
          {control.choices.map((choice) => {
            const active = String(value) === choice.value;
            return (
              <label key={choice.value} className={active ? "is-active" : undefined}>
                <input
                  type="radio"
                  name={`${String(field)}-radio`}
                  checked={active}
                  onChange={() => update(field, choice.value)}
                />
                {choice.label}
              </label>
            );
          })}
        </div>
      );

    case "range":
      if (!field) return null;
      return (
        <span className="wr-prefs-range">
          <input
            type="range"
            min={control.min}
            max={control.max}
            step={control.step}
            value={Number(value ?? control.min)}
            onChange={(event) => update(field, Number(event.target.value))}
          />
          <output>
            {String(value ?? "")}
            {control.unit ?? ""}
          </output>
        </span>
      );

    case "action":
      if (control.action === "clear-css" && !settings.customCss.trim()) return null;
      return (
        <button type="button" className="wr-button" onClick={() => onAction(control.action)}>
          {control.button}
        </button>
      );

    case "note":
      return <p className="wr-prefs-note">{control.text}</p>;

    case "text":
      if (!field) return null;
      return (
        <input
          type="text"
          className="wr-prefs-input"
          value={String(value ?? "")}
          placeholder={control.placeholder}
          onChange={(event) => update(field, event.target.value)}
        />
      );

    case "textarea":
      if (!field) return null;
      return (
        <textarea
          className="wr-prefs-input wr-prefs-textarea"
          rows={control.rows ?? 3}
          value={String(value ?? "")}
          placeholder={control.placeholder}
          spellCheck={false}
          onChange={(event) => update(field, event.target.value)}
        />
      );

    case "custom":
      if (control.id === "ai-agents") {
        return <AiAgents settings={settings} onChange={onChange} />;
      }
      if (control.id === "ai-context") {
        return <AiContext settings={settings} onChange={onChange} />;
      }
      return null;

    case "spell": {
      if (!field) return null;
      const current = Array.isArray(value) ? (value[0] ?? "") : "";
      return (
        <select
          value={current}
          onChange={(event) => update(field, event.target.value ? [event.target.value] : [])}
        >
          <option value="">自动（跟随系统）</option>
          {spellLanguages.map((code) => (
            <option key={code} value={code}>
              {languageLabel(code)}
            </option>
          ))}
        </select>
      );
    }

    default:
      return null;
  }
}
