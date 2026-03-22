Project: "Ad-Morph" – Visual Ad Reconstructor
1. Project Overview
A two-part system consisting of a Chrome Extension and a React-based Web Editor. The goal is to allow users to "inspect" a live web ad, capture its DOM structure and visual assets, convert them into a structured JSON format, and provide an LLM-powered interface to modify the ad while maintaining the original layout.

2. Technical Stack
Extension: Manifest V3 (Javascript), chrome.scripting, chrome.runtime.

Frontend: React, Tailwind CSS, Lucide Icons.

State Management: Zustand (for the JSON "Ad State").

Backend/AI: OpenAI/Gemini API (Vision + Text-to-JSON).

Deployment: Vercel (Frontend) + Supabase (Optional for saving).

3. Component Breakdown & Tasks
Phase 1: The "Inspector" Extension
Build a Chrome Extension that mimics DevTools.

Overlay Mode: When toggled, inject a canvas/div overlay that highlights elements on hover.

Deep Capture: On click, capture:

Computed CSS (colors, fonts, dimensions, absolute positioning).

Image URLs and Alt text.

Inner text and hierarchy.

Context Isolation: Ensure the script can penetrate iframes (using all_frames: true in manifest).

Data Handoff: Open a new tab to the Web Editor and pass the captured data via localStorage or URL state.

Phase 2: The "Ad-JSON" Schema
Define a strict TypeScript interface to ensure the LLM knows exactly what it's editing.

TypeScript
interface AdElement {
  id: string;
  type: 'text' | 'image' | 'button' | 'container';
  content: string;
  styles: {
    top: number; left: number; width: number; height: number;
    backgroundColor: string; color: string; fontSize: string;
    borderRadius: string; backgroundImage?: string;
  };
  zIndex: number;
}
Phase 3: The Web Editor (The "Canvas")
The Renderer: A component that loops through the JSON and renders div, img, and span elements with position: absolute based on the captured coordinates.

Direct Manipulation: Users can click a text element in the UI to change its string or color via a sidebar.

Visual Preview: A "What You See Is What You Get" (WYSIWYG) stage.

Phase 4: The AI "Refiner" Loop
Integrate an LLM to process natural language updates.

Prompting Strategy: Send the current JSON + User Request (e.g., "Make this ad feel more like a luxury brand").

Constraint: Instruct the LLM to only modify content or styles values, never the geometry (coordinates), to preserve the original ad structure.

4. Implementation Roadmap for Claude Code
Task 1: Initialize Chrome Extension
"Build a Chrome Extension (Manifest V3) that, when activated, highlights DOM elements on hover with a blue border. On click, console.log the element's computed styles and text content."

Task 2: Build the Data Capture Logic
"Update the extension to capture the entire child-tree of a selected element. Convert this into a flat JSON array where each object contains its relative position (x/y), size, text, and image source. Open localhost:3000/edit and pass this JSON."

Task 3: Create the React Canvas
"Create a React component that takes a JSON array of ad elements and renders them using absolute positioning inside a fixed-aspect-ratio container (e.g., 1080x1080). Support basic 'click-to-edit' on text elements."

Task 4: LLM Integration
"Create an API route that takes the Ad-JSON and a user string. Use an LLM to return a modified JSON object. Ensure the LLM preserves the IDs and coordinates of all elements."

5. Critical Constraints for the Agent
Coordinate Mapping: Ensure coordinates are captured relative to the "Ad Container" parent, not the entire webpage.

Asset Handling: If an image is a local blob or data-URL, ensure it's handled correctly during the handoff to the editor.

No Layout Shifts: The UI must strictly prevent the user (or AI) from moving elements outside their original bounding boxes unless explicitly requested.