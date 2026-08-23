import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { readCanonicalRtlContract } from './rtl-source-contract.mjs';

const { marker: RTL_ARCHITECTURE_MARKER } = readCanonicalRtlContract(
  path.resolve(import.meta.dirname, '..')
);
const EMBEDDED_BUNDLE_PATH = 'assets/index.android.bundle';
const EMBEDDED_CONFIG_PATH = 'assets/app.config';
const APK_ENTRY_PATHS = [EMBEDDED_BUNDLE_PATH, EMBEDDED_CONFIG_PATH];
const MAX_APK_BYTES = 512 * 1024 * 1024;
const MAX_CENTRAL_DIRECTORY_BYTES = 128 * 1024 * 1024;
const MAX_CENTRAL_DIRECTORY_ENTRIES = 200_000;
const MAX_ENTRY_BYTES = 256 * 1024 * 1024;
const ZIP_EOCD_SIGNATURE = 0x06054b50;
const ZIP_CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
const ZIP_LOCAL_FILE_SIGNATURE = 0x04034b50;
const ZIP64_UINT16_SENTINEL = 0xffff;
const ZIP64_UINT32_SENTINEL = 0xffffffff;

const CRC32_TABLE = new Uint32Array(256);
for (let index = 0; index < CRC32_TABLE.length; index += 1) {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = (value & 1) !== 0 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  CRC32_TABLE[index] = value >>> 0;
}

function fail(message) {
  throw new Error(message);
}

function reportFailure(message) {
  // biome-ignore lint/suspicious/noConsole: CLI verifier must print actionable failures.
  console.error(`FAIL: ${message}`);
  process.exitCode = 1;
}

function usage() {
  // biome-ignore lint/suspicious/noConsole: CLI verifier must print usage.
  console.error(
    'Usage: node scripts/verify-android-rtl-apk.mjs <path-or-url-to-apk>'
  );
  process.exit(2);
}

const apkPath = process.argv[2];

if (!apkPath) {
  usage();
}

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stampaix-rtl-apk-'));

