import type { App, TFile } from 'obsidian';
import { describe, expect, it, vi } from 'vitest';
import {
  createMp3Recording,
  prependRecordingEmbed,
  recordingAttachmentPath,
  recordingFolder,
} from '../src/audio/mp3-recording';

describe('recording embeds', () => {
  it.each([
    ['hello', '![[audio.mp3]]\n\nhello'],
    ['', '![[audio.mp3]]\n\n'],
    ['---\ntitle: Hello\n---\nbody', '---\ntitle: Hello\n---\n![[audio.mp3]]\n\nbody'],
    ['---\r\ntitle: Hello\r\n---', '---\r\ntitle: Hello\r\n---\n![[audio.mp3]]\n\n'],
    ['---\nunfinished', '![[audio.mp3]]\n\n---\nunfinished'],
  ])('prepends to the body and preserves frontmatter: %j', (input, expected) => {
    expect(prependRecordingEmbed(input, '![[audio.mp3]]')).toBe(expected);
  });

  it('encodes PCM, follows a renamed note, and preserves latest edits', async () => {
    const note = { path: 'original.md' } as TFile;
    let content = '---\ntitle: Hello\n---\nlatest edits';
    let mp3 = new Uint8Array();
    const createBinary = vi.fn(async (_path: string, data: ArrayBuffer) => {
      mp3 = new Uint8Array(data);
      return { path: 'attachments/recording.mp3' };
    });
    const getAvailablePathForAttachment = vi.fn(async () => 'attachments/recording.mp3');
    const app = {
      fileManager: {
        getAvailablePathForAttachment,
        generateMarkdownLink: () => '[[attachments/recording.mp3]]',
      },
      vault: {
        adapter: { stat: async () => ({ type: 'folder' }), exists: async () => false },
        getAbstractFileByPath: () => note,
        createBinary,
        process: vi.fn(async (_note, update) => {
          content = update(content);
        }),
      },
    } as unknown as App;
    const recording = await createMp3Recording(app, note);
    for (let frame = 0; frame < 50; frame++) {
      const pcm = new Int16Array(320);
      for (let i = 0; i < pcm.length; i++)
        pcm[i] = Math.round(16000 * Math.sin((2 * Math.PI * 440 * (frame * 320 + i)) / 16000));
      recording.append(new Uint8Array(pcm.buffer));
    }
    note.path = 'renamed.md';
    await recording.finish(false);
    await recording.finish(false);
    expect(getAvailablePathForAttachment).not.toHaveBeenCalled();
    expect(createBinary).toHaveBeenCalledWith('renamed.mp3', expect.any(ArrayBuffer));
    expect(content).toBe('---\ntitle: Hello\n---\n![[attachments/recording.mp3]]\n\nlatest edits');
    expect(createBinary).toHaveBeenCalledTimes(1);
    expect(mp3.length).toBeGreaterThan(8000);
    expect(mp3[0]).toBe(0xff);
    expect((mp3[1] ?? 0) & 0xe0).toBe(0xe0);
  });

  it.each([true, false])(
    'does not save cancelled or empty recordings (cancel=%s)',
    async (cancel) => {
      const recording = await createMp3Recording({} as App, {} as TFile);
      if (cancel) recording.append(new Uint8Array([0, 0]));
      await recording.finish(cancel);
    },
  );
});

describe('MP3 save recovery', () => {
  it('uses an existing folder on disk without recreating it or using the failing attachment helper', async () => {
    const createFolder = vi.fn();
    const app = {
      vault: {
        adapter: { stat: async () => ({ type: 'folder' }), exists: async () => false },
        createFolder,
      },
    } as unknown as App;
    expect(
      await recordingAttachmentPath(app, { path: 'Notes/Meeting.md' } as TFile, {
        besideNote: false,
        folder: 'M - MEDIA',
      }),
    ).toBe('M - MEDIA/Meeting.mp3');
    expect(createFolder).not.toHaveBeenCalled();
  });

  it('creates nested folders and avoids overwriting earlier recordings', async () => {
    const folders = new Set<string>();
    const app = {
      vault: {
        adapter: {
          stat: async (path: string) => (folders.has(path) ? { type: 'folder' } : null),
          exists: async (path: string) =>
            ['Audio/Meetings/Meeting.mp3', 'Audio/Meetings/Meeting (1).mp3'].includes(path),
        },
        createFolder: vi.fn(async (path: string) => {
          folders.add(path);
        }),
      },
    } as unknown as App;
    expect(
      await recordingAttachmentPath(app, { path: 'Meeting.md' } as TFile, {
        besideNote: false,
        folder: 'Audio/Meetings',
      }),
    ).toBe('Audio/Meetings/Meeting (2).mp3');
    expect([...folders]).toEqual(['Audio', 'Audio/Meetings']);
  });

  it.each(['/outside', '../outside', 'Audio/../outside', 'C:\\outside'])(
    'rejects paths outside the vault: %s',
    (folder) => {
      expect(() => recordingFolder('Note.md', { besideNote: false, folder })).toThrow(
        'inside this vault',
      );
    },
  );

  it('supports notes at the root and folders next to a renamed note', () => {
    expect(recordingFolder('Note.md', { besideNote: true, folder: 'ignored' })).toBe('');
    expect(recordingFolder('Moved/Note.md', { besideNote: true, folder: 'ignored' })).toBe('Moved');
    expect(recordingFolder('Note.md', { besideNote: false, folder: '' })).toBe('');
  });

  it('preserves the encoded MP3 when the vault write fails', async () => {
    const note = { path: 'test.md' } as TFile;
    const app = {
      fileManager: { getAvailablePathForAttachment: async () => 'recording.mp3' },
      vault: {
        adapter: { stat: async () => ({ type: 'folder' }), exists: async () => false },
        getAbstractFileByPath: () => note,
        createBinary: async () => {
          throw new Error('disk full');
        },
      },
    } as unknown as App;
    const recording = await createMp3Recording(app, note);
    recording.append(new Uint8Array(640));
    const failure = await recording.finish(false).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(Error);
    const message = (failure as Error).message;
    expect(message).toContain('disk full');
    const path = /preserved at "([^"]+)"/u.exec(message)?.[1];
    if (!path) throw new Error('Expected recovery path');
    const { readFile, rm } = await import('node:fs/promises');
    const { dirname } = await import('node:path');
    try {
      expect((await readFile(path)).length).toBeGreaterThan(0);
    } finally {
      await rm(dirname(path), { recursive: true });
    }
  });
});
