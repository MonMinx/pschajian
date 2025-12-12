const { app, core } = require("photoshop");
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

            // Duplicate the document first.
            const tempDoc = await doc.duplicate("temp_export");
            await tempDoc.cropTo(tempDoc.selection.bounds); // Crop to selection

            // Now save this temp doc to a temp file
            const tempFolder = await fs.getTemporaryFolder();
            const tempFile = await tempFolder.createFile("temp_selection.jpg", { overwrite: true });

            // Correct UXP syntax for saveAs
            // Quality is 0-12 range for JPEG in Photoshop
            await tempDoc.saveAs.jpg(tempFile, { quality: 12 }, true);

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
    let finalPrompt = presetPrompt;
    if (userPrompt) {
        finalPrompt = finalPrompt ? `${finalPrompt}. ${userPrompt}` : userPrompt;
    }

    // Default fallback
    if (!finalPrompt) finalPrompt = "Improve this image";

    // Note: 'gemini-2.5-flash-image' is the model requested by the user documentation provided.
    // If this model is not available in the public API yet, users might need to switch to 'gemini-1.5-pro'
    // or wait for availability.
    const model = "gemini-2.5-flash-image";
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
