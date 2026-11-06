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

export async function createMp3Recording(
  app: App,
  note: TFile,
  destination: RecordingDestination = { besideNote: true, folder: '' },
): Promise<Mp3Recording> {
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
      let savedPath: string | undefined;
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
        const data = await readFile(output);
        const attachment = await saveRecordingAttachment(
          app,
          note,
          destination,
          Uint8Array.from(data).buffer,
        );
        savedPath = attachment.path;
        const link = app.fileManager.generateMarkdownLink(attachment, note.path);
        // process() applies against the latest note, including edits made during encoding.
        await app.vault.process(note, (content) => prependRecordingEmbed(content, `!${link}`));
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        throw new Error(
          savedPath
            ? `The MP3 was saved at "${savedPath}", but its embed could not be inserted: ${detail}`
            : `MP3 save failed: ${detail}. Your recording is preserved at "${output}".`,
        );
      } finally {
        if (discard || bytes === 0 || savedPath !== undefined) {
          await rm(directory, { recursive: true, force: true });
        }
      }
    },
  };
}

export interface RecordingDestination {
  besideNote: boolean;
  folder: string;
}

export function recordingFolder(notePath: string, destination: RecordingDestination): string {
  if (destination.besideNote) {
    const slash = notePath.lastIndexOf('/');
    return slash < 0 ? '' : notePath.slice(0, slash);
  }
  const folder = destination.folder.trim().replace(/\\/gu, '/');
  if (
    folder.startsWith('/') ||
    /^[a-z]:/iu.test(folder) ||
    folder.split('/').some((part) => part === '..' || part === '.')
  ) {
    throw new Error(
      'The MP3 attachment folder must be a path inside this vault, such as Audio/Recordings.',
    );
  }
  return folder.split('/').filter(Boolean).join('/');
}

export async function recordingAttachmentPath(
  app: App,
  note: TFile,
  destination: RecordingDestination,
): Promise<string> {
  const folder = recordingFolder(note.path, destination);
  // Consult the filesystem adapter: an existing directory can be missing from
  // the vault's index, causing getAvailablePathForAttachment to recreate it.
  let current = '';
  for (const part of folder.split('/').filter(Boolean)) {
    current = current ? `${current}/${part}` : part;
    const stat = await app.vault.adapter.stat(current);
    if (stat?.type === 'folder') continue;
    if (stat) throw new Error(`The MP3 folder path "${current}" is a file.`);
    try {
      await app.vault.createFolder(current);
    } catch (error) {
      if ((await app.vault.adapter.stat(current))?.type !== 'folder') throw error;
    }
  }
  const basename = note.path.slice(note.path.lastIndexOf('/') + 1).replace(/\.md$/iu, '');
  const prefix = folder ? `${folder}/` : '';
  for (let index = 0; ; index++) {
    const path = `${prefix}${basename}${index === 0 ? '' : ` (${index})`}.mp3`;
    if (!(await app.vault.adapter.exists(path))) return path;
  }
}

async function saveRecordingAttachment(
  app: App,
  note: TFile,
  destination: RecordingDestination,
  data: ArrayBuffer,
): Promise<TFile> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const path = await recordingAttachmentPath(app, note, destination);
    try {
      return await app.vault.createBinary(path, data);
    } catch (error) {
      // Another finishing session may claim the name between lookup and create.
      if (!(await app.vault.adapter.exists(path))) throw error;
    }
  }
  throw new Error('Could not reserve a unique MP3 filename.');
}
