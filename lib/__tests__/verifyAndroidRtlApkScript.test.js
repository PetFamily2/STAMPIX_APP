import { describe, expect, test } from 'bun:test';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';

const SCRIPT_PATH = 'scripts/verify-android-rtl-apk.mjs';
const { marker: RTL_ARCHITECTURE_MARKER } = JSON.parse(
  fs.readFileSync('config/rtlArchitecture.json', 'utf8')
);

const CRC32_TABLE = new Uint32Array(256);
for (let index = 0; index < CRC32_TABLE.length; index += 1) {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = (value & 1) !== 0 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  CRC32_TABLE[index] = value >>> 0;
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = CRC32_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function createZipArchive(entries) {
  const localParts = [];
  const centralParts = [];
  let localOffset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');
    const data = Buffer.isBuffer(entry.data)
      ? entry.data
      : Buffer.from(entry.data ?? '');
    const method = entry.method ?? 0;
    const flags = (entry.flags ?? 0) | (entry.useDataDescriptor ? 0x8 : 0);
    const compressedData = method === 8 ? zlib.deflateRawSync(data) : data;
    const checksum = crc32(data);

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(flags, 6);
    localHeader.writeUInt16LE(method, 8);
    localHeader.writeUInt32LE(entry.useDataDescriptor ? 0 : checksum, 14);
    localHeader.writeUInt32LE(
      entry.useDataDescriptor ? 0 : compressedData.length,
      18
    );
    localHeader.writeUInt32LE(entry.useDataDescriptor ? 0 : data.length, 22);
    localHeader.writeUInt16LE(name.length, 26);

    const descriptor = entry.useDataDescriptor ? Buffer.alloc(16) : null;
    if (descriptor) {
      descriptor.writeUInt32LE(0x08074b50, 0);
      descriptor.writeUInt32LE(checksum, 4);
      descriptor.writeUInt32LE(compressedData.length, 8);
      descriptor.writeUInt32LE(data.length, 12);
    }
    localParts.push(localHeader, name, compressedData);
    if (descriptor) {
      localParts.push(descriptor);
    }

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(flags, 8);
    centralHeader.writeUInt16LE(method, 10);
    centralHeader.writeUInt32LE(checksum, 16);
    centralHeader.writeUInt32LE(compressedData.length, 20);
    centralHeader.writeUInt32LE(data.length, 24);
    centralHeader.writeUInt16LE(name.length, 28);
    centralHeader.writeUInt32LE(
      entry.centralLocalHeaderOffset ?? localOffset,
      42
    );
    centralParts.push(centralHeader, name);

    localOffset +=
      localHeader.length +
      name.length +
      compressedData.length +
      (descriptor?.length ?? 0);
  }

  const centralDirectory = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralDirectory.length, 12);
  eocd.writeUInt32LE(localOffset, 16);
  return Buffer.concat([...localParts, centralDirectory, eocd]);
}

function createFixtureApk({
  bundleText,
  appConfig,
  bundleMethod = 0,
  configMethod = 0,
  bundleUsesDataDescriptor = false,
  entries,
  archiveBuffer,
  apkName = 'fixture.apk',
} = {}) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'stampaix apk test '));
  const zipEntries = entries ?? [];
  if (!entries && bundleText !== undefined) {
    zipEntries.push({
      name: 'assets/index.android.bundle',
      data: bundleText,
      method: bundleMethod,
      useDataDescriptor: bundleUsesDataDescriptor,
    });
  }
  if (!entries && appConfig !== undefined) {
    zipEntries.push({
      name: 'assets/app.config',
      data: appConfig,
      method: configMethod,
    });
  }

  const apkPath = path.join(tempRoot, apkName);
  fs.writeFileSync(apkPath, archiveBuffer ?? createZipArchive(zipEntries));
  return {
    apkPath,
    cleanup: () => fs.rmSync(tempRoot, { recursive: true, force: true }),
  };
}

function runVerifier(apkPath) {
  return spawnSync(process.execPath, [SCRIPT_PATH, apkPath], {
    encoding: 'utf8',
  });
}

