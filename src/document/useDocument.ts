import { useCallback, useEffect, useRef, useState } from "react";

import { describeFileError } from "../io/file-system";
import { applyLineEnding, detectLineEnding, normalizeLineEndings, type LineEnding } from "../io/line-endings";
import { DEFAULT_FORMAT, type TextFormat } from "../io/encoding";
import { platform } from "../platform";
import type { DocRef } from "../platform/types";
import { decideRestore } from "./restore";
import { loadDraft, saveDraft } from "../storage/draft";
import { rememberRecent } from "../storage/recent";
import { askConfirm } from "../components/confirm";
import { loadSession, saveSession } from "../storage/session";

/**
 * 文档状态：文本、文件名、文件身份、脏标记。
 *
 * 几个刻意的选择：
 * - 保存前先读一遍磁盘，内容与上次保存的不一致就征求确认，避免覆盖别处的修改。
 * - 重新打开页面时优先采用磁盘内容，但草稿更新时保留草稿并提示冲突。
 * - 文件身份用平台层的 `DocRef`，不直接依赖 File System Access 的句柄。
 */

export interface DocumentController {
  text: string;
  name: string;
  ref: DocRef | null;
  dirty: boolean;
  saving: boolean;
  canWrite: boolean;
  error: string | null;
  notice: string | null;
  /** 当前文件保存时使用的换行符。 */
  lineEnding: LineEnding;
  setLineEnding: (ending: LineEnding) => void;
  /** 当前文件的编码与 BOM（状态栏展示、保存写回）。 */
  format: TextFormat;
  /** 以 UTF-8（无 BOM）重写当前文件，用于 GBK / UTF-16 文档的迁移。 */
  convertToUtf8: () => Promise<boolean>;
  /** 工作区内的相对路径；单独打开的文件为 null。 */
  path: string | null;
  /** 每次「从外部换掉文本」自增，用来让编辑器同步，而不是把 doc 变成受控值。 */
  loadToken: number;
  setText: (text: string) => void;
  open: () => Promise<void>;
  /** 打开工作区里的文件（身份已知，保存时直接写回）。 */
  openExternal: (
    text: string,
    name: string,
    ref: DocRef | null,
    path?: string | null,
    format?: TextFormat,
  ) => void;
  /** 文件被重命名后同步身份；不改变文本、脏标记与撤销历史。 */
  renameIdentity: (next: { name: string; ref: DocRef; path: string | null }) => void;
  /** 保存时允许传入编辑器里的最新文本（输入法组合刚提交、React 状态还没跟上时用）。 */
  save: (currentText?: string) => Promise<boolean>;
  saveAs: (currentText?: string) => Promise<boolean>;
  dismissNotice: () => void;
  dismissError: () => void;
}

export interface DocumentOptions {
  autosaveDelay?: number;
  /** 停笔后自动写回文件；需要已经获得写权限。 */
  autoSaveFile?: boolean;
  /** 停笔多久后自动写回，ms。 */
  autoSaveDelay?: number;
  /** 是否正在输入法组合中；组合期间不写盘，避免把旧文本当成最新内容。 */
  isComposing?: () => boolean;
  /** 恢复上次文件前再确认一次；桌面端刚从命令行/文件关联打开时不该被会话覆盖。 */
  shouldRestore?: () => boolean;
  /** 启动时是否恢复上次会话（对应偏好设置「启动选项」）。 */
  restoreSession?: boolean;
  /** 新建文档的默认换行符。 */
  defaultLineEnding?: LineEnding;
  /** 没有草稿、没有上次文件时显示的示例内容。 */
  fallbackText?: string;
}

