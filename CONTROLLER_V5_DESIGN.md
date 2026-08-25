# Controller layout v5

Goal: make every editable control behave exactly like the analog stick during layout editing.

Design rules:
- Every editable control is a direct child of `#layoutCanvas` through one `.control-unit` wrapper.
- No editable control is nested inside face/dpad/system groups.
- One shared gesture engine handles stick, d-pad directions, ABXY, L/R, Select and Start.
- State stores normalized center coordinates plus per-control scale.
- Drag preserves the initial finger-to-control-center offset.
- Pinch scales around the live two-finger midpoint.
- Pointer capture stays on the canvas so the control follows the finger even when the finger leaves the control.
- Bounds use the rendered control size, so no control can be dragged half outside the playable controller area.
- Portrait and landscape states are stored independently.
