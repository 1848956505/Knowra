import { render, screen, waitFor } from '@testing-library/react';
import { ReadableMarkdown } from './ReadableMarkdown';

it('空标题行仍可继续显示后面的聊天正文', () => {
  render(<ReadableMarkdown text={'# \n## \n### \n正文'} />);
  expect(screen.getByText('正文')).toBeInTheDocument();
  expect(screen.getByText('#')).toBeInTheDocument();
});

it('渲染对话中的行内与块公式，金额保持原文', async () => {
  const { container } = render(<ReadableMarkdown text={'设 $x^2$ 成立，价格 $5 和 $10。\n\n$$\n\\frac{a}{b}\n$$\n\n结束'} />);
  await waitFor(() => expect(container.querySelectorAll('.katex').length).toBe(2));
  expect(container).toHaveTextContent('价格 $5 和 $10。');
  expect(screen.getByText('结束')).toBeInTheDocument();
});
