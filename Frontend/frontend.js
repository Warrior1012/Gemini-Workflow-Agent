// 3.frontend.js

// Function to update the HTML list of tasks (renderTasks)
function renderTasks(tasks) {
    const taskListElement = document.getElementById('task-list');
    taskListElement.innerHTML = ''; // Clear existing tasks

    if (tasks.length === 0) {
        taskListElement.innerHTML = '<li>No tasks found. Try a different prompt!</li>';
        return;
    }

    tasks.forEach(task => {
        const listItem = document.createElement('li');
        listItem.innerHTML = `
            <strong>${task.description}</strong>
            <span class="datetime">${task.datetime ? new Date(task.datetime).toLocaleString() : 'No Time'}</span>
            <span class="priority ${task.priority}">${task.priority}</span>
        `;
        taskListElement.appendChild(listItem);
    });
}


// Function to handle the form submission (this will call your Node.js backend)
async function submitTranscriptTest() {
    const transcript = document.getElementById('transcript-input').value;
    const resultDiv = document.getElementById('test-result');

    if (!transcript.trim()) {
        alert("Please enter a transcript to test.");
        return;
    }

    resultDiv.innerHTML = 'Processing...';

    try {
        // CALL THE NODE.JS BACKEND API ENDPOINT
        const response = await fetch('/test-transcript', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                // This header is not needed for /test-transcript, but good to remember
                // 'x-api-key': 'test_key_123' 
            },
            body: JSON.stringify({ transcript: transcript })
        });

        const data = await response.json();
        
        if (response.ok) {
            renderTasks(data.tasks); // Renders tasks on the page
            resultDiv.innerHTML = `<p style="color: green;">Success! Extracted ${data.tasks.length} tasks.</p>`;
        } else {
             resultDiv.innerHTML = `<p style="color: red;">Error: ${data.message || 'Backend server error.'}</p>`;
        }

    } catch (error) {
        console.error('Frontend Fetch Error:', error);
        resultDiv.innerHTML = `<p style="color: red;">Network Error: Could not connect to the server.</p>`;
    }
}