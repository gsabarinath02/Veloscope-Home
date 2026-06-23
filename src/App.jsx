import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ExternalLink,
  FileText,
  FileSearch,
  Globe2,
  HeartPulse,
  Loader2,
  Mail,
  Mic,
  MicOff,
  Menu,
  Paperclip,
  Phone,
  QrCode,
  Search,
  Send,
  Sparkles,
  Ticket,
  UserRound,
  Volume2,
  X
} from "lucide-react";

const promptGroups = [
  {
    label: "Document Q&A",
    prompts: [
      "What is the bib collection date?",
      "What is the refund policy?",
      "What are the race categories?",
      "What documents are needed for bib collection?"
    ]
  },
  {
    label: "Web search",
    prompts: [
      "Search upcoming marathons in India.",
      "Find weather for Kochi this weekend.",
      "What are the best hydration tips for a half marathon?"
    ]
  },
  {
    label: "Voice",
    prompts: [
      "Velo, what events are open for registration?",
      "Velo, register me for the 10K run.",
      "Velo, where do I collect my bib?"
    ]
  },
  {
    label: "Registration",
    prompts: [
      "I want to register for the Kochi Half Marathon.",
      "Register me for the 10K category.",
      "Can you help me complete registration?"
    ]
  }
];

const starters = promptGroups.flatMap((group) => group.prompts);

const seedMessages = [
  {
    id: "m1",
    role: "assistant",
    mode: "rag",
    content: "Welcome to Velo, the Eventforce voice assistant. ask me anything you want",
    sources: [{ title: "Kochi Half Marathon 2026 Event Brochure", type: "document" }]
  }
];

const registrationFields = [
  { key: "fullName", label: "Full name", question: "What is your full name?" },
  { key: "phone", label: "Phone number", question: "What phone number should I use?" },
  { key: "email", label: "Email address", question: "What is your email address?" },
  { key: "age", label: "Age", question: "What is your age?" },
  { key: "gender", label: "Gender", question: "What is your gender?" },
  { key: "raceCategory", label: "Race category", question: "Which race category do you want: Half Marathon 21.1K, Open 10K, Fun Run 5K, or Family Run 3K?" },
  { key: "tshirtSize", label: "T-shirt size", question: "What T-shirt size do you prefer?" },
  { key: "emergencyName", label: "Emergency contact name", question: "Who is your emergency contact?" },
  { key: "emergencyPhone", label: "Emergency contact number", question: "What is their phone number?" }
];

const emptyRegistration = {
  eventName: "Kochi Half Marathon 2026",
  fullName: "",
  phone: "",
  email: "",
  age: "",
  gender: "",
  raceCategory: "",
  tshirtSize: "",
  emergencyName: "",
  emergencyPhone: ""
};

const serviceCards = [
  {
    title: "End-to-End & Platform as a Service",
    text: "A comprehensive model that supports every stage of event management, from planning to execution.",
    image: "/service-action.gif"
  },
  {
    title: "Registration",
    text: "A seamless, secure, and efficient system for attendee registration and management.",
    image: "/registration.gif"
  },
  {
    title: "Velotales",
    text: "Unique storytelling and content creation services that highlight events and participants with depth and emotion.",
    image: "/service-velotales.gif"
  },
  {
    title: "WhatsApp Messaging",
    text: "Personalized campaigns to engage attendees and drive better communication.",
    image: "/service-whatsapp.gif"
  },
  {
    title: "Feedback Management",
    text: "Collect, analyze, and act on participant feedback to improve future events.",
    image: "/eventforce-icon.png"
  },
  {
    title: "CRM & ROI",
    text: "Track attendee data, understand behaviors, and measure ROI effectively.",
    image: "/eventforce-icon.png"
  }
];

const statItems = [
  { label: "Images captured and shared", value: 66, suffix: "M+", decimals: 0 },
  { label: "Events successfully executed", value: 0.6, suffix: "K+", decimals: 1 },
  { label: "Crew members in our network", value: 0.9, suffix: "K+", decimals: 1 }
];

const navItems = ["Home", "About Us", "Events", "Blogs", "Contact Us"];

function cls(...items) {
  return items.filter(Boolean).join(" ");
}

function normalizeSpeech(text) {
  return text.replace(/^velo[:,\s-]*/i, "").trim();
}

function isRegistrationIntent(text) {
  const lower = text.toLowerCase();
  return lower.includes("register") || lower.includes("registration") || lower.includes("sign me up");
}

