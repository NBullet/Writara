import type { UpdateStatus } from "../updates/types";

interface Props {
  status: UpdateStatus;
  visible: boolean;
  onDownload: () => void;
  onInstall: () => void;
  onDismiss: () => void;
}

/**
 * 更新提示条。
 *
 * 和外部修改 / 文件错误用的是同一套 `.wr-banner`：固定在正文上方的浮层，
 * 不挤动排版。只处理三种状态：可下载、下载中、可安装。
 */
export function UpdateBanner({ status, visible, onDownload, onInstall, onDismiss }: Props) {
  if (!visible) return null;

  if (status.state === "available") {
    return (
      <div className="wr-banner" role="status">
        <span className="wr-banner-text">
          发现新版本 v{status.version}
          {status.notes ? <span className="wr-update-note"> · {status.notes}</span> : null}
        </span>
        <span className="wr-banner-actions">
          <button type="button" className="wr-button wr-button-primary" onClick={onDownload}>
            下载
          </button>
          <button type="button" className="wr-button" onClick={onDismiss}>
            稍后
          </button>
        </span>
      </div>
    );
  }

  if (status.state === "downloading") {
    return (
      <div className="wr-banner" role="status">
        <span className="wr-banner-text">
          正在下载 v{status.version}
          <span className="wr-update-progress" aria-hidden="true">
            <i style={{ width: `${status.percent}%` }} />
          </span>
          {status.percent}%
        </span>
        <span className="wr-banner-actions">
          <button type="button" className="wr-button" onClick={onDismiss}>
            收起
          </button>
        </span>
      </div>
    );
  }

  if (status.state === "downloaded") {
    return (
      <div className="wr-banner" role="status">
        <span className="wr-banner-text">v{status.version} 已下载，重启后完成安装</span>
        <span className="wr-banner-actions">
          <button type="button" className="wr-button wr-button-primary" onClick={onInstall}>
            重启并安装
          </button>
          <button type="button" className="wr-button" onClick={onDismiss}>
            稍后
          </button>
        </span>
      </div>
    );
  }

  return null;
}
