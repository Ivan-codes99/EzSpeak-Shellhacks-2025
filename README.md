# EzSpeak

Live captions, translation, and AI voice for anything playing in your Chrome tab. Built for ShellHacks.

## What it does
EzSpeak helps you follow and understand spoken content online. Whether it’s a Zoom class, a YouTube talk, or a live stream, EzSpeak:
- Shows real‑time captions of what’s being said
- Translates those captions into your language
- Can read the translation out loud with a natural AI voice

It works anywhere audio plays in a tab—no special integration with each site.

## How it works (high level)
- EzSpeak listens to the audio from your current browser tab.
- The audio is sent securely to Microsoft Azure Cognitive Services Speech, which powers:
  - Speech‑to‑text (captions)
  - Translation (your chosen language)
  - Text‑to‑speech (optional AI voice)
- Results appear in Chrome’s Side Panel so you can read along and, if you want, hear the translated voice.

## Powered by Azure
Microsoft Azure Cognitive Services Speech is the backbone of EzSpeak. Azure provides the real‑time speech recognition, translation, and high‑quality voice synthesis that make EzSpeak fast and reliable.

## When to use it
- Original idea: two people speaking different languages—each runs the extension to follow and reply in their own language
- Online classes and lectures
- Business meetings with multilingual participants
- Live streams, talks, and tutorials
- Language learning and practice
- Any Chrome tab with speech audio (e.g., YouTube, Twitch, Discord)

## User flow (how you use it)
1. Install the extension.
2. Click the extension icon to open the popup.
3. Choose the language you want translations in and press “Get Started.”
4. The Side Panel opens. Allow the audio capture prompt if asked.
5. Watch captions and translations appear in real time. Toggle “Enable Voice” to have the translation spoken aloud and adjust volume as needed.

## Future next steps
- Better AI voice timing for tighter synchronization with the original speaker.
- Automatic AI voice selection by analyzing speaker characteristics; optional manual voice selection per session.
- On-the-fly language detection: auto-switch translation target and AI voice when the spoken language changes, no extension restart needed.
- Multi-speaker, multi-language meeting support speaker separation, per-listener language output.


— Team EzSpeak
