import React, { useEffect, useRef, useState, createContext, useContext, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import styled, { ThemeProvider, createGlobalStyle, css, keyframes } from "styled-components";
import {
  Send, Loader2, Film, FileMusic, SlidersHorizontal,
  ChevronDown, UploadCloud, Check, Link as LinkIcon, List, X, ShieldCheck, Sparkles,
  Download, FileVideo, FolderOpen, Copy, Cpu, Zap, Square
} from "lucide-react";

/* ================================================================================================
 * Config do backend (env ou padrão)
 * ==============================================================================================*/
const API_URL = (import.meta?.env?.VITE_API_URL ?? "http://127.0.0.1:8000").replace(/\/+$/, "");
const WS_URL = (import.meta?.env?.VITE_WS_URL ?? "ws://127.0.0.1:8000/ws");

/* ================================================================================================
 * Helpers locais (sem imports externos)
 * ==============================================================================================*/
// Toasts simples
function useLocalNotifier() {
  const [toasts, setToasts] = useState([]);
  const remove = (id) => setToasts((t) => t.filter((x) => x.id !== id));
  const notify = (msg, type = "info", ms = 2200) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, msg, type }]);
    if (ms) setTimeout(() => remove(id), ms);
  };
  return { toasts, notify, remove };
}
const ToastWrap = styled.div`
  position: fixed; top: 16px; right: 16px; display: grid; gap: 10px; z-index: 50;
`;
const ToastCard = styled(motion.div)`
  background: ${({ theme }) => theme.colors.bgElev};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-left: 4px solid ${({ $type, theme }) =>
    $type === "error" ? theme.colors.danger : $type === "success" ? theme.colors.success : theme.colors.primary};
  color: ${({ theme }) => theme.colors.text};
  padding: 10px 12px; border-radius: ${({ theme }) => theme.radii.md}; box-shadow: ${({ theme }) => theme.shadows.soft};
  font-weight: 700; font-size: 13px; min-width: 220px;
`;
function ToastDock({ toasts, onClose }) {
  return (
    <ToastWrap>
      <AnimatePresence>
        {toasts.map((t) => (
          <ToastCard
            key={t.id} $type={t.type}
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            onClick={() => onClose(t.id)}
          >
            {t.msg}
          </ToastCard>
        ))}
      </AnimatePresence>
    </ToastWrap>
  );
}

// Extrai URLs válidas do texto
function parseUrlsFromText(text) {
  const urlRe = /(https?:\/\/[^\s<>"]+)/gi;
  const lines = String(text || "").split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  const found = new Set();
  for (const line of lines) {
    let m;
    while ((m = urlRe.exec(line)) !== null) found.add(m[1]);
  }
  return Array.from(found);
}

// Normaliza caminho do backend em URL absoluta
function toAbsoluteUrl(path) {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  const norm = String(path).replace(/\\/g, "/");
  return `${API_URL}${norm.startsWith("/") ? "" : "/"}${norm}`;
}

function sanitizeCustomName(value) {
  if (!value) return null;
  const cleaned = String(value)
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\.+$/, "");
  if (!cleaned) return null;
  return cleaned.slice(0, 120);
}

const RESOLUTION_OPTIONS = [
  { value: "auto", label: "Automático (Original)" },
  { value: "2160p", label: "4K (2160p)" },
  { value: "1440p", label: "2K (1440p)" },
  { value: "1080p", label: "Full HD (1080p)" },
  { value: "720p", label: "HD (720p)" },
  { value: "480p", label: "SD (480p)" },
  { value: "360p", label: "360p" },
  { value: "240p", label: "240p" },
];

const RESOLUTION_MULTIPLIERS = {
  auto: 1,
  "2160p": 1.1,
  "1440p": 1,
  "1080p": 0.82,
  "720p": 0.58,
  "480p": 0.42,
  "360p": 0.3,
  "240p": 0.22,
};

const ENGINE_OPTIONS = [
  { value: "cpu", label: "CPU (libx264)", icon: <Cpu size={14} /> },
  { value: "gpu", label: "GPU (NVENC/AMF/QSV)", icon: <Zap size={14} /> },
  { value: "auto", label: "Automático", icon: <Sparkles size={14} /> },
];

const DISCORD_TARGET_BYTES = 9 * 1024 * 1024;

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 MB";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let idx = 0;
  while (value >= 1024 && idx < units.length - 1) {
    value /= 1024;
    idx += 1;
  }
  return `${value.toFixed(idx === 0 ? 0 : value >= 10 ? 1 : 2)} ${units[idx]}`;
}

/* ================================================================================================
 * Tema / estilos
 * ==============================================================================================*/
function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(!!mql.matches);
    update();
    mql.addEventListener?.("change", update);
    return () => mql.removeEventListener?.("change", update);
  }, []);
  return reduced;
}

const lightTheme = {
  mode: "light",
  colors: {
    bg: "#f5f7fb", bgElev: "#ffffff", text: "#0b0f1a", textDim: "#5b6270",
    primary: "#0a84ff", primaryHover: "#0a74df", success: "#34c759", danger: "#ff3b30",
    accent: "#FACC15", accentText: "#111827",
    border: "#e6e9ef", outline: "#d0d7e5", glass: "rgba(255,255,255,0.65)", glassStroke: "rgba(15,23,42,0.06)",
    cardShadow: "0 10px 40px rgba(22,29,53,0.10)", glow: "0 0 0 8px rgba(10,132,255,0.08)", ring: "0 0 0 3px rgba(10,132,255,0.25)",
    selection: "#dbeafe",
  },
  radii: { sm: "22px", md: "22px", lg: "22px", xl: "22px", pill: "999px" },
  shadows: { soft: "0 6px 18px rgba(22,29,53,0.08)", softLg: "0 14px 48px rgba(22,29,53,0.10)" },
  fonts: {
    body: "-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif",
    mono: "SFMono-Regular,Consolas,Liberation Mono,Menlo,monospace",
  },
};

const GlobalStyle = createGlobalStyle`
  :root { color-scheme: light; }
  *, *::before, *::after { box-sizing: border-box; }
  html, body, #root { height: 100%; }
  body {
    margin: 0;
    background: linear-gradient(135deg, #f6f8fc, #eef3fb 46%, #f7f9fe);
    color: ${({ theme }) => theme.colors.text};
    font-family: ${({ theme }) => theme.fonts.body};
    -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale;
  }
  ::selection { background: ${({ theme }) => theme.colors.selection}; }
  a { color: inherit; text-decoration: none; }
  button { font-family: inherit; }
  /* Fallback minimal para elementos comuns */
  button, input, textarea, select { border-radius: 22px; }
`;

const transitions = {
  layout: { type: "spring", stiffness: 400, damping: 28, mass: 0.8 }, // 120fps snappy
  spring: { type: "spring", stiffness: 400, damping: 28, mass: 0.8 },
  hover: { type: "spring", stiffness: 500, damping: 20 },
};
const simpleFade = { initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0, transition: { duration: 0.25, ease: "easeOut" } }, exit: { opacity: 0, y: -5, transition: { duration: 0.2, ease: "easeIn" } } };
const subtleIn = { initial: { opacity: 0, y: 14 }, animate: { opacity: 1, y: 0, transition: transitions.layout }, exit: { opacity: 0, y: -10, transition: { duration: 0.3 } } };
const accordionVariants = { closed: { height: 0, opacity: 0, marginTop: 0, transition: { duration: 0.28 } }, open: { height: "auto", opacity: 1, marginTop: 16, transition: { duration: 0.42 } } };

const AppRoot = styled.div`min-height: 100dvh; display: grid; place-items: center; padding: clamp(16px, 2vw, 24px);`;
const Shell = styled(motion.div)`
  width: min(1100px, 92vw);
  background: ${({ theme }) => theme.colors.bgElev};
  border: 1px solid ${({ theme }) => theme.colors.glassStroke};
  box-shadow: ${({ theme }) => theme.shadows.softLg};
  border-radius: ${({ theme }) => theme.radii.xl};
  overflow: visible; position: relative;
`;
const GlassHeader = styled.header`
  position: sticky; top: 0; z-index: 10;
  backdrop-filter: saturate(180%) blur(18px);
  background: ${({ theme }) => theme.colors.glass};
  border-bottom: 1px solid ${({ theme }) => theme.colors.glassStroke};
  border-top-left-radius: ${({ theme }) => theme.radii.xl};
  border-top-right-radius: ${({ theme }) => theme.radii.xl};
`;
const HeaderRow = styled.div`display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: clamp(14px, 2vw, 18px) clamp(18px, 2.2vw, 24px);`;
const Brand = styled.div`display: flex; align-items: center; gap: 12px;`;
const BrandIconWrap = styled(motion.div)`width: 36px; height: 36px; display: grid; place-items: center; color: ${({ theme }) => theme.colors.primary};`;
const BrandTitle = styled.div`display: flex; flex-direction: column; line-height: 1.05;`;
const BrandName = styled.span`font-size: clamp(18px, 2.2vw, 22px); font-weight: 700; letter-spacing: -0.01em;`;
const BrandTag = styled.span`font-size: 12px; color: ${({ theme }) => theme.colors.textDim};`;
const Content = styled.main`
  padding: clamp(18px, 2.4vw, 28px); display: grid; grid-template-columns: 1fr; gap: 20px;
  @media (min-width: 1024px) { grid-template-columns: 1.1fr 0.9fr; gap: 26px; }
`;
const Section = styled(motion.section)`
  background: ${({ theme }) => theme.colors.bgElev};
  border: 1px solid ${({ theme }) => theme.colors.glassStroke};
  border-radius: ${({ theme }) => theme.radii.lg};
  padding: clamp(16px, 2vw, 22px); box-shadow: ${({ theme }) => theme.shadows.soft};
`;
const SectionTitle = styled.h2`margin: 0 0 12px 0; font-size: clamp(16px, 1.6vw, 18px); letter-spacing: -0.01em;`;
const Muted = styled.p`margin: 0; color: ${({ theme }) => theme.colors.textDim}; font-size: 13px;`;
const FieldLabel = styled.span`display: inline-flex; align-items: center; gap: 8px; font-size: 12px; font-weight: 800; letter-spacing: 0.06em; text-transform: uppercase; color: ${({ theme }) => theme.colors.textDim}; margin-bottom: 6px;`;

