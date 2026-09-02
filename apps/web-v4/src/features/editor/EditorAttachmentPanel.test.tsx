import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { EditorAttachmentPanel } from './EditorAttachmentPanel';
import { buildAttachmentReferenceUrl } from './attachmentFiles';

const attachment = {
  id: 'attachment-1', noteId: 'note-1', fileName: 'diagram.png',
  mimeType: 'image/png', size: 2048, status: 'ready'
};

describe('EditorAttachmentPanel', () => {
  it('opens stored files and protects attachments referenced by the document', () => {
    renderPanel({ markdown: `![图](${buildAttachmentReferenceUrl(attachment.id)})` });
    expect(screen.getByRole('link', { name: /diagram\.png/ })).toHaveAttribute(
      'href', '/api/storage/attachments/attachment-1/content'
    );
    expect(screen.getByText('正文中')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '删除附件 diagram.png' })).toBeDisabled();
  });

  it('uploads, renames and confirms deletion of an unreferenced attachment', async () => {
    const user = userEvent.setup();
    const onUpload = vi.fn().mockResolvedValue(attachment);
    const onRename = vi.fn().mockResolvedValue({ ...attachment, fileName: 'architecture.png' });
    const onDelete = vi.fn().mockResolvedValue(undefined);
    renderPanel({ onUpload, onRename, onDelete });

    const file = new File(['image'], 'new.png', { type: 'image/png' });
    await user.upload(screen.getByLabelText('选择要上传的附件'), file);
    expect(onUpload).toHaveBeenCalledWith(file);

    await user.click(screen.getByRole('button', { name: '重命名附件 diagram.png' }));
    const fileName = screen.getByRole('textbox', { name: '文件名' });
    await user.clear(fileName);
    await user.type(fileName, 'architecture.png');
    await user.click(screen.getByRole('button', { name: '保存文件名' }));
    expect(onRename).toHaveBeenCalledWith('attachment-1', 'architecture.png');

    await user.click(screen.getByRole('button', { name: '删除附件 diagram.png' }));
    expect(screen.getByRole('dialog', { name: '删除附件？' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '删除附件' }));
    expect(onDelete).toHaveBeenCalledWith('attachment-1');
  });
});

function renderPanel(overrides: Partial<Parameters<typeof EditorAttachmentPanel>[0]> = {}) {
  return render(<EditorAttachmentPanel
    attachments={[attachment]}
    markdown=""
    canWrite
    loading={false}
    onUpload={vi.fn().mockResolvedValue(attachment)}
    onRename={vi.fn().mockResolvedValue(attachment)}
    onDelete={vi.fn().mockResolvedValue(undefined)}
    {...overrides}
  />);
}
