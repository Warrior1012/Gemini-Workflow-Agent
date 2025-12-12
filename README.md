# 🚀 SpeakSpace AI Action: Audio-to-Task Assistant

**One-Line Description:** A voice-first workflow that uses Gemini Function Calling to extract structured tasks and schedule reminders directly from user voice notes or transcribed text.

---

## 💡 Project Objective

This project, built for the SpeakSpace Annual Hackathon, demonstrates a custom workflow that consumes user input (voice or text), intelligently processes it using Google's Gemini API with Function Calling, and executes a real-world backend action (scheduling reminders via `node-schedule`).

## 🛠️ 1. Setup Instructions (Local Development)

Follow these steps to set up and run the backend server and frontend UI.

### Prerequisites

* Node.js (v18 or higher)
* NPM (Node Package Manager)
* A Google Gemini API Key.

### 1.1 Backend Setup

1.  **Dependencies Install:** Navigate to the project directory in your terminal and install all required packages:
    ```bash
    npm install
    ```

2.  **Environment Variables:** Create a file named **`.env`** in the root directory and populate it using the template below.

    #### `.env` File Template (Copy-Paste)

    ```
    # --- Critical Configuration ---
    GEMINI_API_KEY="YOUR_GEMINI_API_KEY_HERE"
    API_KEY="test_key_123" 
    PORT=3000

    # --- Optional: For Transcription Fallback ---
    # Using gemini-2.5-flash for Function Calling/Extraction.
    GEMINI_MODEL="gemini-2.5-flash" 

    # --- Optional: Local Whisper STT (If configured) ---
    LOCAL_WHISPER=false
    # WHISPER_CMD='whisper --model tiny --task transcribe --language en'
    # WHISPER_OUTPUT_DIR='/tmp'
    ```

3.  **Start the Server:** Run the Node.js server. This server hosts the API endpoints and the Job Queue worker.
    ```bash
    npm start 
    # OR: node index.js
    ```
    The server will start on `http://localhost:3000`.

### 1.2 Frontend Setup

1.  Open the **`index.html`** file in your web browser (e.g., by using the "Go Live" extension in VS Code, which usually runs on port 5500).

---

## 🌐 2. Deployment & Testing Guide (For Judges)

The core functionality can be tested via two primary methods: The Web UI and direct API calls (simulating the SpeakSpace platform).

### 2.1 Web UI Demonstration (Recommended)

1.  Ensure both the **Backend** (`http://localhost:3000`) and the **Frontend** (`index.html` on port 5500 or similar) are running.
2.  **Test 1 (Text-based Extraction):**
    * In the **Select/Paste Note** box, paste a test command (e.g., "Please remember to call the hackathon sponsor, Alpha AI, exactly at 8 PM on December 15th, 2025. I also need to draft the final README for the submission, which is a high priority task, and make sure the server is deployed live on Railway by the end of the day.").
    * Click the **Extract Tasks** button.
    * **Expected Result:** Section 2 (`tasksArea`) will display the structured tasks, and the backend console (`index.js` terminal) will show a confirmation message for any scheduled reminders.

3.  **Test 2 (Voice/Audio Workflow):**
    * Click **Upload voice note** and upload an audio file (`.mp3` or `.m4a`).
    * The backend will transcribe the audio, then extract the tasks.
    * **Expected Result:** The transcribed text appears in the box, and tasks/schedules appear below.

### 2.2 API Endpoint URL & Authorization Details

The frontend and the SpeakSpace platform interact with the following endpoints:

| Endpoint | Method | Description |
| `http://localhost:3000/process` | `POST` | **SpeakSpace Integration Endpoint.** Accepts a JSON payload from the SpeakSpace platform and queues the task extraction. |
| `http://localhost:3000/test-transcript` | `POST` | Primary API for testing the core **task extraction** logic directly from a transcribed note. |

#### Authorization Scheme

| Detail | Value | Location |
| **Type** | Custom Header | `x-api-key` |
| **Key Name** | `x-api-key` | |
| **Key Value** | `test_key_123` | Defined in `.env` and `script.js` |

---

## 🔗 3. SpeakSpace Action Configuration (Copy-Paste Ready)

This configuration defines the endpoint and authorization for the **Workflow Module**, allowing SpeakSpace to send transcribed voice notes to your deployed backend API.

**(Replace the `api_url` value with your actual live deployment URL before final submission.)**

```json
{
  "title": "Save Note -> Extract Tasks",
  "description": "Convert voice note to tasks and reminders (demo).",
  "prompt_template": "$PROMPT",
  "notes_selector": "selected_note",
  "api_url": "[https://hackathon-2-backend-production.up.railway.app/process](https://hackathon-2-backend-production.up.railway.app/process)",
  "authorization": {
    "type": "header",
    "header_name": "x-api-key",
    "header_value": "test_key_123"
  }
}