function inferRaceCategory(text) {
  const lower = text.toLowerCase();
  const explicitlyHalfCategory =
    /21(\.1)?\s?k/.test(lower) ||
    lower.includes("half marathon category") ||
    lower.includes("half marathon race") ||
    lower.includes("half marathon run") ||
    (lower.includes("half marathon") && !lower.includes("kochi half marathon"));
  if (explicitlyHalfCategory) return "Half Marathon 21.1K";
  if (lower.includes("10k") || lower.includes("10 k")) return "Open 10K";
  if (lower.includes("5k") || lower.includes("5 k")) return "Fun Run 5K";
  if (lower.includes("3k") || lower.includes("3 k") || lower.includes("family")) return "Family Run 3K";
  return "";
}

let activeVoiceAudio = null;
let activeVoiceAudioUrl = "";

function fallbackSpeakText(text) {
  return new Promise((resolve) => {
    if (!("speechSynthesis" in window)) {
      resolve();
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text.replace(/\s+/g, " ").slice(0, 260));
    utterance.rate = 0.96;
    utterance.pitch = 1;
    utterance.onend = resolve;
    utterance.onerror = resolve;
    window.speechSynthesis.speak(utterance);
  });
}

async function speakText(text, { useDeepgram = true } = {}) {
  const cleanText = String(text || "").replace(/\s+/g, " ").trim().slice(0, 900);
  if (!cleanText) return;

  if (activeVoiceAudio) {
    activeVoiceAudio.pause();
    activeVoiceAudio = null;
  }
  if (activeVoiceAudioUrl) {
    URL.revokeObjectURL(activeVoiceAudioUrl);
    activeVoiceAudioUrl = "";
  }
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();

  if (!useDeepgram) {
    await fallbackSpeakText(cleanText);
    return;
  }

  try {
    const response = await fetch("/api/speak", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: cleanText })
    });

    if (!response.ok) throw new Error("TTS request failed");

    const audioBlob = await response.blob();
    const audioUrl = URL.createObjectURL(audioBlob);
    const audio = new Audio(audioUrl);
    activeVoiceAudio = audio;
    activeVoiceAudioUrl = audioUrl;

    await new Promise((resolve, reject) => {
      const cleanup = () => {
        if (activeVoiceAudio === audio) activeVoiceAudio = null;
        if (activeVoiceAudioUrl === audioUrl) {
          URL.revokeObjectURL(audioUrl);
          activeVoiceAudioUrl = "";
        }
      };

      audio.onended = () => {
        cleanup();
        resolve();
      };
      audio.onerror = () => {
        cleanup();
        reject(new Error("Audio playback failed"));
      };
      audio.play().catch((error) => {
        cleanup();
        reject(error);
      });
    });
  } catch {
    await fallbackSpeakText(cleanText);
  }
}

function getPreferredAudioMimeType() {
  if (!window.MediaRecorder) return "";
  return ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((type) => MediaRecorder.isTypeSupported(type)) || "";
}

function nextMissingField(details) {
  return registrationFields.find((field) => !String(details[field.key] || "").trim());
}

function Header() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="site-header">
      <div className="header-inner">
        <a className="brand" href="#home" aria-label="Eventforce home">
          <img src="/eventforce-logo.png" alt="Eventforce" />
        </a>
        <nav className={cls(menuOpen && "open")} aria-label="Primary navigation">
          {navItems.map((item) => (
            <a className={item === "Home" ? "active" : ""} href={`#${item.toLowerCase().replaceAll(" ", "-")}`} key={item}>
              {item}
            </a>
          ))}
        </nav>
        <button
          className="menu-button"
          type="button"
          aria-label="Toggle menu"
          onClick={() => setMenuOpen((value) => !value)}
        >
          {menuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>
    </header>
  );
}

function SourceChip({ source }) {
  if (!source) return null;
  const Icon = source.type === "web" ? ExternalLink : FileText;
  const label = source.title || source.url || "Source";

  if (source.url) {
    return (
      <a className="source-chip" href={source.url} target="_blank" rel="noreferrer">
        <Icon size={14} />
        <span>{label}</span>
      </a>
    );
  }

  return (
    <span className="source-chip">
      <Icon size={14} />
      <span>{label}</span>
    </span>
  );
}

function VeloAssistantMark({ compact = false }) {
  return (
    <span className={cls("velo-mark", compact && "compact")} aria-hidden="true">
      <img src="/eventforce-icon.png" alt="" />
      <span className="velo-bars">
        <i />
        <i />
        <i />
      </span>
    </span>
  );
}

