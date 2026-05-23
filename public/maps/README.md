# Site plan SVG

Drop the traced site plan here as `site.svg`. SCC is a single-level
outdoor power centre, so one SVG covers the whole property.

Authoring rules:
- viewBox should match the coordinate space used in
  `data/graph.json`
- Each store shape carries `data-store-id="<slug>"` matching
  `stores.json`
- POI shapes carry `data-poi="restroom|atm|exit|kiosk"`
- Strip Inkscape/Figma metadata (`svgo --multipass`) before
  committing

Tracing source: rasterized exports of the existing SCC site map
(public material). Re-trace; do not copy the operator's SVG bytes
verbatim.
