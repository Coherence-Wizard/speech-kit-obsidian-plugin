# Optional MP3 recording

This fork adds **Embed MP3 recording** under Speech Kit's **Transcript output** settings.
It is disabled by default and applies to sessions started after changing the setting.

When enabled, live microphone dictation also produces a 16 kHz mono, 64 kbps MP3.
Encoding happens locally, incrementally, with no extra installation or network upload.
On completion of transcription and any AI cleanup, the recording is saved in Obsidian's
configured attachment location and a playable embed is inserted at the beginning of
the original note's body, after YAML frontmatter when present. The generated link
respects Obsidian's link preferences (for example `![[Recording-….mp3]]`).

The capture is microphone-only. System audio captured by the native speech engine,
imported media, and read-aloud playback are not recorded by this option.
Cancelled sessions discard their audio. Empty sessions create no attachment.
Changing the setting during a session affects the next recording.
Temporary compressed audio is removed on completion or cancellation. An application
crash may leave a temporary `speech-kit-recording-*` directory in the OS temp folder.

## Install with BRAT

In BRAT settings, choose **Add beta plugin** and enter
`https://github.com/Coherence-Wizard/speech-kit-obsidian-plugin`.
Select version **2026.11.5** (or latest), install, and enable Speech Kit.
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