function MessageBubble({ message }) {
  const isUser = message.role === "user";
  const isTicket = message.mode === "ticket";
  const isWeb = message.mode === "web";
  const isRegistration = message.mode === "registration";

  return (
    <article className={cls("message-row", isUser && "from-user")}>
      {!isUser && (
        <span className={cls("assistant-avatar", isTicket && "ticket-avatar")}>
          {isTicket ? <Ticket size={17} /> : <VeloAssistantMark compact />}
        </span>
      )}
      <div className={cls("bubble", isUser && "user-bubble", isTicket && "ticket-bubble")}>
        {!isUser && (
          <div className={cls("answer-kind", isWeb && "web", isRegistration && "registration")}>
            {isWeb ? <Globe2 size={14} /> : isRegistration ? <QrCode size={14} /> : <FileSearch size={14} />}
            {isWeb ? "Searched the web" : isRegistration ? "Registration assistant" : isTicket ? "Support ticket" : "Searched event documents"}
          </div>
        )}
        <p>{message.content}</p>
        {message.ticketNumber && <strong className="ticket-number">Ticket #{message.ticketNumber}</strong>}
        {message.providerWarning && <div className="provider-warning">{message.providerWarning}</div>}
        {!isUser && message.sources?.length > 0 && (
          <div className="source-row">
            {message.sources.slice(0, 5).map((source, index) => (
              <SourceChip key={`${source.title || source.url}-${index}`} source={source} />
            ))}
          </div>
        )}
        {!isUser && message.webSearchAttempted && (
          <div className="search-note">
            <Search size={14} />
            {message.webSearchUsed
              ? "Web search used"
              : message.webSearchConfigured
                ? "Web search checked"
                : "Tavily key needed for live web search"}
          </div>
        )}
      </div>
    </article>
  );
}

function ChatWidget({
  open,
  setOpen,
  registration,
  onRegistrationDraft,
  onRegistrationComplete,
  config,
  promptToSend,
  onPromptConsumed
}) {
  const [messages, setMessages] = useState(seedMessages);
  const [input, setInput] = useState("");
  const [useWeb, setUseWeb] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [assistantState, setAssistantState] = useState("idle");
  const [voiceStatus, setVoiceStatus] = useState("idle");
  const [liveTranscript, setLiveTranscript] = useState("");
  const [voiceError, setVoiceError] = useState("");
  const [voiceReply, setVoiceReply] = useState(true);
  const [wakeEnabled, setWakeEnabled] = useState(false);
  const [autoVoiceEnabled, setAutoVoiceEnabled] = useState(false);
  const [registrationFlow, setRegistrationFlow] = useState({ active: false, confirming: false });
  const listRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const recognitionRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const vadFrameRef = useRef(0);
  const autoVoiceRef = useRef(false);
  const conversationBusyRef = useRef(false);
  const isCapturingRef = useRef(false);
  const lastVoiceAtRef = useRef(0);
  const segmentStartRef = useRef(0);
  const isSendingRef = useRef(false);
  const sendMessageRef = useRef(null);

  useEffect(() => {
    if (open) {
      listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
    }
  }, [messages, open]);

  useEffect(() => {
    isSendingRef.current = isSending;
  }, [isSending]);

  useEffect(() => {
    sendMessageRef.current = sendMessage;
  });

  useEffect(() => () => stopNaturalConversation({ silent: true }), []);

  useEffect(() => {
    if (promptToSend) {
      sendMessage(promptToSend);
      onPromptConsumed?.();
    }
  }, [promptToSend]);

  useEffect(() => {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      setVoiceStatus("idle");
      return;
    }

    const recognition = new Recognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-IN";
    recognition.onresult = (event) => {
      let finalText = "";
      let interimText = "";
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const transcript = event.results[index][0].transcript;
        if (event.results[index].isFinal) finalText += transcript;
        else interimText += transcript;
      }

      const heard = `${finalText || interimText}`.trim();
      if (heard) setLiveTranscript(heard);

      const lower = heard.toLowerCase();
      if (wakeEnabled && lower.includes("velo")) {
        const afterWake = normalizeSpeech(heard);
        setOpen(true);
        setAssistantState("awake");
        setVoiceStatus("awake");
        speakText("How can I help you today?", { useDeepgram: config?.deepgramConfigured });
        if (afterWake && afterWake.toLowerCase() !== "velo") {
          sendMessage(afterWake, { fromVoice: true });
        }
      }
    };
    recognition.onerror = () => {
      setVoiceStatus("idle");
    };
    recognition.onend = () => {
      if (wakeEnabled) {
        try {
          recognition.start();
        } catch {
          setVoiceStatus("idle");
        }
      }
    };
    recognitionRef.current = recognition;
    return () => recognition.stop();
  }, [wakeEnabled, config?.deepgramConfigured]);

  async function playVoiceReply(content) {
    if (!voiceReply) return;

    conversationBusyRef.current = true;
    setVoiceStatus("speaking");
    setAssistantState("answering");
    try {
      await speakText(content, { useDeepgram: config?.deepgramConfigured });
    } finally {
      conversationBusyRef.current = false;
      if (autoVoiceRef.current) {
        setVoiceStatus("listening");
        setAssistantState("listening");
        setLiveTranscript("Listening. Speak naturally, then pause.");
      } else {
        setVoiceStatus("idle");
        setAssistantState("idle");
      }
    }
  }

  function appendAssistant(content, options = {}) {
    setMessages((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        role: "assistant",
        content,
        mode: options.mode || "rag",
        sources: options.sources || [],
        ticketNumber: options.ticketNumber,
        webSearchAttempted: options.webSearchAttempted,
        webSearchUsed: options.webSearchUsed,
        webSearchConfigured: options.webSearchConfigured,
        providerWarning: options.providerWarning
      }
    ]);
    if (voiceReply) void playVoiceReply(content);
  }

  function updateRegistrationDetails(patch) {
    onRegistrationDraft((current) => ({ ...current, ...patch }));
  }

  function startRegistration(question) {
    document.getElementById("registration")?.scrollIntoView({ behavior: "smooth", block: "start" });
    const raceCategory = inferRaceCategory(question);
    const draft = {
      ...registration,
      raceCategory: raceCategory || registration.raceCategory
    };
    onRegistrationDraft(draft);
    setRegistrationFlow({ active: true, confirming: false });
    const nextField = nextMissingField(draft);
    const answer = `Registration is currently open for Kochi Half Marathon 2026. I can help you register. ${nextField?.question || "Please confirm the details."}`;
    appendAssistant(answer, { mode: "registration" });
    return true;
  }

  async function continueRegistration(answerText) {
    const cleanAnswer = answerText.trim();
    if (!registrationFlow.active) return false;

    if (registrationFlow.confirming) {
      if (!/^(yes|confirm|confirmed|ok|okay|submit|proceed)/i.test(cleanAnswer)) {
        appendAssistant("No problem. Tell me which detail you want to change, or say confirm when you are ready.", {
          mode: "registration"
        });
        return true;
      }

      setAssistantState("processing");
      const response = await fetch("/api/registrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ details: registration })
      });
      const payload = await response.json();
      onRegistrationComplete(payload);
      document.getElementById("registration")?.scrollIntoView({ behavior: "smooth", block: "start" });
      setRegistrationFlow({ active: false, confirming: false });
      setAssistantState("answering");
      appendAssistant(
        `Registration confirmed. Your mock registration ID is ${payload.id}. I generated a QR code for bib collection. In demo mode, payment is marked as pending so you can show the payment step separately.`,
        { mode: "registration" }
      );
      return true;
    }

    const field = nextMissingField(registration);
    if (!field) {
      setRegistrationFlow({ active: true, confirming: true });
      appendAssistant("I have all the details. Please review the registration panel and say confirm to generate your registration ID and QR code.", {
        mode: "registration"
      });
      return true;
    }

    updateRegistrationDetails({ [field.key]: cleanAnswer });
    const updated = { ...registration, [field.key]: cleanAnswer };
    const nextField = nextMissingField(updated);
    if (nextField) {
      appendAssistant(nextField.question, { mode: "registration" });
    } else {
      setRegistrationFlow({ active: true, confirming: true });
      appendAssistant("I have all the details. Please review the registration panel and say confirm to generate your registration ID and QR code.", {
        mode: "registration"
      });
    }
    return true;
  }

  function enableWakeWord() {
    const recognition = recognitionRef.current;
    if (!recognition) {
      setVoiceStatus("idle");
      setVoiceError("Wake word is not available in this browser. Start conversation mode instead.");
      return;
    }

    setWakeEnabled(true);
    setVoiceStatus("wake-listening");
    try {
      recognition.start();
    } catch {
      setVoiceStatus("wake-listening");
    }
  }

  function stopNaturalConversation({ silent = false } = {}) {
    autoVoiceRef.current = false;
    conversationBusyRef.current = false;
    isCapturingRef.current = false;
    setAutoVoiceEnabled(false);

    if (vadFrameRef.current) {
      cancelAnimationFrame(vadFrameRef.current);
      vadFrameRef.current = 0;
    }

    if (recorderRef.current?.state === "recording") {
      recorderRef.current.onstop = null;
      recorderRef.current.stop();
    }
    recorderRef.current = null;
    chunksRef.current = [];

    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;

    audioContextRef.current?.close().catch(() => {});
    audioContextRef.current = null;
    analyserRef.current = null;

    setVoiceStatus("idle");
    setAssistantState("idle");
    if (!silent) setLiveTranscript("Voice conversation paused.");
  }

  function resumeNaturalListening() {
    if (!autoVoiceRef.current) return;
    conversationBusyRef.current = false;
    setVoiceStatus("listening");
    setAssistantState("listening");
    setLiveTranscript("Listening. Speak naturally, then pause.");
  }

  async function transcribeVoiceSegment(blob, contentType) {
    if (!blob.size || blob.size < 1200) {
      resumeNaturalListening();
      return;
    }

    setVoiceStatus("transcribing");
    setAssistantState("processing");
    try {
      const response = await fetch("/api/transcribe", {
        method: "POST",
        headers: { "Content-Type": contentType || "audio/webm" },
        body: blob
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Transcription failed");

      const transcript = normalizeSpeech(payload.transcript || "");
      setLiveTranscript(transcript || "I did not catch that. Please try again.");
      if (transcript) {
        await sendMessageRef.current?.(transcript, { fromVoice: true });
      } else {
        resumeNaturalListening();
      }
    } catch {
      setVoiceError(config?.deepgramConfigured ? "I could not understand that audio. Please try again." : "Deepgram key is not configured here.");
      resumeNaturalListening();
    }
  }

  function beginVoiceSegment() {
    const stream = mediaStreamRef.current;
    if (!stream || isCapturingRef.current || conversationBusyRef.current) return;

    const mimeType = getPreferredAudioMimeType();
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    chunksRef.current = [];
    isCapturingRef.current = true;
    segmentStartRef.current = performance.now();
    lastVoiceAtRef.current = segmentStartRef.current;

    recorder.ondataavailable = (event) => {
      if (event.data.size) chunksRef.current.push(event.data);
    };
    recorder.onstop = () => {
      const blobType = mimeType || recorder.mimeType || "audio/webm";
      const blob = new Blob(chunksRef.current, { type: blobType });
      chunksRef.current = [];
      void transcribeVoiceSegment(blob, blobType);
    };

    recorderRef.current = recorder;
    recorder.start(250);
    setVoiceStatus("capturing");
    setAssistantState("listening");
    setLiveTranscript("I am listening...");
  }

  function finishVoiceSegment() {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state !== "recording") return;

    isCapturingRef.current = false;
    conversationBusyRef.current = true;
    setVoiceStatus("transcribing");
    setAssistantState("processing");
    recorder.stop();
  }

  function monitorVoice(dataArray) {
    const analyser = analyserRef.current;
    if (!autoVoiceRef.current || !analyser) return;

    if (!conversationBusyRef.current && !isSendingRef.current) {
      analyser.getByteTimeDomainData(dataArray);
      const sum = dataArray.reduce((total, value) => {
        const normalized = (value - 128) / 128;
        return total + normalized * normalized;
      }, 0);
      const rms = Math.sqrt(sum / dataArray.length);
      const now = performance.now();
      const hasVoice = rms > 0.026;

      if (hasVoice) {
        lastVoiceAtRef.current = now;
        beginVoiceSegment();
      } else if (
        isCapturingRef.current &&
        now - lastVoiceAtRef.current > 1150 &&
        now - segmentStartRef.current > 700
      ) {
        finishVoiceSegment();
      }
    }

    vadFrameRef.current = requestAnimationFrame(() => monitorVoice(dataArray));
  }

  async function startNaturalConversation() {
    setVoiceError("");
    setLiveTranscript("");
    setOpen(true);

    if (autoVoiceRef.current) return;

    if (!navigator.mediaDevices?.getUserMedia) {
      setVoiceError("Microphone access is not available in this browser.");
      return;
    }
    if (!window.MediaRecorder) {
      setVoiceError("Continuous voice capture is not available in this browser.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      const audioContext = new AudioContextClass();
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 2048;
      audioContext.createMediaStreamSource(stream).connect(analyser);

      mediaStreamRef.current = stream;
      audioContextRef.current = audioContext;
      analyserRef.current = analyser;
      autoVoiceRef.current = true;
      setAutoVoiceEnabled(true);
      resumeNaturalListening();

      const dataArray = new Uint8Array(analyser.fftSize);
      monitorVoice(dataArray);
      if (voiceReply) void playVoiceReply("How can I help you today?");
    } catch {
      setVoiceStatus("idle");
      setAssistantState("idle");
      setVoiceError("Please allow microphone access to start a natural voice conversation.");
    }
  }

  async function sendMessage(value = input, options = {}) {
    const question = normalizeSpeech(value).trim();
    if (!question || isSending) return;

    const userMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: question
    };

    setMessages((current) => [...current, userMessage]);
    setInput("");
    setIsSending(true);
    setOpen(true);

    try {
      if (registrationFlow.active) {
        await continueRegistration(question);
        return;
      }

      if (isRegistrationIntent(question)) {
        if (startRegistration(question)) return;
      }

      const webLikely = /search|weather|forecast|upcoming|current|recent|latest|trend|best hydration|guidelines/i.test(question);
      setAssistantState(webLikely && useWeb ? "searching" : "retrieving");
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: question, useWeb })
      });

      if (!response.ok) {
        throw new Error("Assistant request failed");
      }

      const payload = await response.json();
      const assistantAnswer = payload.answer;
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: assistantAnswer,
          mode: payload.mode,
          sources: payload.sources,
          ticketNumber: payload.ticketNumber,
          webSearchAttempted: payload.webSearchAttempted,
          webSearchUsed: payload.webSearchUsed,
          webSearchConfigured: payload.webSearchConfigured,
          providerWarning: payload.providerWarning
        }
      ]);
      if (voiceReply) {
        const voicePromise = playVoiceReply(assistantAnswer);
        if (options.fromVoice) await voicePromise;
      }
    } catch {
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          mode: "ticket",
          content:
            "I could not reach the assistant service, so I created a local support request for the demo team to review.",
          ticketNumber: `EVT-${new Date().getFullYear()}-${Math.floor(10000 + Math.random() * 89999)}`,
          sources: []
        }
      ]);
    } finally {
      setIsSending(false);
      if (!conversationBusyRef.current) {
        if (autoVoiceRef.current) {
          setVoiceStatus("listening");
          setAssistantState("listening");
        } else {
          setAssistantState("idle");
        }
      }
    }
  }

  function onSubmit(event) {
    event.preventDefault();
    sendMessage();
  }

  return (
    <>
      <button
        className={cls("chat-launcher", open && "is-open")}
        type="button"
        onClick={() => {
          setOpen(true);
          void startNaturalConversation();
        }}
        aria-label="Open Eventforce chatbot"
      >
        <VeloAssistantMark />
        <span className="launcher-copy">
          <strong>Ask Velo</strong>
          <small>AI event concierge</small>
        </span>
        <Sparkles size={16} className="launcher-spark" />
      </button>

      <div className={cls("voice-orb", assistantState, wakeEnabled && "wake-on")} aria-label="Velo voice assistant status">
        <span />
        <div>
          <strong>{autoVoiceEnabled ? "Velo listening" : wakeEnabled ? "Say Velo" : "Velo idle"}</strong>
          <small>
            {voiceStatus === "capturing"
              ? "Heard you speaking"
              : voiceStatus === "transcribing"
                ? "Understanding"
                : voiceStatus === "speaking"
                  ? "Speaking"
                  : assistantState === "searching"
                    ? "Searching the web"
                    : assistantState === "listening"
                      ? "Listening"
                      : "Ready"}
          </small>
        </div>
      </div>

      <section className={cls("chat-widget", open && "open")} aria-label="Eventforce chatbot">
        <div className="chat-topbar">
          <div className="assistant-title">
            <span className="assistant-logo">
              <VeloAssistantMark compact />
            </span>
            <div>
              <strong>Velo Assistant</strong>
              <span>
                <i />{" "}
                {voiceStatus === "speaking"
                  ? "Speaking"
                  : voiceStatus === "transcribing"
                    ? "Understanding voice"
                    : voiceStatus === "capturing"
                      ? "Listening to you"
                      : assistantState === "searching"
                        ? "Searching the web"
                        : assistantState === "retrieving"
                          ? "Checking documents"
                          : assistantState === "listening"
                            ? "Listening"
                            : "Online"}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              stopNaturalConversation({ silent: true });
              setOpen(false);
            }}
            aria-label="Close chatbot"
          >
            <X size={21} />
          </button>
        </div>

        <div className="messages" ref={listRef}>
          {messages.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))}
          {isSending && (
            <article className="message-row">
              <span className="assistant-avatar">
                <img src="/eventforce-icon.png" alt="" />
              </span>
              <div className={cls("bubble", "typing", assistantState)}>
                <div className="wave-bars" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                  <span />
                </div>
                {assistantState === "searching" ? "Searching the web..." : assistantState === "retrieving" ? "Retrieving event documents..." : "Generating answer..."}
              </div>
            </article>
          )}
        </div>

        <div className="voice-panel">
          <button
            type="button"
            className={cls("mic-button", "conversation-button", autoVoiceEnabled && "active")}
            onClick={autoVoiceEnabled ? () => stopNaturalConversation() : startNaturalConversation}
          >
            {autoVoiceEnabled ? <MicOff size={18} /> : <Mic size={18} />}
            {autoVoiceEnabled
              ? voiceStatus === "capturing"
                ? "Listening..."
                : voiceStatus === "transcribing"
                  ? "Understanding..."
                  : voiceStatus === "speaking"
                    ? "Speaking..."
                    : "Pause conversation"
              : "Start conversation"}
          </button>
          <button
            type="button"
            className={cls("speak-toggle", voiceReply && "active")}
            onClick={() => setVoiceReply((value) => !value)}
            aria-label={voiceReply ? "Turn voice reply off" : "Turn voice reply on"}
            title={config?.deepgramConfigured ? "Voice reply uses Deepgram TTS" : "Voice reply uses browser speech fallback"}
          >
            <Volume2 size={17} />
          </button>
          {(liveTranscript || voiceError) && (
            <div className="transcript-line">
              {(voiceStatus === "listening" || voiceStatus === "capturing") && <span className="pulse-dot" />}
              {voiceError || liveTranscript}
            </div>
          )}
        </div>

        <div className="starter-row" aria-label="Suggested questions">
          {starters.slice(0, 5).map((starter) => (
            <button key={starter} type="button" onClick={() => sendMessage(starter)}>
              {starter}
            </button>
          ))}
        </div>

        <form className="chat-input" onSubmit={onSubmit}>
          <button className="icon-button" type="button" aria-label="Attach document">
            <Paperclip size={18} />
          </button>
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Ask anything about your event..."
            aria-label="Ask anything about your event"
          />
          <label className="web-toggle">
            <input type="checkbox" checked={useWeb} onChange={(event) => setUseWeb(event.target.checked)} />
            <Search size={15} />
          </label>
          <button className="send-button" type="submit" disabled={!input.trim() || isSending}>
            {isSending ? <Loader2 className="spin" size={18} /> : <Send size={18} />}
          </button>
        </form>
      </section>
    </>
  );
}