export function useDocument(options: DocumentOptions = {}): DocumentController {
  const {
    autosaveDelay = 400,
    autoSaveFile = true,
    autoSaveDelay = 1500,
    fallbackText = "",
    restoreSession = true,
    defaultLineEnding = "lf",
  } = options;
  const isComposingRef = useRef(options.isComposing);
  isComposingRef.current = options.isComposing;
  const shouldRestoreRef = useRef(options.shouldRestore);
  shouldRestoreRef.current = options.shouldRestore;

  const [initial] = useState(() => loadDraft());
  const hadDraft = initial !== null;
  const [text, setTextState] = useState(initial?.text ?? fallbackText);
  const [name, setName] = useState(initial?.name ?? "未命名.md");
  const [ref, setRef] = useState<DocRef | null>(null);
  const [savedText, setSavedText] = useState(initial?.text ?? fallbackText);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [lineEnding, setLineEndingState] = useState<LineEnding>("lf");
  const [format, setFormatState] = useState<TextFormat>(DEFAULT_FORMAT);
  const [path, setPath] = useState<string | null>(null);
  const [loadToken, setLoadToken] = useState(0);
  /** 磁盘被别处改过时暂停自动写入，等用户用 Ctrl+S 明确覆盖。 */
  const [autoSavePaused, setAutoSavePaused] = useState(false);
  const writing = useRef(false);

  const canWrite = platform().canWrite;
  const dirty = text !== savedText;

  const adopt = useCallback(
    (next: {
      text: string;
      name: string;
      ref: DocRef | null;
      savedText: string;
      format?: TextFormat;
    }) => {
      setTextState(next.text);
      setName(next.name);
      setRef(next.ref);
      setSavedText(next.savedText);
      setFormatState(next.format ?? DEFAULT_FORMAT);
      setAutoSavePaused(false);
      setLoadToken((value) => value + 1);
    },
    [],
  );

  // 恢复上次的文件：身份仍在且权限已授予时，以磁盘内容为准。
  useEffect(() => {
    if (!restoreSession) return;
    let cancelled = false;

    void (async () => {
      const record = await loadSession();
      if (!record || cancelled) return;
      // 刚从命令行/文件关联打开了别的文件：不要用会话覆盖它。
      if (shouldRestoreRef.current && !shouldRestoreRef.current()) return;

      let disk: string | null = null;
      let diskFormat: TextFormat = DEFAULT_FORMAT;
      try {
        if (await platform().canWriteTo(record.ref)) {
          // 重启后主进程的白名单是空的：先把会话里的这个路径重新登记，再读。
          await platform().restoreAccess?.(record.ref);
          const raw = await platform().read(record.ref);
          if (raw !== null) {
            disk = normalizeLineEndings(raw.text);
            diskFormat = { encoding: raw.encoding, bom: raw.bom };
            setLineEndingState(detectLineEnding(raw.text));
          }
        }
      } catch {
        disk = null;
      }
      if (cancelled) return;

      if (disk === null) {
        setNotice("上次的文件需要重新授权后才能保存回原文件。");
        return;
      }

      const decision = decideRestore({ draft: text, hadDraft, recordText: record.savedText, disk });
      // 读盘是异步的：这期间用户可能已经从命令行 / 文件关联打开了别的文件，
      // 这时再 adopt 会把那个文件的内容换成上次会话的草稿（真的因此丢过内容）。
      if (shouldRestoreRef.current && !shouldRestoreRef.current()) return;
      if (decision.notice) setNotice(decision.notice);
      adopt({
        text: decision.text,
        name: record.name,
        ref: record.ref,
        savedText: decision.savedText,
        format: diskFormat,
      });
    })();

    return () => {
      cancelled = true;
    };
    // 只在挂载时执行一次；text 是初始草稿，不需要参与依赖。
  }, []);

  // 草稿自动保存（兜底：即使文件没有保存，重开也不丢文字）。
  useEffect(() => {
    const timer = setTimeout(() => saveDraft({ text, name }), autosaveDelay);
    return () => clearTimeout(timer);
  }, [text, name, autosaveDelay]);

  // 文件级自动保存：停笔后静默写回。只在已获得写权限时执行，绝不在这里弹权限框。
  useEffect(() => {
    if (!autoSaveFile || autoSavePaused || !ref || !dirty || saving) return;
    const target = ref;
    const snapshot = text;
    const savedSnapshot = savedText;

    const timer = setTimeout(() => {
      void (async () => {
        if (writing.current) return;
        if (isComposingRef.current?.()) return;
        if (!(await platform().canWriteTo(target))) return;
        writing.current = true;
        try {
          // 先对一下磁盘：别处改过就暂停，不能静默覆盖。
          let disk: string | null = null;
          try {
            const raw = await platform().read(target);
            disk = raw === null ? null : normalizeLineEndings(raw.text);
          } catch {
            return;
          }
          if (disk === null) return;
          if (disk !== savedSnapshot) {
            setAutoSavePaused(true);
            setNotice("文件在磁盘上已被修改，自动保存已暂停；按 Ctrl+S 确认后再继续。");
            return;
          }

          await platform().write(target, applyLineEnding(snapshot, lineEnding), format);
          // 用户可能又输入了：只认这次写进去的内容。
          setSavedText(snapshot);
          void saveSession({ ref: target, name, savedText: snapshot, savedAt: Date.now() });
          void rememberRecent(target, name);
        } catch {
          // 静默失败，下一次停笔再试，不打断输入。
        } finally {
          writing.current = false;
        }
      })();
    }, autoSaveDelay);

    return () => clearTimeout(timer);
  }, [
    autoSaveFile,
    autoSavePaused,
    ref,
    dirty,
    saving,
    text,
    savedText,
    autoSaveDelay,
    lineEnding,
    format,
    name,
  ]);

  const setText = useCallback((value: string) => {
    setTextState(value);
    setError(null);
  }, []);

  const open = useCallback(async () => {
    try {
      setError(null);
      const file = await platform().openFile();
      if (!file) return;
      const ending = detectLineEnding(file.text);
      const normalized = normalizeLineEndings(file.text);
      setLineEndingState(ending);
      setPath(null);
      adopt({
        text: normalized,
        name: file.name,
        ref: file.ref,
        savedText: normalized,
        format: file.format,
      });
      setNotice(null);
      // 立刻落一次草稿，避免刚打开就关掉页面时恢复出旧内容。
      saveDraft({ text: normalized, name: file.name });
      if (file.ref) {
        await saveSession({
          ref: file.ref,
          name: file.name,
          savedText: normalized,
          savedAt: Date.now(),
        });
        void rememberRecent(file.ref, file.name);
      }
    } catch (cause) {
      setError(describeFileError(cause));
    }
  }, [adopt]);

  const renameIdentity = useCallback(
    (next: { name: string; ref: DocRef; path: string | null }) => {
      setName(next.name);
      setRef(next.ref);
      setPath(next.path);
      saveDraft({ text, name: next.name });
      void saveSession({ ref: next.ref, name: next.name, savedText, savedAt: Date.now() });
    },
    [savedText, text],
  );


  const openExternal = useCallback(
    (
      nextText: string,
      nextName: string,
      nextRef: DocRef | null,
      nextPath: string | null = null,
      nextFormat: TextFormat = DEFAULT_FORMAT,
    ) => {
      const normalized = normalizeLineEndings(nextText);
      setLineEndingState(nextText === "" ? defaultLineEnding : detectLineEnding(nextText));
      setPath(nextPath);
      adopt({
        text: normalized,
        name: nextName,
        ref: nextRef,
        savedText: normalized,
        format: nextFormat,
      });
      setNotice(null);
      setError(null);
      saveDraft({ text: normalized, name: nextName });
      if (nextRef) {
        void saveSession({
          ref: nextRef,
          name: nextName,
          savedText: normalized,
          savedAt: Date.now(),
        });
      }
    },
    [adopt],
  );

  const persist = useCallback(async (target: DocRef, nextText: string, nextName: string) => {
    await saveSession({ ref: target, name: nextName, savedText: nextText, savedAt: Date.now() });
    setRef(target);
    setName(nextName);
    setSavedText(nextText);
    setAutoSavePaused(false);
    setNotice(null);
  }, []);

  const save = useCallback(async (currentText?: string): Promise<boolean> => {
    if (saving) return false;
    const snapshot = currentText ?? text;
    // 已经保存过且没有改动：不重复写盘，也不弹权限框。
    if (snapshot === savedText && ref) return true;
    setSaving(true);
    setError(null);
    try {
      if (ref) {
        // 先确认磁盘内容没被别处改过。
        let disk: string | null = null;
        try {
          const raw = await platform().read(ref);
          disk = raw === null ? null : normalizeLineEndings(raw.text);
        } catch {
          disk = null; // 权限未授予时读不到，交给 save() 去申请
        }
        if (disk !== null && disk !== savedText) {
          const overwrite =
            (await askConfirm({
              title: "文件已被外部修改",
              message: "磁盘上的内容与上次保存时不同。仍然用当前内容覆盖吗？",
              actions: [{ id: "overwrite", label: "覆盖", tone: "danger" }],
            })) === "overwrite";
          if (!overwrite) return false;
        }
      }

      const result = await platform().save({
        text: applyLineEnding(snapshot, lineEnding),
        ref,
        suggestedName: name,
        format,
      });
      if (!result) return false; // 用户取消

      if (result.ref) {
        await persist(result.ref, snapshot, result.name);
        void rememberRecent(result.ref, result.name);
      } else {
        setName(result.name);
        setSavedText(snapshot);
        setNotice("当前浏览器不支持写回文件，已下载一份副本。用 Chrome / Edge 可以保存回原文件。");
      }
      return true;
    } catch (cause) {
      setError(describeFileError(cause));
      return false;
    } finally {
      setSaving(false);
    }
  }, [ref, name, persist, savedText, saving, text, lineEnding, format]);

  const saveAs = useCallback(async (currentText?: string): Promise<boolean> => {
    if (saving) return false;
    const snapshot = currentText ?? text;
    setSaving(true);
    setError(null);
    try {
      const result = await platform().save({
        text: applyLineEnding(snapshot, lineEnding),
        ref,
        suggestedName: name,
        forcePicker: true,
        format,
      });
      if (!result) return false;
      if (result.ref) {
        await persist(result.ref, snapshot, result.name);
        void rememberRecent(result.ref, result.name);
      } else {
        setNotice("当前浏览器不支持写回文件，已下载一份副本。");
      }
      return true;
    } catch (cause) {
      setError(describeFileError(cause));
      return false;
    } finally {
      setSaving(false);
    }
  }, [ref, name, persist, saving, text, lineEnding, format]);

  const setLineEnding = useCallback((ending: LineEnding) => {
    setLineEndingState(ending);
  }, []);

  /**
   * 把当前文件改存为 UTF-8（无 BOM）。
   *
   * 读文件时按 BOM / 严格 UTF-8 判定，GBK 与 UTF-16 都能正确打开；但用户总需要
   * 一个「从此按 UTF-8 存」的出口——否则一个 GBK 文件会永远锁在 GBK 里。
   */
  const convertToUtf8 = useCallback(async (): Promise<boolean> => {
    if (!ref || saving) return false;
    const target = ref;
    const snapshot = text;
    setSaving(true);
    setError(null);
    try {
      await platform().write(target, applyLineEnding(snapshot, lineEnding), DEFAULT_FORMAT);
      setFormatState(DEFAULT_FORMAT);
      setSavedText(snapshot);
      setAutoSavePaused(false);
      setNotice(`已按 UTF-8 重新保存 ${name}。`);
      void saveSession({ ref: target, name, savedText: snapshot, savedAt: Date.now() });
      return true;
    } catch (cause) {
      setError(describeFileError(cause));
      return false;
    } finally {
      setSaving(false);
    }
  }, [ref, saving, text, lineEnding, name]);

  const dismissNotice = useCallback(() => setNotice(null), []);
  const dismissError = useCallback(() => setError(null), []);

  return {
    text,
    name,
    ref,
    dirty,
    saving,
    canWrite,
    error,
    notice,
    lineEnding,
    setLineEnding,
    format,
    convertToUtf8,
    path,
    loadToken,
    setText,
    open,
    openExternal,
    renameIdentity,
    save,
    saveAs,
    dismissNotice,
    dismissError,
  };
}
