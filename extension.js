const vscode = require('vscode');
const Diff = require('diff');

/**
 * @param {vscode.ExtensionContext} context
 */
 function activate(context) {
    console.log('Congratulations, your extension "paste-and-apply-patch" is now active!');

    let currentPanel = undefined;

    context.subscriptions.push(
        vscode.commands.registerCommand('paste-and-apply-patch.showPatchInput', () => {
            // No need to capture active editor here anymore, as the patch dictates the files
            const column = vscode.window.activeTextEditor
                ? vscode.window.activeTextEditor.viewColumn
                : vscode.ViewColumn.One; // Default to One if no editor active

            if (currentPanel) {
                currentPanel.reveal(column);
                return;
            }

            const panel = vscode.window.createWebviewPanel(
                'patchInput',
                'Paste Multi-File Patch to Apply', // Updated title
                column,
                { enableScripts: true }
            );
            currentPanel = panel;
            panel.webview.html = getWebviewContent(); // Use the same HTML getter

            panel.webview.onDidReceiveMessage(
                async message => {
                    switch (message.command) {
                        case 'applyPatch':
                            const patchText = message.text;
                            if (!patchText || patchText.trim() === '') {
                                vscode.window.showWarningMessage('Patch text is empty.');
                                return;
                            }
                            // Call the new multi-file handler
                            await applyMultiFilePatch(patchText);
                            panel.dispose(); // Close panel after attempting application
                            return;
                        case 'cancel':
                            panel.dispose();
                            return;
                    }
                },
                undefined,
                context.subscriptions
            );

            panel.onDidDispose(
                () => { currentPanel = undefined; },
                null,
                context.subscriptions
            );
        })
    );
}

