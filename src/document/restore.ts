/**
 * 重新打开时该用「磁盘内容」还是「本地草稿」。
 *
 * 原则：两边都不静默丢。
 * - 草稿没有新内容 → 采用磁盘。
 * - 草稿有新内容 → 保留草稿；磁盘也被外部改过时给出提示，保存前还会再确认。
 */

export interface RestoreInput {
  /** 本地草稿文本。 */
  draft: string;
  /** 是否存在草稿（首次打开没有）。 */
  hadDraft: boolean;
  /** 上次保存/加载时的文本。 */
  recordText: string;
  /** 当前磁盘内容；读不到（无权限/文件没了）为 null。 */
  disk: string | null;
}

export interface RestoreDecision {
  text: string;
  savedText: string;
  notice: string | null;
}

export function decideRestore(input: RestoreInput): RestoreDecision {
  const { draft, hadDraft, recordText, disk } = input;

  if (disk === null) {
    return {
      text: draft,
      savedText: recordText,
      notice: "上次的文件需要重新授权后才能保存回原文件。",
    };
  }

  if (!hadDraft || draft === recordText) {
    return { text: disk, savedText: disk, notice: null };
  }

  if (disk !== recordText) {
    return {
      text: draft,
      savedText: recordText,
      notice: "磁盘上的文件已被修改。当前显示的是本地草稿，保存时会先确认。",
    };
  }

  return { text: draft, savedText: recordText, notice: null };
}
