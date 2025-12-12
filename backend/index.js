

// index.js — Whisper (local) + Gemini (reasoning) integration
require('dotenv').config();
const cors = require('cors');
if (!global.fetch) global.fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const execFile = promisify(require('child_process').execFile);
const exec = promisify(require('child_process').exec);
const express = require('express');
const multer = require('multer');
const bodyParser = require('body-parser');
const chrono = require('chrono-node');
const schedule = require('node-schedule');
const { initDb, saveTask, listTasks } = require('./db');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);


// index.js (Add this block after your require statements)

function scheduleReminder(jobId, task) {
    if (!task.datetime) {
        console.log(`[SCHEDULE] Task skipped as no date/time found: ${task.description.slice(0, 50)}`);
        return; 
    }

    try {
        const dateToSchedule = new Date(task.datetime);
        const now = new Date();
        
        if (dateToSchedule <= now) {
            console.warn(`[SCHEDULE] Task time already passed or is now: ${task.description.slice(0, 50)}`);
            // You could run the reminder immediately here if you want:
            // console.log('⏰ --- REMINDER TRIGGERED (IMMEDIATE) --- ⏰');
            // console.log(`Task: ${task.description}`);
            return;
        }

        // Schedule the job using node-schedule
        schedule.scheduleJob(jobId, dateToSchedule, function(){
            console.log('⏰ --- REMINDER TRIGGERED --- ⏰');
            console.log(`Task: ${task.description}`);
            // In a real app: Call SpeakSpace API or Notification Service
            
            // Optional: delete the job after it runs
            schedule.cancelJob(jobId);
        });
        
        console.log(`[SCHEDULE] Reminder set successfully for ${dateToSchedule.toLocaleString()} (Job ID: ${jobId}).`);

    } catch (error) {
        console.error(`[SCHEDULE ERROR] Could not schedule task: ${task.description.slice(0, 50)}`, error);
    }
}

// -------------------------------------------------------------
// FETCH FIX (works on ALL node versions)
// -------------------------------------------------------------
let fetchFunc = global.fetch;
if (!fetchFunc) {
  fetchFunc = (...args) =>
    import('node-fetch').then(mod => mod.default(...args));
}

// -------------------------------------------------------------
const app = express();
app.use(bodyParser.json());
app.use(cors());

app.use((req, res, next) => {
  console.log(`>>> INCOMING ${req.method} ${req.url}`);
  next();
});


const upload = multer({ dest: 'uploads/' });

// init DB
initDb();

// -------------------------------------------------------------
// ROUTE: POST /upload-audio
// -------------------------------------------------------------

app.post('/test-transcript', async (req, res) => {
    try {
        const { transcript } = req.body;
        if (!transcript) return res.status(400).json({ ok: false, error: 'No transcript provided' });

        console.log("TEST TRANSCRIPT:", transcript.slice(0,200));

        const tasks = await extractTasksWithGemini(transcript);
        console.log("EXTRACTED TASKS:", JSON.stringify(tasks, null, 2));

        // ------------------------------------------------------------------
        // --- CRITICAL FIX: SCHEDULE THE REMINDER FOR /test-transcript ---
        // ------------------------------------------------------------------
        for (const t of tasks) {
            // We need a unique ID for the job, Date.now() is fine for testing
            const uniqueId = t.description.slice(0, 10) + Date.now(); 
            // Call the scheduling function directly
            try { scheduleReminder(uniqueId, t); } catch(e) { /* ignore scheduling errors */ }
        }
        // ------------------------------------------------------------------

        res.json({ ok: true, tasks });
    } catch (err) {
        console.error("TEST-GEMINI ERROR:", err);
        res.status(500).json({ ok: false, error: err.message });
    }
});

