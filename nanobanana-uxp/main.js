const { app, core } = require("photoshop");
const { localFileSystem } = require("uxp").storage;
const { entryWithSystemPath } = require("uxp").storage.localFileSystem;
const fs = require("uxp").storage.localFileSystem;

// State
let currentApiKey = localStorage.getItem("gemini_api_key") || "";

// UI Elements
const apiKeyInput = document.getElementById("apiKey");
const promptInput = document.getElementById("prompt");
const statusDiv = document.getElementById("status");
const btnInpaint = document.getElementById("btnInpaint");
const btnHair = document.getElementById("btnHair");
const btnRetouch = document.getElementById("btnRetouch");

// Initialization
apiKeyInput.value = currentApiKey;

apiKeyInput.addEventListener("change", (e) => {
    currentApiKey = e.target.value.trim();
    localStorage.setItem("gemini_api_key", currentApiKey);
});

// Helper: Update Status
function setStatus(msg, type = "normal") {
    statusDiv.textContent = msg;
    statusDiv.className = "status " + type;
}

// Helper: Convert ArrayBuffer to Base64
function arrayBufferToBase64(buffer) {
    let binary = "";
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

// 1. Get Selection as Base64 Image
async function getSelectionAsBase64() {
    return await core.executeAsModal(async () => {
        try {
            const doc = app.activeDocument;
            if (!doc) throw new Error("No active document.");

            // Check if there is a selection (basic check, usually throws if not)
            try {
                // We'll try to copy. If no selection or empty, it might fail.
                await doc.copy(true); // true = merged copy
            } catch (e) {
                throw new Error("Please make a selection first.");
            }

            // Create a temp document to paste the selection
            // We don't know the exact size of the selection easily without more complex code,
            // but we can create a doc and let it fit? No, we need size.
            // Workaround: Paste into a new document created from clipboard?
            // Photoshop doesn't strictly have "New from Clipboard" in DOM API cleanly exposed as one call,
            // but `app.documents.add` usually defaults to clipboard size if preset is not given?
            // Let's try creating a doc with a default size, then resizing?
            // Actually, `paste` will paste into center.

            // Better approach for UXP:
            // 1. Get bounds of selection (hard in DOM without batchPlay).
            // Let's assume we can just "Crop" the current document to selection?
            // No, that destroys the doc.
            // Duplicate the document first.

            const tempDoc = await doc.duplicate("temp_export");
            await tempDoc.cropTo(tempDoc.selection.bounds); // Crop to selection
            // If the selection was irregular, this crops to bounding box. Good enough.

            // Now save this temp doc to a temp file
            const tempFolder = await fs.getTemporaryFolder();
            const tempFile = await tempFolder.createFile("temp_selection.jpg", { overwrite: true });

            await tempDoc.saveAs.jpg(tempFile, { quality: 80 }, true);

            // Close temp doc
            await tempDoc.closeWithoutSaving();

            // Read the file
            const data = await tempFile.read({ format: fs.formats.binary });
            return arrayBufferToBase64(data);

        } catch (error) {
            console.error(error);
            throw error;
        }
    }, { commandName: "Get Selection" });
}

// 2. Call Gemini API
async function callGeminiAPI(base64Image, userPrompt, presetPrompt = "") {
    if (!currentApiKey) throw new Error("Please enter your Gemini API Key.");

    // Combine prompts
    // If user provided a prompt, append it to preset.
    let finalPrompt = presetPrompt;
    if (userPrompt) {
        finalPrompt = finalPrompt ? `${finalPrompt}. ${userPrompt}` : userPrompt;
    }

    // Default fallback
    if (!finalPrompt) finalPrompt = "Improve this image";

    const model = "gemini-2.5-flash-image"; // Or 'gemini-3-pro-image-preview'
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${currentApiKey}`;

    const payload = {
        contents: [{
            parts: [
                { text: finalPrompt },
                {
                    inline_data: {
                        mime_type: "image/jpeg",
                        data: base64Image
                    }
                }
            ]
        }],
        generationConfig: {
            responseModalities: ["IMAGE"] // We only want the image
        }
    };

    const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`API Error: ${response.status} - ${errText}`);
    }

    const data = await response.json();

    // Extract image
    // Response structure: candidates[0].content.parts[0].inline_data.data (or similar)
    // The API might return 'inlineData' (camelCase) or 'inline_data' depending on version/client,
    // but raw REST usually follows snake_case in docs but JSON output often camelCase in Google APIs.
    // Let's check the docs' REST example output.
    // Docs say: `inlineData` in JSON response.

    try {
        const parts = data.candidates[0].content.parts;
        for (const part of parts) {
            if (part.inlineData && part.inlineData.data) {
                return part.inlineData.data;
            }
        }
        throw new Error("No image data found in response.");
    } catch (e) {
        console.error("Parsing Error", data);
        throw new Error("Failed to parse API response.");
    }
}

// 3. Place Result Layer
async function placeImageLayer(base64Image) {
    await core.executeAsModal(async () => {
        try {
            // Save base64 to file
            const tempFolder = await fs.getTemporaryFolder();
            const tempFile = await tempFolder.createFile("temp_result.png", { overwrite: true });

            // Convert base64 to buffer
            const binaryString = atob(base64Image);
            const len = binaryString.length;
            const bytes = new Uint8Array(len);
            for (let i = 0; i < len; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }

            await tempFile.write(bytes, { format: fs.formats.binary });

            // Open and Copy
            const doc = app.activeDocument;
            const resultDoc = await app.open(tempFile);
            await resultDoc.flatten(); // Ensure it's one layer
            await resultDoc.selection.selectAll();
            await resultDoc.copy();
            await resultDoc.closeWithoutSaving();

            // Paste into Original
            // Note: This will paste into the current selection (centering it).
            // Since we generated from the selection bounds, simply pasting into the *same* selection
            // should align it perfectly if the aspect ratio matches.
            await doc.paste();

        } catch (error) {
            console.error(error);
            throw error;
        }
    }, { commandName: "Place Generated Image" });
}

// Workflow Handler
async function handleGeneration(presetName, presetPrompt) {
    try {
        setStatus(`Processing ${presetName}...`, "normal");

        // 1. Get Image
        setStatus("Getting selection...", "normal");
        const base64Input = await getSelectionAsBase64();

        // 2. Call API
        setStatus("Generating with Gemini...", "normal");
        const userPrompt = promptInput.value.trim();
        const base64Output = await callGeminiAPI(base64Input, userPrompt, presetPrompt);

        // 3. Place Result
        setStatus("Placing result...", "normal");
        await placeImageLayer(base64Output);

        setStatus("Done!", "success");
    } catch (error) {
        setStatus(`Error: ${error.message}`, "error");
        console.error(error);
    }
}

// Event Listeners
btnInpaint.addEventListener("click", () => {
    handleGeneration("Inpaint", "Using the provided image, redraw this area naturally.");
});

btnHair.addEventListener("click", () => {
    handleGeneration("Draw Hair", "Add realistic high-fidelity hair strands, detailed texture.");
});

btnRetouch.addEventListener("click", () => {
    handleGeneration("Retouch", "High-end product retouching, smooth surface, fix imperfections, professional lighting.");
});
