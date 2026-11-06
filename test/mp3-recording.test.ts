import type { App, TFile } from 'obsidian';
import { describe, expect, it, vi } from 'vitest';
import { createMp3Recording, prependRecordingEmbed } from '../src/audio/mp3-recording';

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
    expect(getAvailablePathForAttachment).toHaveBeenCalledWith(
      expect.stringMatching(/\.mp3$/u),
      'renamed.md',
    );
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
