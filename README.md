# 🎬 UltraDownloader

A modern and simple tool for downloading high-quality YouTube videos and audio, with a graphical interface built in **CustomTkinter** and a download engine based on **yt-dlp**.

---

## 🧰 Features

- 📺 Download videos in MP4 with audio (up to **real 4K**)
- 🎞️ Choose custom resolutions: 144p to 2160p (4K)
- 🎧 Extract only the audio in **MP3** or **M4A**
- 🔄 Automatic conversion to **H.264 (MP4)** — compatible with any player
- 💾 Choose the download destination folder
- ⚡ Progress bar with remaining time
- 🟥 Elegant dark interface with red buttons

---

## 🧱 Requirements

Nothing to install!
The application is **standalone** — all dependencies, including **FFmpeg** and **yt-dlp**, are already integrated into the executable.

> ⚠️ Only **Windows 10 or higher** is currently supported.

---

## 🚀 How to use

1. Download the **`YouTube Downloader Tool.exe`** file from the [Releases](../../releases) section.
2. Extract the contents of the ZIP file.
3. **Double-click** on `YouTube Downloader Tool.exe`.
4. Paste the video link and choose the format and resolution.
5. Click **Download** and wait!

---

## 📦 Recommended Structure

```
YouTube Downloader Tool/
│
├── YouTube Downloader Tool.exe   ← main executable
├── icon.ico   ← Application icon
└── ffmpeg/
└── bin/
├── ffmpeg.exe
├── ffprobe.exe
└── ffplay.exe
```

> The `ffmpeg` folder must be in the same directory as the executable. ## 🧩 Technologies Used

- [Python 3.11+](https://www.python.org)
- [yt-dlp](https://github.com/yt-dlp/yt-dlp)
- [CustomTkinter](https://github.com/TomSchimansky/CustomTkinter)
- [FFmpeg](https://ffmpeg.org)

---

## 🧑‍💻 Author

Developed by **Lucas Jordão** 💻
If you liked the project, ⭐ **give it a star** on the repository!
