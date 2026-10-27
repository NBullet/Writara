import { EditorView } from "@codemirror/view";
import { openSearchPanel } from "@codemirror/search";
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

import { createEditor, initialCaret } from "../editor/create-editor";
import { refreshPreview as requestPreviewRefresh, setEditorOptions, setSourceMode, setViewModes, type EditorOptions, type ViewModes } from "../editor/modes";

export interface MarkdownEditorHandle {
  setDoc: (text: string) => void;
  focus: () => void;
  goTo: (pos: number) => void;
  /** 选中一段并滚到视野中间，但不抢焦点（查找栏用）。 */
  selectRange: (from: number, to: number) => void;
  setSourceMode: (enabled: boolean) => void;
  setViewModes: (modes: ViewModes) => void;
  setEditorOptions: (options: EditorOptions) => void;
  refreshPreview: () => void;
  openSearch: () => void;
  /** 供菜单命令直接操作编辑状态。 */
  getView: () => EditorView | null;
}

interface Props {
  initialDoc: string;
  onChange: (doc: string) => void;
  onSelectionChange?: (text: string) => void;
}

/**
 * CodeMirror 实例由本组件持有，React 只负责挂载与外部替换文档。
 * 不要让 EditorView 参与 React 渲染，否则每次输入都会重建视图。
 */
export const MarkdownEditor = forwardRef<MarkdownEditorHandle, Props>(
  function MarkdownEditor({ initialDoc, onChange, onSelectionChange }, ref) {
    const host = useRef<HTMLDivElement>(null);
    const viewRef = useRef<EditorView | null>(null);
    const onChangeRef = useRef(onChange);
    const onSelectionRef = useRef(onSelectionChange);

    useEffect(() => {
      onChangeRef.current = onChange;
    }, [onChange]);

    useEffect(() => {
      onSelectionRef.current = onSelectionChange;
    }, [onSelectionChange]);

    useEffect(() => {
      const element = host.current;
      if (!element) return;

      const view = createEditor({
        parent: element,
        doc: initialDoc,
        onChange: (doc) => onChangeRef.current(doc),
        onSelection: (text) => onSelectionRef.current?.(text),
      });
      viewRef.current = view;
      // 调试用：桌面端/浏览器都能从控制台拿到 EditorView。
      if (import.meta.env.DEV) {
        (window as unknown as { __wrView?: EditorView }).__wrView = view;
      }
      view.focus();

      return () => {
        view.destroy();
        viewRef.current = null;
      };
      // 故意只跑一次：initialDoc 仅在挂载时生效，后续通过 handle.setDoc 替换。
    }, []);

    useImperativeHandle(
      ref,
      () => ({
        setDoc(text: string) {
          const view = viewRef.current;
          if (!view) return;
          // 文本没变（挂载时 App 会把同一份文本再同步一次）：别把光标打回 0，
          // 否则 front matter 的摘要会被「光标在块内」重新展开成原始 YAML。
          if (view.state.doc.toString() === text) {
            view.focus();
            return;
          }
          view.dispatch({
            changes: { from: 0, to: view.state.doc.length, insert: text },
            selection: { anchor: initialCaret(text) },
          });
          view.focus();
        },
        focus() {
          viewRef.current?.focus();
        },
        goTo(pos: number) {
          const view = viewRef.current;
          if (!view) return;
          const target = Math.max(0, Math.min(pos, view.state.doc.length));
          view.dispatch({
            selection: { anchor: target },
            effects: EditorView.scrollIntoView(target, { y: "center" }),
          });
          view.focus();
        },
        selectRange(from: number, to: number) {
          const view = viewRef.current;
          if (!view) return;
          const length = view.state.doc.length;
          const start = Math.max(0, Math.min(from, length));
          const end = Math.max(start, Math.min(to, length));
          view.dispatch({
            selection: { anchor: start, head: end },
            effects: EditorView.scrollIntoView(start, { y: "center" }),
          });
        },
        setSourceMode(enabled: boolean) {
          const view = viewRef.current;
          if (view) setSourceMode(view, enabled);
        },
        setViewModes(modes: ViewModes) {
          const view = viewRef.current;
          if (view) setViewModes(view, modes);
        },
        setEditorOptions(options: EditorOptions) {
          const view = viewRef.current;
          if (view) setEditorOptions(view, options);
        },
        refreshPreview() {
          const view = viewRef.current;
          if (view) requestPreviewRefresh(view);
        },
        getView() {
          return viewRef.current;
        },
        openSearch() {
          const view = viewRef.current;
          if (!view) return;
          view.focus();
          openSearchPanel(view);
        },
      }),
      [],
    );

    return <div className="wr-editor" ref={host} />;
  },
);
