# 🎬 YouTube Downloader Tool

Uma ferramenta moderna e simples para baixar vídeos e áudios do YouTube em alta qualidade, com interface gráfica construída em **CustomTkinter** e motor de download baseado no **yt-dlp**.

---

## 🧰 Funcionalidades

- 📺 Baixe vídeos em MP4 com áudio (até **4K real**)
- 🎞️ Escolha resoluções personalizadas: 144p até 2160p (4K)
- 🎧 Extraia apenas o áudio em **MP3** ou **M4A**
- 🔄 Conversão automática para **H.264 (MP4)** — compatível com qualquer player
- 💾 Escolha a pasta de destino dos downloads
- ⚡ Barra de progresso com tempo restante
- 🟥 Interface escura elegante com botões vermelhos

---

## 🧱 Requisitos

Nada para instalar!  
O aplicativo é **autônomo** — todas as dependências, incluindo **FFmpeg** e **yt-dlp**, já estão integradas no executável.

> ⚠️ Apenas o **Windows 10 ou superior** é suportado no momento.

---

## 🚀 Como usar

1. Baixe o arquivo **`YouTube Downloader Tool.exe`** na seção [Releases](../../releases).
2. Extraia o conteúdo do ZIP.
3. Dê **duplo clique** em `YouTube Downloader Tool.exe`.
4. Cole o link do vídeo e escolha o formato e resolução.
5. Clique em **Baixar** e aguarde!

---

## 📦 Estrutura recomendada

```
YouTube Downloader Tool/
│
├── YouTube Downloader Tool.exe   ← executável principal
├── icon.ico   ← Ícone do aplicativo
└── ffmpeg/
    └── bin/
        ├── ffmpeg.exe
        ├── ffprobe.exe
        └── ffplay.exe
```

> A pasta `ffmpeg` deve estar no mesmo diretório do executável.

---

## 🧩 Tecnologias utilizadas

- [Python 3.11+](https://www.python.org)
- [yt-dlp](https://github.com/yt-dlp/yt-dlp)
- [CustomTkinter](https://github.com/TomSchimansky/CustomTkinter)
- [FFmpeg](https://ffmpeg.org)

---

## 🧑‍💻 Autor

Desenvolvido por **Lucas Jordão** 💻  
Se curtiu o projeto, ⭐ **dê uma estrela** no repositório!
