import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BackupRestoreDialog } from './BackupRestoreDialog';

vi.mock('../../store/AppStoreProvider', () => ({
  useAppStore: (selector: (state: Record<string, unknown>) => unknown) => selector({
    editorHasLocalChanges: false, saveState: 'saved', editorSaveError: null
  })
}));
vi.mock('./backupApi', () => ({
  callBackup: vi.fn(async () => ({ items: [
    { id: '1-aaaaaaaa', createdAt: '2026-09-24T00:00:00.000Z', purpose: 'manual', fileCount: 2, size: 1048576 },
    { id: '2-bbbbbbbb', createdAt: '2026-09-23T00:00:00.000Z', purpose: 'legacy-unspecified', fileCount: 2, size: 2097152 }
  ] }))
}));

it('备份列表显示合计占用与未自动清理状态，并识别历史备份', async () => {
  render(<BackupRestoreDialog isOpen onOpenChange={vi.fn()} />);
  expect(await screen.findByText(/本机列出 2 份备份，清单合计 3\.0 MB/)).toBeInTheDocument();
  expect(screen.getByText(/备份目前不会自动到期清理/)).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: /选择备份/ }));
  expect(await screen.findByRole('option', { name: /历史备份.*2\.0 MB/ })).toBeInTheDocument();
});