function runVerifierAsync(apkPath) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [SCRIPT_PATH, apkPath], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('close', (status) => resolve({ status, stdout, stderr }));
  });
}

function serveFile(filePath) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((_request, response) => {
      fs.createReadStream(filePath)
        .on('error', (error) => response.destroy(error))
        .pipe(response);
    });
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address == null || typeof address === 'string') {
        server.close();
        reject(new Error('Failed to bind fixture HTTP server.'));
        return;
      }
      resolve({
        url: `http://127.0.0.1:${address.port}/fixture.apk`,
        close: () => new Promise((done) => server.close(done)),
      });
    });
  });
}

function withFixture(options, assertion) {
  const fixture = createFixtureApk(options);
  try {
    assertion(runVerifier(fixture.apkPath));
  } finally {
    fixture.cleanup();
  }
}

const VALID_CONFIG =
  '{"scheme":"stampaix","android":{"package":"com.stampaix.app"}}';

describe('verify Android RTL APK script', () => {
  test('passes with the canonical bundle marker and expected app identity', () => {
    withFixture(
      {
        bundleText: `bundle:${RTL_ARCHITECTURE_MARKER}`,
        appConfig: VALID_CONFIG,
        bundleMethod: 0,
      },
      (result) => {
        expect(result.status).toBe(0);
        expect(result.stdout).toContain(
          'PASS: APK contains RTL architecture marker'
        );
      }
    );
  });

  test('passes without app.config when the canonical marker is present', () => {
    withFixture(
      { bundleText: `bundle:${RTL_ARCHITECTURE_MARKER}` },
      (result) => {
        expect(result.status).toBe(0);
      }
    );
  });

  test('passes with deflated entries that use central-directory sizes', () => {
    withFixture(
      {
        bundleText: `bundle:${RTL_ARCHITECTURE_MARKER}`,
        appConfig: VALID_CONFIG,
        bundleMethod: 8,
        configMethod: 8,
        bundleUsesDataDescriptor: true,
      },
      (result) => {
        expect(result.status).toBe(0);
        expect(result.stdout).toContain(
          'PASS: APK contains RTL architecture marker'
        );
      }
    );
  });

  test('passes with spaces in the APK artifact path', () => {
    withFixture(
      {
        bundleText: `bundle:${RTL_ARCHITECTURE_MARKER}`,
        appConfig: VALID_CONFIG,
        apkName: 'fixture artifact with spaces.apk',
      },
      (result) => {
        expect(result.status).toBe(0);
      }
    );
  });

  test('passes when given an APK artifact URL', async () => {
    const fixture = createFixtureApk({
      bundleText: `bundle:${RTL_ARCHITECTURE_MARKER}`,
      appConfig: VALID_CONFIG,
    });
    const server = await serveFile(fixture.apkPath);
    try {
      const result = await runVerifierAsync(server.url);
      expect(result.status).toBe(0);
      expect(result.stdout).toContain(
        'PASS: APK contains RTL architecture marker'
      );
    } finally {
      await server.close();
      fixture.cleanup();
    }
  });

  test('fails when the embedded bundle marker is missing', () => {
    withFixture(
      { bundleText: 'bundle-without-marker', appConfig: VALID_CONFIG },
      (result) => {
        expect(result.status).toBe(1);
        expect(result.stderr).toContain('RTL architecture marker missing');
      }
    );
  });

  test('fails when the embedded bundle contains a wrong manual marker', () => {
    withFixture(
      {
        bundleText: 'bundle:stampaix-rtl-manual-row-right-v2',
        appConfig: VALID_CONFIG,
      },
      (result) => {
        expect(result.status).toBe(1);
        expect(result.stderr).toContain('RTL architecture marker missing');
      }
    );
  });

  test('rejects the obsolete native marker', () => {
    withFixture(
      {
        bundleText: 'bundle:stampaix-rtl-native-row-right-v4',
        appConfig: VALID_CONFIG,
      },
      (result) => {
        expect(result.status).toBe(1);
        expect(result.stderr).toContain('RTL architecture marker missing');
      }
    );
  });

  test('fails on the wrong Android package', () => {
    withFixture(
      {
        bundleText: `bundle:${RTL_ARCHITECTURE_MARKER}`,
        appConfig:
          '{"scheme":"stampaix","android":{"package":"com.example.wrong"}}',
      },
      (result) => {
        expect(result.status).toBe(1);
        expect(result.stderr).toContain('Unexpected Android package');
      }
    );
  });

  test('fails on the wrong app scheme', () => {
    withFixture(
      {
        bundleText: `bundle:${RTL_ARCHITECTURE_MARKER}`,
        appConfig:
          '{"scheme":"wrong","android":{"package":"com.stampaix.app"}}',
      },
      (result) => {
        expect(result.status).toBe(1);
        expect(result.stderr).toContain('Unexpected app scheme');
      }
    );
  });

  test('fails on malformed embedded app config', () => {
    withFixture(
      { bundleText: `bundle:${RTL_ARCHITECTURE_MARKER}`, appConfig: '{broken' },
      (result) => {
        expect(result.status).toBe(1);
        expect(result.stderr).toContain('Malformed embedded app config');
      }
    );
  });

  test('fails when the embedded Android bundle is missing', () => {
    withFixture({ appConfig: VALID_CONFIG }, (result) => {
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('Embedded bundle missing or unreadable');
    });
  });

  test('rejects a non-ZIP file with an APK extension', () => {
    withFixture(
      { archiveBuffer: Buffer.from('not a ZIP archive') },
      (result) => {
        expect(result.status).toBe(1);
        expect(result.stderr).toContain(
          'Malformed APK ZIP: end of central directory is missing'
        );
      }
    );
  });

  test('rejects a truncated ZIP end of central directory', () => {
    const archive = createZipArchive([
      {
        name: 'assets/index.android.bundle',
        data: `bundle:${RTL_ARCHITECTURE_MARKER}`,
      },
    ]);
    withFixture(
      { archiveBuffer: archive.subarray(0, archive.length - 4) },
      (result) => {
        expect(result.status).toBe(1);
        expect(result.stderr).toContain(
          'Malformed APK ZIP: end of central directory is missing'
        );
      }
    );
  });

  test('rejects an unsupported ZIP compression method', () => {
    withFixture(
      {
        entries: [
          {
            name: 'assets/index.android.bundle',
            data: `bundle:${RTL_ARCHITECTURE_MARKER}`,
            method: 12,
          },
        ],
      },
      (result) => {
        expect(result.status).toBe(1);
        expect(result.stderr).toContain('unsupported compression method 12');
      }
    );
  });

  test('rejects duplicate embedded bundle entries', () => {
    withFixture(
      {
        entries: [
          {
            name: 'assets/index.android.bundle',
            data: `bundle:${RTL_ARCHITECTURE_MARKER}`,
          },
          {
            name: 'assets/index.android.bundle',
            data: `second:${RTL_ARCHITECTURE_MARKER}`,
          },
        ],
      },
      (result) => {
        expect(result.status).toBe(1);
        expect(result.stderr).toContain(
          'duplicate target entry assets/index.android.bundle'
        );
      }
    );
  });

  test('rejects an encrypted embedded bundle entry', () => {
    withFixture(
      {
        entries: [
          {
            name: 'assets/index.android.bundle',
            data: `bundle:${RTL_ARCHITECTURE_MARKER}`,
            flags: 0x1,
          },
        ],
      },
      (result) => {
        expect(result.status).toBe(1);
        expect(result.stderr).toContain('encrypted entries are unsupported');
      }
    );
  });

  test('rejects an out-of-bounds local entry offset', () => {
    withFixture(
      {
        entries: [
          {
            name: 'assets/index.android.bundle',
            data: `bundle:${RTL_ARCHITECTURE_MARKER}`,
            centralLocalHeaderOffset: 0xffffff00,
          },
        ],
      },
      (result) => {
        expect(result.status).toBe(1);
        expect(result.stderr).toContain('local file header is out of bounds');
      }
    );
  });

  test('fails when the requested APK artifact is missing', () => {
    const missingPath = path.join(
      os.tmpdir(),
      'stampaix-definitely-missing.apk'
    );
    const result = runVerifier(missingPath);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('APK not found');
  });
});