const fieldStyles = css`
  width: 100%; border: 1px solid ${({ theme }) => theme.colors.border};
  background: #f9fbff; color: ${({ theme }) => theme.colors.text};
  border-radius: ${({ theme }) => theme.radii.md};
  padding: 12px 14px; font-size: 14px; font-weight: 600; outline: none;
  transition: box-shadow .25s ease, border-color .25s ease, background .25s ease;
  &:focus { border-color: ${({ theme }) => theme.colors.primary}; box-shadow: ${({ theme }) => theme.colors.ring}; background: #fff; }
  &::placeholder { color: ${({ theme }) => theme.colors.textDim}; font-weight: 500; }
  &:disabled { opacity: .6; cursor: not-allowed; }
`;
const Input = styled.input`${fieldStyles};`;
const TextArea = styled.textarea`${fieldStyles}; resize: vertical; min-height: 120px;`;
const PrimaryButton = styled(motion.button)`
  appearance: none; border: none; background: ${({ theme }) => theme.colors.primary}; color: white;
  border-radius: ${({ theme }) => theme.radii.md}; padding: 12px 18px; font-weight: 700; letter-spacing: 0.01em;
  box-shadow: 0 8px 26px rgba(10,132,255,0.30); display: inline-flex; align-items: center; gap: 10px; cursor: pointer;
  transition: filter .2s ease, transform .2s ease, background .2s ease;
  &:hover { filter: brightness(0.98); } &:disabled { opacity: .6; cursor: not-allowed; box-shadow: none; }
`;
const AccentButton = styled(motion.button)`
  appearance: none; border: none; background: ${({ theme }) => theme.colors.accent}; color: ${({ theme }) => theme.colors.accentText};
  border-radius: ${({ theme }) => theme.radii.md}; padding: 12px 16px; font-weight: 800;
  box-shadow: 0 10px 30px rgba(250, 204, 21, 0.36);
  display: inline-flex; align-items: center; gap: 10px; cursor: pointer;
`;

const GhostButton = styled.button`
  appearance: none; border: 1px solid ${({ theme }) => theme.colors.border};
  background: ${({ theme }) => theme.colors.bgElev}; color: ${({ theme }) => theme.colors.text};
  padding: 8px 12px; border-radius: ${({ theme }) => theme.radii.sm}; display: inline-flex; align-items: center; gap: 8px;
  font-size: 13px; font-weight: 600; box-shadow: ${({ theme }) => theme.shadows.soft};
  transition: transform .15s ease, box-shadow .2s ease, background .2s ease;
  &:hover { transform: translateY(-1px); } &:active { transform: translateY(0); }
  &:disabled { opacity: .55; cursor: not-allowed; transform: none; }
`;
const DropZone = styled.label`
  position: relative; display: grid; place-items: center;
  border: 2px dashed ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.lg};
  padding: clamp(26px, 4vw, 40px);
  background: rgba(10,132,255,0.05);
  text-align: center; gap: 12px; cursor: pointer;
  transition: border-color .2s ease, background .2s ease, transform .2s ease;
  &:hover { border-color: ${({ theme }) => theme.colors.primary}; background: rgba(10,132,255,0.09); transform: translateY(-2px); }
`;
const HiddenFileInput = styled.input`display: none;`;
const FileBadge = styled.span`
  display: inline-flex; align-items: center; gap: 6px;
  padding: 6px 10px; border-radius: ${({ theme }) => theme.radii.md};
  background: ${({ theme }) => theme.colors.bgElev};
  border: 1px solid ${({ theme }) => theme.colors.border};
  font-size: 12px; font-weight: 700;
`;
const SliderInput = styled.input.attrs({ type: "range" })`
  width: 100%; accent-color: ${({ theme }) => theme.colors.primary};
  margin: 10px 0 4px 0;
  &:disabled { opacity: 0.45; cursor: not-allowed; }
`;
const SliderLabels = styled.div`
  display: flex; align-items: center; justify-content: space-between;
  font-size: 12px; font-weight: 600; color: ${({ theme }) => theme.colors.textDim};
`;
const ToggleRow = styled.div`
  display: flex; align-items: center; justify-content: space-between;
  background: rgba(10,132,255,0.06);
  border: 1px solid ${({ theme }) => theme.colors.border};
  padding: 12px 16px; border-radius: ${({ theme }) => theme.radii.md};
  margin-top: 16px; gap: 12px;
`;
const PillGroup = styled.div`
  --pill-count: 2;
  position: relative;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0;
  background: #f3f6fb;
  border: 1px solid ${({ theme }) => theme.colors.border};
  padding: 6px;
  border-radius: ${({ theme }) => theme.radii.md};
  white-space: nowrap;
  isolation: isolate;
`;
const Pill = styled.button`
  position: relative;
  z-index: 1;
  appearance: none;
  border: none;
  background: transparent;
  border-radius: ${({ theme }) => theme.radii.md};
  padding: 10px 12px;
  font-weight: 700;
  font-size: 14px;
  color: ${({ $active, theme }) => ($active ? theme.colors.primary : theme.colors.textDim)};
  transition: color .2s ease;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  justify-content: center;
  min-width: 0;
  cursor: pointer;
  &:disabled { opacity: 0.45; cursor: not-allowed; }
`;
const PillThumb = styled(motion.div)`
  position: absolute;
  top: 6px;
  bottom: 6px;
  left: 6px;
  width: calc((100% - 12px) / var(--pill-count));
  will-change: left;
  background: white;
  border: 1px solid ${({ theme }) => theme.colors.outline};
  border-radius: ${({ theme }) => theme.radii.md}; box-shadow: ${({ theme }) => theme.shadows.soft};
`;
const SelectWrap = styled.div`display: grid; gap: 8px; position: relative;`;
const SelectLabel = styled.label`font-size: 12px; font-weight: 700; color: ${({ theme }) => theme.colors.textDim}; display: inline-flex; gap: 8px; align-items: center;`;
const SelectButton = styled.button`${fieldStyles}; text-align: left; display: flex; align-items: center; justify-content: space-between; background: #f9fbff;`;
const SelectList = styled(motion.ul)`
  position: absolute; top: calc(100% + 8px); left: 0; right: 0; z-index: 40; list-style: none; margin: 0; padding: 6px;
  border: 1px solid ${({ theme }) => theme.colors.border}; border-radius: ${({ theme }) => theme.radii.md};
  background: ${({ theme }) => theme.colors.bgElev}; box-shadow: ${({ theme }) => theme.shadows.softLg};
  max-height: 260px; overflow: auto; transform-origin: top center;
`;
const SelectItem = styled.li`
  border-radius: ${({ theme }) => theme.radii.sm}; padding: 10px 10px; display: flex; align-items: center; justify-content: space-between; gap: 10px;
  font-weight: 600; font-size: 14px; color: ${({ $active, theme }) => ($active ? theme.colors.primary : theme.colors.text)};
  background: ${({ $active }) => ($active ? "#eaf3ff" : "transparent")}; cursor: pointer; &:hover { background: #f3f7ff; }
`;
const InfoBanner = styled(motion.div)`
  background: linear-gradient(180deg, #ffffff 0%, #fbfdff 100%); border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.md}; padding: 12px 14px; display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 12px;
`;
const Badge = styled.span`
  display: inline-flex; align-items: center; gap: 6px; font-weight: 800; font-size: 10px; text-transform: uppercase; letter-spacing: .04em;
  color: ${({ theme }) => theme.colors.textDim}; background: #f2f6fd; padding: 6px 8px; border-radius: ${({ theme }) => theme.radii.md}; border: 1px solid ${({ theme }) => theme.colors.border};
`;
const Divider = styled.hr`border: none; height: 1px; background: ${({ theme }) => theme.colors.border}; margin: 10px 0;`;
const ProgressWrap = styled.div`width: 100%; max-width: 560px; margin: 0 auto;`;
const ProgressTrack = styled.div`height: 10px; background: #ecf1fb; border-radius: ${({ theme }) => theme.radii.md}; overflow: hidden; border: 1px solid ${({ theme }) => theme.colors.border};`;
const ProgressBar = styled(motion.div)`height: 100%; background: ${({ theme }) => theme.colors.primary}; border-radius: ${({ theme }) => theme.radii.md};`;
const StatusRow = styled.div`display: flex; align-items: center; justify-content: center; gap: 8px; margin-top: 10px; color: ${({ theme }) => theme.colors.primary}; font-weight: 700; font-size: 13px;`;