/**
 * Parses a multi-file patch string and applies changes to each file individually,
 * leaving them in a dirty (unsaved) state.
 * @param {string} patchText The full Unified Diff patch text, potentially containing multiple files.
 */
 async function applyMultiFilePatch(patchText) {
    let successfulFiles = 0;
    let failedFiles = 0;
    let fileMessages = []; // Collect messages for summary

    try {
        // 1. Parse the entire patch string
        const multiFilePatches = Diff.parsePatch(patchText);

        if (!multiFilePatches || multiFilePatches.length === 0) {
            vscode.window.showWarningMessage('Could not parse any file changes from the provided patch text.');
            return;
        }

        // 2. Get Workspace Folder (needed for resolving relative paths)
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            vscode.window.showErrorMessage('No workspace folder open. Cannot resolve file paths from the patch.');
            return;
        }
        const workspaceRootUri = workspaceFolders[0].uri; // Simple strategy: use the first folder

        // 3. Iterate through each file patch object
        for (const filePatch of multiFilePatches) {
            // Determine the target path (prefer new file name, handle prefixes)
            let relativePath = filePatch.newFileName || filePatch.oldFileName;
            if (!relativePath || relativePath === '/dev/null') {
                 // Skip /dev/null entries or patches without filenames (shouldn't happen often)
                 console.warn('Skipping patch entry with missing or /dev/null path:', filePatch);
                 continue;
            }
            if (relativePath.startsWith('a/')) relativePath = relativePath.substring(2);
            if (relativePath.startsWith('b/')) relativePath = relativePath.substring(2);
            relativePath = relativePath.replace(/\\/g, '/'); // Normalize separators

            const targetUri = vscode.Uri.joinPath(workspaceRootUri, relativePath);
            let document;
            let originalText;

            try {
                // 4. Open the document (loads content into memory)
                document = await vscode.workspace.openTextDocument(targetUri);
                originalText = document.getText();

                // 5. Apply ONLY this file's changes
                // Pass the filePatch object directly to applyPatch!
                let patchedText;
                const normalizedOriginalText = originalText.replace(/\r\n/g, '\n');
                // Note: filePatch object likely already uses normalized line endings from parsing
                patchedText = Diff.applyPatch(normalizedOriginalText, filePatch);
                 if (patchedText === false) {
                    // Fallback without normalization (less likely needed with parsed object)
                    patchedText = Diff.applyPatch(originalText, filePatch);
                }


                if (patchedText === false) {
                    console.error(`Failed to apply patch to ${relativePath}. Context mismatch or other error.`);
                    fileMessages.push(`❌ ${relativePath}: Failed (Context mismatch or invalid patch for file).`);
                    failedFiles++;
                    continue; // Move to the next file
                }

                // 6. Create and apply a WorkspaceEdit for THIS file only
                const edit = new vscode.WorkspaceEdit();
                const fullRange = new vscode.Range(
                    document.positionAt(0),
                    document.positionAt(originalText.length)
                );
                edit.replace(document.uri, fullRange, patchedText);

                const success = await vscode.workspace.applyEdit(edit);

                if (success) {
                    successfulFiles++;
                    fileMessages.push(`✅ ${relativePath}: Patched (Ready to save).`);
                    // Optional: Reveal the editor if the document is visible
                    // Find if an editor for this document exists and reveal it
                    const editor = vscode.window.visibleTextEditors.find(e => e.document.uri.toString() === document.uri.toString());
                    if(editor) {
                        vscode.window.showTextDocument(document, { viewColumn: editor.viewColumn, preserveFocus: true });
                    }

                } else {
                    failedFiles++;
                    fileMessages.push(`❌ ${relativePath}: Failed to apply edit (File might be locked or changed externally?).`);
                    console.error(`Failed to apply workspace edit for ${relativePath}`);
                }

            } catch (error) {
                // Handle errors during file processing (e.g., file not found)
                 failedFiles++;
                 if (error.message.includes('cannot open file') || error.code === 'FileNotFound') {
                      fileMessages.push(`❌ ${relativePath}: Failed (File not found in workspace).`);
                      console.error(`File not found: ${targetUri.fsPath}`);
                 } else {
                      fileMessages.push(`❌ ${relativePath}: Failed (Error: ${error.message}).`);
                      console.error(`Error processing file ${targetUri.fsPath}:`, error);
                 }
            }
        } // End of loop through files

    } catch (error) {
        // Handle errors during initial patch parsing
        console.error('Error parsing patch string:', error);
        vscode.window.showErrorMessage(`Failed to parse the patch text: ${error.message}`);
        return; // Stop execution
    }

    // 7. Show Summary Notification
    let summaryMessage = `Patch application finished. ${successfulFiles} file(s) patched successfully and are ready to save. ${failedFiles} file(s) failed.`;
    if (failedFiles > 0) {
        vscode.window.showWarningMessage(summaryMessage, { modal: true, detail: fileMessages.join('\n') }); // Show details in a modal
    } else if (successfulFiles > 0) {
        vscode.window.showInformationMessage(summaryMessage);
    } else {
        // This might happen if the patch was parsed but all files failed or were skipped
        vscode.window.showWarningMessage('Patch processed, but no files were successfully modified.');
    }
}


/**
 * Applies the patch text to the currently active text editor.
 * @param {string} patchText The Unified Diff text.
 */
