import { AppHttpError } from "./errors.ts";

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
const MAX_ENTRIES = 10_000;
const MAX_EXPANDED_BYTES = 500 * 1024 * 1024;

export function validatePptxStructure(bytes: Uint8Array): void {
  if (bytes.byteLength < 22) {
    throw invalidPptx("文件不是完整的 PPTX ZIP 包。");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocdStart = Math.max(0, bytes.byteLength - 65_557);
  let eocdOffset = -1;
  for (let offset = bytes.byteLength - 22; offset >= eocdStart; offset -= 1) {
    if (view.getUint32(offset, true) === EOCD_SIGNATURE) {
      eocdOffset = offset;
      break;
    }
  }
  if (eocdOffset < 0) {
    throw invalidPptx("文件缺少 ZIP 中央目录。");
  }

  const entryCount = view.getUint16(eocdOffset + 10, true);
  const directorySize = view.getUint32(eocdOffset + 12, true);
  const directoryOffset = view.getUint32(eocdOffset + 16, true);
  if (entryCount < 1 || entryCount > MAX_ENTRIES) {
    throw invalidPptx("PPTX 内部条目数量异常。");
  }
  if (directoryOffset + directorySize > eocdOffset) {
    throw invalidPptx("PPTX 中央目录范围无效。");
  }

  const names = new Set<string>();
  let expandedBytes = 0;
  let offset = directoryOffset;
  const decoder = new TextDecoder("utf-8", { fatal: false });
  for (let index = 0; index < entryCount; index += 1) {
    if (offset + 46 > eocdOffset || view.getUint32(offset, true) !== CENTRAL_DIRECTORY_SIGNATURE) {
      throw invalidPptx("PPTX 中央目录条目损坏。");
    }
    const flags = view.getUint16(offset + 8, true);
    if ((flags & 0x1) !== 0) {
      throw new AppHttpError(
        422,
        "ENCRYPTED_PPTX",
        "课件已加密，请在 PowerPoint 中取消密码保护后重试。",
        false,
      );
    }
    expandedBytes += view.getUint32(offset + 24, true);
    if (expandedBytes > MAX_EXPANDED_BYTES) {
      throw invalidPptx("PPTX 解压后体积超过阶段 T 安全上限。");
    }
    const fileNameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const nameStart = offset + 46;
    const nextOffset = nameStart + fileNameLength + extraLength + commentLength;
    if (nextOffset > eocdOffset) {
      throw invalidPptx("PPTX 条目名称范围无效。");
    }
    names.add(decoder.decode(bytes.subarray(nameStart, nameStart + fileNameLength)));
    offset = nextOffset;
  }

  if (!names.has("[Content_Types].xml") || !names.has("ppt/presentation.xml")) {
    throw invalidPptx("ZIP 包缺少 PPTX 必需结构。");
  }
}

export function validateLegacyPptStructure(bytes: Uint8Array): void {
  const oleHeader = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
  const validHeader = bytes.byteLength >= 512 && oleHeader.every((value, index) => bytes[index] === value);
  if (!validHeader) {
    throw new AppHttpError(422, "INVALID_PPT_STRUCTURE", "旧版 PPT 文件结构无效或已损坏。", false);
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint16(0x1c, true) !== 0xfffe || view.getUint16(0x1e, true) !== 9) {
    throw new AppHttpError(422, "INVALID_PPT_STRUCTURE", "旧版 PPT 的复合文档头无效。", false);
  }
}

function invalidPptx(message: string): AppHttpError {
  return new AppHttpError(422, "INVALID_PPTX_STRUCTURE", message, false);
}
