import { getData } from '../api-response.js';

export function createAttachmentApi({ requestJson }) {
  async function uploadAttachmentImage(input) {
    const attachment = getData(await requestJson('/api/storage/attachments', {
      method: 'POST',
      body: JSON.stringify(input)
    }));

    if (!attachment?.id) {
      throw new Error('Image upload response is missing attachment id');
    }

    return {
      attachment,
      contentUrl: `/api/storage/attachments/${encodeURIComponent(attachment.id)}/content`
    };
  }

  return { uploadAttachmentImage };
}
