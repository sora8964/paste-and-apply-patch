# Paste and Apply Patch

A VS Code extension to easily apply Unified Diff Format patches directly from pasted text, designed for integrating code modifications suggested by Large Language Models (LLMs) or other diff sources.

This extension aims to streamline the process of updating your code based on patches, avoiding manual copy-pasting errors, especially when changes span multiple lines or files.

## Features

*   Applies patches provided in the **Unified Diff Format**.
*   Uses a dedicated **multi-line input panel** (Webview) for pasting the patch text.
*   Supports patches containing changes for **multiple files**.
*   Correctly parses file paths from patch headers (`--- a/path/to/file`, `+++ b/path/to/file`).
*   Applies changes to the appropriate files within your **workspace**, resolving paths relative to the root.
*   Works seamlessly with both **open and closed files** within the workspace.
*   Leaves modified files in an **unsaved (dirty) state**, allowing you to review changes before saving (Ctrl+S / Cmd+S).

## How to Use

1.  **Generate or Obtain a Patch:** Get the code modifications you want to apply in the Unified Diff Format (see section below on how to ask LLMs for this).
2.  **Copy the Patch Text:** Select and copy the entire patch content, starting from the `--- a/file...` line(s).
3.  **Trigger the Command:**
    *   Open the VS Code Command Palette (`Ctrl+Shift+P` or `Cmd+Shift+P`).
    *   Search for and select: `Paste and Apply Patch (Show Input Panel)`
    *   *Alternatively*, use the default keyboard shortcut: `Ctrl+Alt+P` (Windows/Linux) or `Cmd+Alt+P` (macOS).
4.  **Paste and Apply:**
    *   A panel will appear with a text area.
    *   Paste the copied patch text into the text area.
    *   Click the "Apply Patch" button.
5.  **Review and Save:**
    *   The extension will attempt to apply the patch to the relevant files.
    *   A notification will summarize the outcome (successful files, failures).
    *   Files that were successfully patched will appear as unsaved in your editor (with a dot on the tab).
    *   **Review the changes carefully** in each modified file using VS Code's built-in diff viewer (click on the file in the Source Control panel or compare with the saved version).
    *   If the changes are correct, save each file individually (`Ctrl+S` / `Cmd+S`).

## Getting Patches from LLMs (e.g., ChatGPT, Claude, Gemini)

To effectively use this extension with LLMs, you need to instruct them to provide changes in the correct format.

**The Key: Ask for Unified Diff Format**

The most important step is to explicitly ask the LLM to output its suggested modifications as a **Unified Diff Patch**.

**Provide Context:** LLMs need the *original* code to generate a diff against. Don't just describe the change; provide the relevant code snippet or the entire file content(s).

**Example Prompt Structure:**

```text
Here is the current content of my file `[FILENAME].[EXTENSION]`:

```[LANGUAGE]
[Paste your ORIGINAL code here]

Please make the following changes:

*   [Describe change 1, e.g., Fix the typo in the print statement]
*   [Describe change 2, e.g., Add a new function called 'calculate_sum']
*   [Describe change 3, e.g., Update the version number in the comment]

IMPORTANT: Please provide the complete set of changes in Unified Diff Format.

**Tips for Prompting:**

*   **Be Specific:** Clearly state the desired changes.
*   **Provide Full Original Code:** For best results, provide the *entire* content of the file(s) you want the LLM to modify. If changes span multiple files, provide the original content for *all* affected files in your prompt.
*   **Request a Single Patch (for Multi-File):** If modifying multiple files, ask the LLM to generate *one single* Unified Diff output that includes the changes for all files, like the examples used during testing.
*   **Reiterate if Necessary:** If the LLM ignores your request and just provides the modified code blocks, politely remind it: "Thank you, but could you please provide those changes specifically in the Unified Diff Format?"

## Important Considerations & Best Practices

*   **⚠️ REVIEW PATCHES CAREFULLY!** LLMs can make mistakes ("hallucinate"). *Never* blindly apply a patch without reviewing the changes it makes. Use VS Code's diff capabilities on the unsaved files.
*   **💾 Use Version Control (Git):** This is **highly recommended**.
    *   **Commit or Stash:** Ensure your working directory is clean (commit changes or use `git stash`) before applying a patch.
    *   **Branching:** Consider applying patches on a separate branch for easier review and rollback.
    *   **Rollback:** If a patch causes issues, version control makes it easy to revert (`git checkout .`, `git reset --hard`, `git stash pop`).
*   **Context Matching is Crucial:** The patch application relies on the context lines (lines without `+` or `-`) matching *exactly* in your local file. If your file has changed since you provided the original code to the LLM, the patch application will likely fail.
*   **Workspace Root:** File paths within the patch (`--- a/path/to/file`, `+++ b/path/to/file`) are resolved relative to the root of the **first** workspace folder opened in VS Code.
*   **No Preview (Yet):** This extension applies changes directly to the buffer (leaving files unsaved). There is currently no pre-application preview step within the extension itself (rely on VS Code's diff view after application).

## Release Notes

### 0.1.0 (Initial Release)

*   Apply Unified Diff patches pasted into a dedicated input panel.
*   Support for multi-file patches.
*   Resolves file paths relative to the workspace root.
*   Applies changes to both open and closed files.
*   Modified files are left in an unsaved state for user review and saving.
*   Basic error handling and notifications.

## License

[Specify your license here, e.g., MIT] - Make sure a LICENSE file exists if you specify one.

---

*Generated by an AI assistant based on user requirements.*