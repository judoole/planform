# Create drawings with an agent

Planform accepts editable architectural JSON created by an agent. The app validates and previews imports before opening them.

1. Open **AI drawings** (on narrow screens, use the project menu).
2. Copy or download the [drawing guide](../public/agent/drawing-guide.md). Give it to ChatGPT/Codex with your PDF, image or description. Download the schema and example too when useful.
3. Ask for a `.planform.json` file with actual walls and attached doors/windows. Require explicit notes for estimated dimensions. The PDF is interpreted in your agent, not uploaded to Planform or converted by the app.
4. Choose the returned JSON file in AI drawings, or paste its contents. Select **Validate & preview**, inspect the result and its source notes, then **Open drawing**. The usual **Open** button also accepts project files.
5. Edit objects manually or give your saved project back to the agent for another revision. Imports are one undoable change. **Save project** downloads a complete, self-contained project.

**Try the example drawing** fills the import box with a three-room demonstration. Its dimensions are invented; it is not a surveyed house or a validated PDF reconstruction.

The project contract is [planform.schema.json](../public/agent/planform.schema.json). These agent files are shipped with the production app for download. Source filename, page, unresolved assumptions and per-object measured/estimated evidence survive saving and appear in Properties. Unknown scale must be marked uncalibrated.