async function applyPatchToEditor(patchText) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showWarningMessage('No active text editor found to apply the patch.');
        return;
    }

    const document = editor.document;
    const originalText = document.getText();
    let patchedText;

    try {
        // Important: Handle potential line ending mismatches between patch and document
        // The 'diff' library's applyPatch might be sensitive to this.
        // Basic normalization (replace CRLF with LF) can help sometimes.
        const normalizedOriginalText = originalText.replace(/\r\n/g, '\n');
        const normalizedPatchText = patchText.replace(/\r\n/g, '\n');

        patchedText = Diff.applyPatch(normalizedOriginalText, normalizedPatchText, {
            // Options for applyPatch if needed, e.g., fuzz factor
            // fuzzFactor: 2 // Allows for some mismatch in context lines
        });

        if (patchedText === false) {
            // Try applying without normalization as a fallback
            patchedText = Diff.applyPatch(originalText, patchText);
        }

        if (patchedText === false) {
            vscode.window.showErrorMessage('Failed to apply the patch. Check patch format, context lines, and ensure it matches the file content.');
            return;
        }

        // Replace the entire document content with the patched text
        const fullRange = new vscode.Range(
            document.positionAt(0),
            document.positionAt(originalText.length) // Use original length for range
        );

        const edit = new vscode.WorkspaceEdit();
        // Make sure to apply the patched text with the original line endings if possible,
        // or let VS Code handle the EOL setting for the document.
        // For simplicity here, we apply the potentially normalized text. VS Code often auto-detects/fixes EOL.
        edit.replace(document.uri, fullRange, patchedText);

        const success = await vscode.workspace.applyEdit(edit);

        if (success) {
            vscode.window.showInformationMessage('Patch applied successfully!');
        } else {
            vscode.window.showErrorMessage('Failed to apply the workspace edit. The file might have changed externally.');
        }

    } catch (error) {
        console.error('Error applying patch:', error);
        // Check if the error is from the diff library (often throws on parse errors)
        if (error.message && error.message.includes('Unified diff parse error')) {
             vscode.window.showErrorMessage(`Patch parsing error: ${error.message}. Ensure the format is correct Unified Diff.`);
        } else {
             vscode.window.showErrorMessage(`Error applying patch: ${error.message || 'Unknown error'}`);
        }
    }
}

async function applyPatchFromText(patchText) {
    try {
        // 1. Parse Header
        const relativePath = parseFilePathFromPatch(patchText);
        if (!relativePath) {
            vscode.window.showErrorMessage('Could not parse file path from patch header (--- a/path or +++ b/path).');
            return;
        }

        // 2. Get Workspace Folder
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            vscode.window.showErrorMessage('No workspace folder open. Cannot resolve relative path.');
            return;
        }
        // Simple strategy: Use the first workspace folder as root
        const workspaceRootUri = workspaceFolders[0].uri;

        // 3. Build Target URI
        const targetUri = vscode.Uri.joinPath(workspaceRootUri, relativePath);

        // 4. Read Target File Content
        let document;
        let originalText;
        try {
            // Use openTextDocument to handle encoding and potentially already open files
            document = await vscode.workspace.openTextDocument(targetUri);
            originalText = document.getText();
        } catch (error) {
            // Handle file not found specifically
            if (error.message.includes('cannot open file') || error.code === 'FileNotFound') {
                 vscode.window.showErrorMessage(`Target file not found in workspace: ${relativePath} (resolved as ${targetUri.fsPath})`);
            } else {
                 vscode.window.showErrorMessage(`Error opening file ${targetUri.fsPath}: ${error.message}`);
            }
            console.error("Error reading file:", error);
            return;
        }

        // 5. Apply Patch (Keep normalization logic)
        let patchedText;
        const normalizedOriginalText = originalText.replace(/\r\n/g, '\n');
        const normalizedPatchText = patchText.replace(/\r\n/g, '\n');
        patchedText = Diff.applyPatch(normalizedOriginalText, normalizedPatchText);
        if (patchedText === false) {
            patchedText = Diff.applyPatch(originalText, patchText); // Fallback
        }

        if (patchedText === false) {
            vscode.window.showErrorMessage(`Failed to apply patch to ${relativePath}. Check patch format, context lines, and ensure it matches the file content.`);
            return;
        }

        // 6. Write Changes using WorkspaceEdit
        const edit = new vscode.WorkspaceEdit();
        // Replace entire content - simpler for patch application
        const fullRange = new vscode.Range(
            document.positionAt(0),
            document.positionAt(originalText.length)
        );
        edit.replace(document.uri, fullRange, patchedText); // Use document.uri which is the same as targetUri

        const success = await vscode.workspace.applyEdit(edit);

        if (success) {
            vscode.window.showInformationMessage(`Patch applied successfully to ${relativePath}!`);
            // Optional: Open the modified file if it wasn't already visible
            // vscode.window.showTextDocument(document);
        } else {
            vscode.window.showErrorMessage(`Failed to save changes to ${relativePath}.`);
        }

    } catch (error) {
        // General error handler
        console.error('Error applying patch from text:', error);
        vscode.window.showErrorMessage(`An unexpected error occurred: ${error.message}`);
    }
}

