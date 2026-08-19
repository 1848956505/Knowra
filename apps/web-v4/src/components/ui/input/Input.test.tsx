import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Checkbox, SearchField, Select, TextField } from './index';

describe('V4-04 TextField', () => {
  it('associates label and input', () => {
    render(<TextField label="标题" />);
    const input = screen.getByLabelText('标题');
    expect(input).toBeInTheDocument();
  });

  it('marks required fields with the asterisk and aria-required', () => {
    render(<TextField label="标题" isRequired />);
    const input = screen.getByLabelText(/标题/);
    expect(input).toBeRequired();
  });

  it('renders the error message when isInvalid is set', () => {
    render(<TextField label="标题" isInvalid errorMessage="标题已被占用" defaultValue="重复" />);
    expect(screen.getByText('标题已被占用')).toBeInTheDocument();
  });
});

describe('V4-04 SearchField', () => {
  it('updates the value through controlled onChange', async () => {
    const user = userEvent.setup();
    function Demo() {
      return (
        <SearchField
          label="搜索"
          placeholder="关键词"
          onChange={() => undefined}
        />
      );
    }
    render(<Demo />);
    const input = screen.getByLabelText('搜索') as HTMLInputElement;
    await user.type(input, 'hello');
    expect(input.value).toBe('hello');
  });

  it('keeps the clear button absent when value is empty and shows it on input', async () => {
    const user = userEvent.setup();
    function Demo() {
      return (
        <SearchField label="搜索" onChange={() => undefined} onClear={() => undefined} />
      );
    }
    render(<Demo />);
    const input = screen.getByLabelText('搜索') as HTMLInputElement;
    // V4-04 验收 P1-1：空值时清除按钮不应出现在 DOM 中
    expect(screen.queryByTestId('search-clear')).toBeNull();
    await user.type(input, '印格');
    expect(input.value).toBe('印格');
    expect(screen.getByTestId('search-clear')).toBeInTheDocument();
    // 点击清除：按钮消失，value 清空
    // （焦点回收的端到端契约由 Playwright SearchField 清除按钮契约覆盖；
    //  jsdom 下 requestAnimationFrame 时序不稳定，单元测试只断言可观察的 DOM 变化。）
    await user.click(screen.getByTestId('search-clear'));
    expect(input.value).toBe('');
    expect(screen.queryByTestId('search-clear')).toBeNull();
  });
});

describe('V4-04 Checkbox', () => {
  it('toggles selected state on click', async () => {
    const user = userEvent.setup();
    render(<Checkbox>记住我</Checkbox>);
    const checkbox = screen.getByRole('checkbox', { name: '记住我' });
    expect(checkbox).not.toBeChecked();
    await user.click(checkbox);
    expect(checkbox).toBeChecked();
  });

  it('exposes indeterminate state when isIndeterminate is set', () => {
    render(<Checkbox isIndeterminate>混合</Checkbox>);
    const checkbox = screen.getByRole('checkbox', { name: '混合' });
    // React Aria 通过 data-indeterminate 表达未决状态，aria-checked 仍可能为 false。
    const wrapper = checkbox.closest('[data-indeterminate]');
    expect(wrapper).toBeTruthy();
  });
});

describe('V4-04 Select', () => {
  it('opens a listbox popover and selects an option', async () => {
    const user = userEvent.setup();
    render(
      <Select
        label="排序"
        defaultSelectedKey="updated"
        options={[
          { id: 'updated', label: '按更新时间' },
          { id: 'created', label: '按创建时间' }
        ]}
      />
    );

    const trigger = screen.getByRole('button', { name: /排序/ });
    await user.click(trigger);
    expect(await screen.findByRole('listbox')).toBeInTheDocument();
    const option = screen.getByRole('option', { name: '按创建时间' });
    await user.click(option);
    expect(trigger).toHaveTextContent('按创建时间');
  });
});
