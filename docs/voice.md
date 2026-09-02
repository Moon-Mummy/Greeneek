# Voice Input & Output

## Surface

- Push-to-talk (Web Speech API) in the composer; transcription lands in the
  composer as user text (the "inbox"), then runs the normal loop.
- STT provider seam: browser engine by default; server-side provider
  (Whisper / Deepgram) is a config row (`voice.stt`).
- TTS: assistant chunk stream routed to an interruptible player; VAD for
  hands-free (stop on silence / start on wake word).

## Privacy pass

- On-device option: browser speech APIs process audio locally; no audio is
  uploaded by Greeneek.
- Server-side STT/TTS providers are opt-in and never enabled by default;
  telemetry events never carry audio payloads — only transcript text and
  duration.

## Remaining work

- [ ] Streaming TTS player with interruption
- [ ] Voice activity detection for hands-free
- [ ] Wake-word config
