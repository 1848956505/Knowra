import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseConversationAttachment, createConversationAttachmentParser, ATTACHMENT_PARSE_LIMITS } from '../src/modules/ai/conversation-attachment-parsers/index.js';
import { docx, pdf, png, jpeg, zip } from './fixtures/conversation-attachment-parsers/synthetic.mjs';
const parse = (buffer, fileName, mimeType) => parseConversationAttachment({ buffer, fileName, mimeType });
const docxMime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const assertFailure = (result, code) => { assert.equal(result.status, 'failed'); assert.equal(result.errorCode, code); assert.equal(result.text, ''); assert.deepEqual(result.segments, []); };
const fixturePath = name => fileURLToPath(new URL(`./fixtures/conversation-attachment-parsers/${name}`, import.meta.url));
export const aiConversationAttachmentParserTests = [
  { name: '附件解析 TXT/MD 严格UTF8与BOM，UTF16偏移包含emoji且不转换内容', async run() {
    const text = '# 合成标题\n正文 😀\r\n';
    for (const [fileName, mimeType, kind] of [['资料.TXT','text/plain; charset=UTF-8','text'], ['资料.md','text/markdown','markdown'], ['资料.markdown','text/markdown','markdown']]) {
      const result = await parse(Buffer.concat([Buffer.from([0xef,0xbb,0xbf]),Buffer.from(text)]), fileName, mimeType);
      assert.equal(result.status,'ready'); assert.equal(result.kind,kind); assert.equal(result.text,text);
      assert.equal(result.segments[0].start,0); assert.equal(result.segments[0].end,text.length);
    }
    assertFailure(await parse(Buffer.from([0xc3,0x28]),'invalid.txt','text/plain'),'AI_ATTACHMENT_ENCODING_INVALID');
    assertFailure(await parse(Buffer.from([0xff,0xfe,0x41,0]),'utf16.txt','text/plain'),'AI_ATTACHMENT_ENCODING_INVALID');
    assertFailure(await parse(Buffer.from([0x41,0,0x42]),'binary.txt','text/plain'),'AI_ATTACHMENT_BINARY_TEXT');
  } },
  { name: '附件解析文件类型与MIME签名拒绝伪装、空文件、超限和旧DOC', async run() {
    assertFailure(await parse(pdf(),'pretend.txt','text/plain'),'AI_ATTACHMENT_MIME_MISMATCH');
    assertFailure(await parse(Buffer.from('text'),'pretend.pdf','application/pdf'),'AI_ATTACHMENT_MIME_MISMATCH');
    assertFailure(await parse(Buffer.from('text'),'pretend.md','image/png'),'AI_ATTACHMENT_MIME_MISMATCH');
    assertFailure(await parse(Buffer.alloc(0),'empty.txt','text/plain'),'AI_ATTACHMENT_EMPTY');
    assertFailure(await parse(Buffer.alloc(ATTACHMENT_PARSE_LIMITS.fileBytes+1),'big.txt','text/plain'),'AI_ATTACHMENT_FILE_LIMIT');
    const old = await parse(Buffer.from([0xd0,0xcf,0x11,0xe0,0xa1,0xb1,0x1a,0xe1]),'old.doc','application/msword');
    assert.equal(old.status,'unsupported'); assert.equal(old.errorCode,'AI_ATTACHMENT_DOC_UNSUPPORTED'); assert.equal(old.text,'');
  } },
  { name: '附件解析DOCX真实库提取中文段落与准确offset，不输出HTML', async run() {
    const result=await parse(docx(),'合成.docx',docxMime); assert.equal(result.status,'ready');
    assert.deepEqual(result.segments.map(segment=>result.text.slice(segment.start,segment.end)),['合成文档第一段','第二段 😀']);
    assert(!result.text.includes('<w:')); assert(result.segments.every(segment=>segment.end<=result.text.length));
  } },
  { name: '附件解析DOCX拒绝DTD实体、外部文件关系、损坏CRC与非Word ZIP', async run() {
    assertFailure(await parse(docx({documentPrefix:'<!DOCTYPE doc [<!ENTITY x SYSTEM "http://127.0.0.1/secret">]>'}),'entity.docx',docxMime),'AI_ATTACHMENT_XML_UNSAFE');
    assertFailure(await parse(docx({extras:[{name:'word/_rels/document.xml.rels',data:'<Relationships><Relationship Id="external" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="file:///secret" TargetMode="External"/></Relationships>'}]}),'external.docx',docxMime),'AI_ATTACHMENT_EXTERNAL_REFERENCE');
    const invalid=zip([{name:'word/document.xml',data:'word content',compressed:false}]); invalid[30+Buffer.byteLength('word/document.xml')]=0x5a;
    assertFailure(await parse(invalid,'crc.docx',docxMime),'AI_ATTACHMENT_DOCUMENT_INVALID');
    assertFailure(await parse(zip([{name:'arbitrary.txt',data:'zip is not docx'}]),'fake.docx',docxMime),'AI_ATTACHMENT_DOCUMENT_INVALID');
  } },
  { name: '附件解析DOCX加密、ZIP路径、zipbomb和条目上限均失败且不截断为ready', async run() {
    assertFailure(await parse(zip([{name:'word/document.xml',data:'encrypted',encrypted:true}]),'encrypted.docx',docxMime),'AI_ATTACHMENT_ENCRYPTED');
    assertFailure(await parse(Buffer.from([0xd0,0xcf,0x11,0xe0,0xa1,0xb1,0x1a,0xe1]),'encrypted.docx',docxMime),'AI_ATTACHMENT_ENCRYPTED');
    const slip=await parse(zip([{name:'../outside.xml',data:'<unsafe/>'}]),'slip.docx',docxMime); assert.equal(slip.status,'failed');
    assertFailure(await parse(zip([{name:'word/document.xml',data:'x'.repeat(1000000)}]),'bomb.docx',docxMime),'AI_ATTACHMENT_EXPANSION_LIMIT');
    assertFailure(await parse(zip(Array.from({length:257},(_,i)=>({name:`entry-${i}.txt`,data:'x'}))),'entries.docx',docxMime),'AI_ATTACHMENT_ARCHIVE_LIMIT');
  } },
  { name: '附件解析PDF真实文字层保持页码与精确可引用片段', async run() {
    const result=await parse(pdf(),'合成.pdf','application/pdf'); assert.equal(result.status,'ready');
    assert.equal(result.text,'Synthetic page one\n\nSynthetic page two');
    assert.deepEqual(result.segments.map(segment=>({page:segment.page,text:result.text.slice(segment.start,segment.end)})),
      [{page:1,text:'Synthetic page one'},{page:2,text:'Synthetic page two'}]);
  } },
  { name: '附件解析PDF扫描无文字层、加密、损坏和页数超限给出明确错误', async run() {
    assertFailure(await parse(pdf([null]),'scan.pdf','application/pdf'),'AI_ATTACHMENT_PDF_NO_TEXT_LAYER');
    assertFailure(await parse(pdf(['Encrypted'],{encrypted:true}),'encrypted.pdf','application/pdf'),'AI_ATTACHMENT_ENCRYPTED');
    assertFailure(await parse(Buffer.from('%PDF-1.7\nbroken'),'broken.pdf','application/pdf'),'AI_ATTACHMENT_DOCUMENT_INVALID');
    assertFailure(await parse(pdf(Array.from({length:101},()=>null)),'pages.pdf','application/pdf'),'AI_ATTACHMENT_PAGE_LIMIT');
  } },
  { name: '附件解析PNG/JPEG只验证元数据并明确视觉不支持，损坏和像素超限拒绝', async run() {
    for (const [buffer,fileName,mime] of [[png(),'synthetic.png','image/png'],[jpeg(),'synthetic.jpg','image/jpeg']]) {
      const result=await parse(buffer,fileName,mime); assert.equal(result.status,'unsupported'); assert.equal(result.errorCode,'AI_ATTACHMENT_VISION_UNSUPPORTED');
      assert.equal(result.width,1); assert.equal(result.height,1); assert.equal(result.text,''); assert.deepEqual(result.segments,[]);
    }
    const corrupt=png(); corrupt[corrupt.length-1]^=1;
    assertFailure(await parse(corrupt,'crc.png','image/png'),'AI_ATTACHMENT_IMAGE_INVALID');
    assertFailure(await parse(jpeg().subarray(0,-2),'broken.jpg','image/jpeg'),'AI_ATTACHMENT_IMAGE_INVALID');
    assertFailure(await parse(png(5000,5000),'pixels.png','image/png'),'AI_ATTACHMENT_IMAGE_LIMIT');
  } },
  { name: '附件解析文本正文上限不会返回不完整ready文本', async run() {
    assertFailure(await parse(Buffer.from('x'.repeat(200001)),'text-limit.txt','text/plain'),'AI_ATTACHMENT_TEXT_LIMIT');
  } },
  { name: '附件解析进程网络guard拒绝HTTP且宿主本地服务未收到请求', async run() {
    let received=0; const server=createServer((_request,response)=>{received++;response.end('must not be read');});
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    try {
      const guarded=createConversationAttachmentParser({childPath:fixturePath('network-probe.mjs')});
      assertFailure(await guarded({buffer:Buffer.from(`http://127.0.0.1:${server.address().port}/probe`),fileName:'network.txt',mimeType:'text/plain'}),'AI_ATTACHMENT_NETWORK_FORBIDDEN');
      assert.equal(received,0);
    } finally { await new Promise(resolve=>server.close(resolve)); }
  } },
  { name: '附件解析PDF不执行JavaScript OpenAction，也不读取外部URL', async run() {
    let received=0; const server=createServer((_request,response)=>{received++;response.end('external data');});
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    try {
      const activeUrl=`http://127.0.0.1:${server.address().port}/pdf-action`;
      const buffer=pdf(['Visible text only'],{activeUrl}); assert(buffer.includes(Buffer.from('/JavaScript')));
      const result=await parse(buffer,'script.pdf','application/pdf'); assert.equal(result.status,'ready');
      assert.equal(result.text,'Visible text only'); assert(!result.text.includes(activeUrl)); assert.equal(received,0);
    } finally { await new Promise(resolve=>server.close(resolve)); }
  } },
  { name: '附件解析独立进程超时和OOM可控退出，宿主随后仍可解析', async run() {
    const timed=createConversationAttachmentParser({childPath:fixturePath('hang.mjs'),wallTimeMs:50});
    assertFailure(await timed({buffer:Buffer.from('safe'),fileName:'timeout.txt',mimeType:'text/plain'}),'AI_ATTACHMENT_PARSE_TIMEOUT');
    const oom=createConversationAttachmentParser({childPath:fixturePath('oom.mjs')});
    assertFailure(await oom({buffer:Buffer.from('safe'),fileName:'oom.txt',mimeType:'text/plain'}),'AI_ATTACHMENT_PARSE_RESOURCE_LIMIT');
    assert.equal((await parse(Buffer.from('still alive'),'alive.txt','text/plain')).status,'ready');
  } },
  { name: '附件解析并发有硬上限，超时回收后不会永久占用解析槽', async run() {
    const timed=createConversationAttachmentParser({childPath:fixturePath('hang.mjs'),wallTimeMs:250});
    const input={buffer:Buffer.from('safe'),fileName:'slots.txt',mimeType:'text/plain'};
    const one=timed(input), two=timed(input);
    assertFailure(await parseConversationAttachment(input),'AI_ATTACHMENT_PARSER_BUSY');
    for (const result of await Promise.all([one,two])) assertFailure(result,'AI_ATTACHMENT_PARSE_TIMEOUT');
    assert.equal((await parseConversationAttachment(input)).status,'ready');
  } },
  { name: '附件解析release目录重定位与依赖符号链接仍可安全加载DOCX/PDF', async run() {
    const root=fs.mkdtempSync(path.join(os.tmpdir(),'knowra-parser-release-test-'));
    try {
      const source=fileURLToPath(new URL('../src/modules/ai/conversation-attachment-parsers/',import.meta.url));
      const target=path.join(root,'release/apps/api/src/modules/ai/conversation-attachment-parsers');
      fs.mkdirSync(path.dirname(target),{recursive:true});fs.cpSync(source,target,{recursive:true});
      const packageRoot=path.dirname(fileURLToPath(import.meta.resolve('mammoth'))).split(`${path.sep}node_modules${path.sep}`)[0];
      fs.symlinkSync(path.join(packageRoot,'node_modules'),path.join(root,'release/node_modules'),'dir');
      const relocated=await import(pathToFileURL(path.join(target,'index.mjs')).href);
      for(const [buffer,fileName,mimeType] of [[docx(),'release.docx',docxMime],[pdf(),'release.pdf','application/pdf']]) {
        const result=await relocated.parseConversationAttachment({buffer,fileName,mimeType});assert.equal(result.status,'ready');
      }
    } finally { fs.rmSync(root,{recursive:true,force:true}); }
  } }
];
