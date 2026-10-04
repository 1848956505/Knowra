import type { ReactNode } from 'react';
import styles from './ReadableMarkdown.module.css';

// 对话和成果只显示一小组 Markdown 排版；所有内容保持 React 文本节点，不执行 HTML。
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|\`[^\`]+\`)/g).map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={index}>{part.slice(2, -2)}</strong>;
    if (part.startsWith('\`') && part.endsWith('\`')) return <code key={index}>{part.slice(1, -1)}</code>;
    return part;
  });
}

export function ReadableMarkdown({ text }: { text: string }) {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const blocks: ReactNode[] = [];
  for (let index = 0; index < lines.length;) {
    const line = lines[index];
    if (!line.trim()) { index++; continue; }
    if (line.startsWith('```')) {
      const start = index++;
      const code: string[] = [];
      while (index < lines.length && !lines[index].startsWith('```')) code.push(lines[index++]);
      if (index < lines.length) index++;
      blocks.push(<pre key={start}><code>{code.join('\n')}</code></pre>);
      continue;
    }
    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      const start = index++;
      const content = inline(heading[2]);
      blocks.push(heading[1].length === 1 ? <h2 key={start}>{content}</h2>
        : heading[1].length === 2 ? <h3 key={start}>{content}</h3> : <h4 key={start}>{content}</h4>);
      continue;
    }
    if (/^\s*[-*]\s+/.test(line)) {
      const start = index;
      const items: ReactNode[] = [];
      while (index < lines.length && /^\s*[-*]\s+/.test(lines[index])) {
        items.push(<li key={index}>{inline(lines[index++].replace(/^\s*[-*]\s+/, ''))}</li>);
      }
      blocks.push(<ul key={start}>{items}</ul>);
      continue;
    }
    if (/^>\s?/.test(line)) { blocks.push(<blockquote key={index}>{inline(line.replace(/^>\s?/, ''))}</blockquote>); index++; continue; }
    const start = index;
    const paragraph: string[] = [];
    while (index < lines.length && lines[index].trim() && !/^(#{1,3}\s+\S|```|\s*[-*]\s+|>\s?)/.test(lines[index])) paragraph.push(lines[index++]);
    blocks.push(<p key={start}>{paragraph.length === 1 ? inline(paragraph[0])
      : paragraph.map((part, lineIndex) => <span key={lineIndex}>{lineIndex ? <br /> : null}{inline(part)}</span>)}</p>);
  }
  return <div className={styles.readable}>{blocks}</div>;
}