// --- ENQUEUE AUDIO (replace old /upload-audio handler) ---
app.post('/upload-audio', upload.single('audio'), (req, res) => {
  try {
    console.log('>>> ENQUEUE POST /upload-audio');
    if (!req.file) return res.status(400).json({ ok: false, error: 'No audio file' });
    const apiKey = req.header('x-api-key') || '';
    const EXPECTED = process.env.API_KEY || 'test_key_123';
    if (apiKey !== EXPECTED) return res.status(401).json({ ok: false, error: 'Unauthorized' });

    const jobId = newJob({ type: 'audio', audioPath: req.file.path, originalname: req.file.originalname, mimetype: req.file.mimetype });
    return res.status(200).json({ ok: true, message: 'Audio queued', job_id: jobId });
  } catch (e) {
    console.error('enqueue upload error', e);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// --- SPEAKSPACE /process (accept SpeakSpace payload) ---
app.post('/process', (req, res) => {
  const apiKey = req.header('x-api-key') || '';
  const EXPECTED = process.env.API_KEY || 'test_key_123';
  if (apiKey !== EXPECTED) return res.status(401).json({ status: 'error', message: 'Unauthorized' });

  const { prompt, note_id, timestamp } = req.body || {};
  if (!prompt || !note_id || !timestamp) return res.status(400).json({ status: 'error', message: 'Missing fields' });

  const jobId = newJob({ type: 'text-note', prompt, note_id, timestamp });
  return res.status(200).json({ status: 'success', message: 'Workflow queued', job_id: jobId });
});

// -------------------------------------------------------------
// ROUTE: GET /tasks
// -------------------------------------------------------------
app.get('/tasks', async (req, res) => {
  const tasks = await listTasks();
  res.json({ ok: true, tasks });
});
// --- HEALTH & JOB STATUS ---
app.get('/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

const JOBS = {}; // jobId -> { status, result, created_at, payload }

app.get('/job/:id', (req, res) => {
  const j = JOBS[req.params.id];
  if (!j) return res.status(404).json({ ok: false, error: 'job not found' });
  return res.json({ ok: true, job: j });
});

// --- SIMPLE QUEUE HELPERS ---
const jobQueue = [];

function newJob(payload) {
  const id = 'job_' + Date.now() + '_' + Math.floor(Math.random()*10000);
  JOBS[id] = { status: 'queued', created_at: new Date().toISOString(), payload };
  jobQueue.push({ jobId: id, payload });
  return id;
}


// -------------------------------------------------------------
const PORT = process.env.PORT || 3000;

// --- WORKER: process queued jobs (paste BEFORE app.listen) ---
async function workerLoopOnce() {
  if (jobQueue.length === 0) return;
  const job = jobQueue.shift();
  const id = job.jobId;
  JOBS[id].status = 'processing';
  try {
    const p = job.payload;
    let transcript = '';
    if (p.type === 'audio') {
      transcript = await transcribeWithWhisperOrGemini(p.audioPath);
      try { fs.unlinkSync(p.audioPath); } catch (e) { /* ignore */ }
    } else {
      transcript = p.prompt || '';
    }

    const tasks = await extractTasksWithGemini(transcript);
    for (const t of tasks) {
      await saveTask(t);
      try { scheduleReminder(t.id || t._id || Date.now(), t); } catch(e) { /* ignore */ }
    }

    JOBS[id].status = 'done';
    JOBS[id].result = { tasks, processed_at: new Date().toISOString() };
  } catch (err) {
    console.error('worker error', err);
    JOBS[id].status = 'failed';
    JOBS[id].error = err.message || String(err);
  }
}
setInterval(() => { workerLoopOnce().catch(e => console.error('workerLoop crash', e)); }, 700);

// friendly root page
app.get('/', (req, res) => res.send('SpeakSpace Hackathon backend is live. Use /health or POST /process.'));


app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

/* =============================================================
                      HELPERS: Whisper + Gemini
   - Primary STT: Whisper (local via WHISPER_CMD env)
   - Fallback STT: Gemini (your existing code)
   - Configure via env:
       LOCAL_WHISPER=true
       WHISPER_CMD='whisper --model tiny --task transcribe --language en --output_format txt --output_dir /tmp'
       OR any command that prints transcript to stdout when you append the audio path
       WHISPER_OUTPUT_DIR=/tmp    // optional, used if whisper writes file instead of stdout
============================================================= */

// Detect mime type from file extension
function detectMime(pathStr) {
  const ext = pathStr.split('.').pop().toLowerCase();
  if (ext === "wav") return "audio/wav";
  if (ext === "mp3") return "audio/mpeg";
  if (ext === "m4a" || ext === "aac") return "audio/m4a";
  return "application/octet-stream";
}

// -------------------- TRANSCRIPTION: TRY WHISPER THEN GEMINI --------------------------
async function transcribeWithWhisperOrGemini(audioPath) {
  // If LOCAL_WHISPER explicitly disabled, skip to Gemini transcription
  if (process.env.LOCAL_WHISPER === 'false') {
    console.log("LOCAL_WHISPER disabled, using Gemini for transcription (fallback).");
    return transcribeWithGemini(audioPath);
  }

  // If user didn't provide WHISPER_CMD, skip Whisper attempt and fallback
  const whisperCmd = process.env.WHISPER_CMD;
  const whisperOutDir = process.env.WHISPER_OUTPUT_DIR || null;

  if (!whisperCmd) {
    console.warn("WHISPER_CMD not set — skipping local whisper. Falling back to Gemini transcription.");
    return transcribeWithGemini(audioPath);
  }

  try {
    // Build command: append audio path to the provided WHISPER_CMD string
    // Example env value: WHISPER_CMD='whisper --model tiny --task transcribe --language en --output_format txt --output_dir /tmp'
    // The user should ensure their command either prints transcript to stdout or writes a .txt file to WHISPER_OUTPUT_DIR.
    const fullCmd = `${whisperCmd} "${audioPath}"`;
    console.log("Running local whisper command:", fullCmd);

    // Use exec to capture stdout/stderr (works if CLI prints transcript)
    const { stdout, stderr } = await exec(fullCmd, { maxBuffer: 10 * 1024 * 1024 });

    if (stderr) {
      // Some CLIs print progress to stderr — just log
      console.log("whisper stderr:", stderr.slice(0, 1000));
    }

    const candidate = (stdout || "").trim();
    if (candidate && candidate.length > 2) {
      console.log("Whisper returned transcript via stdout (length):", candidate.length);
      return candidate;
    }

    // If no stdout, try reading output file by convention: basename + .txt in WHISPER_OUTPUT_DIR
    if (whisperOutDir) {
      const base = path.basename(audioPath, path.extname(audioPath));
      // try a few filename conventions
      const candidates = [
        path.join(whisperOutDir, `${base}.txt`),
        path.join(whisperOutDir, `${base}.trans.txt`),
        path.join(whisperOutDir, `${base}_transcript.txt`)
      ];
      for (const c of candidates) {
        if (fs.existsSync(c)) {
          const txt = fs.readFileSync(c, 'utf8').trim();
          if (txt.length > 0) {
            console.log("Whisper returned transcript via file:", c);
            return txt;
          }
        }
      }
    }

    // If we land here, whisper CLI didn't provide output in expected ways
    console.warn("Local whisper did not produce usable output. Falling back to Gemini transcription.");
    return transcribeWithGemini(audioPath);

  } catch (err) {
    console.error("LOCAL WHISPER ERROR:", err.message || err);
    console.warn("Falling back to Gemini transcription.");
    return transcribeWithGemini(audioPath);
  }
}

// -------------------- GEMINI TRANSCRIPTION (FALLBACK) --------------------------
async function transcribeWithGemini(audioPath) {
  try {
    const audioBytes = fs.readFileSync(audioPath).toString("base64");
    const mimeType = detectMime(audioPath);
    
    const model = genAI.getGenerativeModel({ model: process.env.GEMINI_MODEL });

    const audioPart = {
        inlineData: {
            data: audioBytes,
            mimeType,
        },
    };

    const response = await model.generateContent({
        contents: [{
            parts: [
                audioPart,
                // Instruct the model to return ONLY the transcript
                { text: "Transcribe the above audio and return ONLY plaintext transcript." } 
            ]
        }]
    });
    
    const transcript = response.text.trim();

    if (!transcript) {
      console.warn("Gemini transcription response empty.");
      return "Could not transcribe audio.";
    }

    return transcript;

  } catch (err) {
    console.error("TRANSCRIBE ERROR (gemini fallback):", err);
    return "Could not transcribe audio.";
  }
}

// -------------------- TASK EXTRACTION (Gemini reasoning) --------------------------
async function extractTasksWithGemini(transcript) {
  try {
    // Define the JSON schema for the tasks array
    const taskSchema = {
      type: "object",
      properties: {
        description: {
          type: "string",
          description: "The core task description/action item extracted from the transcript."
        },
        datetime: {
          type: "string",
          description: "The date and time in ISO 8601 format (e.g., 2025-12-13T17:00:00.000Z) if explicitly mentioned. Use null if no time is specified."
        },
        priority: {
          type: "string",
          enum: ["low", "medium", "high"],
          description: "The urgency of the task. Default to 'medium'."
        }
      },
      required: ["description", "datetime"]
    };

    // Define the tool (function) the model must call
    const taskTool = {
      name: "record_tasks",
      description: "Records a list of tasks and their associated details (time, priority) from a user's voice transcript.",
      parameters: {
        type: "object",
        properties: {
          tasks: {
            type: "array",
            items: taskSchema,
            description: "A list of all action items/tasks found in the transcript."
          }
        },
        required: ["tasks"]
      }
    };

    // Configure the model to use the tool
    const model = genAI.getGenerativeModel({
      model: process.env.GEMINI_MODEL,
      config: {
        systemInstruction: "You are an expert task extraction engine. Your only job is to analyze the user's voice transcript and identify all distinct action items, then format them using the provided `record_tasks` function. Do not write any other text or explanation.",
        temperature: 0.1
      },
      tools: [{ functionDeclarations: [taskTool] }] // Tool definition needs to be wrapped
    });
    
    // Send the message and await the response
    const result = await model.generateContent(`Analyze the following transcript and extract all tasks: "${transcript}"`);
    
    // Extract the function call arguments
    const call = result.response.functionCalls?.[0];
    
    if (call && call.name === 'record_tasks') {
      // The tasks array is guaranteed to be clean JSON now
      const rawTasks = call.args.tasks || [];
      console.log("Gemini FUNCTION CALL TASKS:", JSON.stringify(rawTasks, null, 2));

      return rawTasks.map(t => ({
        description: t.description || "",
        datetime: t.datetime || null,
        priority: t.priority || "medium",
        created_at: new Date().toISOString(),
        status: "pending"
      }));

    } else {
      console.warn("Gemini did not return a function call or the required function call. Falling back. RAW Text:", result.text.slice(0, 1000));
      // The fallback parser will use the raw text if the function call failed for some reason
      return fallbackExtractTasks(transcript); 
    }

  } catch (err) {
    console.error("TASK EXTRACTION ERROR (Gemini Function Calling):", err);
    return fallbackExtractTasks(transcript);
  }
}

// -------------------- IMPROVED FALLBACK PARSER --------------------------
function fallbackExtractTasks(text) {
  // break into candidate clauses using sentence enders + common separators
  // keep sentences that are non-trivial
  if(!text || !text.trim()) return [];

  // Normalize whitespace
  const normalized = text.replace(/\s+/g, ' ').trim();

  // Split on ., ?, !, ; OR the words and/also/then OR newlines or commas (but avoid splitting initials)
  const rawParts = normalized.split(/(?:(?<=[.?!;])\s+|\band\b|\balso\b|\bthen\b|\n|,)/i).map(p => p.trim()).filter(Boolean);

  const tasks = [];
  for (let part of rawParts) {
    // ignore very short fragments
    if (part.length < 3) continue;

    // Remove polite prefixes
    part = part.replace(/^(please\s+|kindly\s+|remind me to\s+|remember to\s+)/i, '').trim();

    // Try parse date/time from the clause using chrono
    let dt = null;
    try {
      const parsed = chrono.parse(part);
      if (parsed && parsed.length > 0 && parsed[0].start) {
        const d = parsed[0].start.date();
        // sanity: only accept future-ish or valid dates
        if (d && !isNaN(d.getTime())) dt = d.toISOString();
      }
    } catch (e) {
      // ignore chrono errors
      dt = null;
    }

    // If the part contains multiple imperative verbs (like "Email X and call Y"), split further on " and " only if it seems to be two commands.
    // A heuristic: if " and " occurs and there is a verb at start of each piece, split them.
    if (/\band\b/i.test(part)) {
      const candidates = part.split(/\band\b/i).map(s=>s.trim()).filter(Boolean);
      if (candidates.length > 1) {
        let subAdded = false;
        for (const cand of candidates) {
          const w = cand.split(/\s+/)[0].toLowerCase();
          const verbs = ['call','email','meet','submit','finish','complete','review','buy','order','schedule','prepare','create','draft','send','book','attend','check','update','pay'];
          if (verbs.includes(w) || cand.length < 80) {
            // attempt to parse datetime for each sub-clause
            let subDt = null;
            try {
              const p = chrono.parse(cand);
              if (p && p.length > 0 && p[0].start) subDt = p[0].start.date().toISOString();
            } catch(e) { subDt = null; }
            tasks.push({
              description: cand,
              datetime: subDt || dt || null,
              created_at: new Date().toISOString(),
              status: "pending"
            });
            subAdded = true;
          }
        }
        if (subAdded) continue; // already added splitted subs
      }
    }

    // Otherwise push the whole clause
    tasks.push({
      description: part,
      datetime: dt || null,
      created_at: new Date().toISOString(),
      status: "pending"
    });
  }

  // As a last resort: if we didn't find anything, fallback to splitting by sentences more aggressively
  if (tasks.length === 0) {
    const sentences = normalized.split(/(?<=[.?!])\s+/).map(s=>s.trim()).filter(Boolean);
    for (const s of sentences.slice(0,6)) {
      let dt = null;
      try {
        const p = chrono.parse(s);
        if (p && p.length>0 && p[0].start) dt = p[0].start.date().toISOString();
      } catch(e){ dt = null; }
      if (s.length>2) tasks.push({ description: s, datetime: dt || null, created_at: new Date().toISOString(), status:"pending" });
    }
  }

  return tasks;
}
/// 2.script.js (Add this function)

function generateSchedule() {
    const scheduleArea = document.getElementById('scheduleArea');
    scheduleArea.innerHTML = '';
    
    if (currentExtractedTasks.length === 0) {
        scheduleArea.innerHTML = '<p class="info">Please extract tasks first.</p>';
        return;
    }
  }