import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const DEFAULT_API_ORIGIN = 'http://127.0.0.1:3001';
const DEFAULT_NOTE_ID = 'note-transformer-1781768288411';
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 20_000;

const imageManifest = [
  {
    sourceUrl: 'http://www.uml.org.cn/ai/images/2024102243.png',
    fileName: 'transformer-architecture-01.png'
  },
  {
    sourceUrl: 'http://www.uml.org.cn/ai/images/20241022411.png',
    fileName: 'transformer-architecture-02.png'
  },
  {
    sourceUrl: 'http://www.uml.org.cn/ai/images/20241022412.png',
    fileName: 'transformer-architecture-03.png'
  },
  {
    sourceUrl: 'http://www.uml.org.cn/ai/images/20241022413.png',
    fileName: 'transformer-architecture-04.png'
  },
  {
    sourceUrl: 'http://www.uml.org.cn/ai/images/2024102241.png',
    fileName: 'transformer-architecture-05.png'
  }
];

export async function migrateTransformerHttpImages({
  apiOrigin = DEFAULT_API_ORIGIN,
  noteId = DEFAULT_NOTE_ID,
  apply = false,
  log = console.log
} = {}) {
  const normalizedOrigin = normalizeOrigin(apiOrigin);
  const note = await requestJson(
    new URL(`/api/knowledge/notes/${encodeURIComponent(noteId)}`, normalizedOrigin)
  );
  const matches = inspectManifestMatches(note.rawMarkdown);

  if (matches.total === 0) {
    log(JSON.stringify({
      status: 'already-migrated',
      noteId,
      externalImageCount: 0
    }));
    return { status: 'already-migrated', noteId, attachments: [] };
  }

  if (matches.total !== imageManifest.length || matches.missing.length > 0) {
    throw new Error(
      `Expected ${imageManifest.length} external images, found ${matches.total}; `
      + `missing: ${matches.missing.join(', ') || 'none'}`
    );
  }

  if (!apply) {
    log(JSON.stringify({
      status: 'dry-run',
      noteId,
      title: note.title,
      externalImageCount: matches.total,
      sourceUrls: imageManifest.map(({ sourceUrl }) => sourceUrl)
    }, null, 2));
    return { status: 'dry-run', noteId, attachments: [] };
  }

  const createdAttachments = [];
  let patchAttempted = false;

  try {
    let nextMarkdown = note.rawMarkdown;

    for (const item of imageManifest) {
      const image = await downloadImage(item.sourceUrl);
      const attachment = await requestJson(
        new URL('/api/storage/attachments', normalizedOrigin),
        {
          method: 'POST',
          body: {
            noteId,
            fileName: item.fileName,
            mimeType: image.mimeType,
            contentBase64: image.content.toString('base64')
          }
        }
      );
      createdAttachments.push(attachment);
      nextMarkdown = nextMarkdown.replaceAll(
        item.sourceUrl,
        buildAttachmentReferenceUrl(attachment.id)
      );
    }

    patchAttempted = true;
    await requestJson(
      new URL(`/api/knowledge/notes/${encodeURIComponent(noteId)}`, normalizedOrigin),
      {
        method: 'PATCH',
        body: { rawMarkdown: nextMarkdown }
      }
    );

    const verifiedNote = await requestJson(
      new URL(`/api/knowledge/notes/${encodeURIComponent(noteId)}`, normalizedOrigin)
    );
    verifyMigratedMarkdown(verifiedNote.rawMarkdown, createdAttachments);
    await verifyAttachmentContent(normalizedOrigin, createdAttachments);

    const result = {
      status: 'migrated',
      noteId,
      externalImageCount: 0,
      attachments: createdAttachments.map(({ id, fileName, size }) => ({
        id,
        fileName,
        size
      }))
    };
    log(JSON.stringify(result, null, 2));
    return result;
  } catch (error) {
    if (!patchAttempted) {
      await cleanupAttachments(normalizedOrigin, createdAttachments, log);
    }
    throw error;
  }
}

