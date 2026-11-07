# Save, share, and compare plans

Planform stores editable project files locally and can share snapshots or compare multiple proposals.

## Save and open

Planform automatically keeps the current local draft in this browser. Use **Save project** to download an editable `.planform.json` backup, and **Open** to continue from a saved file.

## Share

Use **Share → Copy link** to send a snapshot. Anyone with the link can open and edit their own copy. Later changes require a new link. Opening a shared copy leaves the recipient’s local draft intact; they can download their copy to keep changes.

The link contains the compressed drawing or multi-drawing project, including its source notes, after `#`. Planform does not upload it to a server. Share it only with people you want to see the drawing. The address before `#` must point to Planform on a host recipients can access; a localhost link only works locally. Links support up to 8,000 URL characters and 64 KiB of uncompressed project data. Use the editable project file for larger drawings.

## Create and compare proposals

Keep **Existing** and up to **10 named proposals** in one project. Both Existing and proposals are editable. Choose the active drawing in the toolbar; switching keeps the same pan and zoom and each drawing has its own undo/redo history.

- **New proposal** copies the active drawing into an independent proposal and selects it.
- **Manage proposals** lets you copy Existing, import a single-plan file as a new proposal, rename the active proposal, or replace it from a file. Replacement is undoable within that proposal.
- **Delete active proposal** returns to Existing. **Restore last deleted** restores the drawing, name, position and edit history. Up to ten deletions can be restored during the current session; deletion recovery is not saved in project files or browser recovery. Existing cannot be deleted.

At ten proposals, creation and import are disabled until a proposal is deleted. The 15 MB project limit still applies, so very large drawings may reach the file-size limit first. Browser recovery is best effort; download a project backup to keep it safely.

Turn on **Overlay** and choose any other drawing as a blue reference behind the active drawing. By default, proposals are compared against Existing. You can also compare two proposals. Only one reference is shown at a time and it cannot be selected or edited. Separately drawn files need the same scale and coordinate origin for the overlay to line up.

**Save project** and browser recovery retain all drawings, their names and the active drawing. Old v3 comparison files and links open as Existing plus one proposal, preserving their geometry and active selection. Single-plan files remain supported. New multi-drawing saves use v4 and require a current version of Planform to open.

In **Share**, choose the active drawing only or **Entire project**. Recipients can switch drawings, use the overlay and edit their own copy. Link-size limits still apply; use **Download project** for larger projects. SVG and PNG exports show the active drawing, with the drawing name included in the export filename for multi-drawing projects.
