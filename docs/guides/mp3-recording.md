# Optional MP3 recording

This fork adds **Embed MP3 recording** under Speech Kit's **Transcript output** settings.
It is disabled by default and applies to sessions started after changing the setting.

When enabled, live microphone dictation also produces a 16 kHz mono, 64 kbps MP3.
Encoding happens locally, incrementally, with no extra installation or network upload.
On completion of transcription and any AI cleanup, the recording is saved in Obsidian's
selected recording location and a playable embed is inserted at the beginning of
the original note's body, after YAML frontmatter when present. The generated link
respects Obsidian's link preferences (for example `![[Note name.mp3]]`).

By default the recording contains only your microphone. Enable **Mix computer audio
into MP3** to record the native engine's combined microphone and computer-audio stream.
This also includes computer audio in transcription. Install the engine update offered
by Speech Kit after updating the plugin through BRAT; an older engine will refuse a
mixed recording rather than silently produce microphone-only audio.

The 2026.11.7 native package is built for Apple silicon Macs. On macOS, allow Obsidian
under System Settings → Privacy & Security → Screen & System Audio Recording when
requested. Microphone permission is also required. The existing native mixer averages
the two sources to avoid clipping; it records all captured audio, including silence,
independently of whether the recognizer detects speech.

Imported media and read-aloud sessions do not produce recordings through this option.
Cancelled sessions discard their audio. Empty sessions create no attachment.
Changing the setting during a session affects the next recording.
Use **Save MP3 beside the note** (on by default) to save next to the note. Turn it off
and set **MP3 attachment folder** to a path within the vault such as `M - MEDIA`
or `Audio/Meetings`. Missing folders are created; a blank folder means the vault root.
The recording uses the note's current name: `Meeting.md` becomes `Meeting.mp3`.
Existing files are preserved by adding `(1)`, `(2)`, and so on.

Temporary compressed audio is removed after a successful save or cancellation.
If saving fails, the error displays the retained MP3's recovery path. If the MP3
was saved but the embed failed, the error identifies the attachment in the vault. An application
crash may leave a temporary `speech-kit-recording-*` directory in the OS temp folder.

## Install with BRAT

In BRAT settings, choose **Add beta plugin** and enter
`https://github.com/Coherence-Wizard/speech-kit-obsidian-plugin`.
Select version **2026.11.7** (or latest), install, and enable Speech Kit.
If Speech Kit is already installed, disable it first; keep its settings and models.
Then enable **Embed MP3 recording** in Speech Kit's Transcript output settings.

## Install manually

1. Download `main.js`, `manifest.json`, and `styles.css` from this fork's release.
2. Disable Speech Kit in Obsidian and back up those three files in
   `<vault>/.obsidian/plugins/local-dictation/`.
3. Replace those three files with the downloaded ones. Keep `data.json`, the `data`
   directory, and the existing native speech engine and models.
4. Enable Speech Kit and turn on **Embed MP3 recording** in its settings.

The plugin retains upstream's `local-dictation` ID, so this replaces the installed
Speech Kit rather than running a second copy. An upstream community-plugin update
may overwrite the fork. Restore the backed-up files to revert.

## Build from source

Use the Node version specified in `package.json`, then run `npm ci` and
`npm run build:frontend`. This frontend change uses the existing upstream native engine.
The encoder source and license are identified in `THIRD_PARTY_NOTICES.md`.