/**
 * Extracts the relative file path from the patch header.
 * Prefers the '---' line. Handles 'a/' or 'b/' prefix.
 * Returns null if no valid path is found.
 * @param {string} patchText
 * @returns {string | null}
 */
 function parseFilePathFromPatch(patchText) {
    const lines = patchText.split('\n', 3); // Read first 3 lines max
    let filePath = null;

    for (const line of lines) {
        if (line.startsWith('--- ')) {
            filePath = line.substring(4).trim();
            // Remove standard 'a/' prefix if present
            if (filePath.startsWith('a/')) {
                filePath = filePath.substring(2);
            }
            break; // Prefer '---'
        } else if (line.startsWith('+++ ') && !filePath) { // Use '+++' only if '---' wasn't found
            filePath = line.substring(4).trim();
            // Remove standard 'b/' prefix if present
            if (filePath.startsWith('b/')) {
                filePath = filePath.substring(2);
            }
            // Don't break here, maybe '---' comes later (though unlikely in valid patches)
        }
    }
    // Basic validation: reject empty paths or device paths like /dev/null
    if (filePath && filePath.length > 0 && filePath !== '/dev/null') {
         // Replace backslashes with forward slashes for consistency with Uri.joinPath
         return filePath.replace(/\\/g, '/');
    }
    return null;
}



/**
 * Generates the HTML content for the Webview panel.
 */
function getWebviewContent() {
    // It's good practice to get the nonce for security
    // const nonce = getNonce(); // See VS Code Webview docs for nonce generation

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <!--
    Use a content security policy to only allow loading images from https or from our extension directory,
    and only allow scripts that have a specific nonce. (More secure setup)
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-GENERATED_NONCE';">
    -->
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Paste Patch</title>
    <style>
        body {
            padding: 10px;
            font-family: var(--vscode-font-family);
            color: var(--vscode-editor-foreground);
            background-color: var(--vscode-editor-background);
        }
        textarea {
            width: 95%;
            height: 60vh; /* Adjust height as needed */
            display: block;
            margin-bottom: 10px;
            font-family: var(--vscode-editor-font-family); /* Use editor font for monospace */
            color: var(--vscode-input-foreground);
            background-color: var(--vscode-input-background);
            border: 1px solid var(--vscode-input-border);
        }
        button {
            padding: 5px 15px;
            color: var(--vscode-button-foreground);
            background-color: var(--vscode-button-background);
            border: none;
            cursor: pointer;
            margin-right: 5px;
        }
        button:hover {
            background-color: var(--vscode-button-hoverBackground);
        }
        #button-container {
            margin-top: 10px;
        }
    </style>
</head>
<body>
    <h1>Paste Unified Diff Patch</h1>
    <p>Paste the patch content below and click "Apply Patch".</p>

    <textarea id="patch-text" placeholder="--- a/file.txt\n+++ b/file.txt\n@@ ... @@\n-removed line\n+added line"></textarea>

    <div id="button-container">
        <button id="apply-button">Apply Patch</button>
        <button id="cancel-button">Cancel</button>
    </div>

    <script>
        // Get the special VS Code API object for communication
        const vscode = acquireVsCodeApi();

        const applyButton = document.getElementById('apply-button');
        const cancelButton = document.getElementById('cancel-button');
        const patchTextArea = document.getElementById('patch-text');

        // Set focus to the textarea when the webview loads
        patchTextArea.focus();

        applyButton.addEventListener('click', () => {
            const patchText = patchTextArea.value;
            vscode.postMessage({
                command: 'applyPatch',
                text: patchText
            });
        });

        cancelButton.addEventListener('click', () => {
            vscode.postMessage({
                command: 'cancel'
            });
        });
    </script>
</body>
</html>`;
}

/*
// Optional: Function to generate nonce (improves security)
function getNonce() {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}
*/

// This method is called when your extension is deactivated
function deactivate() {
    // Clean up resources if needed
}

module.exports = {
    activate,
    deactivate
}