import { Component, type ErrorInfo, type ReactNode } from "react";

import { reportError } from "../logging/report";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
  componentStack: string;
}

/**
 * 渲染错误的最后一道防线。
 *
 * 没有它时，一次渲染期异常会让整个 React 树卸载，窗口只剩纯白底 + 原生菜单，
 * 看起来就是「程序死了」。这里换成一张能操作的面板：错误写日志、可复制、可重载。
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, componentStack: "" };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    const stack = info.componentStack ?? "";
    this.setState({ componentStack: stack });
    reportError("react", error, stack);
  }

  private copy = (): void => {
    const text = [this.state.error?.stack, this.state.componentStack].filter(Boolean).join("\n\n");
    void navigator.clipboard.writeText(text).catch(() => undefined);
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="wr-crash" role="alert">
        <h1>界面出错了</h1>
        <p>错误已经写进运行日志。文档草稿会自动恢复，可以先重新加载界面。</p>
        <pre>{error.message || String(error)}</pre>
        <p className="wr-crash-hint">日志：帮助 → 打开日志文件夹（userData/logs/writara.log）</p>
        <div className="wr-crash-actions">
          <button type="button" className="wr-button" onClick={this.copy}>
            复制错误
          </button>
          <button
            type="button"
            className="wr-button wr-button-primary"
            onClick={() => window.location.reload()}
          >
            重新加载
          </button>
          <button
            type="button"
            className="wr-button"
            onClick={() => void window.writara?.logs.open()}
          >
            打开日志文件夹
          </button>
        </div>
      </div>
    );
  }
}
