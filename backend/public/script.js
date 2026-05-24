// ==========================================================
// 1. CONFIG AND GLOBAL VARIABLES & DOM SELECTION
// ==========================================================
const API_BASE = "http://localhost:3000";
const CLIENT_API_KEY = "test_key_123";

let currentExtractedTasks = [];

// Define DOM elements once, here:
const audioFile = document.getElementById('audioFile');
const noteText = document.getElementById('noteText');
const extractBtn = document.getElementById('extractBtn');
const clearBtn = document.getElementById('clearBtn');
const browserSpeechBtn = document.getElementById('browserSpeechBtn');

// Ensure all required DOM elements are found (safety check)
if (!audioFile || !noteText || !extractBtn) {
    console.error("CRITICAL ERROR: Required DOM elements (audioFile, noteText, or extractBtn) not found. Check index.html IDs!");
}


// ==========================================================
// 2. HELPER FUNCTIONS (MUST BE DEFINED HERE)
// ==========================================================

// Helper: POST FormData with x-api-key 
async function postFormWithKey(url, formData){
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'x-api-key': CLIENT_API_KEY },
        body: formData
    });
    if(!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    return res.json();
}

// Poll job status until done/failed or timeout 
async function pollJob(jobId, timeoutMs = 60_000, intervalMs = 1000){
    const start = Date.now();
    while(Date.now() - start < timeoutMs){
        const res = await fetch(`${API_BASE}/job/${jobId}`);
        if(!res.ok) throw new Error(`Job status ${res.status}`);
        const j = await res.json();
        if(j.job && (j.job.status === 'done' || j.job.status === 'failed')){
            return j.job;
        }
        await new Promise(r => setTimeout(r, intervalMs));
    }
    throw new Error('Job poll timeout');
}

// --- DEFINITION: renderTasks (for Section 2) ---
function renderTasks(tasks) {
    const tasksArea = document.getElementById('tasksArea');
    if (!tasksArea) { console.error("tasksArea element not found."); return; }
    
    tasksArea.innerHTML = ''; 
    currentExtractedTasks = tasks; 

    if (!tasks || tasks.length === 0) {
        tasksArea.innerHTML = '<p class="info">No specific tasks extracted. Try speaking clearer action items.</p>';
        return;
    }

    const ul = document.createElement('ul');
    ul.className = 'task-list';
    tasks.forEach(task => {
        const li = document.createElement('li');
        const desc = typeof task === 'string' ? task : task.description || 'Task Item';
        const dt = task.datetime ? new Date(task.datetime).toLocaleString() : 'No Time Specified';
        
        li.innerHTML = `<strong>${desc}</strong> <span class="datetime">(${dt})</span>`;
        ul.appendChild(li);
    });
    tasksArea.appendChild(ul);
}


// --- DEFINITION: renderSchedule (for Section 3) ---
function renderSchedule(tasks) {
    const scheduleArea = document.getElementById('scheduleArea');
    if (!scheduleArea) { console.error("scheduleArea element not found."); return; }

    scheduleArea.innerHTML = '';
    
    if (!tasks || tasks.length === 0) {
        scheduleArea.innerHTML = '<p class="info">No scheduleable tasks found in transcript.</p>';
        return;
    }

    const ul = document.createElement('ul');
    ul.className = 'schedule-list';
    
    tasks.forEach(task => {
        const li = document.createElement('li');
        
        const description = (typeof task === 'object' && task.description) 
                            ? task.description 
                            : 'Task (Description Missing)';
                            
        const dt = task.datetime 
                   ? new Date(task.datetime).toLocaleString() 
                   : '⚠️ No Date/Time Specified (Reminder Skipped)';
        
        li.innerHTML = `
            <strong>${description}</strong> 
            <span class="datetime">Scheduled for: ${dt}</span>
        `;
        ul.appendChild(li);
    });
    
    scheduleArea.appendChild(ul);
}


// --- DEFINITION: Export JSON ---
function exportJson() {
    if (currentExtractedTasks.length === 0) {
        alert("No tasks to export. Please run task extraction first.");
        return;
    }

    const exportData = { 
        project_name: "SpeakSpace Audio-to-Task Workflow",
        extraction_timestamp: new Date().toISOString(),
        total_tasks: currentExtractedTasks.length,
        extracted_tasks: currentExtractedTasks 
    };

    const dataStr = JSON.stringify(exportData, null, 2); 

    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = 'SpeakSpace_Extracted_Tasks.json'; 

    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    console.log('[Frontend] Exported tasks as JSON.');
}