const OptionsContext = createContext({ isDownloading: false, isAudioOnly: false });

const float = keyframes`from{transform:translateY(0)}50%{transform:translateY(-3px)}to{transform:translateY(0)}`;
const AmbientSpark = styled(motion.div)`
  position: absolute; inset: auto auto -50px -50px; width: 220px; height: 220px; border-radius: 50%; pointer-events: none;
  background: radial-gradient(120px 120px at 70% 30%, rgba(10,132,255,0.16), transparent 60%),
              radial-gradient(120px 120px at 20% 80%, rgba(52,199,89,0.12), transparent 60%);
  filter: blur(8px); opacity: 0.7; animation: ${float} 6s ease-in-out infinite;
`;

function calcThumbLeft(index, count) {
  const safeCount = Math.max(1, count);
  const safeIndex = Math.max(0, Math.min(index, safeCount - 1));
  return `calc(6px + ${safeIndex} * ((100% - 12px) / ${safeCount}))`;
}

function detectProvider(raw) {
  if (!raw) return null;
  const value = String(raw).trim().toLowerCase();
  if (!value) return null;
  if (/instagram\.com\//.test(value)) return "instagram";
  if (/(facebook\.com|fb\.watch)\//.test(value)) return "facebook";
  if (/(twitter\.com|x\.com)\//.test(value)) return "twitter";
  if (/(youtube\.com|youtu\.be|music\.youtube\.com)\//.test(value)) return "youtube";
  if (/dailymotion\.com|dai\.ly/.test(value)) return "dailymotion";
  return null;
}

const PROVIDERS_WITH_LOCKED_OPTIONS = new Set(["instagram", "facebook", "twitter"]);

/* ================================================================================================
 * Componente principal
 * ==============================================================================================*/
export default function DriveStyleDownloader() {
  const notifier = useLocalNotifier();
  const { notify } = notifier;
  const prefersReduced = usePrefersReducedMotion();
  // 2. Persistent Cache & Defaults (Optimization)
  // Load saved state or use optimized defaults ("best", "mp4", etc)
  const [activeView, setActiveView] = useState(() => localStorage.getItem("ud_activeView") || "downloader");
  useEffect(() => localStorage.setItem("ud_activeView", activeView), [activeView]);

  const [url, setUrl] = useState("");
  const [batchUrls, setBatchUrls] = useState("");
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("Aguardando link...");
  const [busy, setBusy] = useState(false);
  const urlRef = useRef("");
  useEffect(() => { urlRef.current = url; }, [url]);
  const fileInputRef = useRef(null);
  const activeViewRef = useRef("downloader");
  useEffect(() => { activeViewRef.current = activeView; }, [activeView]);

  // Focus Input Ref
  const inputRef = useRef(null);

  // 3. Auto-Focus & Auto-Paste (Instant Launch)
  useEffect(() => {
    // Focus immediately
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  const [savedPath, setSavedPath] = useState(null);
  const [savedDir, setSavedDir] = useState(null);
  const wsRef = useRef(null);
  const clipboardStateRef = useRef({ raw: "", link: "" });

  const [isBatchMode, setIsBatchMode] = useState(false);
  const isBatchModeRef = useRef(false);
  useEffect(() => { isBatchModeRef.current = isBatchMode; }, [isBatchMode]);

  const [isDragging, setIsDragging] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [compressDragging, setCompressDragging] = useState(false);

  // Default to "best" resolution and "mp4" format
  const [format, setFormat] = useState(() => localStorage.getItem("ud_format") || "mp4");
  const [quality, setQuality] = useState(() => Number(localStorage.getItem("ud_quality")) || 192);
  const [resolution, setResolution] = useState(() => localStorage.getItem("ud_resolution") || "best");

  // Persist settings
  useEffect(() => {
    localStorage.setItem("ud_format", format);
    localStorage.setItem("ud_quality", String(quality));
    localStorage.setItem("ud_resolution", resolution);
  }, [format, quality, resolution]);

  const [compressSource, setCompressSource] = useState(null);
  const [compressionPercent, setCompressionPercent] = useState(() => Number(localStorage.getItem("ud_compPercent")) || 40);
  const [compressResolution, setCompressResolution] = useState(() => localStorage.getItem("ud_compRes") || "auto");
  const [compressionEngine, setCompressionEngine] = useState(() => localStorage.getItem("ud_compEngine") || "cpu");

  useEffect(() => {
    localStorage.setItem("ud_compPercent", String(compressionPercent));
    localStorage.setItem("ud_compRes", compressResolution);
    localStorage.setItem("ud_compEngine", compressionEngine);
  }, [compressionPercent, compressResolution, compressionEngine]);

  const [discordMode, setDiscordMode] = useState(false);
  const [compressBusy, setCompressBusy] = useState(false);
  const [compressStatus, setCompressStatus] = useState("Selecione um vídeo MP4 para começar.");
  const [compressProgress, setCompressProgress] = useState(0);
  const [compressResult, setCompressResult] = useState(null);
  const [compressTargetDir, setCompressTargetDir] = useState(null);
  const [linkProvider, setLinkProvider] = useState(null);
  const [instagramMeta, setInstagramMeta] = useState(null);
  const [instagramLoading, setInstagramLoading] = useState(false);
  const [instagramError, setInstagramError] = useState(null);

  // Estados de update removidos


  const isAudioOnly = useMemo(() => ["mp3", "m4a", "wav", "flac"].includes(format), [format]);
  const isDownloading = busy || (progress > 0 && progress < 100);
  const compressorResolutionOptions = useMemo(() => RESOLUTION_OPTIONS, []);
  const compressorEngineOptions = useMemo(() => ENGINE_OPTIONS, []);
  const estimatedFinalSize = useMemo(() => {
    if (!compressSource?.size) return 0;
    const resolutionFactor = RESOLUTION_MULTIPLIERS[compressResolution] ?? 1;
    const compressionFactor = Math.max(0.01, 1 - Math.min(99, Math.max(0, compressionPercent)) / 100);
    return compressSource.size * resolutionFactor * compressionFactor;
  }, [compressSource, compressionPercent, compressResolution]);
  const reductionPercent = useMemo(() => {
    if (!compressSource?.size || !estimatedFinalSize) return 0;
    const reduction = 100 - (estimatedFinalSize / compressSource.size) * 100;
    return Math.max(0, Math.min(99, Math.round(reduction)));
  }, [compressSource, estimatedFinalSize]);
  const compressionPercentLabel = useMemo(() => {
    const backendPercent = typeof compressResult?.reduction_percent === "number" && Number.isFinite(compressResult.reduction_percent)
      ? compressResult.reduction_percent
      : null;
    const fallbackPercent = backendPercent ?? (compressSource ? reductionPercent : null);
    if (fallbackPercent === null || Number.isNaN(Number(fallbackPercent))) return "--";
    const normalized = Math.max(0, Math.min(100, Number(fallbackPercent)));
    return Number.isInteger(normalized) ? `${normalized.toFixed(0)}%` : `${normalized.toFixed(1)}%`;
  }, [compressResult, compressSource, reductionPercent]);
  const withinDiscordTarget = useMemo(() => {
    if (!compressSource?.size) return false;
    return estimatedFinalSize <= DISCORD_TARGET_BYTES;
  }, [compressSource, estimatedFinalSize]);
  const compressProgressDisplay = useMemo(() => Math.min(100, Math.max(0, Math.round(compressProgress))), [compressProgress]);
  const showCompressProgress = compressBusy || compressProgressDisplay > 0;
  const finalOutputDir = useMemo(() => {
    if (compressTargetDir) return compressTargetDir;
    const out = compressResult?.output_path;
    if (!out) return null;
    const normalized = String(out).replace(/\\/g, "/");
    const parts = normalized.split("/");
    if (parts.length <= 1) return normalized;
    parts.pop();
    return parts.join("/") || normalized;
  }, [compressResult, compressTargetDir]);
  const instagramIsCarousel = useMemo(() => {
    if (!instagramMeta) return false;
    return !!instagramMeta.is_carousel;
  }, [instagramMeta]);
  const isRestrictedProvider = useMemo(() => PROVIDERS_WITH_LOCKED_OPTIONS.has(linkProvider), [linkProvider]);

  const providerDetails = useMemo(() => {
    if (!linkProvider || isBatchMode) return null;
    if (linkProvider === "instagram") {
      const spinner = (
        <motion.span
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
        >
          <Loader2 size={18} style={{ color: lightTheme.colors.primary }} />
        </motion.span>
      );
      if (instagramLoading) {
        return {
          icon: spinner,
          title: "Analisando link do Instagram...",
          subtitle: "Baixaremos o vídeo na melhor qualidade disponível.",
        };
      }
      if (instagramError) {
        return {
          icon: <X size={18} style={{ color: lightTheme.colors.danger }} />,
          title: "Não foi possível analisar o link.",
          subtitle: instagramError,
        };
      }
      const baseTitle = instagramIsCarousel
        ? `Carrossel com ${instagramMeta?.entry_count ?? "?"} itens`
        : "Vídeo único do Instagram";
      const stats = instagramMeta
        ? `• ${instagramMeta.video_count ?? 0} vídeo(s)`
        : "";
      return {
        icon: <FileVideo size={18} style={{ color: lightTheme.colors.primary }} />,
        title: `${baseTitle} ${stats}`.trim(),
        subtitle: "Baixaremos apenas o vídeo (imagens exigem login).",
      };
    }
    if (linkProvider === "facebook") {
      return {
        icon: <FileVideo size={18} style={{ color: lightTheme.colors.primary }} />,
        title: "Link do Facebook detectado",
        subtitle: "Baixaremos o vídeo na melhor qualidade disponível. Ajustes avançados foram ocultados.",
      };
    }
    if (linkProvider === "twitter") {
      return {
        icon: <FileVideo size={18} style={{ color: lightTheme.colors.primary }} />,
        title: "Link do X (Twitter) detectado",
        subtitle: "Baixaremos o vídeo com qualidade máxima disponível automaticamente.",
      };
    }
    return null;
  }, [linkProvider, isBatchMode, instagramLoading, instagramError, instagramMeta, instagramIsCarousel]);

  useEffect(() => {
    if (isBatchMode) {
      setLinkProvider(null);
      return;
    }
    const provider = detectProvider(url || "");
    setLinkProvider(provider);
  }, [url, isBatchMode]);

  useEffect(() => {
    if (PROVIDERS_WITH_LOCKED_OPTIONS.has(linkProvider)) {
      if (format !== "mp4") setFormat("mp4");
      if (resolution !== "best") setResolution("best");
      if (quality !== 192) setQuality(192);
    }
    if (linkProvider === "instagram") {
      setInstagramMeta(null);
      setInstagramError(null);
    } else {
      setInstagramMeta(null);
      setInstagramError(null);
    }
    if (isRestrictedProvider) {
      setOptionsOpen(false);
    }
  }, [linkProvider, format, resolution, quality, isRestrictedProvider]);

  useEffect(() => {
    if (linkProvider !== "instagram" || isBatchMode) {
      setInstagramMeta(null);
      setInstagramLoading(false);
      setInstagramError(null);
      return;
    }
    const trimmed = (url || "").trim();
    if (!trimmed) {
      setInstagramMeta(null);
      setInstagramLoading(false);
      setInstagramError(null);
      return;
    }
    let cancelled = false;
    setInstagramLoading(true);
    setInstagramError(null);
    (async () => {
      try {
        const endpoint = `${API_URL}/inspect-instagram?url=${encodeURIComponent(trimmed)}`;
        const response = await fetch(endpoint, { cache: "no-store" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        if (!cancelled) {
          setInstagramMeta(data || null);
        }
      } catch (error) {
        console.error("instagram inspect failed:", error);
        if (!cancelled) {
          setInstagramMeta(null);
          setInstagramError("Não foi possível analisar o link.");
        }
      } finally {
        if (!cancelled) setInstagramLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [linkProvider, url, isBatchMode]);

  const handleFilePick = useCallback((fileList) => {
    if (!fileList || fileList.length === 0) return;
    const file = fileList[0];
    if (!file) return;
    const isMp4 = file.type === "video/mp4" || /\.mp4$/i.test(file.name || "");
    if (!isMp4) {
      notify("Selecione um arquivo MP4 para comprimir.", "error");
      return;
    }
    if (!file.size) {
      notify("Arquivo inválido ou vazio.", "error");
      return;
    }
    setCompressSource(file);
    setCompressionPercent(40);
    setCompressResolution("auto");
    setDiscordMode(false);
    setCompressBusy(false);
    setCompressProgress(0);
    setCompressStatus("Ajuste as configurações e comprima.");
    setCompressResult(null);
    setCompressTargetDir(null);
  }, [notify]);

  const clearCompressor = useCallback(() => {
    setCompressSource(null);
    setCompressionPercent(40);
    setCompressResolution("auto");
    setCompressionEngine("cpu");
    setDiscordMode(false);
    setCompressBusy(false);
    setCompressProgress(0);
    setCompressStatus("Selecione um vídeo MP4 para começar.");
    setCompressResult(null);
    setCompressTargetDir(null);
  }, []);

  const handleCompressionChange = useCallback((value) => {
    setCompressionPercent(value);
    if (discordMode) setDiscordMode(false);
  }, [discordMode]);

  const handleResolutionChange = useCallback((value) => {
    setCompressResolution(value);
    if (discordMode) setDiscordMode(false);
  }, [discordMode]);

  const applyDiscordPreset = useCallback(() => {
    if (!compressSource?.size) return;
    const fileSize = compressSource.size;
    for (const option of RESOLUTION_OPTIONS) {
      const multiplier = RESOLUTION_MULTIPLIERS[option.value] ?? 1;
      if (fileSize * multiplier * 0.01 > DISCORD_TARGET_BYTES) continue;
      const ratio = Math.min(1, DISCORD_TARGET_BYTES / (fileSize * multiplier));
      const computed = Math.round(100 * (1 - ratio));
      const clamped = Math.max(0, Math.min(99, computed));
      setCompressResolution(option.value);
      setCompressionPercent(clamped);
      return;
    }
    setCompressResolution("240p");
    setCompressionPercent(99);
  }, [compressSource]);

  const handleDiscordToggle = useCallback(() => {
    if (compressBusy) return;
    if (!discordMode) {
      if (!compressSource) {
        notify("Selecione um vídeo MP4 antes de usar o modo Discord.", "info");
        return;
      }
      setDiscordMode(true);
      applyDiscordPreset();
    } else {
      setDiscordMode(false);
    }
  }, [discordMode, compressSource, notify, applyDiscordPreset, compressBusy]);

  const handleFileInputChange = useCallback((event) => {
    handleFilePick(event.target.files);
    event.target.value = "";
  }, [handleFilePick]);

  const handleCompressorDragOver = useCallback((event) => {
    event.preventDefault();
    setCompressDragging(true);
  }, []);

  const handleCompressorDragLeave = useCallback((event) => {
    event.preventDefault();
    setCompressDragging(false);
  }, []);

  const handleCompressorDrop = useCallback((event) => {
    event.preventDefault();
    setCompressDragging(false);
    const fileList = event.dataTransfer?.files;
    if (fileList?.length) handleFilePick(fileList);
  }, [handleFilePick]);

  const handleCopyPath = useCallback(async (path) => {
    if (!path) return;
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(path);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = path;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      notify("Caminho copiado para a área de transferência.", "success");
    } catch (err) {
      console.error("Copy path failed:", err);
      notify("Não foi possível copiar o caminho.", "error");
    }
  }, [notify]);

  // Abre seletor de pasta no backend
  const chooseSaveDir = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/select-dir`, { method: "POST" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const js = await res.json();
      const dir = js?.dir || js?.directory;
      if (!dir) return null;
      setSavedDir(dir);
      return dir;
    } catch (e) {
      console.error(e);
      notify("Não foi possível abrir o seletor de pasta.", "error");
      return null;
    }
  }, [notify]);

  const handleStartCompression = useCallback(async () => {
    if (!compressSource) {
      notify("Selecione um vídeo para comprimir.", "error");
      return;
    }
    if (compressBusy) return;

    try {
      setCompressBusy(true);
      setCompressResult(null);
      setCompressProgress(0);
      setCompressStatus("Solicitando diretório de saída...");

      const targetDir = await chooseSaveDir();
      if (!targetDir) {
        setCompressStatus("Operação cancelada pelo usuário.");
        setCompressBusy(false);
        return;
      }

      setCompressTargetDir(targetDir);

      let customName = null;
      const defaultName = (compressSource.name || "video.mp4").replace(/\.mp4$/i, "");
      const rawName = window.prompt("Nome personalizado (opcional, sem extensão)", defaultName);
      if (rawName !== null && rawName.trim()) {
        const sanitized = sanitizeCustomName(rawName);
        if (sanitized) {
          customName = sanitized;
        } else {
          notify("Nome personalizado inválido; usaremos o padrão.", "error");
        }
      }

      setCompressStatus("Enviando arquivo ao servidor...");

      const formData = new FormData();
      formData.append("file", compressSource, compressSource.name || "video.mp4");
      formData.append("compression", String(compressionPercent));
      formData.append("resolution", compressResolution);
      formData.append("discord_mode", discordMode ? "1" : "0");
      formData.append("target_dir", targetDir);
      formData.append("hardware_mode", compressionEngine);
      if (customName) formData.append("custom_name", customName);

      const response = await fetch(`${API_URL}/compress`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        if (response.status === 499) {
          setCompressStatus("Compressão cancelada pelo usuário.");
          setCompressProgress(0);
          notify("Compressão cancelada.", "info");
          return;
        }
        const text = await response.text();
        throw new Error(text || `HTTP ${response.status}`);
      }

      const data = await response.json();
      setCompressStatus("Compressão concluída!");
      setCompressProgress(100);
      setCompressResult(data);
      notify("Vídeo comprimido com sucesso!", "success");
    } catch (error) {
      console.error("Compression failed:", error);
      const message = error instanceof Error ? error.message : "Erro desconhecido.";
      setCompressStatus("Falha na compressão.");
      setCompressProgress(0);
      notify(message.includes("HTTP") ? "Falha na compressão." : message, "error");
    } finally {
      setCompressBusy(false);
    }
  }, [
    compressSource,
    compressBusy,
    chooseSaveDir,
    compressionPercent,
    compressResolution,
    discordMode,
    compressionEngine,
    notify,
  ]);

  useEffect(() => {
    if (!discordMode || !compressSource) return;
    applyDiscordPreset();
  }, [discordMode, compressSource, applyDiscordPreset]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    let cancelled = false;
    let reportedError = false;
    const allowedHosts = /(youtube\.com|youtu\.be|music\.youtube\.com|dailymotion\.com|dai\.ly|instagram\.com|facebook\.com|fb\.watch|twitter\.com|x\.com|m\.facebook\.com)/i;
    const hasDocument = typeof document !== "undefined";
    const canUseNavigatorClipboard = false;

    const fetchClipboardText = async () => {
      if (canUseNavigatorClipboard) {
        return navigator.clipboard.readText();
      }
      try {
        const res = await fetch(`${API_URL}/clipboard`, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        return data?.text ?? "";
      } catch (error) {
        throw error;
      }
    };

    const pollClipboard = async () => {
      if (cancelled) return;
      if (activeViewRef.current !== "downloader") return;
      if (isBatchModeRef.current) return;
      if (hasDocument && document.visibilityState === "hidden") return;
      if (hasDocument && typeof document.hasFocus === "function" && !document.hasFocus()) return;

      try {
        const raw = (await fetchClipboardText())?.trim();
        if (!raw || raw === clipboardStateRef.current.raw) return;

        clipboardStateRef.current.raw = raw;
        reportedError = false;
        const urls = parseUrlsFromText(raw);
        const match = urls.find((candidate) => allowedHosts.test(candidate));
        if (!match) return;

        if (clipboardStateRef.current.link === match) return;
        clipboardStateRef.current.link = match;

        if (urlRef.current && urlRef.current === match) return;

        setUrl(match);
      } catch (err) {
        if (!reportedError) {
          console.debug("Clipboard read failed:", err);
          reportedError = true;
        }
      }
    };

    const startPolling = () => {
      if (cancelled) return () => { };
      const interval = setInterval(pollClipboard, 3000);
      pollClipboard();
      return () => clearInterval(interval);
    };

    let stopPolling = () => { };
    // Instant kickoff
    const kickoff = () => {
      if (cancelled) return;
      stopPolling = startPolling();
    };

    // Run immediately without delay
    kickoff();

    return () => {
      cancelled = true;
      stopPolling();
    };

  }, [setUrl]);

  // WebSocket (auto-reconnect)
  const notifyRef = useRef(notify);
  useEffect(() => {
    let closed = false;
    let frameId = null;

    function connect() {
      if (closed) return;
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => console.log("WS conectado:", WS_URL);

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data || "{}");

          // WS update handlers removidos


          if (data.task === "compressor") {
            if (typeof data.progress === "number") {
              setCompressProgress(Math.max(0, Math.min(100, data.progress)));
            }
            if (data.status) {
              const statusText = String(data.status);
              setCompressStatus(statusText);
              if (/erro/i.test(statusText)) setCompressBusy(false);
              if (/conclu/i.test(statusText)) setCompressBusy(false);
              if (/cancelad/i.test(statusText)) {
                setCompressBusy(false);
                setCompressProgress(0);
              }
            }
            if (data.saved_path || data.output_path || data.final_size || data.filename) {
              setCompressResult((prev) => {
                const finalSize = typeof data.final_size === "number" ? data.final_size : prev?.final_size;
                return {
                  ...(prev || {}),
                  output_path: data.saved_path || data.output_path || prev?.output_path,
                  filename: data.filename || prev?.filename,
                  final_size: finalSize,
                  final_size_human: data.final_size_human || prev?.final_size_human || (typeof finalSize === "number" ? formatBytes(finalSize) : undefined),
                  target_size_bytes: data.target_size_bytes ?? prev?.target_size_bytes,
                  target_size_human: data.target_size_human ?? prev?.target_size_human,
                };
              });
            }
            return;
          }

          const pct = data.progress ?? data.pct ?? data.percent;
          if (typeof pct === "number") setProgress(Math.max(0, Math.min(100, pct)));
          if (data.status) setStatus(String(data.status));

          if (data.status && /cancelad/i.test(String(data.status))) {
            setBusy(false);
            setProgress(0);
            setSavedPath(null);
          }

          const sp = data.saved_path || data.path || data.output_path || data.file;

          if (sp && !isBatchModeRef.current) {
            setTimeout(() => {
              setSavedPath(String(sp));
              setBusy(false);
            }, 3000);
          }

          if (data.queue_finished) {
            const dir = data.target_dir;
            setProgress(100);
            setStatus("Concluindo");
            setTimeout(() => {
              setSavedPath(dir || null);
              setBusy(false);
            }, 3000);
          }
        } catch (e) {
          console.warn("WS msg inv?lida:", e);
        }
      };

      ws.onclose = () => {
        if (!closed) setTimeout(connect, 1200);
      };
    }

    const start = () => {
      if (!closed) connect();
    };

    if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
      frameId = window.requestAnimationFrame(start);
    } else {
      start();
    }

    return () => {
      closed = true;
      if (frameId !== null && typeof window !== "undefined" && typeof window.cancelAnimationFrame === "function") {
        window.cancelAnimationFrame(frameId);
      }
      wsRef.current?.close();
    };
  }, []);
  // Funções de check update removidas


  const getOptions = useCallback(() => ({
    format,
    quality,
    resolution: isAudioOnly ? "best" : resolution,
  }), [format, quality, resolution, isAudioOnly]);

  // ▶️ Cancelar download/fila atual
  const cancelDownload = useCallback(async () => {
    try {
      await fetch(`${API_URL}/cancel`, { method: "POST" });
      setStatus("Cancelando...");
    } catch (e) {
      console.error(e);
      notify("Falha ao cancelar.", "error");
    }
  }, [notify]);

  const cancelCompression = useCallback(async () => {
    try {
      await fetch(`${API_URL}/cancel`, { method: "POST" });
      setCompressStatus("Cancelando compressão...");
    } catch (e) {
      console.error(e);
      notify("Falha ao cancelar a compressão.", "error");
    }
  }, [notify]);

  // Revela na pasta no backend (Explorer)
  const revealInFolder = useCallback(async (path) => {
    if (!path) return;
    try {
      const res = await fetch(`${API_URL}/reveal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path })
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (e) {
      console.error(e);
      notify("Falha ao abrir a pasta.", "error");
    }
  }, [notify]);

  // Fluxo principal
  const startDownload = useCallback(async () => {
    if (isDownloading) return;
    setProgress(0);
    setSavedPath(null);
    setBusy(true);

    const options = getOptions();

    // 1) escolher pasta
    const targetDir = await chooseSaveDir();
    if (!targetDir) { setBusy(false); setStatus("Aguardando link..."); return; }

    let customName = null;
    if (!isBatchMode) {
      const rawName = window.prompt("Nome personalizado (opcional, sem extensao)", "");
      if (rawName !== null) {
        const sanitized = sanitizeCustomName(rawName);
        if (sanitized) {
          customName = sanitized;
        } else if (rawName.trim()) {
          notify("Nome personalizado invalido; usando titulo original.", "error");
        }
      }
    }


    if (isBatchMode) {
      const urls = parseUrlsFromText(batchUrls);
      if (urls.length === 0) { setBusy(false); return notify("Cole links válidos na área de texto!", "error"); }
      setStatus(`Adicionando ${urls.length} links à fila...`);
      try {
        const res = await fetch(`${API_URL}/queue`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ urls, target_dir: targetDir, ...options }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        notify(`${urls.length} downloads iniciados!`, "success");
        setBatchUrls("");
        setStatus("Processando fila...");
      } catch (err) {
        console.error(err);
        notify("Falha ao adicionar à fila.", "error");
        setBusy(false);
      }
    } else {
      if (!url.trim()) { setBusy(false); return notify("Cole um link válido!", "error"); }
      setStatus("Preparando...");
      try {
        const queryParams = new URLSearchParams({ url: url.trim(), target_dir: targetDir, ...options });
        if (customName) queryParams.set("filename", customName);
        const res = await fetch(`${API_URL}/download?${queryParams.toString()}`, { method: "POST" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        notify("Download iniciado!", "success");
        setStatus("Baixando...");
        setUrl("");
      } catch (err) {
        console.error(err);
        notify("Falha ao iniciar o download.", "error");
        setBusy(false);
      }
    }
  }, [isDownloading, getOptions, isBatchMode, batchUrls, notify, url, chooseSaveDir]);

  // Drag & Drop .txt
  const handleDragOver = (e) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = (e) => { e.preventDefault(); setIsDragging(false); };
  const handleDrop = (e) => {
    e.preventDefault(); setIsDragging(false);
    const files = e.dataTransfer.files;
    if (!files || files.length !== 1) return notify("Arraste somente um arquivo .txt.", "error");
    const f = files[0];
    const looksTxt = f.type === "text/plain" || /\.txt$/i.test(f.name || "");
    if (!looksTxt) return notify("Apenas arquivo .txt é aceito.", "error");
    const reader = new FileReader();
    reader.onload = (ev) => { setBatchUrls(String(ev.target.result || "")); notify("Links carregados do arquivo!", "success"); };
    reader.onerror = () => notify("Falha ao ler o arquivo.", "error");
    reader.readAsText(f);
  };

  const LeftColumn = (
    <Section key="left" variants={simpleFade} initial="initial" animate="animate" exit="exit">
      <Muted>Cole um link único ou alterne para baixar em lote.</Muted>
      <Divider />
      <PillGroup style={{ marginBottom: 14 }}>
        <PillThumb
          initial={false}
          layout={false}
          animate={{ left: calcThumbLeft(isBatchMode ? 1 : 0, 2) }}
          transition={prefersReduced ? { duration: 0 } : transitions.spring}
        />
        <Pill onClick={() => setIsBatchMode(false)} $active={!isBatchMode}><LinkIcon size={16} /> Link Único</Pill>
        <Pill onClick={() => setIsBatchMode(true)} $active={isBatchMode}><List size={16} /> Em Lote</Pill>
      </PillGroup>

      <AnimatePresence mode="wait">
        {isBatchMode ? (
          <motion.div key="batch-input" variants={subtleIn} initial="initial" animate="animate" exit="exit">
            <TextArea
              value={batchUrls}
              onChange={(e) => setBatchUrls(e.target.value)}
              placeholder="Cole um link por linha..."
              onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
              disabled={isDownloading}
              style={isDragging ? { borderColor: lightTheme.colors.primary, boxShadow: lightTheme.colors.ring } : undefined}
            />
            <AnimatePresence>
              {isDragging && (
                <InfoBanner variants={subtleIn} initial="initial" animate="animate" exit="exit" style={{ marginTop: 10 }}>
                  <UploadCloud size={18} style={{ color: lightTheme.colors.primary }} />
                  <Muted>Solte seu arquivo .txt para importar links.</Muted>
                  <Badge>Arraste & Solte</Badge>
                </InfoBanner>
              )}
            </AnimatePresence>
          </motion.div>
        ) : (
          <motion.div key="single-input" variants={subtleIn} initial="initial" animate="animate" exit="exit">
            <Input
              ref={inputRef}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="Cole o link do conteúdo..."
              disabled={isDownloading}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {!isBatchMode && providerDetails && (
        <motion.div
          key={`provider-${linkProvider || "default"}`}
          variants={subtleIn}
          initial="initial"
          animate="animate"
          exit="exit"
          style={{ marginTop: 12, display: "grid", gap: 10 }}
        >
          <FieldLabel><FileVideo size={14} /> {linkProvider === "instagram" ? "Instagram" : linkProvider === "facebook" ? "Facebook" : linkProvider === "twitter" ? "X (Twitter)" : "Conteúdo"}</FieldLabel>
          <InfoBanner initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={transitions.layout}>
            {providerDetails.icon}
            <div style={{ display: "grid", gap: 4 }}>
              <span style={{ fontWeight: 700, fontSize: 13 }}>{providerDetails.title}</span>
              <Muted style={{ fontSize: 12 }}>{providerDetails.subtitle}</Muted>
              {instagramError && linkProvider === "instagram" && (
                <Muted style={{ fontSize: 12, color: lightTheme.colors.danger }}>{instagramError}</Muted>
              )}
            </div>
            <Badge>{linkProvider === "twitter" ? "X" : (linkProvider ? linkProvider.charAt(0).toUpperCase() + linkProvider.slice(1) : "")}</Badge>
          </InfoBanner>
        </motion.div>
      )}

      <div style={{ display: "flex", gap: 12, marginTop: 14, flexWrap: "wrap" }}>
        <PrimaryButton
          whileHover={prefersReduced ? undefined : { scale: 1.03 }}
          whileTap={prefersReduced ? undefined : { scale: 0.98 }}
          transition={transitions.hover}
          onClick={startDownload}
          disabled={isDownloading}
        >
          <Send size={18} /> Baixar
        </PrimaryButton>

        <GhostButton
          onClick={() => setOptionsOpen((v) => !v)}
          disabled={isRestrictedProvider}
          title={isRestrictedProvider ? "Opções avançadas indisponíveis para este provedor." : undefined}
        >
          <SlidersHorizontal size={16} /> Opções
        </GhostButton>

        {isDownloading && (
          <GhostButton
            onClick={cancelDownload}
            title="Cancelar download atual"
            style={{ borderColor: lightTheme.colors.danger, color: lightTheme.colors.danger }}
          >
            <X size={16} /> Cancelar
          </GhostButton>
        )}
        <GhostButton onClick={() => {
          setUrl(""); setBatchUrls(""); setProgress(0); setStatus("Aguardando link...");
          setSavedPath(null); setSavedDir(null); setBusy(false);
        }}>
          <X size={16} /> Limpar
        </GhostButton>
      </div>

      <motion.div style={{ marginTop: 6 }}>
        <AnimatePresence initial={false}>
          {optionsOpen && !isRestrictedProvider && (
            <motion.div key="accordion" variants={accordionVariants} initial="closed" animate="open" exit="closed">
              <Divider />
              <OptionsContext.Provider value={{ isDownloading, isAudioOnly }}>
                <OptionsPanel
                  format={format} setFormat={setFormat}
                  resolution={resolution} setResolution={setResolution}
                  quality={quality} setQuality={setQuality}
                />
              </OptionsContext.Provider>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      <motion.div style={{ marginTop: 12 }}>
        <StatusDisplay
          status={status}
          progress={progress}
          isDownloading={isDownloading}
          savedPath={savedPath}
          onReveal={() => revealInFolder(savedPath)}
        />
      </motion.div>
    </Section>
  );

  const RightColumn = (
    <Section key="right" variants={simpleFade} initial="initial" animate="animate" exit="exit">
      <SectionTitle>Qualidade & Segurança</SectionTitle>
      <Muted>Download confiável com otimizações de rede, fila e reconexão via WebSocket.</Muted>
      <Divider />
      <InfoBanner initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={transitions.layout}>
        <ShieldCheck size={18} style={{ color: lightTheme.colors.success }} />
        <Muted>Seus downloads usam fila dedicada e feedback em tempo real. Modo em lote aceita .txt.</Muted>
        <Badge>Automação</Badge>
      </InfoBanner>
      <div style={{ height: 10 }} />
      <InfoBanner initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={transitions.layout}>
        <Sparkles size={18} style={{ color: lightTheme.colors.primary }} />
        <Muted>Estética minimalista com microinterações. Respeita prefers-reduced-motion.</Muted>
        <Badge>Intuitivo</Badge>
      </InfoBanner>
    </Section>
  );

  const CompressorLeft = (
    <Section key="compress-left" variants={simpleFade} initial="initial" animate="animate" exit="exit">
      <SectionTitle>Compressor de Vídeo MP4</SectionTitle>
      <Muted>Reduza o tamanho dos seus vídeos seguindo a mesma experiência do downloader.</Muted>
      <Divider />
      <HiddenFileInput
        id="compress-file-input"
        type="file"
        accept="video/mp4"
        onChange={handleFileInputChange}
        ref={fileInputRef}
      />
      <DropZone
        htmlFor="compress-file-input"
        onDragOver={handleCompressorDragOver}
        onDragLeave={handleCompressorDragLeave}
        onDrop={handleCompressorDrop}
        style={{
          ...(compressDragging ? { borderColor: lightTheme.colors.primary, background: "rgba(10,132,255,0.12)" } : {}),
          opacity: compressBusy ? 0.55 : 1,
          pointerEvents: compressBusy ? "none" : undefined,
        }}
      >
        <UploadCloud size={26} style={{ color: lightTheme.colors.primary }} />
        <div style={{ fontWeight: 700, fontSize: 14 }}>Arraste um vídeo MP4 ou clique para selecionar.</div>
        <Muted style={{ fontSize: 12 }}>
          {compressBusy ? "Processando compressão..." : "Integração completa com o backend de compressão."}
        </Muted>
        {compressSource ? <Badge>{compressBusy ? "Processando" : "Pronto"}</Badge> : <Badge>MP4</Badge>}
      </DropZone>

      <AnimatePresence>
        {compressSource && (
          <motion.div key="compress-file" variants={subtleIn} initial="initial" animate="animate" exit="exit" style={{ marginTop: 16 }}>
            <FieldLabel><FileVideo size={14} /> Arquivo selecionado</FieldLabel>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 8 }}>
              <FileBadge><FileVideo size={14} /> {compressSource.name}</FileBadge>
              <FileBadge><Download size={14} /> {formatBytes(compressSource.size)}</FileBadge>
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <GhostButton onClick={() => fileInputRef.current?.click()} disabled={compressBusy}><UploadCloud size={16} /> Trocar vídeo</GhostButton>
              <GhostButton onClick={clearCompressor} disabled={compressBusy}><X size={16} /> Remover</GhostButton>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <Divider />
      <FieldLabel>Controle de compressão</FieldLabel>
      <Muted style={{ marginBottom: 6 }}>Defina o quanto o arquivo será reduzido.</Muted>
      <SliderInput
        min={0}
        max={99}
        step={1}
        value={compressionPercent}
        onChange={(e) => handleCompressionChange(Number(e.target.value))}
        disabled={!compressSource || compressBusy}
      />
      <SliderLabels>
        <span>0%</span>
        <strong style={{ fontSize: 14 }}>{compressionPercent}%</strong>
        <span>99%</span>
      </SliderLabels>

      <div style={{ marginTop: 18 }}>
        <CustomSelect
          label="Resolução alvo"
          options={compressorResolutionOptions}
          value={compressResolution}
          onChange={handleResolutionChange}
          disabled={!compressSource || compressBusy}
          leftIcon={<Film size={14} />}
        />
      </div>

      <div style={{ marginTop: 12 }}>
        <CustomSelect
          label="Processamento"
          options={compressorEngineOptions}
          value={compressionEngine}
          onChange={setCompressionEngine}
          disabled={!compressSource || compressBusy}
          leftIcon={<Cpu size={14} />}
        />
        <Muted style={{ fontSize: 11, marginTop: 4 }}>
          GPU tenta NVENC/AMF/QSV automaticamente quando disponível.
        </Muted>
      </div>

      <ToggleRow>
        <div style={{ display: "grid", gap: 4 }}>
          <FieldLabel style={{ marginBottom: 0 }}>
            <Sparkles size={14} /> Modo Discord
          </FieldLabel>
          <Muted style={{ fontSize: 12 }}>
            Ajusta automaticamente para ~{formatBytes(DISCORD_TARGET_BYTES)}.
          </Muted>
        </div>
        <GhostButton
          onClick={handleDiscordToggle}
          disabled={!compressSource || compressBusy}
          style={discordMode ? { background: lightTheme.colors.primary, color: "#fff", borderColor: lightTheme.colors.primary } : undefined}
        >
          {discordMode ? "Ativado" : "Ativar"}
        </GhostButton>
      </ToggleRow>

      <div style={{ display: "flex", gap: 12, marginTop: 18, flexWrap: "wrap" }}>
        <PrimaryButton
          whileHover={prefersReduced ? undefined : { scale: 1.03 }}
          whileTap={prefersReduced ? undefined : { scale: 0.98 }}
          transition={transitions.hover}
          onClick={handleStartCompression}
          disabled={!compressSource || compressBusy}
        >
          <Send size={18} /> Comprimir vídeo
        </PrimaryButton>
        {compressBusy && (
          <GhostButton onClick={cancelCompression} disabled={!compressBusy}>
            <Square size={16} /> Cancelar compressão
          </GhostButton>
        )}
        <GhostButton onClick={clearCompressor} disabled={!compressSource || compressBusy}>
          <X size={16} /> Limpar
        </GhostButton>
      </div>
    </Section>
  );

  const CompressorRight = (
    <Section key="compress-right" variants={simpleFade} initial="initial" animate="animate" exit="exit">
      <SectionTitle>Estimativas inteligentes</SectionTitle>
      <Muted>Visualize o tamanho final aproximado antes de iniciar a compressão.</Muted>
      <Divider />

      <InfoBanner initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={transitions.layout}>
        <FileVideo size={18} style={{ color: lightTheme.colors.primary }} />
        <div style={{ display: "grid", gap: 6 }}>
          <span style={{ fontWeight: 700, fontSize: 13 }}>Status da compressão</span>
          <Muted style={{ fontSize: 12 }}>{compressStatus}</Muted>
          {showCompressProgress && (
            <ProgressWrap style={{ margin: "6px 0 0 0", maxWidth: "100%" }}>
              <ProgressTrack>
                <ProgressBar
                  initial={false}
                  animate={{ width: `${Math.max(2, compressProgressDisplay)}%` }}
                  style={{ width: `${Math.max(2, compressProgressDisplay)}%` }}
                />
              </ProgressTrack>
            </ProgressWrap>
          )}
        </div>
        <Badge>
          {compressBusy
            ? `${compressProgressDisplay}%`
            : compressionPercentLabel}
        </Badge>
      </InfoBanner>

      <div style={{ height: 12 }} />

      <InfoBanner initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={transitions.layout}>
        <Sparkles size={18} style={{ color: lightTheme.colors.success }} />
        <div style={{ display: "grid", gap: 4 }}>
          <span style={{ fontWeight: 700, fontSize: 13 }}>Resumo rápido</span>
          <Muted style={{ fontSize: 12 }}>
            Original: {compressSource ? formatBytes(compressSource.size) : "--"} · Estimado: {compressSource ? formatBytes(estimatedFinalSize) : "--"}.
          </Muted>
          <Muted style={{ fontSize: 12 }}>
            Redução prevista: {compressSource ? `${reductionPercent}%` : "--"}.
          </Muted>
          {compressResult && (
            <>
              <Muted style={{ fontSize: 12 }}>
                Final real: {compressResult.final_size_human ?? (compressResult.final_size ? formatBytes(compressResult.final_size) : "--")} · Arquivo: {compressResult.filename || "--"}.
              </Muted>
              <Muted style={{ fontSize: 12 }}>
                Alvo calculado: {compressResult.target_size_human ?? (compressResult.target_size_bytes ? formatBytes(compressResult.target_size_bytes) : "--")}.
              </Muted>
              <Muted style={{ fontSize: 12 }}>
                Destino: {finalOutputDir || "--"}
              </Muted>
              {compressResult.encoder_used && (
                <Muted style={{ fontSize: 12 }}>
                  Encoder: {compressResult.encoder_used} {compressResult.hardware_mode_used === "gpu" ? "(GPU)" : "(CPU)"}.
                </Muted>
              )}
            </>
          )}
          {discordMode && compressSource && (
            <Muted style={{ fontSize: 12, color: withinDiscordTarget ? lightTheme.colors.success : lightTheme.colors.danger }}>
              {withinDiscordTarget ? "Dentro do limite do Discord (~9 MB)." : "Ajuste compressão ou resolução para atingir ~9 MB."}
            </Muted>
          )}
        </div>
        {discordMode && <Badge>Modo Discord</Badge>}
      </InfoBanner>

      <div style={{ marginTop: 18, display: "grid", gap: 10 }}>
        <FieldLabel>Próximos passos</FieldLabel>
        <Muted style={{ fontSize: 12 }}>
          Acompanhe o progresso em tempo real acima. Após finalizar, utilize as ações rápidas para acessar o arquivo comprimido.
        </Muted>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <GhostButton
            onClick={() => compressResult?.output_path && revealInFolder(compressResult.output_path)}
            disabled={!compressResult?.output_path}
          >
            <FolderOpen size={16} /> Abrir local
          </GhostButton>
          <GhostButton
            onClick={() => handleCopyPath(compressResult?.output_path ?? "")}
            disabled={!compressResult?.output_path}
          >
            <Copy size={16} /> Copiar caminho
          </GhostButton>
        </div>
      </div>
    </Section>
  );

  // 4. Global Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = async (e) => {
      // Ignore if user is typing in an input (except for specific control combos)
      const isInput = ["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName);

      // Ctrl+V: Paste anywhere (intelligent)
      if (e.ctrlKey && e.key.toLowerCase() === "v") {
        if (isInput && document.activeElement !== inputRef.current && document.activeElement?.type === "text") {
          // Let default paste happen for other inputs
          return;
        }
        // If not focusing another text input, or explicitly focusing main input
        if (!isInput || document.activeElement === inputRef.current || document.activeElement === document.body) {
          // We might want to let default paste happen if focused on main input, 
          // BUT user asked for "Paste URL directly". 
          // If we prevent default, we must handle reading clipboard manually. 
          // If we don't prevent default, the browser pastes.
          // Requirement: "Automatically paste the last clipboard URL... Ctrl+V → Paste URL directly"
          // Let's rely on default behavior IF focused on input, otherwise focus and paste?
          // Actually simplest: If not in input, focus input and let browser paste? 
          // Or read clipboard manually. Browser blocks readText without user interaction usually, 
          // but Ctrl+V IS user interaction.

          if (!isInput) {
            e.preventDefault();
            try {
              const text = await navigator.clipboard.readText();
              if (text) {
                setUrl(text);
                inputRef.current?.focus();
                notify("Link colado!", "success");
              }
            } catch (err) {
              inputRef.current?.focus();
              // Fallback: focus and user presses V again or legacy execCommand? 
              // We'll rely on simply focusing if read fails, enabling native paste.
            }
          }
          // If already in input, let default paste work.
        }
        return;
      }

      // Ctrl+K: Focus Input
      if (e.ctrlKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        return;
      }

      // Ctrl+D: Trigger Download (Download mode only)
      if (e.ctrlKey && e.key.toLowerCase() === "d") {
        e.preventDefault();
        if (activeViewRef.current === "downloader" && !busy) {
          startDownload();
        }
        return;
      }

      // Ctrl+L: Clear URL
      if (e.ctrlKey && e.key.toLowerCase() === "l") {
        e.preventDefault();
        setUrl("");
        setBatchUrls("");
        inputRef.current?.focus();
        return;
      }

      // Ctrl+1: Downloader Mode
      if (e.ctrlKey && e.key === "1") {
        e.preventDefault();
        setActiveView("downloader");
        return;
      }

      // Ctrl+2: Compressor Mode
      if (e.ctrlKey && e.key === "2") {
        e.preventDefault();
        setActiveView("compressor");
        return;
      }

      // Ctrl+Tab: Toggle Mode
      if (e.ctrlKey && e.key === "Tab") {
        e.preventDefault();
        setActiveView((prev) => (prev === "downloader" ? "compressor" : "downloader"));
        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [busy, startDownload, notify]);

  return (
    <ThemeProvider theme={lightTheme}>
      <GlobalStyle />
      <AppRoot>
        <ToastDock toasts={notifier.toasts} onClose={notifier.remove} />





        <Shell variants={simpleFade} initial="initial" animate="animate">
          <AmbientSpark initial={{ opacity: 0 }} animate={{ opacity: 0.7 }} transition={{ duration: 0.8 }} />
          <GlassHeader>
            <HeaderRow>
              <Brand>
                <BrandIconWrap initial={{ rotate: -8, scale: 0.9, opacity: 0 }} animate={{ rotate: 0, scale: 1, opacity: 1 }} transition={transitions.spring}>
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 3L2 8.5V15.5L12 21L22 15.5V8.5L12 3Z" fill="currentColor" fillOpacity="0.18" />
                    <path d="M12 3L2 8.5V15.5L12 21L22 15.5V8.5L12 3Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M12 14.5L7 11.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M12 21V14.5L17 11.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M22 8.5L12 14.5L2 8.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </BrandIconWrap>
                <BrandTitle>
                  <BrandName>Ultra Downloader</BrandName>
                  <BrandTag>Download Rápido • Sem Limites</BrandTag>
                </BrandTitle>
              </Brand>
              <PillGroup style={{ width: "clamp(280px, 45vw, 340px)", gridTemplateColumns: "repeat(2, 1fr)" }}>
                <PillThumb
                  initial={false}
                  layout={false}
                  animate={{ left: calcThumbLeft(activeView === "compressor" ? 1 : 0, 2) }}
                  transition={prefersReduced ? { duration: 0 } : transitions.spring}
                />
                <Pill onClick={() => setActiveView("downloader")} $active={activeView === "downloader"}>
                  <Download size={16} /> Downloader
                </Pill>
                <Pill onClick={() => setActiveView("compressor")} $active={activeView === "compressor"}>
                  <FileVideo size={16} /> Compressor
                </Pill>
              </PillGroup>
            </HeaderRow>
          </GlassHeader>
          <Content>
            {activeView === "downloader" ? (
              <>
                {LeftColumn}
                {RightColumn}
              </>
            ) : (
              <>
                {CompressorLeft}
                {CompressorRight}
              </>
            )}
          </Content>
        </Shell>
      </AppRoot>
    </ThemeProvider>
  );
}

/* ================================================================================================
 * Painel de Opções / Select / Status
 * ==============================================================================================*/
function OptionsPanel({ format, setFormat, resolution, setResolution, quality, setQuality }) {
  const { isDownloading, isAudioOnly } = useContext(OptionsContext);

  const formatOptions = useMemo(() => ([
    { value: "mp4", label: "MP4 (Vídeo)", icon: <Film size={16} /> },
    { value: "mp3", label: "MP3 (Áudio)", icon: <FileMusic size={16} /> },
    { value: "m4a", label: "M4A (Áudio)", icon: <FileMusic size={16} /> },
    { value: "wav", label: "WAV (Áudio)", icon: <FileMusic size={16} /> },
    { value: "flac", label: "FLAC (Áudio)", icon: <FileMusic size={16} /> },
  ]), []);

  const resolutionOptions = useMemo(() => ([
    { value: "best", label: "Melhor" },
    { value: "2160p", label: "4K (2160p)" },
    { value: "1440p", label: "2K (1440p)" },
    { value: "1080p", label: "1080p" },
    { value: "720p", label: "720p" },
    { value: "480p", label: "480p" },
  ]), []);

  const qualityOptions = useMemo(() => ([
    { value: 320, label: "320 kbps (Alta)" },
    { value: 192, label: "192 kbps (Padrão)" },
    { value: 128, label: "128 kbps (Baixa)" },
  ]), []);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
      <CustomSelect
        label="Formato"
        options={formatOptions}
        value={format}
        onChange={setFormat}
        disabled={isDownloading}
      />

      <CustomSelect
        label="Resolução"
        options={resolutionOptions}
        value={isAudioOnly ? "best" : resolution}
        onChange={setResolution}
        disabled={isAudioOnly || isDownloading}
        leftIcon={<Film size={14} />}
      />

      <CustomSelect
        label="Qualidade"
        options={qualityOptions}
        value={quality}
        onChange={setQuality}
        disabled={!["mp3", "m4a"].includes(format) || isDownloading}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------------------------------
 *  Custom Select (A11y + Motion)
 * ------------------------------------------------------------------------------------------------- */
function CustomSelect({ label, options, value, onChange, leftIcon, disabled }) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value) || options[0];
  const wrapRef = React.useRef(null);

  useEffect(() => { if (disabled && open) setOpen(false); }, [disabled, open]);

  // Fecha ao clicar fora
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e) => {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  // Fecha com ESC
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <SelectWrap ref={wrapRef}>
      <SelectLabel>{leftIcon} {label}</SelectLabel>
      <SelectButton
        type="button"
        onClick={() => !disabled && setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
        disabled={disabled}
      >
        <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
          {selected.icon} {selected.label}
        </span>
        <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ type: "spring", stiffness: 300, damping: 20 }}>
          <ChevronDown size={16} />
        </motion.span>
      </SelectButton>

      <AnimatePresence>
        {open && (
          <SelectList
            role="listbox"
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.18, ease: [0.25, 0.1, 0.25, 1] }}
          >
            {options.map((opt) => (
              <SelectItem
                key={opt.value}
                role="option"
                aria-selected={opt.value === value}
                $active={opt.value === value}
                onClick={() => { onChange(opt.value); setOpen(false); }}
              >
                <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
                  {opt.icon} {opt.label}
                </span>
                {opt.value === value && <Check size={16} />}
              </SelectItem>
            ))}
          </SelectList>
        )}
      </AnimatePresence>
    </SelectWrap>
  );
}

/* -------------------------------------------------------------------------------------------------
 *  Status Display (inclui "Mostrar na pasta")
 * ------------------------------------------------------------------------------------------------- */
function StatusDisplay({ status, progress, isDownloading, savedPath, onReveal }) {
  const prefersReduced = usePrefersReducedMotion();
  const [showButton, setShowButton] = useState(false);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    let timer;
    if (savedPath && !isDownloading) {
      setShowButton(false);
      timer = setTimeout(() => setShowButton(true), 3000);
      setHidden(false);
    } else {
      setShowButton(false);
      setHidden(false);
    }
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [savedPath, isDownloading]);

  const handleReveal = useCallback(async () => {
    try {
      await onReveal();
    } finally {
      setHidden(true);
    }
  }, [onReveal]);

  // Após abrir a pasta, oculta completamente o bloco
  if (hidden) {
    return null;
  }

  // Só mostra o botão quando NÃO está baixando/processando
  if (savedPath && !isDownloading && !hidden) {
    return (
      <div style={{ width: "100%", display: "grid", placeItems: "center", minHeight: 110 }}>
        {showButton ? (
          <AccentButton
            whileHover={prefersReduced ? undefined : { scale: 1.02 }}
            whileTap={prefersReduced ? undefined : { scale: 0.99 }}
            onClick={handleReveal}
            title={String(savedPath)}
          >
            {/* Ícone de pasta */}
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M3 7h5l2 2h9v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Mostrar na pasta
          </AccentButton>
        ) : (
          <AnimatePresence mode="wait">
            <motion.div key="delay-wait" variants={subtleIn} initial="initial" animate="animate" exit="exit">
              <Muted style={{ fontWeight: 700 }}>{status}</Muted>
            </motion.div>
          </AnimatePresence>
        )}
      </div>
    );
  }

  if (isDownloading) {
    return (
      <div style={{ width: "100%", display: "grid", placeItems: "center", minHeight: 110 }}>
        <motion.div
          key="progress"
          variants={subtleIn}
          initial="initial"
          animate="animate"
          exit="exit"
          style={{ width: "100%" }}
        >
          <ProgressWrap>
            <ProgressTrack>
              <ProgressBar
                initial={false}
                animate={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
                transition={{ ease: "easeInOut", duration: 0.35 }}
              />
            </ProgressTrack>
            <StatusRow>
              <motion.span
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                style={{ display: "inline-flex" }}
              >
                <Loader2 size={14} />
              </motion.span>
              <span>{status}</span>
            </StatusRow>
          </ProgressWrap>
        </motion.div>
      </div>
    );
  }

  return (
    <div style={{ width: "100%", display: "grid", placeItems: "center", minHeight: 110 }}>
      <AnimatePresence mode="wait">
        <motion.div key="idle" variants={subtleIn} initial="initial" animate="animate" exit="exit">
          <Muted style={{ fontWeight: 700 }}>{status}</Muted>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