function isHttpUrl(value) {
  return /^https?:\/\//i.test(value);
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = CRC32_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function assertRange(offset, length, limit, label) {
  if (
    !Number.isSafeInteger(offset) ||
    !Number.isSafeInteger(length) ||
    offset < 0 ||
    length < 0 ||
    offset > limit ||
    length > limit - offset
  ) {
    throw new Error(`Malformed APK ZIP: ${label} is out of bounds.`);
  }
}

function findEndOfCentralDirectory(archive) {
  const minimumEocdSize = 22;
  if (archive.length < minimumEocdSize) {
    throw new Error('Malformed APK ZIP: end of central directory is missing.');
  }

  const searchStart = Math.max(
    0,
    archive.length - minimumEocdSize - ZIP64_UINT16_SENTINEL
  );
  for (
    let offset = archive.length - minimumEocdSize;
    offset >= searchStart;
    offset -= 1
  ) {
    if (archive.readUInt32LE(offset) !== ZIP_EOCD_SIGNATURE) {
      continue;
    }
    const commentLength = archive.readUInt16LE(offset + 20);
    if (offset + minimumEocdSize + commentLength === archive.length) {
      return offset;
    }
  }

  throw new Error('Malformed APK ZIP: end of central directory is missing.');
}

function parseCentralDirectory(archive) {
  const eocdOffset = findEndOfCentralDirectory(archive);
  const diskNumber = archive.readUInt16LE(eocdOffset + 4);
  const centralDirectoryDisk = archive.readUInt16LE(eocdOffset + 6);
  const entriesOnDisk = archive.readUInt16LE(eocdOffset + 8);
  const entryCount = archive.readUInt16LE(eocdOffset + 10);
  const centralDirectorySize = archive.readUInt32LE(eocdOffset + 12);
  const centralDirectoryOffset = archive.readUInt32LE(eocdOffset + 16);

  if (
    diskNumber !== 0 ||
    centralDirectoryDisk !== 0 ||
    entriesOnDisk !== entryCount
  ) {
    throw new Error('Malformed APK ZIP: multi-disk archives are unsupported.');
  }
  if (
    entryCount === ZIP64_UINT16_SENTINEL ||
    centralDirectorySize === ZIP64_UINT32_SENTINEL ||
    centralDirectoryOffset === ZIP64_UINT32_SENTINEL
  ) {
    throw new Error('Malformed APK ZIP: ZIP64 archives are unsupported.');
  }
  if (entryCount > MAX_CENTRAL_DIRECTORY_ENTRIES) {
    throw new Error(
      'Malformed APK ZIP: central directory has too many entries.'
    );
  }
  if (centralDirectorySize > MAX_CENTRAL_DIRECTORY_BYTES) {
    throw new Error('Malformed APK ZIP: central directory is too large.');
  }

  assertRange(
    centralDirectoryOffset,
    centralDirectorySize,
    eocdOffset,
    'central directory'
  );
  const centralDirectoryEnd = centralDirectoryOffset + centralDirectorySize;
  const targetNames = new Map(
    APK_ENTRY_PATHS.map((entryPath) => [
      entryPath,
      Buffer.from(entryPath, 'utf8'),
    ])
  );
  const targetEntries = new Map();
  let cursor = centralDirectoryOffset;

  for (let index = 0; index < entryCount; index += 1) {
    assertRange(cursor, 46, centralDirectoryEnd, 'central directory entry');
    if (archive.readUInt32LE(cursor) !== ZIP_CENTRAL_DIRECTORY_SIGNATURE) {
      throw new Error(
        `Malformed APK ZIP: invalid central directory entry ${index}.`
      );
    }

    const flags = archive.readUInt16LE(cursor + 8);
    const compressionMethod = archive.readUInt16LE(cursor + 10);
    const expectedCrc32 = archive.readUInt32LE(cursor + 16);
    const compressedSize = archive.readUInt32LE(cursor + 20);
    const uncompressedSize = archive.readUInt32LE(cursor + 24);
    const fileNameLength = archive.readUInt16LE(cursor + 28);
    const extraLength = archive.readUInt16LE(cursor + 30);
    const commentLength = archive.readUInt16LE(cursor + 32);
    const diskStart = archive.readUInt16LE(cursor + 34);
    const localHeaderOffset = archive.readUInt32LE(cursor + 42);

    if (
      compressedSize === ZIP64_UINT32_SENTINEL ||
      uncompressedSize === ZIP64_UINT32_SENTINEL ||
      localHeaderOffset === ZIP64_UINT32_SENTINEL
    ) {
      throw new Error('Malformed APK ZIP: ZIP64 entries are unsupported.');
    }
    if (diskStart !== 0) {
      throw new Error('Malformed APK ZIP: multi-disk entries are unsupported.');
    }
    if ((flags & 0x1) !== 0) {
      throw new Error('Malformed APK ZIP: encrypted entries are unsupported.');
    }
    if (compressionMethod !== 0 && compressionMethod !== 8) {
      throw new Error(
        `Malformed APK ZIP: unsupported compression method ${compressionMethod}.`
      );
    }
    if (
      compressedSize > MAX_ENTRY_BYTES ||
      uncompressedSize > MAX_ENTRY_BYTES
    ) {
      throw new Error('Malformed APK ZIP: entry size exceeds the safe limit.');
    }

    const entryLength = 46 + fileNameLength + extraLength + commentLength;
    assertRange(
      cursor,
      entryLength,
      centralDirectoryEnd,
      'central directory entry'
    );
    assertRange(
      localHeaderOffset,
      30,
      centralDirectoryOffset,
      'local file header'
    );
    const fileName = archive.subarray(
      cursor + 46,
      cursor + 46 + fileNameLength
    );

    for (const [entryPath, expectedName] of targetNames) {
      if (!fileName.equals(expectedName)) {
        continue;
      }
      if (targetEntries.has(entryPath)) {
        throw new Error(
          `Malformed APK ZIP: duplicate target entry ${entryPath}.`
        );
      }
      targetEntries.set(entryPath, {
        entryPath,
        flags,
        compressionMethod,
        expectedCrc32,
        compressedSize,
        uncompressedSize,
        localHeaderOffset,
        fileName,
      });
    }
    cursor += entryLength;
  }

  if (cursor !== centralDirectoryEnd) {
    throw new Error(
      'Malformed APK ZIP: central directory size does not match its entries.'
    );
  }

  return { archive, centralDirectoryOffset, targetEntries };
}

function readZipEntry(zip, entryPath) {
  const entry = zip.targetEntries.get(entryPath);
  if (!entry) {
    return null;
  }

  const offset = entry.localHeaderOffset;
  if (zip.archive.readUInt32LE(offset) !== ZIP_LOCAL_FILE_SIGNATURE) {
    throw new Error(
      `Malformed APK ZIP: invalid local header for ${entryPath}.`
    );
  }
  const localFlags = zip.archive.readUInt16LE(offset + 6);
  const localCompressionMethod = zip.archive.readUInt16LE(offset + 8);
  const localCrc32 = zip.archive.readUInt32LE(offset + 14);
  const localCompressedSize = zip.archive.readUInt32LE(offset + 18);
  const localUncompressedSize = zip.archive.readUInt32LE(offset + 22);
  const fileNameLength = zip.archive.readUInt16LE(offset + 26);
  const extraLength = zip.archive.readUInt16LE(offset + 28);
  const usesDataDescriptor = (entry.flags & 0x8) !== 0;

  if (
    localCompressedSize === ZIP64_UINT32_SENTINEL ||
    localUncompressedSize === ZIP64_UINT32_SENTINEL
  ) {
    throw new Error(`Malformed APK ZIP: ZIP64 local header for ${entryPath}.`);
  }
  if (
    localFlags !== entry.flags ||
    localCompressionMethod !== entry.compressionMethod
  ) {
    throw new Error(
      `Malformed APK ZIP: inconsistent local header for ${entryPath}.`
    );
  }
  if (
    (!usesDataDescriptor &&
      (localCrc32 !== entry.expectedCrc32 ||
        localCompressedSize !== entry.compressedSize ||
        localUncompressedSize !== entry.uncompressedSize)) ||
    (usesDataDescriptor &&
      ((localCrc32 !== 0 && localCrc32 !== entry.expectedCrc32) ||
        (localCompressedSize !== 0 &&
          localCompressedSize !== entry.compressedSize) ||
        (localUncompressedSize !== 0 &&
          localUncompressedSize !== entry.uncompressedSize)))
  ) {
    throw new Error(
      `Malformed APK ZIP: inconsistent declared sizes for ${entryPath}.`
    );
  }

  const headerLength = 30 + fileNameLength + extraLength;
  assertRange(
    offset,
    headerLength,
    zip.centralDirectoryOffset,
    'local file header'
  );
  const localName = zip.archive.subarray(
    offset + 30,
    offset + 30 + fileNameLength
  );
  if (!localName.equals(entry.fileName)) {
    throw new Error(
      `Malformed APK ZIP: local entry name mismatch for ${entryPath}.`
    );
  }

  const dataOffset = offset + headerLength;
  assertRange(
    dataOffset,
    entry.compressedSize,
    zip.centralDirectoryOffset,
    `compressed data for ${entryPath}`
  );
  const compressedData = zip.archive.subarray(
    dataOffset,
    dataOffset + entry.compressedSize
  );
  let data;
  if (entry.compressionMethod === 0) {
    if (entry.compressedSize !== entry.uncompressedSize) {
      throw new Error(
        `Malformed APK ZIP: stored entry size mismatch for ${entryPath}.`
      );
    }
    data = Buffer.from(compressedData);
  } else {
    try {
      data = zlib.inflateRawSync(compressedData, {
        maxOutputLength: Math.max(1, entry.uncompressedSize),
      });
    } catch (error) {
      throw new Error(
        `Malformed APK ZIP: cannot inflate ${entryPath}: ${error.message}`
      );
    }
  }

  if (data.length !== entry.uncompressedSize) {
    throw new Error(
      `Malformed APK ZIP: uncompressed size mismatch for ${entryPath}.`
    );
  }
  if (crc32(data) !== entry.expectedCrc32) {
    throw new Error(`Malformed APK ZIP: CRC-32 mismatch for ${entryPath}.`);
  }
  return data;
}

function openApkZip(localApkPath) {
  const stat = fs.statSync(localApkPath);
  if (!stat.isFile()) {
    throw new Error(`APK is not a regular file: ${localApkPath}`);
  }
  if (stat.size > MAX_APK_BYTES) {
    throw new Error('APK exceeds the safe verification size limit.');
  }
  const archive = fs.readFileSync(localApkPath);
  if (archive.length !== stat.size) {
    throw new Error('APK changed while it was being read.');
  }
  return parseCentralDirectory(archive);
}

async function readResponseBodyBounded(response) {
  const declaredLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_APK_BYTES) {
    throw new Error('Downloaded APK exceeds the safe verification size limit.');
  }
  if (!response.body) {
    throw new Error('Downloaded APK response has no body.');
  }

  const reader = response.body.getReader();
  const chunks = [];
  let totalLength = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    totalLength += value.byteLength;
    if (totalLength > MAX_APK_BYTES) {
      await reader.cancel();
      throw new Error(
        'Downloaded APK exceeds the safe verification size limit.'
      );
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks, totalLength);
}

