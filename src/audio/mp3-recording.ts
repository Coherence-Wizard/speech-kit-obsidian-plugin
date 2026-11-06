import { randomUUID } from 'node:crypto';
import { closeSync, mkdtempSync, openSync, writeSync } from 'node:fs';
import { readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Mp3Encoder } from '@breezystack/lamejs';
import type { App, TFile } from 'obsidian';

export interface Mp3Recording {
  append(frame: Uint8Array): void;
  finish(discard: boolean): Promise<void>;
}

/** Keep YAML metadata first; the player belongs at the beginning of the body. */
export function prependRecordingEmbed(content: string, embed: string): string {
  const frontmatter = /^(?:\uFEFF)?---\r?\n[\s\S]*?\r?\n(?:---|\.\.\.)(?:\r?\n|$)/u.exec(content);
  const offset = frontmatter?.[0].length ?? 0;
  const prefix = content.slice(0, offset);
  return `${prefix}${prefix && !prefix.endsWith('\n') ? '\n' : ''}${embed}\n\n${content.slice(offset)}`;
}

export async function createMp3Recording(app: App, note: TFile): Promise<Mp3Recording> {
  const encoder = new Mp3Encoder(1, 16000, 64);
  const directory = mkdtempSync(join(tmpdir(), 'speech-kit-recording-'));
  const output = join(directory, 'recording.mp3');
  let fd: number;
  try {
    fd = openSync(output, 'wx', 0o600);
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
  let bytes = 0;
  const write = (data: Uint8Array): void => {
    let offset = 0;
    while (offset < data.length) offset += writeSync(fd, data, offset, data.length - offset);
  };
  let finished = false;
  return {
    append(frame) {
      if (finished) return;
      if (frame.byteLength % 2 !== 0) throw new Error('Invalid PCM frame length.');
      const samples = new Int16Array(frame.byteLength / 2);
      const view = new DataView(frame.buffer, frame.byteOffset, frame.byteLength);
      for (let index = 0; index < samples.length; index++) {
        samples[index] = view.getInt16(index * 2, true);
      }
      // Encode incrementally and spool compressed audio to disk, bounding memory.
      write(encoder.encodeBuffer(samples));
      bytes += frame.length;
    },
    async finish(discard) {
      if (finished) return;
      finished = true;
      try {
        try {
          if (!discard && bytes > 0) write(encoder.flush());
        } finally {
          closeSync(fd);
        }
        if (discard || bytes === 0) return;
        if (app.vault.getAbstractFileByPath(note.path) !== note) {
          throw new Error('The recording note no longer exists.');
        }
        const name = `Recording-${new Date().toISOString().replace(/[:.]/gu, '-')}-${randomUUID()}.mp3`;
        const path = await app.fileManager.getAvailablePathForAttachment(name, note.path);
        const data = await readFile(output);
        const attachment = await app.vault.createBinary(path, Uint8Array.from(data).buffer);
        const link = app.fileManager.generateMarkdownLink(attachment, note.path);
        // process() applies against the latest note, including edits made during encoding.
        await app.vault.process(note, (content) => prependRecordingEmbed(content, `!${link}`));
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    },
  };
}
