# Floor SVGs

Drop `level-1.svg`, `level-2.svg`, `level-3.svg` here.

Authoring rules:
- viewBox should match the node-graph coordinate space in `data/graph.l<n>.json`
- Each store shape carries `data-store-id="<slug>"` matching `stores.json`
- Restrooms/elevators/escalators carry `data-poi="restroom|elevator|escalator|stair"`
- Strip Inkscape/Figma metadata (`svgo --multipass`) before committing

Tracing source: rasterized exports of the existing SCC PDF directory
(public material). Re-trace; do not copy the operator's SVG bytes.