async function resolveApkPath(input) {
  if (!isHttpUrl(input)) {
    const resolvedPath = path.resolve(input);
    if (!fs.existsSync(resolvedPath)) {
      fail(`APK not found: ${resolvedPath}`);
    }
    return resolvedPath;
  }

  const response = await fetch(input, { redirect: 'follow' });
  if (!response.ok) {
    fail(
      `Failed to download APK: HTTP ${response.status} ${response.statusText}`
    );
  }

  const downloadedApkPath = path.join(tempDir, 'downloaded.apk');
  fs.writeFileSync(downloadedApkPath, await readResponseBodyBounded(response));
  return downloadedApkPath;
}

try {
  const resolvedApkPath = await resolveApkPath(apkPath);
  const zip = openApkZip(resolvedApkPath);
  const bundle = readZipEntry(zip, EMBEDDED_BUNDLE_PATH);
  if (!bundle) {
    fail(
      `Embedded bundle missing or unreadable in APK: ${EMBEDDED_BUNDLE_PATH}`
    );
  }
  if (!bundle.includes(Buffer.from(RTL_ARCHITECTURE_MARKER))) {
    fail(
      `RTL architecture marker missing from embedded Android bundle: ${RTL_ARCHITECTURE_MARKER}`
    );
  }

  const embeddedConfig = readZipEntry(zip, EMBEDDED_CONFIG_PATH);
  if (embeddedConfig) {
    const configSource = embeddedConfig.toString('utf8').replace(/^\uFEFF/, '');
    let config;
    try {
      config = JSON.parse(configSource);
    } catch (error) {
      fail(`Malformed embedded app config: ${error.message}`);
    }
    if (config?.android?.package !== 'com.stampaix.app') {
      fail(
        `Unexpected Android package in embedded app config: ${config?.android?.package ?? '<missing>'}`
      );
    }
    if (config?.scheme !== 'stampaix') {
      fail(
        `Unexpected app scheme in embedded app config: ${config?.scheme ?? '<missing>'}`
      );
    }
  }

  // biome-ignore lint/suspicious/noConsole: CLI verifier reports pass/fail status.
  console.log(
    `PASS: APK contains RTL architecture marker (${RTL_ARCHITECTURE_MARKER}).`
  );
  // biome-ignore lint/suspicious/noConsole: CLI verifier reports the inspected artifact.
  console.log(`APK: ${isHttpUrl(apkPath) ? apkPath : resolvedApkPath}`);
} catch (error) {
  reportFailure(error instanceof Error ? error.message : String(error));
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
