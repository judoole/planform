# Save, share, and compare plans

Planform stores editable project files locally and can share snapshots or compare two versions.

## Save and open

Planform automatically keeps the current local draft in this browser. Use **Save project** to download an editable `.planform.json` backup, and **Open** to continue from a saved file.

## Share

Use **Share → Copy link** to send a snapshot. Anyone with the link can open and edit their own copy. Later changes require a new link. Opening a shared copy leaves the recipient’s local draft intact; they can download their copy to keep changes.

The link contains the compressed drawing or comparison project, including its source notes, after `#`. Planform does not upload it to a server. Share it only with people you want to see the drawing. The address before `#` must point to Planform on a host recipients can access; a localhost link only works locally. Links support up to 8,000 URL characters and 64 KiB of uncompressed project data. Use the editable project file for larger drawings.

## Compare two versions

Open your first file as **Existing**, then use **Load as proposed** to choose a second single-plan file. You can also use **Duplicate as proposed** to start from a copy of Existing. Use **Replace proposed** to load a different file later. Both versions are editable when active, and each has its own undo and redo history.

Switch between versions in the toolbar to compare from the same pan and zoom. Turn on **Overlay** to trace the inactive drawing in blue behind the active one. For separately drawn files, use the same scale and coordinate origin for the overlay to line up.

**Save project** and browser recovery retain both versions and the active version. In **Share**, choose **Existing and Proposed** to send both versions in one link. The recipient can switch versions, use the overlay and edit their own copy. For larger projects, use **Download project** to send the file. SVG and PNG exports show the active drawing.
