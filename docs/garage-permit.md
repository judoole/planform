# Export your drawings

Open **Export → Download PDF** to share or attach your drawing. The PDF includes the floor plan, two 3D illustrations from opposite corners when the browser can render them, and any ready sections, elevations, Property map, imported site plan and building area estimate. Each view is on its own page. Use **Pages included** to choose what goes in the file and **Preview page** to look through the selection.

**Fit to page** works even before you calibrate the floor plan and labels the PDF page as a sketch. For a drawing at a specific scale, calibrate a known distance, choose a scale such as **1:100**, and print at 100% actual size. The 3D illustration fits the page, and the Property map and imported site plan each keep their own 1:500 scale. SVG and PNG export the floor plan.

Use the [Map workspace](property-map.md) to prepare the Property map page.

Select **More drawings and measurements** for optional views of a simple rectangular building.

- **Section and elevations** show a cut through the building and its four sides. Set the walls and roof in **Building**. For each view, enter the ground heights in centimeters, using the same zero reference as the optional floor elevation. Download each view as a PDF.
- **Site plan** lets you import a local PDF page or image, set its scale from a known distance, and place the building on it. Mark nearby boundaries, roads, or buildings to measure distances. You can add a property reference before downloading the PDF.
- **Building areas** shows the enclosed floor area and the footprint measured around the outside walls.

Save the editable `.planform.json` to retain the calibrated map and drawing settings. Maps and tracing references are embedded as local PNG or JPEG, with up to 100 PDF pages from which to select, 24 MB per source file, 24 million source image pixels, and 6 million embedded pixels. On floor-plan tracing references, **Calibrate scale** rescales the whole drawing, including its tracing image. The site map uses independent calibration.

For a downloaded static application build, extract the ZIP to a directory and serve the extracted files from a static server. A local example is `python3 -m http.server --bind 127.0.0.1 8000` from the extracted directory, then open [localhost:8000](http://127.0.0.1:8000/). The application processes local files and generates downloads in the browser.

Legacy permit drafts store their vertical measurements under the garage structure. When a legacy drawing has no shared building settings, opening it seeds the building and opening fields from those values. The original structure fields and terrain remain in the project. Edit the transferred measurements in Building and Properties.
