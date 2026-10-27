import { parseFrontMatter } from "./frontmatter";
import { writaraParser } from "./parser";

export interface OutlineItem {
  level: number;
  text: string;
  /** 在原文中的位置（已加上 front matter 的偏移）。 */
  from: number;
}

const HEADING = /^(?:ATX|Setext)Heading([1-6])$/;

/** 去掉标题里的标记，只留可显示的文本。 */
export function plainHeading(source: string): string {
  return source
    .replace(/^[ \t]*#{1,6}[ \t]*/m, "")
    .replace(/[ \t]+#+[ \t]*$/, "")
    .replace(/^[ \t]*(?:=+|-+)[ \t]*$/m, "")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*_`~]/g, "")
    .trim();
}

/** 大纲：标题层级 + 文本 + 原文位置，供侧栏跳转。 */
export function collectOutline(source: string): OutlineItem[] {
  const front = parseFrontMatter(source);
  const body = front ? front.body : source;
  const offset = front ? front.to : 0;
  const tree = writaraParser.parse(body);
  const items: OutlineItem[] = [];

  tree.iterate({
    enter: (node) => {
      const match = HEADING.exec(node.name);
      if (!match) return;
      const text = plainHeading(body.slice(node.from, node.to));
      if (!text) return;
      items.push({ level: Number(match[1]), text, from: node.from + offset });
    },
  });

  return items;
}