function inspectManifestMatches(markdown = '') {
  const source = String(markdown);
  const counts = imageManifest.map(({ sourceUrl }) => ({
    sourceUrl,
    count: source.split(sourceUrl).length - 1
  }));

  return {
    total: counts.reduce((sum, item) => sum + item.count, 0),
    missing: counts.filter(({ count }) => count === 0).map(({ sourceUrl }) => sourceUrl)
  };
}

async function downloadImage(sourceUrl) {
  const response = await fetch(sourceUrl, {
    headers: {
      Referer: 'http://www.uml.org.cn/',
      'User-Agent': 'Mozilla/5.0 Knowra image migration'
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  });

  if (!response.ok) {
    throw new Error(`Image download failed (${response.status}): ${sourceUrl}`);
  }

  const mimeType = String(response.headers.get('content-type') || '')
    .split(';')[0]
    .trim()
    .toLowerCase();
  if (!mimeType.startsWith('image/')) {
    throw new Error(`Unexpected image content type "${mimeType}": ${sourceUrl}`);
  }

  const content = Buffer.from(await response.arrayBuffer());
  if (content.byteLength === 0 || content.byteLength > MAX_IMAGE_BYTES) {
    throw new Error(`Invalid image size ${content.byteLength}: ${sourceUrl}`);
  }

  return { content, mimeType };
}

async function verifyAttachmentContent(apiOrigin, attachments) {
  for (const attachment of attachments) {
    const response = await fetch(
      new URL(
        `/api/storage/attachments/${encodeURIComponent(attachment.id)}/content`,
        apiOrigin
      ),
      { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) }
    );
    if (!response.ok) {
      throw new Error(
        `Attachment verification failed (${response.status}): ${attachment.id}`
      );
    }
    const content = await response.arrayBuffer();
    if (content.byteLength !== attachment.size) {
      throw new Error(`Attachment size mismatch: ${attachment.id}`);
    }
  }
}

function verifyMigratedMarkdown(markdown = '', attachments) {
  const source = String(markdown);
  for (const { sourceUrl } of imageManifest) {
    if (source.includes(sourceUrl)) {
      throw new Error(`External image URL remains after migration: ${sourceUrl}`);
    }
  }
  for (const attachment of attachments) {
    if (!source.includes(buildAttachmentReferenceUrl(attachment.id))) {
      throw new Error(`Attachment reference missing after migration: ${attachment.id}`);
    }
  }
}

async function cleanupAttachments(apiOrigin, attachments, log) {
  for (const attachment of attachments.reverse()) {
    try {
      await requestJson(
        new URL(`/api/storage/attachments/${encodeURIComponent(attachment.id)}`, apiOrigin),
        { method: 'DELETE' }
      );
    } catch (error) {
      log(`cleanup failed for ${attachment.id}: ${error.message}`);
    }
  }
}

async function requestJson(url, { method = 'GET', body } = {}) {
  const response = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      `${method} ${url.pathname} failed (${response.status}): `
      + `${payload?.error?.message || 'unknown response'}`
    );
  }
  return payload?.data;
}

function buildAttachmentReferenceUrl(attachmentId) {
  const encodedId = encodeURIComponent(attachmentId);
  return `/api/storage/attachments/${encodedId}/content#attachment=${encodedId}`;
}

function normalizeOrigin(value) {
  const normalized = new URL(value);
  normalized.pathname = '/';
  normalized.search = '';
  normalized.hash = '';
  return normalized;
}

function parseArguments(argv) {
  const options = {
    apiOrigin: process.env.KNOWRA_API_ORIGIN || DEFAULT_API_ORIGIN,
    noteId: DEFAULT_NOTE_ID,
    apply: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--apply') {
      options.apply = true;
    } else if (argument === '--api-origin') {
      options.apiOrigin = argv[index += 1];
    } else if (argument === '--note-id') {
      options.noteId = argv[index += 1];
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  return options;
}

const currentFile = fileURLToPath(import.meta.url);
const invokedFile = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (currentFile === invokedFile) {
  migrateTransformerHttpImages(parseArguments(process.argv.slice(2)))
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
