import customtkinter as ctk
from tkinter import filedialog, messagebox
from yt_dlp import YoutubeDL
import threading
import os


# --- Aparência ---
ctk.set_appearance_mode("dark")
ctk.set_default_color_theme("dark-blue")  # base azul, com botão vermelho customizado


class DownloaderApp(ctk.CTk):
    def __init__(self):
        super().__init__()
        self.title("YouTube Downloader Tool")
        self.iconbitmap("icon.ico")
        self.geometry("700x480")
        self.resizable(False, False)

        # Frame principal
        self.main_frame = ctk.CTkFrame(self)
        self.main_frame.pack(expand=True)

        # URL
        self.url_entry = ctk.CTkEntry(
            self.main_frame,
            placeholder_text="Cole o link do vídeo aqui",
            width=560
        )
        self.url_entry.pack(pady=20)

        # Formato
        self.format_option = ctk.CTkOptionMenu(
            self.main_frame,
            values=[
                "MP4 (vídeo + áudio)",
                "MP4 (somente vídeo)",
                "MP4 (somente áudio)",
                "MP3 (áudio extraído)"
            ],
            command=self.on_format_change
        )
        self.format_option.set("MP4 (vídeo + áudio)")
        self.format_option.pack(pady=10)

        # Área dinâmica (resolução ou qualidade)
        self.dynamic_frame = ctk.CTkFrame(self.main_frame, fg_color="transparent")
        self.dynamic_frame.pack(pady=5)

        self.resolution_option = ctk.CTkOptionMenu(
            self.dynamic_frame,
            values=[
                "2160p (4K)", "1440p (2K)", "1080p", "720p",
                "480p", "360p", "240p", "144p", "Melhor disponível"
            ]
        )
        self.resolution_option.set("Melhor disponível")

        self.audio_quality_option = ctk.CTkOptionMenu(
            self.dynamic_frame,
            values=["320 kbps", "256 kbps", "192 kbps", "128 kbps", "96 kbps", "64 kbps"]
        )
        self.audio_quality_option.set("192 kbps")

        self.resolution_option.pack(pady=10)

        # Botão vermelho
        self.download_button = ctk.CTkButton(
            self.main_frame,
            text="Baixar",
            command=self.start_download,
            fg_color="#cc0000",
            hover_color="#990000"
        )
        self.download_button.pack(pady=20)

        # Barra de progresso
        self.progress_bar = ctk.CTkProgressBar(self.main_frame, width=500)
        self.progress_bar.set(0)
        self.progress_bar.pack_forget()

        # Status
        self.status_label = ctk.CTkLabel(self.main_frame, text="")
        self.status_label.pack(pady=10)

    # Alterna as opções conforme formato
    def on_format_change(self, value):
        for w in self.dynamic_frame.winfo_children():
            w.pack_forget()

        if "MP3" in value:
            self.audio_quality_option.pack(pady=10)
        else:
            self.resolution_option.pack(pady=10)

    # Inicia o download em thread separada
    def start_download(self):
        url = self.url_entry.get().strip()
        if not url:
            messagebox.showwarning("Aviso", "Insira o link do vídeo!")
            return

        folder = filedialog.askdirectory(title="Escolha a pasta para salvar")
        if not folder:
            return

        self.status_label.configure(text="Baixando...")
        self.progress_bar.set(0)
        self.progress_bar.pack(pady=10)
        threading.Thread(target=self.download_video, args=(url, folder), daemon=True).start()

    # Atualiza progresso em tempo real
    def progress_hook(self, d):
        if d.get("status") == "downloading":
            total = d.get("total_bytes") or d.get("total_bytes_estimate")
            downloaded = d.get("downloaded_bytes", 0)
            percent = (downloaded / total) if total else 0
            eta = d.get("eta", 0)

            self.progress_bar.set(percent)
            self.status_label.configure(
                text=f"{percent*100:.1f}% • {self.format_eta(eta)} restantes"
            )
        elif d.get("status") == "finished":
            self.progress_bar.set(1)
            self.status_label.configure(text="Quase lá...")

    # Formata o tempo restante
    def format_eta(self, eta):
        if not eta or eta <= 0:
            return "Calculando..."
        m, s = divmod(int(eta), 60)
        h, m = divmod(m, 60)
        return f"{h:02d}:{m:02d}:{s:02d}" if h else f"{m:02d}:{s:02d}"

    # Download principal
    def download_video(self, url, folder):
        formato = self.format_option.get()
        resolucao = self.resolution_option.get()
        qualidade_audio = self.audio_quality_option.get().split()[0]

        ffmpeg_path = os.path.join(os.getcwd(), "ffmpeg", "bin")

        ydl_opts = {
            "outtmpl": os.path.join(folder, "%(title)s.%(ext)s"),
            "merge_output_format": "mp4",
            "progress_hooks": [self.progress_hook],
            "noprogress": False,
            "postprocessors": [],
            "ffmpeg_location": ffmpeg_path,  # caminho para FFmpeg local
        }

        # MP4 (vídeo + áudio)
        if formato == "MP4 (vídeo + áudio)":
            if resolucao == "Melhor disponível":
                ydl_opts["format"] = "bestvideo[height<=?9999]+bestaudio/best"
            else:
                res_num = resolucao.split("p")[0]
                ydl_opts["format"] = f"bestvideo[height<={res_num}]+bestaudio/best"

            # converter automaticamente para MP4 H.264
            ydl_opts["postprocessors"].append({
                "key": "FFmpegVideoConvertor",
                "preferedformat": "mp4"
            })

        # MP4 (somente vídeo)
        elif formato == "MP4 (somente vídeo)":
            if resolucao == "Melhor disponível":
                ydl_opts["format"] = "bestvideo[height<=?9999]/bestvideo"
            else:
                res_num = resolucao.split("p")[0]
                ydl_opts["format"] = f"bestvideo[height<={res_num}]/bestvideo[height<={res_num}]"

            ydl_opts["postprocessors"].append({
                "key": "FFmpegVideoConvertor",
                "preferedformat": "mp4"
            })

        # MP4 (somente áudio)
        elif formato == "MP4 (somente áudio)":
            ydl_opts["format"] = "bestaudio[ext=m4a]/bestaudio"
            ydl_opts["postprocessors"].append({
                "key": "FFmpegExtractAudio",
                "preferredcodec": "m4a",
                "preferredquality": qualidade_audio,
            })

        # MP3 (áudio extraído)
        elif formato == "MP3 (áudio extraído)":
            ydl_opts["format"] = "bestaudio[ext=m4a]/bestaudio"
            ydl_opts["postprocessors"].append({
                "key": "FFmpegExtractAudio",
                "preferredcodec": "mp3",
                "preferredquality": qualidade_audio,
            })

        # Download
        try:
            with YoutubeDL(ydl_opts) as ydl:
                ydl.download([url])
            self.status_label.configure(text="✅ Download concluído!")
        except Exception as e:
            self.status_label.configure(text="❌ Erro no download")
            messagebox.showerror("Erro", str(e))
        finally:
            self.progress_bar.pack_forget()


if __name__ == "__main__":
    app = DownloaderApp()
    app.mainloop()
