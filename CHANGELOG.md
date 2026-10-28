# Changelog

Every version is a git tag. To get an older build, download its installer from Releases.

## v1.3.0 — 2026-10-28
- **Discover**: a search panel at the top of Home and a full Discover page. Search YouTube or SoundCloud, preview inside Aurora, then download as video or audio in one click, with live progress on each result
- **Create playlist** has been rebuilt: name, description, a cover photo and songs (with "All downloads" / "All favorites" shortcuts) in one window
- Fixed: uploaded photos now change playlist covers and profile pictures. WebP, GIF, AVIF and BMP images used to fail silently
- **Downloads** page: stats (items, songs, videos, disk space, sources), Music/Videos filter, a new grid view with thumbnails, plus "Open folder" and "Download more" buttons. The Video Downloader tab now shows your recent downloads
- **Friends**: every profile gets a friend code. Add friends by code and see live what they're listening to (song, artist, cover, progress), then find and download it yourself. You can turn sharing off at any time
- **Aurora Store**: 8 themes (Aurora Night, Midnight Mono, Sunset Drive, Ocean Depths, Sakura, Evergreen, Neon Arcade, Golden Hour), 5 font styles, 3 player styles and 5 effects (moving aurora, glass panels, album color glow, extra round, big artwork). You can import and export themes as files
- Title bar: a new Store button and a Friends button that shows how many friends are listening right now

## v1.2.1 — 2026-10-28
- Discord Connection now shows the song's **album cover** as the main picture and a **photo of the artist** in the small bubble. Both are looked up online through Deezer's public catalogue and cached. You can turn this off on the Discord Connection page
- If no match is found, it falls back to the downloaded thumbnail, then the Aurora logo

## v1.2.0 — 2026-10-28
- **Discord Connection**: show what you're listening to on your Discord profile ("Listening to Aurora"), with song, artist, artwork, a live progress bar and an "Open on YouTube/SoundCloud" button. Open it from the avatar menu, Settings or Browse. It needs the Discord desktop app running on the same PC
- New look: a deep-night palette, violet→teal "aurora" gradients, rounder shapes, a floating player dock, the Poppins display font, an Aurora logo in the title bar, and heart icons for favorites
- "Liked Songs" is now **Favorites**, and "Your Library" is now **Library**

## v1.1.0 — 2026-10-28
- New **Check for updates** button at the top right of the window (also in Menu → Help). It checks GitHub Releases, shows what's new, then downloads and runs the new installer. Your data is kept
- Aurora checks quietly on start-up and turns the button green when an update is available

## v1.0.0 — 2026-10-28
First release.
- Three-panel layout: Your Library, main view, Now Playing panel, player bar
- Profiles: create, edit (name, photo, colour), delete, and switch from the avatar menu, the Profile tab, or the "Who's listening?" screen. Each profile has its own library state
- Video Downloader (yt-dlp): YouTube, SoundCloud, Vimeo, TikTok and 1000+ sites; MP4/MP3/M4A; playlists; Spotify links are matched to YouTube; ffmpeg installs itself automatically on first use
- Playback of audio and video, queue, shuffle, repeat, full screen, picture-in-picture, media keys
- Playlists with custom covers, Liked Songs, artist pages, search, sorting, drag-and-drop import, music folder scanning
- Customization: accent colour, custom CSS, user.css / user.js
- Per-user Windows installer (no admin) with Start menu and Desktop shortcuts and an uninstaller
