# Changelog

Every version is a git tag. To get an older build, download its installer from Releases.

## v1.8.0 — 2026-10-29
- **Aurora Account**: sign in with an account name and password (Search → Aurora Account, or the button on your profile). Use the same one on your PC and iPhone and your profile (name, photo, bio, status, banner, favorites), Favorites, playlists and Store look stay the same on both
- **Songs on your other devices**: the Account page lists every song that's on another of your devices but not this one. Download one or all of them, or turn on automatic downloads. Songs are copied straight from your other device (at full Wi-Fi speed on the same network), or downloaded again from YouTube/SoundCloud when that device is off
- Your own devices can always copy songs from each other, even with library sharing for friends turned off
- **End-to-end encrypted**: everything is locked with a key made from your name and password (PBKDF2, 210,000 rounds, then AES-256-GCM) before it leaves the device. The password itself is never stored or sent. There's no password reset, so keep it safe
- Requests between your devices are signed, so nobody else can pose as one of them

## v1.7.0 — 2026-10-28
- **Faster downloads**: 4 downloads at once (was 2), each one fetched in 4 parallel pieces, and playlists are split into separate downloads so their videos download side by side instead of one after another
- **Listen Together**: if you don't have the host's song and it has no YouTube/SoundCloud link (a local file, say), Aurora now copies it straight from the host and starts in sync. iPhones always do this first
- **Wi-Fi fast path**: when an iPhone on the same Wi-Fi gets a song from this PC (friends' libraries or Listen Together), it downloads it directly at full network speed instead of through the internet relay. Windows may ask once to let Aurora use your private network: click Allow
- Song copies through the relay send more at once and no longer load the whole file before starting; files up to 400 MB (no limit over Wi-Fi)
- Aurora for iPhone 1.2 can now download from links by itself: see [Aurora-iOS](https://github.com/UndeadBossGames/Aurora-iOS)

## v1.6.0 — 2026-10-28
- **Friends' libraries**: open any friend's library from the Friends page (Library button), their profile card (Browse library) or the friend menu, and search, filter and scroll through every song they have
- **Download any song from a friend** with one click, or **Download all**. Songs that came from YouTube/SoundCloud download from the source; anything else (local files, iPhone songs) is copied straight from your friend, with its title, artist, album and cover. Copies land in a "From friends" folder
- Works between PC and iPhone in both directions
- Privacy: only people on your friends list can see your library, only while Aurora is open, and you can turn it off with "Let friends browse and download my songs" on the Friends page
- The last library you saw from each friend is remembered, so you can still browse it when they're offline

## v1.5.0 — 2026-10-28
- **Songs belong to profiles**: new downloads and imports go to the profile that added them, so every profile has its own library. Songs from before 1.5 stay shared with everyone
- **Transfer songs**: copy or move songs to another profile, or share them with every profile. Open it from your profile page, the Downloads page, or right-click a song → "Send to another profile…". Moving doesn't duplicate files
- Deleting a profile makes the songs only it owned shared, so nothing disappears
- **Aurora for iPhone** is here: see [Aurora-iOS](https://github.com/UndeadBossGames/Aurora-iOS)

## v1.4.0 — 2026-10-28
- **Listen Together**: host a session and share its code (like `LT-7KQ2M9`). Everyone who joins hears the same song at the same second; play, pause, seek and skip follow the host. If a guest doesn't have the song, Aurora downloads it for them automatically. Includes a member list, chat with emoji reactions, a Resync button, and a Join button on friends who are hosting
- **Seamless in-app updates**: new versions download in the background inside Aurora. One click on "Restart to update" installs silently and reopens the app, with no installer wizard. You can turn automatic downloads off
- **One menu**: the title-bar buttons (Store, Friends, Downloader, Updates, What's new) now live in a single menu under your avatar, with shortcut tiles, a profile switcher and alert dots
- **Profile customization**: edit your bio (up to 300 characters), pronouns, a status with an emoji, a banner (8 gradients or your own picture), and show your favorite song, album and artist. Friends can open your profile card
- **Profile effects**: Soft glow, Rainbow ring, Aurora ring, Heartbeat, Sparkles, On fire, Frost, Neon sign and Orbit
- **Store**: 7 new themes (Lavender Haze, Crimson Night, Arctic, Cyber Lime, Coffee House, Retro Wave, Matrix), 5 new fonts, 7 player bar effects (glowing bar, rainbow progress, live EQ, spinning vinyl, album backdrop, pulsing play button, wave), and 4 one-click bundles. New Featured tab, NEW badges and a 15-second "Try" preview for themes

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
