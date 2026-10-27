interface Props {
  message: string | null;
}

/**
 * 长操作提示条。
 *
 * 打开大文件、扫描文件夹、合并导出这些操作可能持续几秒；没有提示时窗口看起来像卡死。
 * 固定在外壳左下角、不挡点击、不参与排版；状态由调用方的 `withBusy` 驱动。
 */
export function BusyOverlay({ message }: Props) {
  if (!message) return null;
  return (
    <div className="wr-busy" role="status" aria-live="polite">
      <span className="wr-busy-spinner" aria-hidden="true" />
      <span className="wr-busy-text">{message}</span>
    </div>
  );
}