function Hero() {
  return (
    <section className="hero" id="home">
      <div className="hero-overlay" />
      <div className="hero-content">
        <p className="hero-kicker">Welcome to Eventforce</p>
        <h1>Power up your event, End-to-End</h1>
      </div>
    </section>
  );
}

function Stats() {
  const [active, setActive] = useState(false);
  const statsRef = useRef(null);

  useEffect(() => {
    const node = statsRef.current;
    if (!node) return undefined;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setActive(true);
          observer.disconnect();
        }
      },
      { threshold: 0.32 }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <section className="stats-band" aria-label="Numbers That Speak Volumes" ref={statsRef}>
      <div className="section-shell">
        <h2>Numbers That Speak Volumes</h2>
        <div className="stats-grid">
          {statItems.map((item, index) => (
            <AnimatedStat key={item.label} item={item} active={active} index={index} />
          ))}
        </div>
      </div>
    </section>
  );
}

function About() {
  return (
    <section className="about-section" id="about-us">
      <div className="section-shell about-grid">
        <div>
          <p className="section-kicker">BRING FORCE</p>
          <h2>Revolutionizing Event Management. One Platform. Endless Possibilities.</h2>
          <p>
            Eventforce converges technology and creative expertise to deliver seamless event experiences. With registration, PhotoApp, messaging, analytics, and AI-driven support, organizers can craft events that drive measurable results and lasting connections.
          </p>
          <a className="outline-link" href="#services">
            Read More <ArrowRight size={17} />
          </a>
        </div>
        <div className="why-panel">
          <h3>Why Event force?</h3>
          <article>
            <strong>05.</strong>
            <div>
              <h4>CRM & ROI</h4>
              <p>Leverage attendee data, track behaviors, and measure ROI effectively.</p>
            </div>
          </article>
          <article>
            <strong>03.</strong>
            <div>
              <h4>Broad Engagement</h4>
              <p>Maximize participant engagement through personalization and storytelling.</p>
            </div>
          </article>
          <article>
            <strong>04.</strong>
            <div>
              <h4>Impactful Brand Presence</h4>
              <p>Create measurable brand visibility for sponsors and partners.</p>
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}

function Services() {
  return (
    <section className="services" id="services">
      <div className="section-shell">
        <p className="section-kicker">Eventforce Features</p>
        <h2>OUR PROGRAM & SERVICES</h2>
        <div className="service-grid">
          {serviceCards.map((item) => (
            <article className="service-card" key={item.title}>
              <img src={item.image} alt="" />
              <h3>{item.title}</h3>
              <p>{item.text}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function EventsBlock() {
  return (
    <section className="events-block" id="events">
      <div className="section-shell events-grid">
        <div>
          <p className="section-kicker">Events Covered</p>
          <h2>From marathons to corporate expos, we have tackled diverse challenges.</h2>
          <p>
            The chatbot in this demo uses the same event-management story, but adds a support layer: document answers, web search through Tavily, and automatic ticketing for anything outside the approved knowledge base.
          </p>
        </div>
        <div className="event-card">
          <img src="/eventforce-hero.png" alt="" />
          <h3>Global Tech Summit 2025</h3>
          <p>Registration, PhotoApp, WhatsApp, feedback, CRM, and ROI assistant demo.</p>
          <div>
            <CalendarDays size={18} />
            May 20 - 22, 2025
          </div>
        </div>
      </div>
    </section>
  );
}

function AnimatedStat({ item, active, index }) {
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    if (!active) return undefined;

    let frameId;
    const start = performance.now();
    const duration = 1300 + index * 160;

    function tick(now) {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayValue(item.value * eased);
      if (progress < 1) frameId = requestAnimationFrame(tick);
    }

    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [active, index, item.value]);

  const number = displayValue.toFixed(item.decimals);

  return (
    <article style={{ "--stat-delay": `${index * 90}ms` }}>
      <span>{item.label}</span>
      <strong>
        {number}
        <em>{item.suffix}</em>
      </strong>
    </article>
  );
}

function RegistrationPanel({ registration, completedRegistration }) {
  const completeCount = registrationFields.filter((field) => String(registration[field.key] || "").trim()).length;
  const progress = Math.round((completeCount / registrationFields.length) * 100);

  return (
    <section className="registration-demo" id="registration">
      <div className="section-shell registration-grid">
        <div>
          <p className="section-kicker">Voice Registration Demo</p>
          <h2>Watch Velo fill the runner form live</h2>
          <p>
            Say “Velo, register me for the 10K run” in conversation mode. The assistant listens for your pause, asks one question at a time, fills the form, summarizes the details, and generates a mock QR code after confirmation.
          </p>
          <div className="registration-progress">
            <span style={{ width: `${progress}%` }} />
          </div>
          <small>{completeCount} of {registrationFields.length} fields complete</small>
        </div>
        <div className="runner-form-card">
          <div className="form-card-header">
            <UserRound size={22} />
            <div>
              <strong>{registration.eventName}</strong>
              <span>Demo registration form</span>
            </div>
          </div>
          <div className="runner-form-grid">
            {registrationFields.map((field) => (
              <label key={field.key} className={registration[field.key] ? "filled" : ""}>
                <span>{field.label}</span>
                <input value={registration[field.key] || ""} readOnly placeholder="Waiting for voice input" />
              </label>
            ))}
          </div>
          {completedRegistration && (
            <div className="registration-success">
              <div>
                <CheckCircle2 size={24} />
                <strong>Registration generated</strong>
                <span>{completedRegistration.id}</span>
              </div>
              <img src={completedRegistration.qrCode} alt="Registration QR code" />
              <p>Payment status: demo pending. Use this screen to show the payment handoff or confirmed registration mode.</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function TryAsking({ onPrompt }) {
  return (
    <section className="demo-prompts" id="blogs">
      <div className="section-shell">
        <p className="section-kicker">AI Assistant Demo</p>
        <h2>Try asking</h2>
        <p>
          These prompts demonstrate document retrieval, web search, voice activation, and guided registration. Open the floating Velo assistant and click any prompt to run it.
        </p>
        <div className="prompt-group-grid">
          {promptGroups.map((group) => (
            <article key={group.label}>
              <h3>{group.label}</h3>
              <div className="prompt-list">
                {group.prompts.map((prompt) => (
                  <button key={prompt} type="button" onClick={() => onPrompt(prompt)}>
                    <CheckCircle2 size={17} />
                    {prompt}
                  </button>
                ))}
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function ContactFooter() {
  return (
    <footer className="contact-footer" id="contact-us">
      <div className="section-shell footer-grid">
        <img src="/eventforce-logo.png" alt="Eventforce" />
        <div>
          <span>
            <Mail size={16} />
            support@eventforce.ai
          </span>
          <span>
            <Mail size={16} />
            sales@eventforce.ai
          </span>
          <span>
            <Phone size={16} />
            8304033534
          </span>
        </div>
      </div>
    </footer>
  );
}

export default function App() {
  const [chatOpen, setChatOpen] = useState(false);
  const [config, setConfig] = useState({});
  const [promptToSend, setPromptToSend] = useState("");
  const [registration, setRegistration] = useState(emptyRegistration);
  const [completedRegistration, setCompletedRegistration] = useState(null);

  useEffect(() => {
    fetch("/api/config")
      .then((response) => response.json())
      .then(setConfig)
      .catch(() => setConfig({}));
  }, []);

  function runPrompt(prompt) {
    setChatOpen(true);
    setPromptToSend(prompt);
  }

  return (
    <div className="app">
      <Header />
      <main>
        <Hero />
        <Stats />
        <About />
        <Services />
        <EventsBlock />
        <RegistrationPanel registration={registration} completedRegistration={completedRegistration} />
        <TryAsking onPrompt={runPrompt} />
        <ContactFooter />
      </main>
      <ChatWidget
        open={chatOpen}
        setOpen={setChatOpen}
        registration={registration}
        onRegistrationDraft={setRegistration}
        onRegistrationComplete={setCompletedRegistration}
        config={config}
        promptToSend={promptToSend}
        onPromptConsumed={() => setPromptToSend("")}
      />
    </div>
  );
}