// ==========================================================
// 3. EVENT LISTENERS (MUST COME LAST)
// ==========================================================

// 1. Audio File Change Handler (Correctly isolated)
if (audioFile && noteText) {
    audioFile.removeEventListener && audioFile.removeEventListener('change', ()=>{});
    audioFile.addEventListener('change', async (e) => {
        const f = e.target.files[0];
        if(!f) return;
        noteText.value = `--- Uploaded file: ${f.name} (${Math.round(f.size/1024)} KB) ---\n\nUploading...`;
        
        try {
            const fd = new FormData();
            fd.append('audio', f, f.name);
            const resp = await postFormWithKey(`${API_BASE}/upload-audio`, fd);
            if(!resp.ok || !resp.job_id) throw new Error(resp.error || 'No job id returned');
            
            noteText.value = `Uploaded. Job: ${resp.job_id}\nWaiting for transcription...`;
            const job = await pollJob(resp.job_id, 120000, 1500); 
            
            if(job.status === 'done' && job.result && Array.isArray(job.result.tasks)){
                const tasks = job.result.tasks;
                noteText.value = 'Server processed the audio. See extracted tasks below.';
                renderTasks(tasks); 
                renderSchedule(tasks);
            } else {
                noteText.value = `Job finished with status ${job.status}. Result: ${JSON.stringify(job.result || job.error || {})}`;
            }
        } catch(err){
            console.error('Upload/transcribe error', err);
            noteText.value = `Transcription failed: ${err.message}\n\n(You can fallback to client-side extraction)`;
        }
    });
}


// 2. Extract Button Handler (This is the one that needs to be correct)
if (extractBtn && noteText) {
    extractBtn.addEventListener('click', async ()=> {
        const t = noteText.value.trim();
        if (!t) { alert('No text to extract tasks from.'); return; }
        console.log('[frontend] extract clicked, text len', t.length);

        try {
            const res = await fetch(`${API_BASE || ''}/test-transcript`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ transcript: t })
            });
            
            // Check if response is JSON before parsing
            if (res.headers.get('content-type')?.includes('application/json')) {
                const j = await res.json().catch(e => { console.error('[frontend] JSON parse error', e); return null; });
            
                let tasksArr = null;
                if (j) {
                    // Check all possible return structures
                    if (Array.isArray(j.tasks)) tasksArr = j.tasks;
                    else if (j.result && Array.isArray(j.result.tasks)) tasksArr = j.result.tasks;
                    else if (Array.isArray(j)) tasksArr = j;
                }

                if (tasksArr && tasksArr.length > 0) {
                    renderTasks(tasksArr); 
                    renderSchedule(tasksArr); 
                } else {
                    console.warn('[frontend] Server returned JSON but no tasks array.');
                    renderTasks([]); 
                    renderSchedule([]); 
                }
            } else {
                // Handle non-JSON response (e.g., HTML error page from server)
                console.error('[frontend] Server did not return JSON. Status:', res.status);
                const text = await res.text();
                console.error('[frontend] Server Response Text:', text.slice(0, 200));
                alert('Server returned an error. Check Node.js console.');
            }
            
        } catch (err) {
            console.warn('[frontend] server extract failed (Network/Fetch error):', err);
            alert('Server connection failed. Check console.');
        }
    });
} else {
    console.error("Extract Button or Note Text element not found for listener attachment.");
}


// 3. CLEAR Button functionality (MOVED OUTSIDE)
if (clearBtn && noteText) {
    clearBtn.addEventListener('click', () => {
        noteText.value = '';
        console.log('[frontend] Cleared input box.');
        document.getElementById('tasksArea').innerHTML = '<p class="info">Extracted tasks will appear here.</p>';
        document.getElementById('scheduleArea').innerHTML = '<p class="info">Scheduled reminders will be confirmed here.</p>';
        currentExtractedTasks = [];
    });
}


// 4. USE BROWSER SPEECH Button functionality (MOVED OUTSIDE)
if (browserSpeechBtn) {
    browserSpeechBtn.addEventListener('click', () => {
        alert('Browser Speech-to-Text Feature: This requires complex browser permissions and is often unreliable. Please use "Upload Voice Note" or paste the text directly for the demo.');
        console.warn('[frontend] Browser Speech-to-Text triggered (Requires dedicated implementation).');
    });
}


// 5. Export JSON Button Handler
document.getElementById('exportJsonBtn')?.addEventListener('click', exportJson);