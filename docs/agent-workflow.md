# Create drawings with an agent

Planform accepts editable architectural JSON created by an agent. Browser assistants can also use the drawing tools through the user's own browser session.

1. Open **Help → AI assistant guide and prompts**. For an existing drawing, select the relevant objects before opening Help.
2. Customize a prompt starter and choose **Copy AI handoff**. Paste it into your own ChatGPT, Claude or Codex chat. It includes the request, active drawing JSON, selected object IDs and [drawing guide](../public/agent/drawing-guide.md). A browser assistant can read the same context in Help, then close Help to edit through the drawing tools and Properties.
3. Ask for a `.planform.json` file with actual walls and attached doors/windows. Require explicit notes for estimated dimensions. The PDF is interpreted in your agent, not uploaded to Planform or converted by the app.
4. Use **Manage proposals → Import new proposal** to add a returned single-drawing JSON file to the current project. **Open** loads a complete project. Inspect the drawing and its source notes after importing.
5. Edit objects manually or give your saved project back to the agent for another revision. Imports are one undoable change. **Save project** downloads a complete, self-contained project.

The [example drawing](../public/agent/example.planform.json) is a three-room demonstration with invented dimensions.

The handoff captures only the active drawing and its identity. Copy it again after changes or switching drawings. Rooms and areas are derived from walls, so selected walls, labels and furniture help identify the target. Inspect furniture placement and walking clearances visually.

The project contract is [planform.schema.json](../public/agent/planform.schema.json). These agent files are shipped with the production app for download. Source filename, page, unresolved assumptions and per-object measured/estimated evidence survive saving and appear in Properties. Unknown scale must be marked uncalibrated.
