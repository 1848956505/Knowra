import { render, screen } from '@testing-library/react';
import { ReadableMarkdown } from './ReadableMarkdown';

it('空标题行仍可继续显示后面的聊天正文', () => {
  render(<ReadableMarkdown text={'# \n## \n### \n正文'} />);
  expect(screen.getByText('正文')).toBeInTheDocument();
  expect(screen.getByText('#')).toBeInTheDocument();
});
